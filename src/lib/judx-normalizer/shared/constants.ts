// judx-normalizer shared constants

export const COURT_STJ_ACRONYM = 'STJ';
export const COURT_STF_ACRONYM = 'STF';
export const PIPELINE_VERSION = 'judx-normalizer-v1';
export const BATCH_SIZE = 200;
export const DEFAULT_DECISION_KIND = 'acordao';
export const DEFAULT_ENVIRONMENT = 'nao_informado';

/**
 * Maps regex patterns found in organ/session descriptions to environment values.
 * Keys are regex source strings; values carry the inferred environment and confidence.
 */
export const ENVIRONMENT_PATTERNS: Record<string, { value: string; confidence: number }> = {
  'Plen[aá]rio\\s+Virtual|\\bPV\\b': { value: 'virtual', confidence: 0.92 },
  'Turma\\s+Virtual|\\bTV\\b': { value: 'virtual', confidence: 0.90 },
  'Sess[aã]o\\s+Virtual': { value: 'virtual', confidence: 0.90 },
  'Sess[aã]o\\s+Presencial': { value: 'presencial', confidence: 0.92 },
  'Plen[aá]rio(?!\\s*Virtual)': { value: 'presencial', confidence: 0.85 },
  'Julgamento\\s+Presencial': { value: 'presencial', confidence: 0.88 },
};

/**
 * Ordered array of patterns for detecting rapporteur (relator) outcomes.
 * Checked in order — first match wins.
 */
export const RAPPORTEUR_PATTERNS: Array<{
  pattern: RegExp;
  outcome: string;
  confidence: number;
}> = [
  {
    pattern: /Relator(a)?\s+para\s+o?\s*[Aa]córdão/,
    outcome: 'substituido_por_relator_acordao',
    confidence: 0.95,
  },
  {
    pattern: /[Vv]encido\s+o\s+[Rr]elator/,
    outcome: 'vencido',
    confidence: 0.93,
  },
  {
    pattern: /ficou\s+vencido\s+o\s+[Rr]elator/,
    outcome: 'vencido',
    confidence: 0.93,
  },
  {
    pattern: /[Rr]elator\s+designado/,
    outcome: 'substituido_por_relator_acordao',
    confidence: 0.90,
  },
  {
    pattern: /[Aa]córdão\s+lavrado\s+por/,
    outcome: 'substituido_por_relator_acordao',
    confidence: 0.88,
  },
  {
    pattern: /[Dd]iverg[eê]ncia\s+vencedora/,
    outcome: 'vencido',
    confidence: 0.82,
  },
  {
    pattern: /[Aa]companhou\s+o\s+[Rr]elator/,
    outcome: 'prevaleceu',
    confidence: 0.70,
  },
];
