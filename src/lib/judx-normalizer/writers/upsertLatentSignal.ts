import { getJudxClient } from '../shared/db';
import { logError, logInfo } from '../shared/logger';

const CTX = 'upsertLatentSignal';

export interface UpsertLatentSignalData {
  case_id?: string | null;
  decision_id?: string | null;
  judge_id?: string | null;
  signal_domain: string;
  signal_name: string;
  signal_value?: number | null;
  signal_payload?: Record<string, unknown>;
  extracted_from?: string;
}

/**
 * Inserts a row into judx_latent_signal.
 * Append-only table. Returns the UUID or null on error.
 */
export async function upsertLatentSignal(data: UpsertLatentSignalData): Promise<string | null> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    case_id: data.case_id ?? null,
    decision_id: data.decision_id ?? null,
    judge_id: data.judge_id ?? null,
    signal_domain: data.signal_domain,
    signal_name: data.signal_name,
    signal_value: data.signal_value ?? null,
    signal_payload: data.signal_payload ?? null,
    extracted_from: data.extracted_from ?? null,
  };

  try {
    const { data: result, error } = await client
      .from('judx_latent_signal')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      logError(CTX, `Insert failed: ${error.message}`, { signal_domain: data.signal_domain, signal_name: data.signal_name });
      return null;
    }

    const id = result?.id as string;
    logInfo(CTX, `Inserted latent signal "${data.signal_name}" -> ${id}`);
    return id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Exception: ${msg}`, { signal_domain: data.signal_domain, signal_name: data.signal_name });
    return null;
  }
}
