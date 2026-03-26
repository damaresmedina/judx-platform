// judx-normalizer — Environment normalizer
// Maps environment data from a JudxBundle to judgment regime and event rows.

import type { JudxBundle } from '../shared/types';
import { logInfo } from '../shared/logger';

// ---------------------------------------------------------------------------
// Insert types
// ---------------------------------------------------------------------------

export type JudxJudgmentRegimeInsert = {
  case_id: string;
  initial_environment: string;
  current_environment: string;
  final_environment: string;
  judgment_path: string[];
  environment_source: string;
  environment_confidence: number;
  metadata: Record<string, unknown>;
};

export type JudxEnvironmentEventInsert = {
  case_id: string;
  event_type: string;
  to_environment: string;
  evidence: string | null;
  event_order: number;
};

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * Creates a judgment regime record and an array of environment event records
 * from the bundle's environment data.
 *
 * @param bundle - The normalized JudxBundle.
 * @param caseId - The UUID of the case row.
 * @returns An object with `regime` and `events` ready for insertion.
 */
export function normalizeEnvironment(
  bundle: JudxBundle,
  caseId: string,
): { regime: JudxJudgmentRegimeInsert; events: JudxEnvironmentEventInsert[] } {
  const inferred = bundle.environment.inferred || 'nao_informado';

  // Build the judgment path from events
  const judgmentPath: string[] = [inferred];
  for (const evt of bundle.environmentEvents) {
    if (evt.toEnvironment && !judgmentPath.includes(evt.toEnvironment)) {
      judgmentPath.push(evt.toEnvironment);
    }
  }

  // Determine final environment: last event's target, or the inferred value
  const finalEnvironment =
    bundle.environmentEvents.length > 0
      ? bundle.environmentEvents[bundle.environmentEvents.length - 1].toEnvironment
      : inferred;

  const regime: JudxJudgmentRegimeInsert = {
    case_id: caseId,
    initial_environment: inferred,
    current_environment: finalEnvironment,
    final_environment: finalEnvironment,
    judgment_path: judgmentPath,
    environment_source: bundle.environment.source,
    environment_confidence: bundle.environment.confidence,
    metadata: {
      evidence: bundle.environment.evidence,
    },
  };

  // Map environment events with order
  const events: JudxEnvironmentEventInsert[] = bundle.environmentEvents.map((evt, index) => ({
    case_id: caseId,
    event_type: evt.eventType,
    to_environment: evt.toEnvironment,
    evidence: evt.evidence ?? null,
    event_order: index + 1,
  }));

  logInfo('environmentNormalizer', `Environment for case ${caseId}: ${inferred}`, {
    eventCount: events.length,
    judgmentPath,
  });

  return { regime, events };
}
