import { getSupabaseServiceClient } from "@/src/lib/supabase-service";

const PAGE = 1000;

/** Tabelas públicas usadas pelo app; falhas individuais não abortam o backup. */
const BACKUP_TABLES = [
  "stj_decisions",
  "stj_decisoes_dj",
  "stj_precedentes_temas",
  "stj_precedentes_processos",
  "stj_distribuicao",
  "stf_decisions",
] as const;

async function fetchAllRows(table: string): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseServiceClient();
  const all: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) {
      throw new Error(`Supabase select ${table}: ${error.message}`);
    }
    const chunk = data ?? [];
    all.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export type RunFullBackupResult = {
  path: string;
  bytes: number;
  tables: Record<string, number>;
  /** Mensagens quando uma tabela não pôde ser lida (ex.: schema ausente). */
  tableErrors?: Record<string, string>;
};

/** Exporta as tabelas STJ para JSON e grava no bucket Storage `backups`. */
export async function runFullBackup(now = new Date()): Promise<RunFullBackupResult> {
  const supabase = getSupabaseServiceClient();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const path = `backup_${y}${m}${d}.json`;

  const payload: Record<string, Record<string, unknown>[]> = {};
  const tables: Record<string, number> = {};
  const tableErrors: Record<string, string> = {};

  for (const t of BACKUP_TABLES) {
    try {
      const rows = await fetchAllRows(t);
      payload[t] = rows;
      tables[t] = rows.length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      tableErrors[t] = msg;
      payload[t] = [];
      tables[t] = 0;
    }
  }

  const body = JSON.stringify(
    { exportedAt: now.toISOString(), tables: tables, data: payload },
    null,
    0,
  );
  const bytes = new TextEncoder().encode(body).length;

  const { error } = await supabase.storage.from("backups").upload(path, body, {
    contentType: "application/json; charset=utf-8",
    upsert: true,
  });
  if (error) {
    throw new Error(`Storage upload backups/${path}: ${error.message}`);
  }

  return {
    path,
    bytes,
    tables,
    ...(Object.keys(tableErrors).length > 0 ? { tableErrors } : {}),
  };
}
