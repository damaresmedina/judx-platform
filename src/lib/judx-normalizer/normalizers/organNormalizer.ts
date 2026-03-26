// judx-normalizer — Organ normalizer
// Maps an organ name to the shape expected by the judx_organs table.

import { normalizeOrganName, slugify } from '../shared/text';
import { logInfo, logInference } from '../shared/logger';

// ---------------------------------------------------------------------------
// Insert type
// ---------------------------------------------------------------------------

export type JudxOrganInsert = {
  raw_name: string;
  normalized_name: string;
  slug: string;
  organ_type: string;
  court_id: string;
};

// ---------------------------------------------------------------------------
// Organ type inference
// ---------------------------------------------------------------------------

const ORGAN_TYPE_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /plen[aá]rio/i, type: 'plenario' },
  { pattern: /corte\s+especial/i, type: 'corte_especial' },
  { pattern: /se[cç][aã]o/i, type: 'secao' },
  { pattern: /turma/i, type: 'turma' },
];

function inferOrganType(name: string): string {
  for (const { pattern, type } of ORGAN_TYPE_PATTERNS) {
    if (pattern.test(name)) {
      return type;
    }
  }
  return 'outro';
}

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * Produces a row-shaped object ready for upsert into `judx_organs`.
 * Returns null if the organ name is null or empty.
 *
 * @param organName - The raw organ name from the source.
 * @param courtId   - The UUID of the court row.
 * @returns An insert-ready object or null.
 */
export function normalizeOrgan(
  organName: string | null,
  courtId: string,
): JudxOrganInsert | null {
  if (!organName || organName.trim().length === 0) {
    return null;
  }

  const rawName = organName.trim();
  const normalized = normalizeOrganName(rawName);
  const slug = slugify(rawName);
  const organType = inferOrganType(rawName);

  if (organType !== 'outro') {
    logInference('organNormalizer', 'organ_type', organType, 'name_pattern', 0.9, {
      rawName,
    });
  }

  logInfo('organNormalizer', `Normalized organ: "${rawName}" -> "${normalized}" (${organType})`, {
    courtId,
  });

  return {
    raw_name: rawName,
    normalized_name: normalized,
    slug,
    organ_type: organType,
    court_id: courtId,
  };
}
