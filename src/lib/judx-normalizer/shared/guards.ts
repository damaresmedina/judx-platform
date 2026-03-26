// judx-normalizer validation guards

/**
 * Type guard: checks that a value is a non-null, non-empty string after trim.
 */
export function isNonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Checks that at least one of the required fields in `obj` is non-empty.
 * Useful for minimum-context validation before attempting normalization.
 */
export function hasMinContext(
  obj: Record<string, unknown>,
  requiredFields: string[]
): boolean {
  return requiredFields.some((field) => isNonEmpty(obj[field]));
}

/**
 * Asserts that a value is not null or undefined.
 * Throws a descriptive error if the assertion fails.
 *
 * @returns The value, narrowed to non-nullable T.
 */
export function requireField<T>(value: T | null | undefined, fieldName: string): T {
  if (value === null || value === undefined) {
    throw new Error(`[judx-normalizer] Required field "${fieldName}" is null or undefined.`);
  }
  return value;
}
