import { getJudxClient } from '../shared/db';
import { logError, logInfo } from '../shared/logger';

const CTX = 'upsertEnvironmentEvent';

export interface UpsertEnvironmentEventData {
  case_id: string;
  decision_id?: string | null;
  to_environment: string;
  event_type: string;
  reason_category?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Inserts a row into judx_judgment_environment_event.
 * Append-only table. Returns the UUID or null on error.
 */
export async function upsertEnvironmentEvent(data: UpsertEnvironmentEventData): Promise<string | null> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    case_id: data.case_id,
    decision_id: data.decision_id ?? null,
    to_environment: data.to_environment,
    event_type: data.event_type,
    reason_category: data.reason_category ?? null,
    metadata: data.metadata ?? null,
  };

  try {
    const { data: result, error } = await client
      .from('judx_judgment_environment_event')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      logError(CTX, `Insert failed: ${error.message}`, { case_id: data.case_id });
      return null;
    }

    const id = result?.id as string;
    logInfo(CTX, `Inserted environment event for case ${data.case_id} -> ${id}`);
    return id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Exception: ${msg}`, { case_id: data.case_id });
    return null;
  }
}
