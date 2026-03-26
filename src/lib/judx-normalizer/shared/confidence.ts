// judx-normalizer confidence scoring utilities

export type ConfidenceSource =
  | 'structured_field'
  | 'header'
  | 'ementa_first_lines'
  | 'body_text'
  | 'heuristic';

const SOURCE_DEFAULTS: Record<ConfidenceSource, number> = {
  structured_field: 0.98,
  header: 0.92,
  ementa_first_lines: 0.85,
  body_text: 0.75,
  heuristic: 0.60,
};

/**
 * Returns the default confidence score for a given source type.
 */
export function confidenceForSource(source: ConfidenceSource): number {
  return SOURCE_DEFAULTS[source];
}

/**
 * Merges two independent confidence scores using the noisy-OR formula:
 *   P(A or B) = 1 - (1 - A) * (1 - B)
 *
 * Useful when two independent signals both support the same inference.
 */
export function mergeConfidence(a: number, b: number): number {
  return 1 - (1 - a) * (1 - b);
}

/**
 * A single inference record produced during normalization.
 */
export type InferenceRecord = {
  field: string;
  value: string;
  source: ConfidenceSource;
  confidence: number;
  evidence?: string;
  pattern?: string;
};
