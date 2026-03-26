import { getJudxClient } from '../shared/db';
import { logError, logInfo } from '../shared/logger';

const CTX = 'upsertCaseLitigants';

/**
 * Upserts rows into judx_case_litigant on conflict (case_id, litigant_id, procedural_position).
 * Idempotent: re-running with the same data produces no duplicates.
 */
export async function upsertCaseLitigants(
  caseId: string,
  litigantIds: Array<{ litigantId: string; proceduralPosition: string; isStateSide: boolean }>
): Promise<void> {
  if (litigantIds.length === 0) return;

  const client = getJudxClient();

  const rows = litigantIds.map((l) => ({
    case_id: caseId,
    litigant_id: l.litigantId,
    procedural_position: l.proceduralPosition,
    is_state_side: l.isStateSide,
  }));

  try {
    const { error } = await client
      .from('judx_case_litigant')
      .upsert(rows, { onConflict: 'case_id,litigant_id,procedural_position', ignoreDuplicates: true })
      .select('id');

    if (error) {
      logError(CTX, `Upsert failed: ${error.message}`, { caseId, count: litigantIds.length });
      return;
    }

    logInfo(CTX, `Upserted ${litigantIds.length} case-litigant links for case ${caseId}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Exception: ${msg}`, { caseId });
  }
}
