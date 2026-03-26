import { getJudxClient } from '../shared/db';
import { logError, logInfo } from '../shared/logger';

const CTX = 'upsertEcology';

export interface JudxEcologyRow {
  id: string;
  court_id: string;
  ecology_label: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Upserts a row into judx_ecology.
 * Returns the ecology ID or null on error.
 */
export async function upsertEcology(
  courtId: string,
  data: Partial<JudxEcologyRow>
): Promise<string | null> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    ...data,
    court_id: courtId,
  };

  try {
    const { data: result, error } = await client
      .from('judx_ecology')
      .upsert(row, { onConflict: 'court_id,ecology_label' })
      .select('id')
      .single();

    if (error) {
      logError(CTX, `Upsert failed: ${error.message}`, { courtId, data });
      return null;
    }

    const id = result?.id as string;
    logInfo(CTX, `Upserted ecology -> ${id}`);
    return id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Exception: ${msg}`, { courtId });
    return null;
  }
}
