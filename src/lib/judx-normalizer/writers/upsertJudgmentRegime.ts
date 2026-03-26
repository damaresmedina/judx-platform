import { getJudxClient } from '../shared/db';
import { logError, logInfo } from '../shared/logger';

const CTX = 'upsertJudgmentRegime';

export interface UpsertJudgmentRegimeData {
  case_id: string;
  initial_environment: string;
  current_environment: string;
  final_environment?: string | null;
  judgment_path?: string;
}

/**
 * Upserts a row into judx_judgment_regime on conflict (case_id).
 * Returns the UUID or null on error.
 */
export async function upsertJudgmentRegime(data: UpsertJudgmentRegimeData): Promise<string | null> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    case_id: data.case_id,
    initial_environment: data.initial_environment,
    current_environment: data.current_environment,
    final_environment: data.final_environment ?? null,
    judgment_path: data.judgment_path ?? null,
  };

  try {
    const { data: result, error } = await client
      .from('judx_judgment_regime')
      .upsert(row, { onConflict: 'case_id' })
      .select('id')
      .single();

    if (error) {
      logError(CTX, `Upsert failed: ${error.message}`, { case_id: data.case_id });
      return null;
    }

    const id = result?.id as string;
    logInfo(CTX, `Upserted judgment regime for case ${data.case_id} -> ${id}`);
    return id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Exception: ${msg}`, { case_id: data.case_id });
    return null;
  }
}
