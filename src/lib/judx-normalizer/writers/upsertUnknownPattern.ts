import { getJudxClient } from '../shared/db';
import { logError, logInfo } from '../shared/logger';

const CTX = 'upsertUnknownPattern';

export interface UpsertUnknownPatternData {
  court_id?: string | null;
  pattern_label: string;
  description?: string | null;
  hypothesis?: Record<string, unknown>;
  linked_cases?: unknown[];
}

/**
 * Inserts a row into judx_unknown_pattern_registry.
 * Append-only table. Returns the UUID or null on error.
 */
export async function upsertUnknownPattern(data: UpsertUnknownPatternData): Promise<string | null> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    court_id: data.court_id ?? null,
    pattern_label: data.pattern_label,
    description: data.description ?? null,
    hypothesis: data.hypothesis ?? null,
    linked_cases: data.linked_cases ?? null,
  };

  try {
    const { data: result, error } = await client
      .from('judx_unknown_pattern_registry')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      logError(CTX, `Insert failed: ${error.message}`, { pattern_label: data.pattern_label });
      return null;
    }

    const id = result?.id as string;
    logInfo(CTX, `Inserted unknown pattern "${data.pattern_label}" -> ${id}`);
    return id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Exception: ${msg}`, { pattern_label: data.pattern_label });
    return null;
  }
}
