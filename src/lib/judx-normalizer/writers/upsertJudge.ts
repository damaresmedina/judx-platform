import { getJudxClient } from '../shared/db';
import { logError, logInfo } from '../shared/logger';

const CTX = 'upsertJudge';

const judgeCache = new Map<string, string>();

/**
 * Upserts a row into judx_judge on conflict (court_id, normalized_name).
 * Returns the UUID or null on error. Caches results in-memory.
 */
export async function upsertJudge(
  courtId: string,
  name: string,
  normalizedName: string
): Promise<string | null> {
  const cacheKey = `${courtId}:${normalizedName}`;
  const cached = judgeCache.get(cacheKey);
  if (cached) return cached;

  const client = getJudxClient();

  const row: Record<string, unknown> = {
    court_id: courtId,
    name,
    normalized_name: normalizedName,
  };

  try {
    const { data, error } = await client
      .from('judx_judge')
      .upsert(row, { onConflict: 'court_id,normalized_name' })
      .select('id')
      .single();

    if (error) {
      logError(CTX, `Upsert failed: ${error.message}`, { courtId, name });
      return null;
    }

    const id = data?.id as string;
    judgeCache.set(cacheKey, id);
    logInfo(CTX, `Upserted judge "${name}" -> ${id}`);
    return id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Exception: ${msg}`, { courtId, name });
    return null;
  }
}
