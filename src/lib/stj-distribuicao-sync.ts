import { fetchStjWithRetries, sleep, STJ_INTER_RESOURCE_DELAY_MS } from "@/src/lib/stj-fetch";
import { fetchPackageShow, type CkanResource } from "@/src/lib/stj-ckan";
import { getSupabaseServiceClient } from "@/src/lib/supabase-service";

/** Slug do dataset no CKAN (referência humana). */
export const STJ_DISTRIBUICAO_DATASET_ID = "atas-de-distribuicao" as const;

/**
 * UUID do package no CKAN — usar em `package_show` (lookup por slug pode falhar no cache/API).
 * Corresponde ao dataset "atas-de-distribuicao".
 */
export const STJ_DISTRIBUICAO_PACKAGE_ID = "6328ba8d-930a-4c35-90ee-c91bf3fef5cb" as const;

/**
 * URL direta do primeiro arquivo JSON do dataset (ata20230630.json), igual à informada pelo CKAN.
 * Usada como fallback se `package_show` falhar (evita depender só da API lenta).
 */
export const STJ_DISTRIBUICAO_FIRST_ATA_URL =
  "https://dadosabertos.web.stj.jus.br/dataset/6328ba8d-930a-4c35-90ee-c91bf3fef5cb/resource/7abb9668-ec1b-4b61-90f3-874fd0fbe2c0/download/ata20230630.json" as const;

const UPSERT_BATCH = 300;

export type StjDistribuicaoRow = {
  numero_registro: string;
  data_distribuicao: string | null;
  ministro_distribuido: string | null;
  orgao_julgador: string | null;
  classe_processual: string | null;
};

type AtaItem = {
  numeroRegistro?: string | null;
  dataHoraDistribuicao?: string | null;
  nomeMinistroRelator?: string | null;
  codigoOrgaoJulgador?: string | null;
  nomeClasse?: string | null;
  siglaClasse?: string | null;
};

function isExcludedDistribDictionary(r: CkanResource): boolean {
  const name = (r.name ?? "").trim().toLowerCase();
  const url = (r.url ?? "").trim().toLowerCase();
  if (name === "dicionario-atadedistribuicao.csv") return true;
  if (name.includes("dicionario-atadedistribuicao")) return true;
  if (url.includes("dicionario-atadedistribuicao.csv")) return true;
  return false;
}

/** Inclui atas JSON: nome começa com "ata" ou URL termina em ".json", exceto o dicionário CSV. */
function isAtaJsonResource(r: CkanResource): boolean {
  if (isExcludedDistribDictionary(r)) return false;
  const name = (r.name ?? "").trim().toLowerCase();
  const url = (r.url ?? "").trim().toLowerCase();
  const nameOk = name.startsWith("ata");
  const urlOk = url.endsWith(".json");
  return nameOk || urlOk;
}

function mapAtaItem(it: AtaItem): StjDistribuicaoRow | null {
  const nr = it.numeroRegistro != null ? String(it.numeroRegistro).trim() : "";
  if (!nr) return null;
  const dh = it.dataHoraDistribuicao != null ? String(it.dataHoraDistribuicao).trim() : "";
  let data_distribuicao: string | null = null;
  if (dh) {
    const d = new Date(dh);
    data_distribuicao = Number.isNaN(d.getTime()) ? dh : d.toISOString();
  }
  const sigla = it.siglaClasse != null ? String(it.siglaClasse).trim() : "";
  const nome = it.nomeClasse != null ? String(it.nomeClasse).trim() : "";
  const classe =
    sigla && nome ? `${sigla} — ${nome}` : nome || sigla || null;
  return {
    numero_registro: nr,
    data_distribuicao,
    ministro_distribuido:
      it.nomeMinistroRelator != null ? String(it.nomeMinistroRelator).trim() || null : null,
    orgao_julgador:
      it.codigoOrgaoJulgador != null ? String(it.codigoOrgaoJulgador).trim() || null : null,
    classe_processual: classe,
  };
}

export type StjDistribuicaoFailure = { resourceUrl?: string; name?: string; error: string };

export type StjDistribuicaoSyncResult = {
  success: boolean;
  inserted: number;
  resourcesProcessed: number;
  totalFiles: number;
  fileIndex: number;
  fileName: string | null;
  failed: StjDistribuicaoFailure[];
  durationMs: number;
  /** true quando `offset` está fora de 0..totalFiles-1 */
  invalidOffset?: boolean;
};

export type StjDistribuicaoAllSyncResult = {
  success: boolean;
  totalFiles: number;
  inserted: number;
  filesSucceeded: number;
  filesFailed: number;
  failed: StjDistribuicaoFailure[];
  fileResults: Array<{ fileIndex: number; fileName: string | null; inserted: number; success: boolean }>;
  durationMs: number;
};

export async function listStjDistribuicaoAtaResources(): Promise<CkanResource[]> {
  try {
    const resources = await fetchPackageShow(STJ_DISTRIBUICAO_PACKAGE_ID);
    const list = resources.filter(isAtaJsonResource).sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"),
    );
    if (list.length > 0) return list;
  } catch (e) {
    console.warn(
      "[stj-distribuicao] CKAN package_show falhou; usando apenas o primeiro ata (URL fixa).",
      e,
    );
    return [
      {
        name: "ata20230630.json",
        format: "JSON",
        mimetype: "application/json",
        url: STJ_DISTRIBUICAO_FIRST_ATA_URL,
      },
    ];
  }
  return [];
}

async function syncStjDistribuicaoFromList(
  list: CkanResource[],
  offset: number,
): Promise<StjDistribuicaoSyncResult> {
  const started = Date.now();
  const failed: StjDistribuicaoFailure[] = [];
  const totalFiles = list.length;

  const res = list[offset];
  const fileName = res.name ?? null;
  const url = (res.url ?? "").trim();
  const rows: StjDistribuicaoRow[] = [];
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
    const body = (await http.json()) as unknown;
    let items: unknown[] = [];
    if (body && typeof body === "object" && "value" in (body as object)) {
      const v = (body as { value?: unknown }).value;
      if (Array.isArray(v)) items = v;
    } else if (Array.isArray(body)) {
      items = body;
    }
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const row = mapAtaItem(raw as AtaItem);
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
  const byNr = new Map<string, StjDistribuicaoRow>();
  for (const r of rows) {
    byNr.set(r.numero_registro, r);
  }
  const deduped = [...byNr.values()];

  let inserted = 0;
  for (let i = 0; i < deduped.length; i += UPSERT_BATCH) {
    const batch = deduped.slice(i, i + UPSERT_BATCH);
    const { data, error } = await supabase
      .from("stj_distribuicao")
      .upsert(batch, { onConflict: "numero_registro", ignoreDuplicates: false })
      .select("numero_registro");
    if (error) {
      throw new Error(`Supabase upsert stj_distribuicao: ${error.message}`);
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
 * Processa uma única ata (arquivo JSON) do dataset. `offset` é o índice na lista ordenada (0, 1, 2…).
 */
export async function syncStjDistribuicao(opts?: { offset?: number }): Promise<StjDistribuicaoSyncResult> {
  const started = Date.now();
  const offset = opts?.offset ?? 0;

  const list = await listStjDistribuicaoAtaResources();
  const totalFiles = list.length;

  if (totalFiles === 0) {
    return {
      success: false,
      inserted: 0,
      resourcesProcessed: 0,
      totalFiles: 0,
      fileIndex: offset,
      fileName: null,
      failed: [{ error: "Nenhum resource de ata JSON encontrado no dataset." }],
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

  return syncStjDistribuicaoFromList(list, offset);
}

/**
 * Processa todas as atas em sequência (uma execução por arquivo, lista CKAN obtida uma vez).
 * Pode exceder o tempo do serverless em datasets muito grandes; prefira o fluxo arquivo a arquivo no cliente.
 */
export async function syncStjDistribuicaoAll(): Promise<StjDistribuicaoAllSyncResult> {
  const started = Date.now();
  const list = await listStjDistribuicaoAtaResources();
  const totalFiles = list.length;
  const failed: StjDistribuicaoFailure[] = [];
  const fileResults: StjDistribuicaoAllSyncResult["fileResults"] = [];

  if (totalFiles === 0) {
    return {
      success: false,
      totalFiles: 0,
      inserted: 0,
      filesSucceeded: 0,
      filesFailed: 0,
      failed: [{ error: "Nenhum resource de ata JSON encontrado no dataset." }],
      fileResults: [],
      durationMs: Date.now() - started,
    };
  }

  let inserted = 0;
  let filesSucceeded = 0;
  let filesFailed = 0;

  for (let i = 0; i < totalFiles; i++) {
    const one = await syncStjDistribuicaoFromList(list, i);
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
