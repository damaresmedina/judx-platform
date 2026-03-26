import { getJudxClient } from '../shared/db';
import { logError, logInfo } from '../shared/logger';

const CTX = 'upsertLitigant';

export interface UpsertLitigantData {
  name: string;
  normalizedName: string;
  litigantType?: string;
  stateEntity: boolean;
  stateEntityKind?: string;
}

/**
 * Upserts a row into judx_litigant on conflict (normalized_name).
 * Returns the UUID or null on error.
 */
export async function upsertLitigant(data: UpsertLitigantData): Promise<string | null> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    name: data.name,
    normalized_name: data.normalizedName,
    litigant_type: data.litigantType ?? null,
    state_entity: data.stateEntity,
    state_entity_kind: data.stateEntityKind ?? null,
  };

  try {
    const { data: result, error } = await client
      .from('judx_litigant')
      .upsert(row, { onConflict: 'normalized_name' })
      .select('id')
      .single();

    if (error) {
      logError(CTX, `Upsert failed: ${error.message}`, { name: data.name });
      return null;
    }

    const id = result?.id as string;
    logInfo(CTX, `Upserted litigant "${data.name}" -> ${id}`);
    return id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Exception: ${msg}`, { name: data.name });
    return null;
  }
}
