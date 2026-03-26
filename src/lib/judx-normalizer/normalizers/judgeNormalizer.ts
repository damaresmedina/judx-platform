// judx-normalizer — Judge normalizer
// Maps a judge name to the shape expected by the judx_judges table.

import { normalizeJudgeName } from '../shared/text';
import { logInfo } from '../shared/logger';

// ---------------------------------------------------------------------------
// Insert type
// ---------------------------------------------------------------------------

export type JudxJudgeInsert = {
  name: string;
  normalized_name: string;
  court_id: string;
};

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * Produces a row-shaped object ready for upsert into `judx_judges`.
 * Unique constraint is on (court_id, normalized_name).
 *
 * @param name    - The original judge name as it appears in the source.
 * @param courtId - The UUID of the court row.
 * @returns An insert-ready object for `judx_judges`.
 */
export function normalizeJudge(name: string, courtId: string): JudxJudgeInsert {
  const normalized = normalizeJudgeName(name);

  logInfo('judgeNormalizer', `Normalized judge: "${name}" -> "${normalized}"`, { courtId });

  return {
    name,
    normalized_name: normalized,
    court_id: courtId,
  };
}
