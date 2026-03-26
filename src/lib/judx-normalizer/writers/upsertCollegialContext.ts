import { getJudxClient } from '../shared/db';
import { logError, logInfo } from '../shared/logger';

const CTX = 'upsertCollegialContext';

export interface UpsertCollegialContextData {
  case_id: string;
  decision_id?: string | null;
  organ_id?: string | null;
  session_environment?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Inserts a row into judx_collegial_context.
 * Append-only table. Returns the UUID or null on error.
 */
export async function upsertCollegialContext(data: UpsertCollegialContextData): Promise<string | null> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    case_id: data.case_id,
    decision_id: data.decision_id ?? null,
    organ_id: data.organ_id ?? null,
    session_environment: data.session_environment ?? null,
    metadata: data.metadata ?? null,
  };

  try {
    const { data: result, error } = await client
      .from('judx_collegial_context')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      logError(CTX, `Insert failed: ${error.message}`, { case_id: data.case_id });
      return null;
    }

    const id = result?.id as string;
    logInfo(CTX, `Inserted collegial context for case ${data.case_id} -> ${id}`);
    return id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Exception: ${msg}`, { case_id: data.case_id });
    return null;
  }
}
