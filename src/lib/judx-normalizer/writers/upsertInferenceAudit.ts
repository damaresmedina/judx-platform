// Append-only — cada inferência é um evento imutável, nunca upsert
import { getJudxClient } from '../shared/db';
import { logError, logInfo } from '../shared/logger';

const CTX = 'upsertInferenceAudit';

export type InferenceAuditEntry = {
  hypothesis: string;
  empirical_base: string | null;
  textual_evidence: string | null;
  counter_evidence: string | null;
  limitation: string | null;
  plausible_alternative: string | null;
  rule_applied: string | null;
  pipeline_layer: string;
  confidence_score: number;
  source_table: string;
  source_id: string;
};

/**
 * Inserts an audit record into judx_inference_audit.
 * Append-only — never throws, only logs errors.
 */
export async function upsertInferenceAudit(entry: InferenceAuditEntry): Promise<void> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    hypothesis: entry.hypothesis,
    empirical_base: entry.empirical_base,
    textual_evidence: entry.textual_evidence,
    counter_evidence: entry.counter_evidence,
    limitation: entry.limitation,
    plausible_alternative: entry.plausible_alternative,
    rule_applied: entry.rule_applied,
    pipeline_layer: entry.pipeline_layer,
    confidence_score: entry.confidence_score,
    source_table: entry.source_table,
    source_id: entry.source_id,
  };

  try {
    const { error } = await client
      .from('judx_inference_audit')
      .insert(row);

    if (error) {
      logError(CTX, `Insert failed: ${error.message}`, { source_id: entry.source_id });
      return;
    }

    logInfo(CTX, `Audit recorded: ${entry.hypothesis.slice(0, 80)}`, { source_id: entry.source_id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Exception: ${msg}`, { source_id: entry.source_id });
  }
}
