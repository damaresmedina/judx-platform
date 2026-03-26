// judx-normalizer — Case normalizer
// Maps a JudxBundle to the shape expected by the judx_cases table.

import type { JudxBundle } from '../shared/types';
import { cleanText } from '../shared/text';
import { logInfo } from '../shared/logger';

// ---------------------------------------------------------------------------
// Insert type
// ---------------------------------------------------------------------------

export type JudxCaseInsert = {
  external_number: string;
  court_id: string;
  phase: string;
  decided_at: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  source_table: string;
  source_id: string;
};

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * Produces a row-shaped object ready for upsert into `judx_cases`.
 *
 * @param bundle  - The normalized JudxBundle for a single decision.
 * @param courtId - The UUID of the court row (looked up beforehand).
 * @returns An insert-ready object for `judx_cases`.
 */
export function normalizeCase(bundle: JudxBundle, courtId: string): JudxCaseInsert {
  const excerpt = cleanText(bundle.decision.excerpt);
  const summary = excerpt.length > 0 ? excerpt.slice(0, 500) : null;

  const decidedAt = bundle.decision.date ?? null;

  logInfo('caseNormalizer', `Normalizing case ${bundle.externalNumber}`, {
    courtId,
    decidedAt,
    hasSummary: summary !== null,
  });

  return {
    external_number: bundle.externalNumber,
    court_id: courtId,
    phase: 'outra',
    decided_at: decidedAt,
    summary,
    metadata: bundle.rawMetadata,
    source_table: bundle.sourceTable,
    source_id: bundle.sourceId,
  };
}
