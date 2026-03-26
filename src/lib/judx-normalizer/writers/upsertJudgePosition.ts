import { getJudxClient } from '../shared/db';
import { logError, logInfo } from '../shared/logger';

const CTX = 'upsertJudgePosition';

export interface UpsertJudgePositionData {
  case_id: string;
  decision_id?: string | null;
  judge_id: string;
  role: string;
  vote_type?: string;
  authored_vote?: boolean;
  leading_vote?: boolean;
  majority_side?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Inserts a row into judx_judge_position_in_case.
 * This is an append-only table (a judge may hold multiple positions across decisions).
 * Returns the UUID or null on error.
 */
export async function upsertJudgePosition(data: UpsertJudgePositionData): Promise<string | null> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    case_id: data.case_id,
    decision_id: data.decision_id ?? null,
    judge_id: data.judge_id,
    role: data.role,
    vote_type: data.vote_type ?? null,
    authored_vote: data.authored_vote ?? false,
    leading_vote: data.leading_vote ?? false,
    majority_side: data.majority_side ?? null,
    metadata: data.metadata ?? null,
  };

  try {
    const { data: result, error } = await client
      .from('judx_judge_position_in_case')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      logError(CTX, `Insert failed: ${error.message}`, { case_id: data.case_id, judge_id: data.judge_id });
      return null;
    }

    const id = result?.id as string;
    logInfo(CTX, `Inserted judge position for judge ${data.judge_id} in case ${data.case_id} -> ${id}`);
    return id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Exception: ${msg}`, { case_id: data.case_id, judge_id: data.judge_id });
    return null;
  }
}
