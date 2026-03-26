// judx-normalizer adapter: stj_decisoes_dj (Diario da Justica)

import type { StjDecisaoDjRaw, JudxBundle } from '../shared/types';
import { getJudxClient } from '../shared/db';
import {
  COURT_STJ_ACRONYM,
  BATCH_SIZE,
  DEFAULT_ENVIRONMENT,
  ENVIRONMENT_PATTERNS,
  RAPPORTEUR_PATTERNS,
} from '../shared/constants';
import type { ConfidenceSource } from '../shared/confidence';

// ---------------------------------------------------------------------------
// Reader — paginated async generator
// ---------------------------------------------------------------------------

/**
 * Yields batches of raw rows from the `stj_decisoes_dj` table.
 * Pagination uses Supabase `.range()` until a batch comes back shorter than
 * `batchSize`, which signals the end of the table.
 */
export async function* readStjDecisoesDj(
  batchSize: number = BATCH_SIZE,
): AsyncGenerator<StjDecisaoDjRaw[]> {
  const client = getJudxClient();
  let offset = 0;

  while (true) {
    const { data, error } = await client
      .from('stj_decisoes_dj')
      .select('*')
      .range(offset, offset + batchSize - 1);

    if (error) {
      throw new Error(
        `[stjDecisoesDjAdapter] Failed to read stj_decisoes_dj at offset ${offset}: ${error.message}`,
      );
    }

    const rows = (data ?? []) as StjDecisaoDjRaw[];

    if (rows.length === 0) break;

    yield rows;

    if (rows.length < batchSize) break;

    offset += batchSize;
  }
}

// ---------------------------------------------------------------------------
// Internal parsing helpers
// ---------------------------------------------------------------------------

function safe(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/**
 * Infers the session environment (virtual / presencial / nao_informado)
 * from free-text fields using the patterns in constants.ts.
 */
function parseEnvironment(
  ...texts: (string | null | undefined)[]
): { inferred: string; source: ConfidenceSource; confidence: number; evidence: string | null } {
  const combined = texts.map(safe).filter(Boolean).join(' ');

  for (const [src, meta] of Object.entries(ENVIRONMENT_PATTERNS)) {
    const re = new RegExp(src, 'i');
    const m = combined.match(re);
    if (m) {
      return {
        inferred: meta.value,
        source: 'ementa_first_lines',
        confidence: meta.confidence,
        evidence: m[0],
      };
    }
  }

  return {
    inferred: DEFAULT_ENVIRONMENT,
    source: 'heuristic',
    confidence: 0,
    evidence: null,
  };
}

/**
 * Detects rapporteur (relator) outcome signals in free text.
 */
function parseRapporteurOutcome(
  relatorName: string,
  ...texts: (string | null | undefined)[]
): JudxBundle['rapporteurOutcome'] {
  if (!relatorName) return null;

  const combined = texts.map(safe).filter(Boolean).join(' ');

  for (const { pattern, outcome, confidence } of RAPPORTEUR_PATTERNS) {
    const m = combined.match(pattern);
    if (m) {
      let substituteName: string | null = null;
      if (outcome === 'substituido_por_relator_acordao') {
        const subMatch = combined.match(
          /[Rr]elator(?:a)?\s+para\s+o?\s*[Aa]córdão[:\s]+(?:Min(?:istro|\.)\s+)?([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/,
        );
        if (subMatch) {
          substituteName = subMatch[1].trim();
        }
      }

      return {
        relatorName,
        outcome,
        substituteName,
        evidence: m[0],
        confidence,
      };
    }
  }

  return {
    relatorName,
    outcome: 'prevaleceu',
    substituteName: null,
    evidence: null,
    confidence: 0.50,
  };
}

/**
 * Extracts environment-change events from ementa text.
 */
function extractEnvironmentEvents(
  ...texts: (string | null | undefined)[]
): JudxBundle['environmentEvents'] {
  const combined = texts.map(safe).filter(Boolean).join(' ');
  const events: JudxBundle['environmentEvents'] = [];
  const seen = new Set<string>();

  for (const [src, meta] of Object.entries(ENVIRONMENT_PATTERNS)) {
    const re = new RegExp(src, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(combined)) !== null) {
      const key = `${meta.value}::${m[0]}`;
      if (!seen.has(key)) {
        seen.add(key);
        events.push({
          eventType: 'environment_inference',
          toEnvironment: meta.value,
          evidence: m[0],
        });
      }
    }
  }

  return events;
}

/**
 * Maps the `tipo_decisao` field to a normalised decision kind.
 */
function inferDecisionKind(tipoBruto: string | null): string {
  const tipo = safe(tipoBruto).toLowerCase();

  if (/monocr[aá]tica/i.test(tipo)) return 'monocratica';
  if (/colegiada/i.test(tipo)) return 'colegiada';
  if (/ac[oó]rd[aã]o/i.test(tipo)) return 'acordao';
  if (/despacho/i.test(tipo)) return 'despacho';

  // Fallback: return sanitised original or a default
  return tipo || 'nao_informado';
}

/**
 * Infers a normalised result string from `tipo_decisao` and `ementa`.
 */
function inferResult(raw: StjDecisaoDjRaw): string {
  const ementa = safe(raw.ementa).toLowerCase();
  const tipo = safe(raw.tipo_decisao).toLowerCase();

  // Try ementa-based patterns first (more specific)
  if (/negou[\s-]+provimento|n[aã]o\s+provid[oa]|improced[eê]nte/i.test(ementa))
    return 'negou_provimento';
  if (/deu[\s-]+provimento|provid[oa]/i.test(ementa)) return 'deu_provimento';
  if (/parcial[\s-]+provimento/i.test(ementa)) return 'parcial_provimento';
  if (/n[aã]o\s+conhec/i.test(ementa)) return 'nao_conhecido';
  if (/extint/i.test(ementa)) return 'extinto';
  if (/prejudicad/i.test(ementa)) return 'prejudicado';

  // tipo_decisao based fallback
  if (/despacho/i.test(tipo)) return 'despacho';

  return 'nao_informado';
}

/**
 * Extracts latent signals from ementa text.
 */
function extractLatentSignals(raw: StjDecisaoDjRaw): JudxBundle['latentSignals'] {
  const signals: JudxBundle['latentSignals'] = [];
  const ementa = safe(raw.ementa);

  const statePatterns =
    /\b(?:Fazenda\s+(?:P[uú]blica|Nacional|Estadual|Municipal)|Uni[aã]o|Estado|Munic[ií]pio|INSS|Banco\s+Central|autarquia|empresa\s+p[uú]blica)\b/i;
  if (statePatterns.test(ementa)) {
    signals.push({
      domain: 'parties',
      name: 'state_involvement',
      value: 1,
      payload: { evidence: ementa.match(statePatterns)?.[0] ?? '' },
    });
  }

  const constPatterns =
    /\b(?:constitucional|inconstitucional|CF\s*\/?\s*88|art(?:igo)?\.?\s*5|controle\s+de\s+constitucionalidade)\b/i;
  if (constPatterns.test(ementa)) {
    signals.push({
      domain: 'constitutional',
      name: 'constitutional_matter',
      value: 1,
      payload: { evidence: ementa.match(constPatterns)?.[0] ?? '' },
    });
  }

  const crimPatterns =
    /\b(?:penal|criminal|crime|habeas\s+corpus|pris[aã]o|condena[çc][aã]o|r[eé]u)\b/i;
  if (crimPatterns.test(ementa)) {
    signals.push({
      domain: 'criminal',
      name: 'criminal_matter',
      value: 1,
      payload: { evidence: ementa.match(crimPatterns)?.[0] ?? '' },
    });
  }

  const taxPatterns = /\b(?:tribut[aá]ri[oa]|fiscal|imposto|ICMS|ISS|PIS|COFINS|IRPJ)\b/i;
  if (taxPatterns.test(ementa)) {
    signals.push({
      domain: 'tax',
      name: 'tax_matter',
      value: 1,
      payload: { evidence: ementa.match(taxPatterns)?.[0] ?? '' },
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Adapter — raw row -> JudxBundle
// ---------------------------------------------------------------------------

/**
 * Converts a single raw `stj_decisoes_dj` row into the normalized JudxBundle.
 */
export function adaptStjDecisaoDj(raw: StjDecisaoDjRaw): JudxBundle {
  const relatorName = safe(raw.relator);
  const ementaText = safe(raw.ementa);

  const environment = parseEnvironment(ementaText, safe(raw.orgao_julgador));
  const rapporteurOutcome = parseRapporteurOutcome(relatorName, ementaText);
  const environmentEvents = extractEnvironmentEvents(ementaText);
  const latentSignals = extractLatentSignals(raw);

  // Build judges array
  const judges: JudxBundle['judges'] = [];
  if (relatorName) {
    const relatorDefeated =
      rapporteurOutcome?.outcome === 'vencido' ||
      rapporteurOutcome?.outcome === 'substituido_por_relator_acordao';

    judges.push({
      name: relatorName,
      role: 'relator',
      voteType: relatorDefeated ? 'vencido' : 'vencedor',
      isRelator: true,
      isRelatorParaAcordao: false,
      relatorPrevailed: !relatorDefeated,
      relatorDefeatedMarker: relatorDefeated ? (rapporteurOutcome?.evidence ?? null) : null,
    });

    if (rapporteurOutcome?.substituteName) {
      judges.push({
        name: rapporteurOutcome.substituteName,
        role: 'relator_para_acordao',
        voteType: 'vencedor',
        isRelator: false,
        isRelatorParaAcordao: true,
        relatorPrevailed: null,
        relatorDefeatedMarker: null,
      });
    }
  }

  return {
    courtId: COURT_STJ_ACRONYM,
    courtAcronym: COURT_STJ_ACRONYM,
    externalNumber: raw.numero_processo,
    organName: raw.orgao_julgador ?? null,
    proceduralClassName: raw.classe ?? null,
    subject: null, // DJ source does not have tema/ramo_direito

    decision: {
      date: raw.data_decisao ?? null,
      kind: inferDecisionKind(raw.tipo_decisao),
      result: inferResult(raw),
      fullText: null, // DJ records link to inteiro teor but don't embed it
      excerpt: raw.ementa ?? null,
      metadata: {
        url_inteiro_teor: raw.url_inteiro_teor ?? null,
      },
    },

    judges,
    environment,
    rapporteurOutcome,
    latentSignals,
    environmentEvents,

    sourceTable: 'stj_decisoes_dj',
    sourceId: String(raw.id),
    rawMetadata: { ...(raw as unknown as Record<string, unknown>) },
  };
}
