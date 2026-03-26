// judx-normalizer — Procedural class normalizer
// Maps a class name to the shape expected by the judx_procedural_classes table.

import { normalizeClassName, slugify } from '../shared/text';
import { logInfo } from '../shared/logger';

// ---------------------------------------------------------------------------
// Insert type
// ---------------------------------------------------------------------------

export type JudxProceduralClassInsert = {
  raw_name: string;
  normalized_name: string;
  slug: string;
  court_id: string;
};

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * Produces a row-shaped object ready for upsert into `judx_procedural_classes`.
 * Returns null if the class name is null or empty.
 *
 * @param className - The raw procedural class name from the source.
 * @param courtId   - The UUID of the court row.
 * @returns An insert-ready object or null.
 */
export function normalizeClass(
  className: string | null,
  courtId: string,
): JudxProceduralClassInsert | null {
  if (!className || className.trim().length === 0) {
    return null;
  }

  const rawName = className.trim();
  const normalized = normalizeClassName(rawName);
  const slug = slugify(rawName);

  logInfo('classNormalizer', `Normalized class: "${rawName}" -> "${normalized}"`, { courtId });

  return {
    raw_name: rawName,
    normalized_name: normalized,
    slug,
    court_id: courtId,
  };
}
