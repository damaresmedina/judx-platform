import { getJudxClient } from '../shared/db';
import { logError, logInfo } from '../shared/logger';
import { upsertInferenceAudit } from './upsertInferenceAudit';

const CTX = 'upsertEnvironmentInference';

export interface UpsertEnvironmentInferenceData {
  case_id: string;
  inferred_driver: string;
  confidence: number;
  evidence: Record<string, unknown>;
  auto_description?: string;
  source_table?: string;
  source_id?: string;
  environment_source?: string;
  rule_applied?: string;
}

/**
 * Inserts a row into judx_environment_inference.
 * Append-only table. Returns the UUID or null on error.
 */
export async function upsertEnvironmentInference(data: UpsertEnvironmentInferenceData): Promise<string | null> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    case_id: data.case_id,
    inferred_driver: data.inferred_driver,
    confidence: data.confidence,
    evidence: data.evidence,
    auto_description: data.auto_description ?? null,
  };

  try {
    const { data: result, error } = await client
      .from('judx_environment_inference')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      logError(CTX, `Insert failed: ${error.message}`, { case_id: data.case_id });
      return null;
    }

    const id = result?.id as string;
    logInfo(CTX, `Inserted environment inference for case ${data.case_id} -> ${id}`);

    // Audit trail
    await upsertInferenceAudit({
      hypothesis: `ambiente inferido como ${data.inferred_driver} a partir de ${data.environment_source ?? 'unknown'}`,
      empirical_base: typeof data.evidence === 'object' ? JSON.stringify(data.evidence) : null,
      textual_evidence: data.evidence?.['text_fragment'] as string ?? null,
      counter_evidence: data.confidence < 0.85 ? 'confiança abaixo do limiar primário' : null,
      limitation: data.environment_source !== 'structured_field' ? 'inferência textual — sem campo estruturado na fonte' : null,
      plausible_alternative: null,
      rule_applied: data.rule_applied ?? null,
      pipeline_layer: 'events',
      confidence_score: data.confidence,
      source_table: data.source_table ?? 'unknown',
      source_id: data.source_id ?? data.case_id,
    });

    return id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Exception: ${msg}`, { case_id: data.case_id });
    return null;
  }
}
