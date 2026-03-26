// Adaptador exclusivo STF — nunca misturar com STJ
// Lê exclusivamente de stf_decisions. Nenhum import de stjDecisionsAdapter.

import type { StfDecisionRaw, JudxBundle } from '../shared/types';
import { getJudxClient } from '../shared/db';
import { COURT_STF_ACRONYM, BATCH_SIZE, DEFAULT_ENVIRONMENT } from '../shared/constants';
import type { ConfidenceSource } from '../shared/confidence';

// ---------------------------------------------------------------------------
// Reader — paginated async generator
// ---------------------------------------------------------------------------

/**
 * Yields batches of raw rows from the `stf_decisions` table.
 * Pagination uses Supabase `.range()` until a batch comes back shorter than
 * `batchSize`, which signals the end of the table.
 */
export async function* readStfDecisions(
  batchSize: number = BATCH_SIZE,
): AsyncGenerator<StfDecisionRaw[]> {
  const client = getJudxClient();
  let offset = 0;

  while (true) {
    const { data, error } = await client
      .from('stf_decisions')
      .select('*')
      .range(offset, offset + batchSize - 1);

    if (error) {
      throw new Error(
        `[stfDecisionsAdapter] Failed to read stf_decisions at offset ${offset}: ${error.message}`,
      );
    }

    const rows = (data ?? []) as StfDecisionRaw[];

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
 * Maps the STF `ambiente_julgamento` field to the normalized environment value.
 * The STF Qlik data uses structured values, not free text like STJ.
 */
function parseEnvironment(
  ambienteJulgamento: string | null | undefined,
): { inferred: string; source: ConfidenceSource; confidence: number; evidence: string | null } {
  const raw = safe(ambienteJulgamento).toLowerCase();

  if (!raw || raw === '-') {
    return {
      inferred: DEFAULT_ENVIRONMENT,
      source: 'heuristic',
      confidence: 0,
      evidence: null,
    };
  }

  if (/virtual/i.test(raw)) {
    return {
      inferred: 'virtual',
      source: 'structured_field',
      confidence: 0.95,
      evidence: ambienteJulgamento!,
    };
  }

  if (/presencial|f[ií]sic/i.test(raw)) {
    return {
      inferred: 'presencial',
      source: 'structured_field',
      confidence: 0.95,
      evidence: ambienteJulgamento!,
    };
  }

  // Known value but unmapped — record as-is
  return {
    inferred: raw,
    source: 'structured_field',
    confidence: 0.70,
    evidence: ambienteJulgamento!,
  };
}

/**
 * Infers decision result from `andamento_decisao` and `tipo_decisao`.
 */
function inferResult(raw: StfDecisionRaw): string {
  const andamento = safe(raw.andamento_decisao).toLowerCase();
  const tipo = safe(raw.tipo_decisao).toLowerCase();
  const combined = `${andamento} ${tipo}`;

  if (/negou|negad[oa]|improced[eê]nte|n[aã]o\s+provid[oa]|desprovid/i.test(combined))
    return 'negou_provimento';
  if (/deu\s+provimento|provid[oa]/i.test(combined)) return 'deu_provimento';
  if (/parcial/i.test(combined)) return 'parcial_provimento';
  if (/n[aã]o\s+conhec/i.test(combined)) return 'nao_conhecido';
  if (/extint/i.test(combined)) return 'extinto';
  if (/prejudicad/i.test(combined)) return 'prejudicado';

  // Return andamento as-is if meaningful, otherwise nao_informado
  if (andamento && andamento !== '-') return andamento.slice(0, 80);
  return 'nao_informado';
}

/**
 * Infers decision kind from `tipo_decisao`.
 */
function inferKind(tipodecisao: string | null | undefined, origemDecisao: string | null | undefined): string {
  const tipo = safe(tipodecisao).toLowerCase();
  const origem = safe(origemDecisao).toLowerCase();

  // STF Qlik values: "Decisão Final", "Decisão em recurso interno",
  // "Decisão Interlocutória", "Decisão Liminar", "Decisão Rep. Geral", etc.
  if (/acórdão|acordao/i.test(tipo)) return 'acordao';
  if (/liminar/i.test(tipo)) return 'liminar';
  if (/interlocutória|interlocutoria/i.test(tipo)) return 'interlocutoria';
  if (/rep.*geral/i.test(tipo)) return 'repercussao_geral';
  if (/sobrestamento/i.test(tipo)) return 'sobrestamento';
  if (/recurso interno/i.test(tipo)) return 'recurso_interno';

  // "Decisão Final" + origem MONOCRÁTICA = monocratica; + TURMA/PLENO = acordao
  if (/final/i.test(tipo)) {
    if (/monocrática|monocratica/i.test(origem)) return 'monocratica';
    if (/turma|plen[aá]rio|seção|secao/i.test(origem)) return 'acordao';
    return 'decisao_final';
  }

  // Plain "Decisão" — check origem
  if (/^decisão$|^decisao$/i.test(tipo)) {
    if (/monocrática|monocratica/i.test(origem)) return 'monocratica';
    return 'decisao';
  }

  if (tipo && tipo !== '-') return tipo.slice(0, 50);
  return 'decisao';
}

/**
 * Strips time portion from STF date strings.
 * "01/02/2024 00:00:00" → "01/02/2024"
 */
function stripTime(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{1,2}\/\d{1,2}\/\d{4})/);
  return match ? match[1] : trimmed;
}

/**
 * Extracts procedural class from processo string (e.g. "ARE 1492326" → "ARE")
 */
function extractClassFromProcesso(processo: string | null | undefined): string | null {
  const p = safe(processo);
  const match = p.match(/^([A-Z]{2,10})\s/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Adapter — raw row -> JudxBundle
// ---------------------------------------------------------------------------

/**
 * Converts a single raw `stf_decisions` row into the normalized JudxBundle.
 */
export function adaptStfDecision(raw: StfDecisionRaw): JudxBundle {
  const relatorName = safe(raw.relator_atual);
  const environment = parseEnvironment(raw.ambiente_julgamento);

  // Build judges array — relator only (STF Qlik does not expose full composition)
  const judges: JudxBundle['judges'] = [];
  if (relatorName) {
    judges.push({
      name: relatorName,
      role: 'relator',
      voteType: 'vencedor', // default — no outcome signal in structured data
      isRelator: true,
      isRelatorParaAcordao: false,
      relatorPrevailed: null, // cannot infer from structured data alone
      relatorDefeatedMarker: null,
    });
  }

  return {
    courtId: COURT_STF_ACRONYM,
    courtAcronym: COURT_STF_ACRONYM,
    externalNumber: raw.processo ?? raw.id_fato_decisao,
    organName: raw.orgao_julgador ?? null,
    proceduralClassName: extractClassFromProcesso(raw.processo),
    subject: raw.assuntos_processo ?? raw.ramo_direito ?? null,

    decision: {
      date: stripTime(raw.data_decisao),
      kind: inferKind(raw.tipo_decisao, raw.origem_decisao),
      result: inferResult(raw),
      fullText: null, // Qlik extraction does not carry full text
      excerpt: raw.observacao_andamento ?? null,
      metadata: {
        processo: raw.processo,
        data_autuacao: raw.data_autuacao ?? null,
        data_baixa: raw.data_baixa ?? null,
        ramo_direito: raw.ramo_direito ?? null,
        origem_decisao: raw.origem_decisao ?? null,
        meio_processo: raw.meio_processo ?? null,
        em_tramite: raw.indicador_tramitacao ?? null,
        procedencia: raw.descricao_procedencia ?? null,
        orgao_origem: raw.descricao_orgao_origem ?? null,
        ano_decisao: raw.ano_decisao ?? null,
      },
    },

    judges,
    environment,
    rapporteurOutcome: null, // STF structured data does not expose outcome signals
    latentSignals: [],       // will be populated when patterns layer is implemented
    environmentEvents: [],   // STF environment is a single structured field, not events

    sourceTable: 'stf_decisions',
    sourceId: raw.id_fato_decisao,
    rawMetadata: { ...(raw as unknown as Record<string, unknown>) },
  };
}
