import { getJudxClient } from '../shared/db';
import { logError, logInfo } from '../shared/logger';

const CTX = 'upsertCourt';

const courtCache = new Map<string, string>();

const KNOWN_COURTS: Record<string, { name: string; branch: string; level: string }> = {
  STJ: { name: 'Superior Tribunal de Justiça', branch: 'infraconstitucional', level: 'superior' },
  STF: { name: 'Supremo Tribunal Federal', branch: 'constitucional', level: 'supremo' },
  TST: { name: 'Tribunal Superior do Trabalho', branch: 'trabalhista', level: 'superior' },
  TSE: { name: 'Tribunal Superior Eleitoral', branch: 'eleitoral', level: 'superior' },
  STM: { name: 'Superior Tribunal Militar', branch: 'militar', level: 'superior' },
};

/**
 * Upserts a court row into judx_court by acronym.
 * On conflict by acronym, does nothing (idempotent).
 * Returns the court UUID. Caches results in-memory.
 */
export async function upsertCourt(acronym: string): Promise<string> {
  const cached = courtCache.get(acronym);
  if (cached) return cached;

  const client = getJudxClient();
  const known = KNOWN_COURTS[acronym];

  const row: Record<string, unknown> = {
    acronym,
    name: known?.name ?? acronym,
    branch: known?.branch ?? 'unknown',
    level: known?.level ?? 'unknown',
  };

  try {
    const { data, error } = await client
      .from('judx_court')
      .upsert(row, { onConflict: 'acronym', ignoreDuplicates: true })
      .select('id')
      .single();

    if (error) {
      // If ignoreDuplicates returns no row, fetch it explicitly
      if (!data) {
        const { data: existing, error: fetchErr } = await client
          .from('judx_court')
          .select('id')
          .eq('acronym', acronym)
          .single();

        if (fetchErr || !existing) {
          throw new Error(fetchErr?.message ?? 'Court not found after upsert');
        }

        const id = existing.id as string;
        courtCache.set(acronym, id);
        logInfo(CTX, `Resolved court ${acronym} -> ${id}`);
        return id;
      }
    }

    const id = data!.id as string;
    courtCache.set(acronym, id);
    logInfo(CTX, `Upserted court ${acronym} -> ${id}`);
    return id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Failed to upsert court ${acronym}: ${msg}`);
    throw err;
  }
}
