// judx-normalizer adapter: stj_decisions (espelhos de acordaos)

import type { StjDecisionRaw, JudxBundle } from '../shared/types';
import { getJudxClient } from '../shared/db';
import {
  COURT_STJ_ACRONYM,
  BATCH_SIZE,
  DEFAULT_DECISION_KIND,
  DEFAULT_ENVIRONMENT,
  ENVIRONMENT_PATTERNS,
  RAPPORTEUR_PATTERNS,
} from '../shared/constants';
import type { ConfidenceSource } from '../shared/confidence';

// ---------------------------------------------------------------------------
// Reader — paginated async generator
// ---------------------------------------------------------------------------

/**
 * Yields batches of raw rows from the `stj_decisions` table.
 * Pagination uses Supabase `.range()` until a batch comes back shorter than
 * `batchSize`, which signals the end of the table.
 */
export async function* readStjDecisions(
  batchSize: number = BATCH_SIZE,
): AsyncGenerator<StjDecisionRaw[]> {
  const client = getJudxClient();
  let offset = 0;

  while (true) {
    const { data, error } = await client
      .from('stj_decisions')
      .select('*')
      .range(offset, offset + batchSize - 1);

    if (error) {
      throw new Error(
        `[stjDecisionsAdapter] Failed to read stj_decisions at offset ${offset}: ${error.message}`,
      );
    }

    const rows = (data ?? []) as StjDecisionRaw[];

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
      // Try to capture a substitute name when the relator was replaced
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

  // Default: relator prevailed (no contrary signal found)
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
 * E.g. "Plenario Virtual" -> "virtual", "Sessao Presencial" -> "presencial".
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
 * Infers a decision result string from `resultado` or `ementa` free text.
 */
function inferResult(raw: StjDecisionRaw): string {
  const resultado = safe(raw.resultado).toLowerCase();
  const ementa = safe(raw.ementa).toLowerCase();

  if (resultado) {
    if (/negou|negad[oa]|improced[eê]nte|n[aã]o\s+provid[oa]/i.test(resultado))
      return 'negou_provimento';
    if (/deu\s+provimento|provid[oa]/i.test(resultado)) return 'deu_provimento';
    if (/parcial/i.test(resultado)) return 'parcial_provimento';
    if (/n[aã]o\s+conhec/i.test(resultado)) return 'nao_conhecido';
    if (/extint/i.test(resultado)) return 'extinto';
    if (/prejudicad/i.test(resultado)) return 'prejudicado';
    return resultado.slice(0, 80);
  }

  if (/negou[\s-]+provimento/i.test(ementa)) return 'negou_provimento';
  if (/deu[\s-]+provimento/i.test(ementa)) return 'deu_provimento';
  if (/parcial[\s-]+provimento/i.test(ementa)) return 'parcial_provimento';

  return 'nao_informado';
}

/**
 * Extracts latent signals — heuristics for state involvement, constitutional
 * matters, etc., derived from ementa/tema text.
 */
function extractLatentSignals(raw: StjDecisionRaw): JudxBundle['latentSignals'] {
  const signals: JudxBundle['latentSignals'] = [];
  const ementa = safe(raw.ementa);
  const tema = safe(raw.tema);
  const combined = `${ementa} ${tema}`;

  // State involvement heuristic
  const statePatterns =
    /\b(?:Fazenda\s+(?:P[uú]blica|Nacional|Estadual|Municipal)|Uni[aã]o|Estado|Munic[ií]pio|INSS|Banco\s+Central|autarquia|empresa\s+p[uú]blica)\b/i;
  if (statePatterns.test(combined)) {
    signals.push({
      domain: 'parties',
      name: 'state_involvement',
      value: 1,
      payload: { evidence: combined.match(statePatterns)?.[0] ?? '' },
    });
  }

  // Constitutional matter heuristic
  const constPatterns =
    /\b(?:constitucional|inconstitucional|CF\s*\/?\s*88|art(?:igo)?\.?\s*5|controle\s+de\s+constitucionalidade)\b/i;
  if (constPatterns.test(combined)) {
    signals.push({
      domain: 'constitutional',
      name: 'constitutional_matter',
      value: 1,
      payload: { evidence: combined.match(constPatterns)?.[0] ?? '' },
    });
  }

  // Criminal matter heuristic
  const crimPatterns =
    /\b(?:penal|criminal|crime|habeas\s+corpus|pris[aã]o|condena[çc][aã]o|r[eé]u)\b/i;
  if (crimPatterns.test(combined)) {
    signals.push({
      domain: 'criminal',
      name: 'criminal_matter',
      value: 1,
      payload: { evidence: combined.match(crimPatterns)?.[0] ?? '' },
    });
  }

  // Tax/tributary matter
  const taxPatterns = /\b(?:tribut[aá]ri[oa]|fiscal|imposto|ICMS|ISS|PIS|COFINS|IRPJ)\b/i;
  if (taxPatterns.test(combined)) {
    signals.push({
      domain: 'tax',
      name: 'tax_matter',
      value: 1,
      payload: { evidence: combined.match(taxPatterns)?.[0] ?? '' },
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Adapter — raw row -> JudxBundle
// ---------------------------------------------------------------------------

/**
 * Converts a single raw `stj_decisions` row into the normalized JudxBundle.
 */
export function adaptStjDecision(raw: StjDecisionRaw): JudxBundle {
  const relatorName = safe(raw.relator);
  const ementaText = safe(raw.ementa);
  const resultadoText = safe(raw.resultado);

  const environment = parseEnvironment(ementaText, resultadoText, safe(raw.orgao_julgador));
  const rapporteurOutcome = parseRapporteurOutcome(relatorName, ementaText, resultadoText);
  const environmentEvents = extractEnvironmentEvents(ementaText, resultadoText);
  const latentSignals = extractLatentSignals(raw);

  // Build judges array — at minimum the relator
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

    // If a substitute (relator para acordao) was found, add them too
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
    externalNumber: raw.numero_registro,
    organName: raw.orgao_julgador ?? null,
    proceduralClassName: raw.classe ?? null,
    subject: raw.tema ?? raw.ramo_direito ?? null,

    decision: {
      date: raw.data_julgamento ?? null,
      kind: DEFAULT_DECISION_KIND,
      result: inferResult(raw),
      fullText: null, // espelhos do not carry full text
      excerpt: raw.ementa ?? null,
      metadata: {
        processo: raw.processo,
        uf: raw.uf ?? null,
      },
    },

    judges,
    environment,
    rapporteurOutcome,
    latentSignals,
    environmentEvents,

    sourceTable: 'stj_decisions',
    sourceId: raw.numero_registro,
    rawMetadata: { ...(raw as unknown as Record<string, unknown>) },
  };
}
