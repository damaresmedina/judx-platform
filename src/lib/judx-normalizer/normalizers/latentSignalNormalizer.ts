// judx-normalizer — Latent signal normalizer
// Maps latent signals from a JudxBundle to judx_latent_signals rows.

import type { JudxBundle } from '../shared/types';
import { logInfo } from '../shared/logger';

// ---------------------------------------------------------------------------
// Insert type
// ---------------------------------------------------------------------------

export type JudxLatentSignalInsert = {
  case_id: string;
  decision_id: string | null;
  signal_domain: string;
  signal_name: string;
  signal_value: number | null;
  signal_payload: Record<string, unknown>;
  extracted_from: string;
};

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * Creates latent signal records from the bundle's latentSignals array.
 *
 * @param bundle     - The normalized JudxBundle.
 * @param caseId     - The UUID of the case row.
 * @param decisionId - The UUID of the decision (may be null).
 * @returns Array of insert-ready objects for `judx_latent_signals`.
 */
export function normalizeLatentSignals(
  bundle: JudxBundle,
  caseId: string,
  decisionId: string | null,
): JudxLatentSignalInsert[] {
  const signals: JudxLatentSignalInsert[] = bundle.latentSignals.map((signal) => ({
    case_id: caseId,
    decision_id: decisionId,
    signal_domain: signal.domain,
    signal_name: signal.name,
    signal_value: signal.value ?? null,
    signal_payload: signal.payload,
    extracted_from: bundle.sourceTable,
  }));

  if (signals.length > 0) {
    logInfo('latentSignalNormalizer', `Created ${signals.length} latent signal(s) for case ${caseId}`, {
      domains: [...new Set(signals.map((s) => s.signal_domain))],
    });
  }

  return signals;
}
