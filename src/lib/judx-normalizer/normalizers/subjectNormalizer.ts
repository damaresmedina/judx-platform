// judx-normalizer — Subject normalizer
// Maps a subject (tema) to the shape expected by the judx_subjects table.
// Subjects are court-independent.

import { cleanText, slugify } from '../shared/text';
import { logInfo } from '../shared/logger';

// ---------------------------------------------------------------------------
// Insert type
// ---------------------------------------------------------------------------

export type JudxSubjectInsert = {
  raw_name: string;
  normalized_name: string;
  slug: string;
};

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * Produces a row-shaped object ready for upsert into `judx_subjects`.
 * Returns null if the subject is null or empty.
 * Subjects are court-independent — no court_id needed.
 *
 * @param tema - The raw subject/tema from the source.
 * @returns An insert-ready object or null.
 */
export function normalizeSubject(tema: string | null): JudxSubjectInsert | null {
  if (!tema || tema.trim().length === 0) {
    return null;
  }

  const rawName = tema.trim();
  const normalized = cleanText(rawName);
  const slug = slugify(rawName);

  logInfo('subjectNormalizer', `Normalized subject: "${rawName}" -> "${normalized}"`);

  return {
    raw_name: rawName,
    normalized_name: normalized,
    slug,
  };
}
