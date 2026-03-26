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
