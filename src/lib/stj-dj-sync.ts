import { fetchStjWithRetries, sleep, STJ_INTER_RESOURCE_DELAY_MS } from "@/src/lib/stj-fetch";
import { fetchPackageShow, type CkanResource } from "@/src/lib/stj-ckan";
import { getSupabaseServiceClient } from "@/src/lib/supabase-service";

export const STJ_DJ_DATASET_ID =
  "integras-de-decisoes-terminativas-e-acordaos-do-diario-da-justica" as const;

const UPSERT_BATCH = 200;

export type StjDecisaoDjRow = {
  seq_documento: number;
  data_publicacao: string | null;
  tipo_documento: string | null;
  numero_registro: string | null;
  processo: string | null;
  ministro: string | null;
  teor: string | null;
  assuntos: string | null;
};

function normalizeToArray(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const v of Object.values(o)) {
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}

function epochMsToIsoTimestamp(ms: unknown): string | null {
  if (ms == null) return null;
  const n = typeof ms === "number" ? ms : Number(ms);
  if (!Number.isFinite(n)) return null;
  return new Date(n).toISOString();
}

function mapMetadataToRow(rec: Record<string, unknown>): StjDecisaoDjRow | null {
  const seq = rec.seqDocumento;
  const seqN = typeof seq === "number" ? seq : seq != null ? Number(seq) : NaN;
  if (!Number.isFinite(seqN)) return null;
  const str = (k: string) => {
    const v = rec[k];
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };
  return {
    seq_documento: seqN,
    data_publicacao: epochMsToIsoTimestamp(rec.dataPublicacao),
    tipo_documento: str("tipoDocumento"),
    numero_registro: str("numeroRegistro"),
    processo: str("processo"),
    ministro: str("ministro"),
    teor: str("teor"),
    assuntos: str("assuntos"),
  };
}

function isMetadadosJsonResource(r: CkanResource): boolean {
  const name = (r.name ?? "").trim().toLowerCase();
  if (name.startsWith("dicionario")) return false;
  if (!name.startsWith("metadados")) return false;
  return name.endsWith(".json");
}

export type StjDjSyncFailure = { resourceUrl?: string; name?: string; error: string };

export type StjDjSyncResult = {
  success: boolean;
  inserted: number;
  resourcesProcessed: number;
  failed: StjDjSyncFailure[];
  durationMs: number;
};

export async function syncStjDecisoesDj(): Promise<StjDjSyncResult> {
  const started = Date.now();
  const failed: StjDjSyncFailure[] = [];
  let resourcesProcessed = 0;
  const rows: StjDecisaoDjRow[] = [];

  const resources = await fetchPackageShow(STJ_DJ_DATASET_ID);
  const list = resources.filter(isMetadadosJsonResource);
  if (list.length === 0) {
    return {
      success: false,
      inserted: 0,
      resourcesProcessed: 0,
      failed: [{ error: "Nenhum resource metadados*.json encontrado no dataset." }],
      durationMs: Date.now() - started,
    };
  }

  let first = true;
  for (const res of list) {
    const url = (res.url ?? "").trim();
    if (!url) continue;
    if (!first) await sleep(STJ_INTER_RESOURCE_DELAY_MS);
    first = false;
    try {
      const http = await fetchStjWithRetries(url);
      const text = await http.text();
      const raw = JSON.parse(text) as unknown;
      const arr = normalizeToArray(raw);
      for (const rec of arr) {
        const row = mapMetadataToRow(rec);
        if (row) rows.push(row);
      }
      resourcesProcessed++;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      failed.push({ resourceUrl: url, name: res.name ?? undefined, error });
    }
  }

  const supabase = getSupabaseServiceClient();
  const bySeq = new Map<number, StjDecisaoDjRow>();
  for (const r of rows) {
    bySeq.set(r.seq_documento, r);
  }
  const deduped = [...bySeq.values()];

  let inserted = 0;
  for (let i = 0; i < deduped.length; i += UPSERT_BATCH) {
    const batch = deduped.slice(i, i + UPSERT_BATCH);
    const { data, error } = await supabase
      .from("stj_decisoes_dj")
      .upsert(batch, { onConflict: "seq_documento", ignoreDuplicates: false })
      .select("seq_documento");
    if (error) {
      throw new Error(`Supabase upsert stj_decisoes_dj: ${error.message}`);
    }
    inserted += data?.length ?? batch.length;
  }

  return {
    success: failed.length === 0,
    inserted,
    resourcesProcessed,
    failed,
    durationMs: Date.now() - started,
  };
}
