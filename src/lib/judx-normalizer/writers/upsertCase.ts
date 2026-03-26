import { getJudxClient } from '../shared/db';
import { logError, logInfo } from '../shared/logger';

const CTX = 'upsertCase';

export interface UpsertCaseData {
  external_number: string;
  court_id: string;
  organ_id?: string | null;
  procedural_class_id?: string | null;
  main_subject_id?: string | null;
  phase?: string;
  decided_at?: string | null;
  state_involved?: boolean;
  summary?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Upserts a row into judx_case on conflict (external_number).
 * On conflict, updates: organ_id, decided_at, summary, metadata (merged).
 * Returns the case UUID or null on error.
 */
export async function upsertCase(data: UpsertCaseData): Promise<string | null> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    external_number: data.external_number,
    court_id: data.court_id,
    organ_id: data.organ_id ?? null,
    procedural_class_id: data.procedural_class_id ?? null,
    main_subject_id: data.main_subject_id ?? null,
    phase: data.phase ?? null,
    decided_at: data.decided_at ?? null,
    state_involved: data.state_involved ?? false,
    summary: data.summary ?? null,
    metadata: data.metadata ?? null,
  };

  try {
    // First attempt upsert
    const { data: result, error } = await client
      .from('judx_case')
      .upsert(row, { onConflict: 'external_number' })
      .select('id, metadata')
      .single();

    if (error) {
      logError(CTX, `Upsert failed: ${error.message}`, { external_number: data.external_number });
      return null;
    }

    const id = result?.id as string;

    // If there was existing metadata, merge it with the new metadata
    if (data.metadata && result?.metadata) {
      const existingMeta = result.metadata as Record<string, unknown>;
      const mergedMeta = { ...existingMeta, ...data.metadata };

      const { error: updateErr } = await client
        .from('judx_case')
        .update({ metadata: mergedMeta })
        .eq('id', id);

      if (updateErr) {
        logError(CTX, `Metadata merge failed: ${updateErr.message}`, { id });
      }
    }

    logInfo(CTX, `Upserted case "${data.external_number}" -> ${id}`);
    return id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Exception: ${msg}`, { external_number: data.external_number });
    return null;
  }
}
