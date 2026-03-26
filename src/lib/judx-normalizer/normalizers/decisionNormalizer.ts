// judx-normalizer — Decision normalizer
// Maps a JudxBundle to the shape expected by the judx_decisions table.

import type { JudxBundle } from '../shared/types';
import { cleanText } from '../shared/text';
import { logInfo, logWarn } from '../shared/logger';

// ---------------------------------------------------------------------------
// Insert type
// ---------------------------------------------------------------------------

export type JudxDecisionInsert = {
  case_id: string;
  decision_date: string | null;
  kind: string;
  result: string;
  session_environment: string;
  full_text: string | null;
  excerpt: string | null;
  metadata: Record<string, unknown>;
  source_table: string;
  source_id: string;
  observation_state: 'emergent' | 'probable' | 'unstable' | 'contested' | 'consolidated';
  contradiction_flag: boolean;
  stability_flag: boolean;
};

// ---------------------------------------------------------------------------
// Enum mappings
// ---------------------------------------------------------------------------

const KIND_MAP: Record<string, string> = {
  monocratica: 'monocratica',
  monocrática: 'monocratica',
  colegiada: 'colegiada',
  acordao: 'acordao',
  acórdão: 'acordao',
  decisao: 'outra',
  despacho: 'despacho',
};

const RESULT_MAP: Record<string, string> = {
  'provido': 'provido',
  'não provido': 'nao_provido',
  'nao provido': 'nao_provido',
  'parcialmente provido': 'parcialmente_provido',
  'provido em parte': 'parcialmente_provido',
  'não conhecido': 'nao_conhecido',
  'nao conhecido': 'nao_conhecido',
  'prejudicado': 'prejudicado',
  'extinto': 'extinto',
  'denegado': 'denegado',
  'concedido': 'concedido',
  'parcialmente concedido': 'parcialmente_concedido',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapKind(raw: string): string {
  const key = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return KIND_MAP[key] ?? 'outra';
}

function mapResult(raw: string): string {
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  // Direct match
  if (RESULT_MAP[normalized]) return RESULT_MAP[normalized];

  // Substring match — find the longest matching key
  let best: string | null = null;
  let bestLen = 0;
  for (const [key, val] of Object.entries(RESULT_MAP)) {
    if (normalized.includes(key) && key.length > bestLen) {
      best = val;
      bestLen = key.length;
    }
  }

  return best ?? 'outro';
}

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * Produces a row-shaped object ready for upsert into `judx_decisions`.
 *
 * @param bundle - The normalized JudxBundle for a single decision.
 * @param caseId - The UUID of the parent case row.
 * @returns An insert-ready object for `judx_decisions`.
 */
export function normalizeDecision(bundle: JudxBundle, caseId: string): JudxDecisionInsert {
  const kind = mapKind(bundle.decision.kind);
  const result = mapResult(bundle.decision.result);

  if (kind === 'outra' && bundle.decision.kind) {
    logWarn('decisionNormalizer', `Unknown decision kind "${bundle.decision.kind}", defaulting to "outra"`, {
      externalNumber: bundle.externalNumber,
    });
  }

  if (result === 'outro' && bundle.decision.result) {
    logWarn('decisionNormalizer', `Unknown result "${bundle.decision.result}", defaulting to "outro"`, {
      externalNumber: bundle.externalNumber,
    });
  }

  const sessionEnvironment = bundle.environment.inferred || 'nao_informado';

  const metadata: Record<string, unknown> = {
    ...bundle.decision.metadata,
    environment_inference: {
      inferred: bundle.environment.inferred,
      source: bundle.environment.source,
      confidence: bundle.environment.confidence,
      evidence: bundle.environment.evidence,
    },
  };

  // --- Observation state inference ---
  // contradiction_flag: true when environment has conflicting signals
  const envMeta = metadata.environment_inference as Record<string, unknown> | undefined;
  const contradictionFlag = envMeta?.['conflictDetected'] === true;

  // Determine observation_state based on documented rules
  let observationState: JudxDecisionInsert['observation_state'];
  if (contradictionFlag) {
    // Conflicting environment sources → unstable
    observationState = 'unstable';
  } else {
    // Check for divergent latent signal domains → contested
    const signalDomains = new Set(bundle.latentSignals.map(s => s.domain));
    const hasDivergentDomains = signalDomains.size >= 3;

    if (hasDivergentDomains) {
      observationState = 'contested';
    } else if (bundle.environment.confidence >= 0.88) {
      observationState = 'probable';
    } else {
      // No recurring theme pattern → emergent
      observationState = 'emergent';
    }
  }

  // stability_flag: true when observation_state is 'probable'
  const stabilityFlag = observationState === 'probable';

  logInfo('decisionNormalizer', `Normalizing decision for case ${caseId}`, {
    kind,
    result,
    sessionEnvironment,
    observationState,
  });

  return {
    case_id: caseId,
    decision_date: bundle.decision.date ?? null,
    kind,
    result,
    session_environment: sessionEnvironment,
    full_text: bundle.decision.fullText ?? null,
    excerpt: bundle.decision.excerpt ? cleanText(bundle.decision.excerpt) : null,
    metadata,
    source_table: bundle.sourceTable,
    source_id: bundle.sourceId,
    observation_state: observationState,
    contradiction_flag: contradictionFlag,
    stability_flag: stabilityFlag,
  };
}
