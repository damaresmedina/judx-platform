// judx-normalizer text normalization utilities

/**
 * Convert text to a URL/ID-safe slug:
 * lowercase, strip accents, replace non-alphanumeric sequences with underscore.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Convert a string to Title Case (first letter of each word uppercase).
 */
function toTitleCase(s: string): string {
  return s.replace(/\S+/g, (word) => {
    // Keep short prepositions/articles lowercase (common in Portuguese names)
    const lower = word.toLowerCase();
    const minor = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'nos', 'nas', 'o', 'a', 'os', 'as']);
    if (minor.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}

/**
 * Normalize a judge (Ministro) name:
 * - Remove common prefixes (Min., Ministro, Ministra)
 * - Trim and collapse whitespace
 * - Title case
 */
export function normalizeJudgeName(name: string): string {
  let cleaned = name
    .replace(/\bMinistr[oa]\b\.?/gi, '')
    .replace(/\bMin\b\.?/gi, '')
    .replace(/\bDes\b\.?/gi, '')
    .replace(/\bDr\b\.?/gi, '')
    .trim()
    .replace(/\s+/g, ' ');

  return toTitleCase(cleaned);
}

/**
 * Normalize an organ (orgao julgador) name:
 * - Trim
 * - Collapse whitespace
 * - Title case
 */
export function normalizeOrganName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, ' ');
  return toTitleCase(cleaned);
}

/**
 * Normalize a procedural class name:
 * - Trim
 * - Collapse whitespace
 * - Title case
 */
export function normalizeClassName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, ' ');
  return toTitleCase(cleaned);
}

/**
 * Extract the first N lines from a full text block.
 * Returns empty string if input is null/empty.
 */
export function extractHeader(fullText: string | null, maxLines: number = 10): string {
  if (!fullText) return '';
  const lines = fullText.split(/\r?\n/);
  return lines.slice(0, maxLines).join('\n').trim();
}

/**
 * Clean arbitrary text: trim, collapse whitespace, return empty string for nullish.
 */
export function cleanText(text: string | null | undefined): string {
  if (text == null) return '';
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Splits a raw processo string into classe, UF and numero.
 * Canonical location for this logic — used by stj-sync.ts and adapters.
 */
export function splitProcessoFields(raw: string | null | undefined): {
  classe: string;
  uf: string | null;
  processo: string;
} {
  const s = (raw ?? '').trim();
  if (!s) return { classe: '', uf: null, processo: '' };

  const ufMatch = s.match(/\/([A-Za-z]{2})\s*$/);
  const uf = ufMatch ? ufMatch[1].toUpperCase() : null;

  const firstDig = s.search(/\d/);
  const classe = firstDig === -1 ? s.trim() : s.slice(0, firstDig).trim();

  if (firstDig === -1) {
    return { classe: classe || '', uf, processo: '' };
  }

  let rest = s.slice(firstDig);
  rest = rest.replace(/\/[A-Za-z]{2}\s*$/i, '').trim();
  const processo = rest.replace(/[^\d.]/g, '');
  return { classe, uf, processo };
}
