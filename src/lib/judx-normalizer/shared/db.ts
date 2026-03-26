// judx-normalizer Supabase client utilities

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

/**
 * Returns a singleton Supabase client using the service role key.
 * Suitable for server-side / pipeline usage where RLS should be bypassed.
 */
export function getJudxClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      '[judx-normalizer] Missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'
    );
  }

  _client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _client;
}

/**
 * Upsert rows into a table with conflict resolution.
 *
 * @param table     - Target table name
 * @param rows      - Array of row objects to upsert
 * @param onConflict - Comma-separated column names for conflict detection
 * @param options   - Optional: { ignoreDuplicates?: boolean; count?: 'exact' | 'planned' | 'estimated' }
 * @returns The upserted rows (data) — throws on error.
 */
export async function judxUpsert<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  onConflict: string,
  options?: { ignoreDuplicates?: boolean; count?: 'exact' | 'planned' | 'estimated' }
): Promise<T[]> {
  if (rows.length === 0) return [];

  const client = getJudxClient();

  const { data, error } = await client
    .from(table)
    .upsert(rows as unknown[], {
      onConflict,
      ignoreDuplicates: options?.ignoreDuplicates ?? false,
      count: options?.count,
    })
    .select();

  if (error) {
    throw new Error(`[judx-normalizer] Upsert into "${table}" failed: ${error.message}`);
  }

  return (data ?? []) as T[];
}

/**
 * Insert rows into an append-only table.
 * Does NOT upsert — duplicates will cause a constraint error if a unique index exists.
 *
 * @param table - Target table name
 * @param rows  - Array of row objects to insert
 * @returns The inserted rows (data) — throws on error.
 */
export async function judxInsert<T extends Record<string, unknown>>(
  table: string,
  rows: T[]
): Promise<T[]> {
  if (rows.length === 0) return [];

  const client = getJudxClient();

  const { data, error } = await client
    .from(table)
    .insert(rows as unknown[])
    .select();

  if (error) {
    throw new Error(`[judx-normalizer] Insert into "${table}" failed: ${error.message}`);
  }

  return (data ?? []) as T[];
}
