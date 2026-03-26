import { getJudxClient } from '../shared/db';
import { logError, logInfo } from '../shared/logger';

const CTX = 'upsertDecision';

export interface UpsertDecisionData {
  case_id: string;
  decision_date?: string | null;
  kind: string;
  result: string;
  session_environment?: string;
  full_text?: string | null;
  excerpt?: string | null;
  metadata?: Record<string, unknown>;
  observation_state?: string;
  contradiction_flag?: boolean;
  stability_flag?: boolean;
}

/**
 * Inserts a decision into judx_decision.
 * Decisions are append-per-case, but we check for existing records
 * by (case_id + decision_date) to avoid duplicates.
 * Returns the decision UUID or null on error.
 */
export async function upsertDecision(data: UpsertDecisionData): Promise<string | null> {
  const client = getJudxClient();

  try {
    // Check for existing decision with same case_id and decision_date to avoid duplicates
    if (data.decision_date) {
      const { data: existing, error: checkErr } = await client
        .from('judx_decision')
        .select('id')
        .eq('case_id', data.case_id)
        .eq('decision_date', data.decision_date)
        .eq('kind', data.kind)
        .maybeSingle();

      if (checkErr) {
        logError(CTX, `Duplicate check failed: ${checkErr.message}`, { case_id: data.case_id });
      }

      if (existing) {
        logInfo(CTX, `Decision already exists for case ${data.case_id} on ${data.decision_date} -> ${existing.id}`);
        return existing.id as string;
      }
    }

    const row: Record<string, unknown> = {
      case_id: data.case_id,
      decision_date: data.decision_date ?? null,
      kind: data.kind,
      result: data.result,
      session_environment: data.session_environment ?? null,
      full_text: data.full_text ?? null,
      excerpt: data.excerpt ?? null,
      metadata: data.metadata ?? null,
      observation_state: data.observation_state ?? null,
      contradiction_flag: data.contradiction_flag ?? false,
      stability_flag: data.stability_flag ?? false,
    };

    const { data: result, error } = await client
      .from('judx_decision')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      logError(CTX, `Insert failed: ${error.message}`, { case_id: data.case_id });
      return null;
    }

    const id = result?.id as string;
    logInfo(CTX, `Inserted decision for case ${data.case_id} -> ${id}`);
    return id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Exception: ${msg}`, { case_id: data.case_id });
    return null;
  }
}
