import { getJudxClient } from '../shared/db';
import { logError, logInfo } from '../shared/logger';
import { upsertInferenceAudit } from './upsertInferenceAudit';

const CTX = 'upsertRapporteurOutcome';

export interface UpsertRapporteurOutcomeData {
  case_id: string;
  decision_id?: string | null;
  relator_judge_id: string;
  substitute_judge_id?: string | null;
  outcome: string;
  environment?: string;
  inferred_from_text?: boolean;
  confidence?: number;
  source_fragment?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Inserts a row into judx_relator_decision_outcome.
 * Append-only table. Returns the UUID or null on error.
 */
export async function upsertRapporteurOutcome(data: UpsertRapporteurOutcomeData): Promise<string | null> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    case_id: data.case_id,
    decision_id: data.decision_id ?? null,
    relator_judge_id: data.relator_judge_id,
    substitute_judge_id: data.substitute_judge_id ?? null,
    outcome: data.outcome,
    environment: data.environment ?? null,
    inferred_from_text: data.inferred_from_text ?? false,
    confidence: data.confidence ?? null,
    source_fragment: data.source_fragment ?? null,
    metadata: data.metadata ?? null,
  };

  try {
    const { data: result, error } = await client
      .from('judx_relator_decision_outcome')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      logError(CTX, `Insert failed: ${error.message}`, { case_id: data.case_id });
      return null;
    }

    const id = result?.id as string;
    logInfo(CTX, `Inserted rapporteur outcome for case ${data.case_id} -> ${id}`);

    // Audit trail
    const plausibleAlt = data.outcome === 'vencido' ? 'prevaleceu'
      : data.outcome === 'prevaleceu' ? 'vencido'
      : null;

    await upsertInferenceAudit({
      hypothesis: `relator ${data.outcome} — detectado por padrão textual`,
      empirical_base: data.source_fragment ?? null,
      textual_evidence: data.source_fragment ?? null,
      counter_evidence: (data.confidence ?? 0) <= 0.90 ? 'padrão de baixa especificidade' : null,
      limitation: null,
      plausible_alternative: plausibleAlt,
      rule_applied: null,
      pipeline_layer: 'events',
      confidence_score: data.confidence ?? 0,
      source_table: 'judx_relator_decision_outcome',
      source_id: data.case_id,
    });

    return id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Exception: ${msg}`, { case_id: data.case_id });
    return null;
  }
}
