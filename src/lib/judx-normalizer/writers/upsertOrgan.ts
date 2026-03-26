import { getJudxClient } from '../shared/db';
import { logError, logInfo } from '../shared/logger';

const CTX = 'upsertOrgan';

/**
 * Upserts a row into judx_organ on conflict (court_id, normalized_name).
 * Returns the organ UUID or null on error.
 */
export async function upsertOrgan(
  courtId: string,
  name: string,
  normalizedName: string,
  organType: string | null
): Promise<string | null> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    court_id: courtId,
    name,
    normalized_name: normalizedName,
    organ_type: organType,
  };

  try {
    const { data, error } = await client
      .from('judx_organ')
      .upsert(row, { onConflict: 'court_id,normalized_name' })
      .select('id')
      .single();

    if (error) {
      logError(CTX, `Upsert failed: ${error.message}`, { courtId, name });
      return null;
    }

    const id = data?.id as string;
    logInfo(CTX, `Upserted organ "${name}" -> ${id}`);
    return id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Exception: ${msg}`, { courtId, name });
    return null;
  }
}
