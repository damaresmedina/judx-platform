import { getJudxClient } from '../shared/db';
import { logError, logInfo } from '../shared/logger';

const CTX = 'upsertSubject';

/**
 * Upserts a row into judx_subject on conflict (normalized_name).
 * Returns the UUID or null on error.
 */
export async function upsertSubject(
  name: string,
  normalizedName: string
): Promise<string | null> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    name,
    normalized_name: normalizedName,
  };

  try {
    const { data, error } = await client
      .from('judx_subject')
      .upsert(row, { onConflict: 'normalized_name' })
      .select('id')
      .single();

    if (error) {
      logError(CTX, `Upsert failed: ${error.message}`, { name });
      return null;
    }

    const id = data?.id as string;
    logInfo(CTX, `Upserted subject "${name}" -> ${id}`);
    return id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Exception: ${msg}`, { name });
    return null;
  }
}
