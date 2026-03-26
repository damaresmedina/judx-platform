// Adaptador exclusivo STF — nunca misturar com STJ
// Lê exclusivamente de stf_decisions. Nenhum import de stjDecisionsAdapter.
// Campos mapeados do Qlik STF (20 colunas confirmadas via Excel):
//   idFatoDecisao, Processo, Relator atual, Meio Processo, Origem decisão,
//   Ambiente julgamento, Data de autuação, Data baixa, Indicador colegiado,
//   Ano da decisão, Data da decisão, Tipo decisão, Andamento decisão,
//   Observação do andamento, Ramo direito, Assuntos do processo,
//   Indicador de tramitação, Órgão julgador, Descrição Procedência Processo,
//   Descrição Órgão Origem

import type { StfDecisionRaw, JudxBundle } from '../shared/types';
import { getJudxClient } from '../shared/db';
import { COURT_STF_ACRONYM, BATCH_SIZE, DEFAULT_ENVIRONMENT } from '../shared/constants';
import type { ConfidenceSource } from '../shared/confidence';

// ---------------------------------------------------------------------------
// Reader — paginated async generator
// ---------------------------------------------------------------------------

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
 * Maps Ambiente julgamento → normalized environment.
 * STF uses structured values: "Virtual" or "Presencial".
 */
function parseEnvironment(
  ambienteJulgamento: string | null | undefined,
): { inferred: string; source: ConfidenceSource; confidence: number; evidence: string | null } {
  const raw = safe(ambienteJulgamento).toLowerCase();

  if (!raw || raw === '-') {
    return { inferred: DEFAULT_ENVIRONMENT, source: 'heuristic', confidence: 0, evidence: null };
  }

  if (/virtual/i.test(raw)) {
    return { inferred: 'virtual', source: 'structured_field', confidence: 0.95, evidence: ambienteJulgamento! };
  }

  if (/presencial|f[ií]sic/i.test(raw)) {
    return { inferred: 'presencial', source: 'structured_field', confidence: 0.95, evidence: ambienteJulgamento! };
  }

  return { inferred: raw, source: 'structured_field', confidence: 0.70, evidence: ambienteJulgamento! };
}

/**
 * Maps Tipo decisão → kind enum.
 * Values confirmed via Excel: Decisão Final (75.7%), Decisão em recurso interno (18.2%),
 * Decisão Interlocutória (5%), Decisão Liminar (0.6%), Decisão (0.5%),
 * Decisão Rep. Geral (0.1%), Decisão Sobrestamento (0.03%).
 */
function inferKind(tipodecisao: string | null | undefined): string {
  const tipo = safe(tipodecisao).toLowerCase();

  if (/final/i.test(tipo)) return 'acordao';
  if (/recurso interno/i.test(tipo)) return 'acordao';
  if (/interlocutória|interlocutoria/i.test(tipo)) return 'decisao_interlocutoria';
  if (/liminar/i.test(tipo)) return 'liminar';
  if (/rep.*geral/i.test(tipo)) return 'repercussao_geral';
  if (/sobrestamento/i.test(tipo)) return 'outra';
  if (/^decisão$|^decisao$/i.test(tipo)) return 'outra';

  return 'outra';
}

/**
 * Maps Andamento decisão → result string.
 * Uses the raw value directly — it's already a structured outcome.
 */
function inferResult(andamento: string | null | undefined): string {
  const raw = safe(andamento);
  if (!raw || raw === '-' || raw === '*NI*') return 'nao_informado';
  return raw.slice(0, 80);
}

/**
 * Strips time portion from STF date strings.
 * "01/02/2024 00:00:00" → "01/02/2024"
 */
function stripTime(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (trimmed === '*NI*' || trimmed === '-') return null;
  const match = trimmed.match(/^(\d{1,2}\/\d{1,2}\/\d{4})/);
  return match ? match[1] : trimmed;
}

/**
 * Extracts procedural class from Processo (e.g. "ACO 399" → "ACO")
 */
function extractClassFromProcesso(processo: string | null | undefined): string | null {
  const p = safe(processo);
  const match = p.match(/^([A-Za-z]{2,10})\s/);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Extracts summary from Observação do andamento.
 * Returns null for *NI* and "Sem Descrição" — only real text.
 */
function extractSummary(obs: string | null | undefined): string | null {
  const raw = safe(obs);
  if (!raw || raw === '*NI*' || raw === 'Sem Descrição' || raw === '-') return null;
  return raw;
}

// ---------------------------------------------------------------------------
// Adapter — raw row -> JudxBundle
// ---------------------------------------------------------------------------

/**
 * Converts a single raw `stf_decisions` row into the normalized JudxBundle.
 *
 * Key mappings:
 *   externalNumber ← Processo (chave do case — agrupa decisões do mesmo processo)
 *   sourceId       ← idFatoDecisao (chave da decision — único por linha)
 */
export function adaptStfDecision(raw: StfDecisionRaw): JudxBundle {
  const relatorName = safe(raw.relator_atual);
  const environment = parseEnvironment(raw.ambiente_julgamento);
  const summary = extractSummary(raw.observacao_andamento);

  const judges: JudxBundle['judges'] = [];
  if (relatorName) {
    judges.push({
      name: relatorName,
      role: 'relator',
      voteType: 'vencedor',
      isRelator: true,
      isRelatorParaAcordao: false,
      relatorPrevailed: null,
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
      kind: inferKind(raw.tipo_decisao),
      result: inferResult(raw.andamento_decisao),
      fullText: null,
      excerpt: summary,
      metadata: {
        id_fato_decisao: raw.id_fato_decisao,
        processo: raw.processo,
        indicador_colegiado: raw.indicador_colegiado ?? null,
        meio_processo: raw.meio_processo ?? null,
        data_autuacao: raw.data_autuacao ?? null,
        data_baixa: raw.data_baixa ?? null,
        ramo_direito: raw.ramo_direito ?? null,
        origem_decisao: raw.origem_decisao ?? null,
        em_tramite: raw.indicador_tramitacao ?? null,
        procedencia: raw.descricao_procedencia ?? null,
        orgao_origem: raw.descricao_orgao_origem ?? null,
        ano_decisao: raw.ano_decisao ?? null,
        incidente: raw.incidente ?? null,
      },
    },

    judges,
    environment,
    rapporteurOutcome: null,
    latentSignals: [],
    environmentEvents: [],

    sourceTable: 'stf_decisions',
    sourceId: raw.id_fato_decisao,
    rawMetadata: { ...(raw as unknown as Record<string, unknown>) },
  };
}
