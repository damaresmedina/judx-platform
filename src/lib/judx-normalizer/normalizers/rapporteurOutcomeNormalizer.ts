// judx-normalizer — Rapporteur outcome normalizer
// Maps rapporteur outcome data from a JudxBundle to the judx_relator_decision_outcomes table.

import type { JudxBundle } from '../shared/types';
import { normalizeJudgeName } from '../shared/text';
import { logInfo, logWarn } from '../shared/logger';

// ---------------------------------------------------------------------------
// Insert type
// ---------------------------------------------------------------------------

export type JudxRapporteurOutcomeInsert = {
  case_id: string;
  decision_id: string | null;
  relator_judge_id: string | null;
  substitute_judge_id: string | null;
  outcome: string;
  evidence: string | null;
  confidence: number;
  metadata: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * Creates a rapporteur outcome record if the bundle contains one.
 * Returns null if bundle.rapporteurOutcome is null.
 *
 * @param bundle     - The normalized JudxBundle.
 * @param caseId     - The UUID of the case row.
 * @param decisionId - The UUID of the decision (may be null).
 * @param judgeIdMap - Map of normalized_name -> judge UUID.
 * @returns An insert-ready object or null.
 */
export function normalizeRapporteurOutcome(
  bundle: JudxBundle,
  caseId: string,
  decisionId: string | null,
  judgeIdMap: Map<string, string>,
): JudxRapporteurOutcomeInsert | null {
  if (!bundle.rapporteurOutcome) {
    return null;
  }

  const ro = bundle.rapporteurOutcome;

  // Resolve relator judge ID
  const relatorNormalized = normalizeJudgeName(ro.relatorName);
  let relatorJudgeId: string | null = null;
  for (const [key, id] of judgeIdMap.entries()) {
    if (key.toLowerCase() === relatorNormalized.toLowerCase()) {
      relatorJudgeId = id;
      break;
    }
  }

  if (!relatorJudgeId) {
    logWarn('rapporteurOutcomeNormalizer', `Could not resolve relator judge ID for "${ro.relatorName}"`, {
      caseId,
      normalizedName: relatorNormalized,
    });
  }

  // Resolve substitute judge ID (if present)
  let substituteJudgeId: string | null = null;
  if (ro.substituteName) {
    const substituteNormalized = normalizeJudgeName(ro.substituteName);
    for (const [key, id] of judgeIdMap.entries()) {
      if (key.toLowerCase() === substituteNormalized.toLowerCase()) {
        substituteJudgeId = id;
        break;
      }
    }

    if (!substituteJudgeId) {
      logWarn('rapporteurOutcomeNormalizer', `Could not resolve substitute judge ID for "${ro.substituteName}"`, {
        caseId,
      });
    }
  }

  logInfo('rapporteurOutcomeNormalizer', `Rapporteur outcome: ${ro.outcome}`, {
    caseId,
    relatorName: ro.relatorName,
    substituteName: ro.substituteName,
    confidence: ro.confidence,
  });

  return {
    case_id: caseId,
    decision_id: decisionId,
    relator_judge_id: relatorJudgeId,
    substitute_judge_id: substituteJudgeId,
    outcome: ro.outcome,
    evidence: ro.evidence ?? null,
    confidence: ro.confidence,
    metadata: {
      relator_name_original: ro.relatorName,
      substitute_name_original: ro.substituteName,
    },
  };
}
