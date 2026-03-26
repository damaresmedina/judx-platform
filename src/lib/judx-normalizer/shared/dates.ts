// judx-normalizer date utilities

/**
 * Format a Date object as yyyy-mm-dd.
 */
export function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse various date representations into a yyyy-mm-dd string.
 *
 * Supported formats:
 *   - ISO 8601 strings (2024-01-15, 2024-01-15T10:30:00Z)
 *   - Brazilian dd/mm/yyyy
 *   - Compact yyyymmdd (as string or number)
 *   - Epoch milliseconds (number > 1e10)
 *
 * Returns null if the value is nullish or unparseable.
 */
export function parseDate(value: string | number | null | undefined): string | null {
  if (value == null) return null;

  // Epoch ms (numbers above ~year 2001 in ms)
  if (typeof value === 'number') {
    if (value > 1e12) {
      // likely epoch ms
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : toISODate(d);
    }
    // Try compact yyyymmdd as number (e.g. 20240115)
    if (value > 19000101 && value < 21000101) {
      const s = String(value);
      const y = parseInt(s.slice(0, 4), 10);
      const m = parseInt(s.slice(4, 6), 10);
      const day = parseInt(s.slice(6, 8), 10);
      const d = new Date(y, m - 1, day);
      return isNaN(d.getTime()) ? null : toISODate(d);
    }
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === '') return null;

  // dd/mm/yyyy or dd-mm-yyyy (Brazilian format)
  const brMatch = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10);
    const year = parseInt(brMatch[3], 10);
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime()) && d.getDate() === day) {
      return toISODate(d);
    }
    return null;
  }

  // Compact yyyymmdd string
  const compactMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const y = parseInt(compactMatch[1], 10);
    const m = parseInt(compactMatch[2], 10);
    const day = parseInt(compactMatch[3], 10);
    const d = new Date(y, m - 1, day);
    if (!isNaN(d.getTime()) && d.getDate() === day) {
      return toISODate(d);
    }
    return null;
  }

  // ISO 8601 or other parseable string
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return toISODate(d);
  }

  return null;
}

/**
 * Check whether a string is a valid yyyy-mm-dd date.
 */
export function isValidDate(s: string | null): boolean {
  if (!s) return false;
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const d = new Date(y, m - 1, day);
  return !isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() === day;
}
