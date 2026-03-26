import { getJudxClient } from '../shared/db';
import { logError, logInfo } from '../shared/logger';

const CTX = 'upsertProceduralClass';

/**
 * Upserts a row into judx_procedural_class on conflict (court_id, normalized_name).
 * Returns the UUID or null on error.
 */
export async function upsertProceduralClass(
  courtId: string,
  rawName: string,
  normalizedName: string
): Promise<string | null> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    court_id: courtId,
    raw_name: rawName,
    normalized_name: normalizedName,
  };

  try {
    const { data, error } = await client
      .from('judx_procedural_class')
      .upsert(row, { onConflict: 'court_id,normalized_name' })
      .select('id')
      .single();

    if (error) {
      logError(CTX, `Upsert failed: ${error.message}`, { courtId, rawName });
      return null;
    }

    const id = data?.id as string;
    logInfo(CTX, `Upserted procedural class "${rawName}" -> ${id}`);
    return id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Exception: ${msg}`, { courtId, rawName });
    return null;
  }
}
