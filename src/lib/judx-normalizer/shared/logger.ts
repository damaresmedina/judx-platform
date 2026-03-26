// judx-normalizer structured logger

const PREFIX = '[judx-normalizer]';

function ts(): string {
  return new Date().toISOString();
}

function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return '';
  return ' ' + JSON.stringify(meta);
}

/**
 * Log an informational message.
 */
export function logInfo(context: string, msg: string, meta?: Record<string, unknown>): void {
  console.log(`${ts()} ${PREFIX} [${context}] INFO: ${msg}${formatMeta(meta)}`);
}

/**
 * Log a warning message.
 */
export function logWarn(context: string, msg: string, meta?: Record<string, unknown>): void {
  console.warn(`${ts()} ${PREFIX} [${context}] WARN: ${msg}${formatMeta(meta)}`);
}

/**
 * Log an error message.
 */
export function logError(context: string, msg: string, meta?: Record<string, unknown>): void {
  console.error(`${ts()} ${PREFIX} [${context}] ERROR: ${msg}${formatMeta(meta)}`);
}

/**
 * Log an inference event — used when the normalizer infers a value that was
 * not explicitly present in the source data.
 */
export function logInference(
  context: string,
  field: string,
  value: string,
  source: string,
  confidence: number,
  meta?: Record<string, unknown>
): void {
  console.log(
    `${ts()} ${PREFIX} [${context}] INFERENCE: field=${field} value="${value}" source=${source} confidence=${confidence.toFixed(2)}${formatMeta(meta)}`
  );
}
