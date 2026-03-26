// judx-normalizer content hashing for deduplication

import { createHash } from 'crypto';

/**
 * Returns the SHA-256 hex digest of the input string.
 */
export function contentHash(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Build a deterministic signature from an array of parts.
 * Filters out null/undefined, joins remaining parts with `|`, and hashes the result.
 *
 * Useful for building dedup keys from multiple fields of a record.
 */
export function recordSignature(parts: (string | null | undefined)[]): string {
  const joined = parts.filter((p): p is string => p != null).join('|');
  return contentHash(joined);
}
