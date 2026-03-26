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
  totalFiles: number;
  fileIndex: number;
  fileName: string | null;
  failed: StjDjSyncFailure[];
  durationMs: number;
  /** true quando `offset` está fora de 0..totalFiles-1 */
  invalidOffset?: boolean;
};

export type StjDjAllSyncResult = {
  success: boolean;
  totalFiles: number;
  inserted: number;
  filesSucceeded: number;
  filesFailed: number;
  failed: StjDjSyncFailure[];
  fileResults: Array<{ fileIndex: number; fileName: string | null; inserted: number; success: boolean }>;
  durationMs: number;
};

export async function listStjDjMetadadosResources(): Promise<CkanResource[]> {
  const resources = await fetchPackageShow(STJ_DJ_DATASET_ID);
  return resources
    .filter(isMetadadosJsonResource)
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"));
}

async function syncStjDecisoesDjFromList(
  list: CkanResource[],
  offset: number,
): Promise<StjDjSyncResult> {
  const started = Date.now();
  const failed: StjDjSyncFailure[] = [];
  const totalFiles = list.length;

  const res = list[offset];
  const fileName = res.name ?? null;
  const url = (res.url ?? "").trim();
  const rows: StjDecisaoDjRow[] = [];
  let resourcesProcessed = 0;

  if (!url) {
    failed.push({ name: fileName ?? undefined, error: "Resource sem URL." });
    return {
      success: false,
      inserted: 0,
      resourcesProcessed: 0,
      totalFiles,
      fileIndex: offset,
      fileName,
      failed,
      durationMs: Date.now() - started,
    };
  }

  if (offset > 0) await sleep(STJ_INTER_RESOURCE_DELAY_MS);

  try {
    const http = await fetchStjWithRetries(url);
    const text = await http.text();
    const raw = JSON.parse(text) as unknown;
    const arr = normalizeToArray(raw);
    for (const rec of arr) {
      const row = mapMetadataToRow(rec);
      if (row) rows.push(row);
    }
    resourcesProcessed = 1;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    failed.push({ resourceUrl: url, name: fileName ?? undefined, error });
    return {
      success: false,
      inserted: 0,
      resourcesProcessed: 0,
      totalFiles,
      fileIndex: offset,
      fileName,
      failed,
      durationMs: Date.now() - started,
    };
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
    totalFiles,
    fileIndex: offset,
    fileName,
    failed,
    durationMs: Date.now() - started,
  };
}

/**
 * Processa um único arquivo metadados*.json. `offset` é o índice na lista ordenada (0, 1, 2…).
 */
export async function syncStjDecisoesDj(opts?: { offset?: number }): Promise<StjDjSyncResult> {
  const started = Date.now();
  const offset = opts?.offset ?? 0;

  const list = await listStjDjMetadadosResources();
  const totalFiles = list.length;

  if (totalFiles === 0) {
    return {
      success: false,
      inserted: 0,
      resourcesProcessed: 0,
      totalFiles: 0,
      fileIndex: offset,
      fileName: null,
      failed: [{ error: "Nenhum resource metadados*.json encontrado no dataset." }],
      durationMs: Date.now() - started,
    };
  }

  if (offset < 0 || offset >= totalFiles) {
    return {
      success: false,
      inserted: 0,
      resourcesProcessed: 0,
      totalFiles,
      fileIndex: offset,
      fileName: null,
      failed: [
        {
          error: `offset inválido (${offset}). Use um inteiro entre 0 e ${totalFiles - 1}.`,
        },
      ],
      durationMs: Date.now() - started,
      invalidOffset: true,
    };
  }

  return syncStjDecisoesDjFromList(list, offset);
}

/** Processa todos os metadados em sequência (uma execução por arquivo). */
export async function syncStjDecisoesDjAll(): Promise<StjDjAllSyncResult> {
  const started = Date.now();
  const list = await listStjDjMetadadosResources();
  const totalFiles = list.length;
  const failed: StjDjSyncFailure[] = [];
  const fileResults: StjDjAllSyncResult["fileResults"] = [];

  if (totalFiles === 0) {
    return {
      success: false,
      totalFiles: 0,
      inserted: 0,
      filesSucceeded: 0,
      filesFailed: 0,
      failed: [{ error: "Nenhum resource metadados*.json encontrado no dataset." }],
      fileResults: [],
      durationMs: Date.now() - started,
    };
  }

  let inserted = 0;
  let filesSucceeded = 0;
  let filesFailed = 0;

  for (let i = 0; i < totalFiles; i++) {
    const one = await syncStjDecisoesDjFromList(list, i);
    inserted += one.inserted;
    failed.push(...one.failed);
    const ok = one.success && one.failed.length === 0;
    if (ok) filesSucceeded++;
    else filesFailed++;
    fileResults.push({
      fileIndex: one.fileIndex,
      fileName: one.fileName,
      inserted: one.inserted,
      success: ok,
    });
  }

  return {
    success: filesFailed === 0,
    totalFiles,
    inserted,
    filesSucceeded,
    filesFailed,
    failed,
    fileResults,
    durationMs: Date.now() - started,
  };
}
