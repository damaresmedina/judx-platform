// judx-normalizer shared types

import type { ConfidenceSource } from './confidence';

// ---------------------------------------------------------------------------
// Raw source table types
// ---------------------------------------------------------------------------

/** Row shape of the `stj_decisions` table (espelho / monocratica). */
export type StjDecisionRaw = {
  numero_registro: string;
  processo: string;
  classe: string | null;
  uf: string | null;
  relator: string | null;
  orgao_julgador: string | null;
  data_julgamento: string | null;
  ementa: string | null;
  tema: string | null;
  resultado: string | null;
  ramo_direito: string | null;
};

/** Row shape of the `stj_decisoes_dj` table (Diario da Justica). */
export type StjDecisaoDjRaw = {
  id: number;
  numero_processo: string;
  classe: string | null;
  relator: string | null;
  orgao_julgador: string | null;
  data_decisao: string | null;
  tipo_decisao: string | null;
  ementa: string | null;
  url_inteiro_teor: string | null;
};

/** Row shape of the `stf_decisoes` table (372e + e7a4 datasets). */
export type StfDecisaoRaw = {
  id: number;
  processo: string;
  orgao_julgador: string | null;
  relator_decisao: string | null;
  relator_atual: string | null;
  data_autuacao: string | null;
  data_decisao: string | null;
  data_baixa: string | null;
  grupo_origem: string | null;
  tipo_classe: string | null;
  classe: string | null;
  ramo_direito: string | null;
  assunto: string | null;
  assunto_completo: string | null;
  incidente: number | null;
  link_processo: string | null;
  cod_andamento: string | null;
  subgrupo_andamento: string | null;
  descricao_andamento: string | null;
  observacao_andamento: string | null;
  tipo_decisao: string | null;
  preferencia_covid19: boolean | null;
  preferencia_criminal: boolean | null;
  sigla_ultimo_recurso: string | null;
  recurso_interno_pendente: boolean | null;
  em_tramitacao: boolean | null;
  decisoes_virtual: boolean | null;
  ambiente_julgamento: string | null;
  indicador_colegiado: string | null;
  id_fato_decisao: number | null;
  raw_source: string | null;
  created_at: string | null;
};

// ---------------------------------------------------------------------------
// Normalized ontological bundle
// ---------------------------------------------------------------------------

/** The complete normalized bundle for a single decision. */
export type JudxBundle = {
  courtId: string;
  courtAcronym: string;
  organName: string | null;
  proceduralClassName: string | null;
  externalNumber: string;
  subject: string | null;

  decision: {
    date: string | null;
    kind: string;
    result: string;
    fullText: string | null;
    excerpt: string | null;
    metadata: Record<string, unknown>;
  };

  judges: Array<{
    name: string;
    role: string;
    voteType: string;
    isRelator: boolean;
    isRelatorParaAcordao: boolean;
    relatorPrevailed: boolean | null;
    relatorDefeatedMarker: string | null;
  }>;

  environment: {
    inferred: string;
    source: ConfidenceSource;
    confidence: number;
    evidence: string | null;
  };

  rapporteurOutcome: {
    relatorName: string;
    outcome: string;
    substituteName: string | null;
    evidence: string | null;
    confidence: number;
  } | null;

  latentSignals: Array<{
    domain: string;
    name: string;
    value: number | null;
    payload: Record<string, unknown>;
  }>;

  environmentEvents: Array<{
    eventType: string;
    toEnvironment: string;
    evidence: string | null;
  }>;

  sourceTable: string;
  sourceId: string;
  rawMetadata: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Pipeline result
// ---------------------------------------------------------------------------

export type NormalizationResult = {
  processed: number;
  upserted: number;
  errors: number;
  inferences: number;
};
