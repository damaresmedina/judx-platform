// Responsabilidade única: extração STJ → stj_*. Nunca aciona ICONS diretamente.
import { strFromU8, unzipSync } from "fflate";
import { getSupabaseServiceClient } from "@/src/lib/supabase-service";
import { splitProcessoFields } from "@/src/lib/judx-normalizer/shared/text";

const CKAN_BASE = "https://dadosabertos.web.stj.jus.br/api/3/action";

/** Headers para aproximar requisições de um navegador (reduz bloqueios intermitentes no STJ). */
const STJ_BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  Referer: "https://dadosabertos.web.stj.jus.br",
  Connection: "keep-alive",
};

/** Pausa entre downloads de arquivos (resources) para não sobrecarregar o servidor. */
const STJ_INTER_RESOURCE_DELAY_MS = 2000;

/** Esperas (ms) antes de cada nova tentativa após HTTP 520: 1ª retentativa após 5s, 2ª após 15s, 3ª após 30s. */
const STJ_520_RETRY_DELAYS_MS = [5000, 15000, 30000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch com headers de browser; em 520, repete até 3 vezes com backoff 5s / 15s / 30s.
 * Outros status não são reintentados aqui.
 */
async function fetchStjWithRetry(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(STJ_BROWSER_HEADERS);
  if (init.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  let lastRes!: Response;
  for (let attempt = 0; attempt <= STJ_520_RETRY_DELAYS_MS.length; attempt++) {
    lastRes = await fetch(url, { ...init, cache: "no-store", headers });
    if (lastRes.status !== 520) return lastRes;
    if (attempt < STJ_520_RETRY_DELAYS_MS.length) {
      await sleep(STJ_520_RETRY_DELAYS_MS[attempt]);
    }
  }
  return lastRes;
}

/** IDs CKAN dos 10 datasets de espelhos de acórdãos (Corte Especial, Seções e Turmas). */
export const STJ_ESPELHO_DATASET_IDS = [
  "espelhos-de-acordaos-corte-especial",
  "espelhos-de-acordaos-primeira-secao",
  "espelhos-de-acordaos-segunda-secao",
  "espelhos-de-acordaos-terceira-secao",
  "espelhos-de-acordaos-primeira-turma",
  "espelhos-de-acordaos-segunda-turma",
  "espelhos-de-acordaos-terceira-turma",
  "espelhos-de-acordaos-quarta-turma",
  "espelhos-de-acordaos-quinta-turma",
  "espelhos-de-acordaos-sexta-turma",
] as const;

type CkanResource = {
  name?: string | null;
  format?: string | null;
  mimetype?: string | null;
  created?: string | null;
  url?: string | null;
};

type CkanPackageShowResult = {
  success: boolean;
  result?: { resources?: CkanResource[] };
};

/** FORMATO 2 — registro espelho (JSON ou CSV), compatível com o modelo antigo. */
export type StjEspelhoRecord = {
  id?: string | number | null;
  numeroProcesso?: string | null;
  numeroRegistro?: string | null;
  siglaClasse?: string | null;
  nomeOrgaoJulgador?: string | null;
  ministroRelator?: string | null;
  ministro?: string | null;
  dataDecisao?: string | null;
  ementa?: string | null;
  teor?: string | null;
  tipoDeDecisao?: string | null;
  decisao?: string | null;
  tema?: unknown;
};

/** FORMATO 1 — metadados JSON (dados abertos STJ). */
export type StjMetadataRecord = {
  seqDocumento?: number | null;
  dataPublicacao?: number | null;
  tipoDocumento?: string | null;
  numeroRegistro?: string | null;
  processo?: string | null;
  dataRecebimento?: number | null;
  dataDistribuicao?: number | null;
  ministro?: string | null;
  recurso?: string | null;
  teor?: string | null;
  descricaoMonocratica?: string | null;
  assuntos?: string | null;
};

type StjUnifiedInput = {
  numeroRegistro: string;
  processoRaw: string;
  ministro?: string | null;
  ministroRelator?: string | null;
  teor?: string | null;
  tipoDeDecisao?: string | null;
  nomeOrgaoJulgador?: string | null;
  dataDecisao?: string | null;
  dataDistribuicao?: number | null;
  dataPublicacao?: number | null;
  ementa?: string | null;
  descricaoMonocratica?: string | null;
  tema?: unknown;
  assuntos?: string | null;
};

export type StjDecisionRow = {
  numero_registro: string;
  processo: string;
  classe: string | null;
  uf: string | null;
  relator: string | null;
  orgao_julgador: string | null;
  data_julgamento: string | null;
  ementa: string | null;
  tema: string | null;
  resultado: string | null;
  ramo_direito: string | null;
};

// Re-export splitProcessoFields from canonical location
export { splitProcessoFields } from "@/src/lib/judx-normalizer/shared/text";

function pickAllSyncableResources(resources: CkanResource[]): CkanResource[] {
  return resources.filter((r) => {
    const url = (r.url ?? "").trim();
    if (!url) return false;
    const fmt = (r.format ?? "").trim().toUpperCase();
    if (fmt === "JSON" || fmt === "CSV") return true;
    const mt = (r.mimetype ?? "").trim().toLowerCase();
    if (mt.includes("csv")) return true;
    if (mt.includes("json")) return true;
    const lower = url.toLowerCase();
    return lower.endsWith(".json") || lower.endsWith(".csv");
  });
}

function filterSyncableResourcesLastDays(resources: CkanResource[], days: number): CkanResource[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return pickAllSyncableResources(resources).filter((r) => {
    const t = Date.parse(r.created ?? "");
    if (Number.isNaN(t)) return false;
    return t >= cutoff;
  });
}

function detectFormatFromResource(r: CkanResource): "json" | "csv" | null {
  const fmt = (r.format ?? "").trim().toUpperCase();
  if (fmt === "CSV") return "csv";
  if (fmt === "JSON") return "json";
  const mt = (r.mimetype ?? "").trim().toLowerCase();
  if (mt.includes("csv")) return "csv";
  if (mt.includes("json")) return "json";
  const url = (r.url ?? "").trim().toLowerCase();
  if (url.endsWith(".csv")) return "csv";
  if (url.endsWith(".json")) return "json";
  return null;
}

function getDownloadBasename(url: string): string {
  const last = url.split("/").pop() ?? "";
  return last.split("?")[0] ?? "";
}

/** Extrai o identificador do dataset CKAN (`slug` ou UUID) a partir da URL de download de um resource. */
export function extractStjDatasetKeyFromResourceUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const i = parts.indexOf("dataset");
    if (i === -1 || !parts[i + 1]) return null;
    return parts[i + 1];
  } catch {
    return null;
  }
}

function stemFromSyncableUrl(url: string): string | null {
  const base = getDownloadBasename(url);
  const m = base.match(/^(.+)\.(json|csv|zip)$/i);
  return m ? m[1] : null;
}

function findZipResourceForStem(resources: CkanResource[], stem: string): CkanResource | null {
  const target = `${stem.toLowerCase()}.zip`;
  for (const r of resources) {
    const u = (r.url ?? "").trim();
    if (!u) continue;
    if (getDownloadBasename(u).toLowerCase() === target) return r;
  }
  return null;
}

function shouldOfferJsonZipFallback(resource: CkanResource, url: string): boolean {
  if (detectFormatFromResource(resource) === "json") return true;
  const u = (resource.url ?? url).trim().toLowerCase();
  return u.endsWith(".json");
}

function parseJsonRecordsFromZipBuffer(buf: ArrayBuffer): StjUnifiedInput[] {
  const files = unzipSync(new Uint8Array(buf));
  const unified: StjUnifiedInput[] = [];
  for (const [name, data] of Object.entries(files)) {
    const lower = name.toLowerCase();
    if (!lower.endsWith(".json")) continue;
    if (lower.includes("__macosx")) continue;
    const text = strFromU8(data);
    const trimmed = text.trimStart();
    if (!trimmed) continue;
    const raw = JSON.parse(text) as unknown;
    const arr = normalizeToArray(raw);
    unified.push(...arr.map(jsonRecordToUnified));
  }
  return unified;
}

function detectFormatFromResponse(contentType: string | null, url: string): "json" | "csv" | null {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("csv")) return "csv";
  if (ct.includes("json")) return "json";
  const u = url.trim().toLowerCase();
  if (u.endsWith(".csv")) return "csv";
  if (u.endsWith(".json")) return "json";
  return null;
}

function sniffTextFormat(text: string): "json" | "csv" {
  const t = text.trimStart();
  const c = t[0];
  if (c === "[" || c === "{") return "json";
  return "csv";
}

async function fetchPackageShow(datasetId: string): Promise<CkanResource[]> {
  const u = new URL(`${CKAN_BASE}/package_show`);
  u.searchParams.set("id", datasetId);
  const res = await fetchStjWithRetry(u.toString());
  if (!res.ok) {
    throw new Error(`CKAN package_show failed for ${datasetId}: ${res.status}`);
  }
  const body = (await res.json()) as CkanPackageShowResult;
  if (!body.success || !body.result?.resources) {
    throw new Error(`CKAN package_show invalid response for ${datasetId}`);
  }
  return body.result.resources;
}

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

function parseDataDecisao(ymd: string | null | undefined): string | null {
  if (!ymd || typeof ymd !== "string") return null;
  const s = ymd.trim();
  if (/^\d{8}$/.test(s)) {
    const y = s.slice(0, 4);
    const m = s.slice(4, 6);
    const d = s.slice(6, 8);
    return `${y}-${m}-${d}`;
  }
  return s;
}

function epochMsToIsoDate(ms: unknown): string | null {
  if (ms == null) return null;
  const n = typeof ms === "number" ? ms : Number(ms);
  if (!Number.isFinite(n)) return null;
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function temaToString(tema: unknown): string | null {
  if (tema == null) return null;
  if (typeof tema === "string") return tema.trim() || null;
  try {
    return JSON.stringify(tema);
  } catch {
    return String(tema);
  }
}

function inferRamoDireito(ementa: string | null | undefined): string | null {
  if (!ementa || typeof ementa !== "string") return null;
  const first = ementa.split(/[.\n]/)[0]?.trim();
  if (!first) return null;
  return first.length > 500 ? first.slice(0, 500) + "…" : first;
}

function isEspelhoShapedJson(rec: Record<string, unknown>): boolean {
  const np = rec.numeroProcesso != null ? String(rec.numeroProcesso).trim() : "";
  if (np.length > 0) return true;
  const em = rec.ementa != null ? String(rec.ementa).trim() : "";
  const mr = rec.ministroRelator != null ? String(rec.ministroRelator).trim() : "";
  return em.length > 0 && mr.length > 0;
}

function jsonRecordToUnified(rec: Record<string, unknown>): StjUnifiedInput {
  const str = (k: string) => {
    const v = rec[k];
    if (v == null) return "";
    return String(v).trim();
  };

  if (isEspelhoShapedJson(rec)) {
    const sigla = str("siglaClasse");
    const proc = str("numeroProcesso");
    const processoRaw = [sigla, proc].filter(Boolean).join(" ").trim();
    return {
      numeroRegistro: str("numeroRegistro"),
      processoRaw,
      ministroRelator: rec.ministroRelator != null ? String(rec.ministroRelator) : null,
      teor: rec.teor != null ? String(rec.teor) : null,
      tipoDeDecisao: rec.tipoDeDecisao != null ? String(rec.tipoDeDecisao) : null,
      nomeOrgaoJulgador: rec.nomeOrgaoJulgador != null ? String(rec.nomeOrgaoJulgador) : null,
      dataDecisao: rec.dataDecisao != null ? String(rec.dataDecisao) : undefined,
      ementa: rec.ementa != null ? String(rec.ementa) : undefined,
      tema: rec.tema,
    };
  }

  return {
    numeroRegistro: str("numeroRegistro"),
    processoRaw: str("processo"),
    ministro: rec.ministro != null ? String(rec.ministro) : null,
    teor: rec.teor != null ? String(rec.teor) : null,
    tipoDeDecisao:
      rec.tipoDeDecisao != null
        ? String(rec.tipoDeDecisao)
        : rec.tipoDocumento != null
          ? String(rec.tipoDocumento)
          : null,
    dataDistribuicao:
      typeof rec.dataDistribuicao === "number"
        ? rec.dataDistribuicao
        : rec.dataDistribuicao != null
          ? Number(rec.dataDistribuicao)
          : null,
    dataPublicacao:
      typeof rec.dataPublicacao === "number"
        ? rec.dataPublicacao
        : rec.dataPublicacao != null
          ? Number(rec.dataPublicacao)
          : null,
    descricaoMonocratica:
      rec.descricaoMonocratica != null ? String(rec.descricaoMonocratica) : undefined,
    assuntos: rec.assuntos != null ? String(rec.assuntos) : undefined,
  };
}

function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') {
      inQ = true;
    } else if (c === sep) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): Record<string, string>[] {
  const normalized = text.replace(/^\ufeff/, "");
  const lines = normalized.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = parseCsvLine(lines[0], sep).map((h) =>
    h.trim().replace(/^\ufeff/, "").toLowerCase(),
  );
  const rows: Record<string, string>[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = parseCsvLine(lines[li], sep);
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = (cells[i] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

function csvGet(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k.toLowerCase()];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function csvRowToUnified(row: Record<string, string>): StjUnifiedInput {
  const sigla = csvGet(row, "siglaclasse", "sigla_classe", "classe");
  const proc = csvGet(row, "numeroprocesso", "numero_processo", "processo");
  const processoRaw = [sigla, proc].filter(Boolean).join(" ").trim() || proc;
  return {
    numeroRegistro: csvGet(row, "numeroregistro", "numero_registro"),
    processoRaw,
    ministro: csvGet(row, "ministro") || null,
    ministroRelator: csvGet(row, "ministrorelator", "ministro_relator") || null,
    teor: csvGet(row, "teor") || null,
    tipoDeDecisao:
      csvGet(row, "tipodecisao", "tipo_de_decisao", "tipodedecisao", "tipodocumento", "tipo_documento") ||
      null,
    nomeOrgaoJulgador: csvGet(row, "nomeorgaojulgador", "orgao_julgador") || null,
    dataDecisao: csvGet(row, "datadecisao", "data_decisao") || undefined,
    ementa: csvGet(row, "ementa") || undefined,
    tema: csvGet(row, "tema") || undefined,
  };
}

function resolveDataJulgamento(u: StjUnifiedInput): string | null {
  const fromDecisao = u.dataDecisao ? parseDataDecisao(u.dataDecisao) : null;
  if (fromDecisao) return fromDecisao;
  return epochMsToIsoDate(u.dataDistribuicao ?? u.dataPublicacao);
}

export function mapUnifiedToRow(u: StjUnifiedInput): StjDecisionRow | null {
  const numero_registro = u.numeroRegistro.trim();
  if (!numero_registro) return null;

  const { classe, uf, processo } = splitProcessoFields(u.processoRaw);
  if (!processo) return null;

  const relatorRaw = u.ministro ?? u.ministroRelator;
  const relator = relatorRaw != null && String(relatorRaw).trim() !== "" ? String(relatorRaw).trim() : null;

  const teor = u.teor != null ? String(u.teor).trim() : "";
  const tipoDec = u.tipoDeDecisao != null ? String(u.tipoDeDecisao).trim() : "";
  const resultado = teor || tipoDec || null;

  const ementaStr =
    u.ementa != null && String(u.ementa).trim() !== ""
      ? String(u.ementa).trim()
      : u.descricaoMonocratica != null && String(u.descricaoMonocratica).trim() !== ""
        ? String(u.descricaoMonocratica).trim()
        : null;

  const tema = temaToString(u.tema) ?? (u.assuntos != null && u.assuntos.trim() !== "" ? u.assuntos.trim() : null);

  return {
    numero_registro,
    processo,
    classe: classe.trim() ? classe.trim() : null,
    uf,
    relator,
    orgao_julgador:
      u.nomeOrgaoJulgador != null && String(u.nomeOrgaoJulgador).trim() !== ""
        ? String(u.nomeOrgaoJulgador).trim()
        : null,
    data_julgamento: resolveDataJulgamento(u),
    ementa: ementaStr,
    tema,
    resultado,
    ramo_direito: inferRamoDireito(ementaStr ?? u.assuntos),
  };
}

/** Compatível com o modelo espelho JSON antigo (`StjEspelhoRecord`). */
export function mapStjRecordToRow(r: StjEspelhoRecord): StjDecisionRow | null {
  const sigla = (r.siglaClasse ?? "").trim();
  const proc = (r.numeroProcesso ?? "").trim();
  const processoRaw = [sigla, proc].filter(Boolean).join(" ").trim();
  const u: StjUnifiedInput = {
    numeroRegistro: String(r.numeroRegistro ?? "").trim(),
    processoRaw,
    ministro: r.ministro,
    ministroRelator: r.ministroRelator,
    teor: r.teor != null ? String(r.teor) : null,
    tipoDeDecisao: r.tipoDeDecisao != null ? String(r.tipoDeDecisao) : null,
    nomeOrgaoJulgador: r.nomeOrgaoJulgador != null ? String(r.nomeOrgaoJulgador) : null,
    dataDecisao: r.dataDecisao != null ? String(r.dataDecisao) : undefined,
    ementa: r.ementa != null ? String(r.ementa) : undefined,
    tema: r.tema,
  };
  return mapUnifiedToRow(u);
}

async function fetchResourceRecords(
  url: string,
  resource: CkanResource,
): Promise<{ unified: StjUnifiedInput[]; format: "json" | "csv" }> {
  const res = await fetchStjWithRetry(url);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${url}`);
  }
  const text = await res.text();
  const hint = detectFormatFromResource(resource);
  const fromResp = detectFormatFromResponse(res.headers.get("content-type"), url);
  let format: "json" | "csv" = hint ?? fromResp ?? sniffTextFormat(text);

  if (format === "json") {
    try {
      const raw = JSON.parse(text) as unknown;
      const arr = normalizeToArray(raw);
      return {
        unified: arr.map(jsonRecordToUnified),
        format: "json",
      };
    } catch {
      format = "csv";
    }
  }

  if (format === "csv") {
    const csvRows = parseCsv(text);
    return { unified: csvRows.map(csvRowToUnified), format: "csv" };
  }

  const raw = JSON.parse(text) as unknown;
  const arr = normalizeToArray(raw);
  return { unified: arr.map(jsonRecordToUnified), format: "json" };
}

async function fetchResourceRecordsWithZipFallback(
  url: string,
  resource: CkanResource,
  allResources: CkanResource[],
): Promise<{ unified: StjUnifiedInput[]; format: "json" | "csv"; usedZipFallback: boolean }> {
  try {
    const r = await fetchResourceRecords(url, resource);
    return { ...r, usedZipFallback: false };
  } catch (firstErr) {
    if (!shouldOfferJsonZipFallback(resource, url)) throw firstErr;
    const stem = stemFromSyncableUrl(url);
    if (!stem) throw firstErr;
    const zipRes = findZipResourceForStem(allResources, stem);
    if (!zipRes) throw firstErr;
    const zipUrl = (zipRes.url ?? "").trim();
    if (!zipUrl) throw firstErr;
    const zipHttp = await fetchStjWithRetry(zipUrl);
    if (!zipHttp.ok) {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      throw new Error(`${msg} | Fallback ZIP: HTTP ${zipHttp.status} ${zipUrl}`);
    }
    const buf = await zipHttp.arrayBuffer();
    let unified: StjUnifiedInput[];
    try {
      unified = parseJsonRecordsFromZipBuffer(buf);
    } catch (zipParseErr) {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      const z = zipParseErr instanceof Error ? zipParseErr.message : String(zipParseErr);
      throw new Error(`${msg} | Fallback ZIP: leitura dos JSONs (${z})`);
    }
    return { unified, format: "json", usedZipFallback: true };
  }
}

const UPSERT_BATCH = 200;

export type StjSyncDatasetFailure = {
  datasetId: string;
  error: string;
  resourceUrl?: string;
};

export type StjSyncResult = {
  inserted: number;
  datasetsSucceeded: number;
  failed: StjSyncDatasetFailure[];
  /** Arquivos JSON processados com sucesso. */
  jsonResourcesProcessed: number;
  /** Arquivos CSV processados com sucesso. */
  csvResourcesProcessed: number;
  /** JSON obtidos via ZIP equivalente (após falha do download direto do .json). */
  zipFallbacksUsed: number;
};

async function syncStjDecisionsInternal(opts: {
  incremental: boolean;
  incrementalDays: number;
}): Promise<StjSyncResult> {
  const supabase = getSupabaseServiceClient();
  const rows: StjDecisionRow[] = [];
  const failed: StjSyncDatasetFailure[] = [];
  let datasetsSucceeded = 0;
  let jsonResourcesProcessed = 0;
  let csvResourcesProcessed = 0;
  let zipFallbacksUsed = 0;

  for (const datasetId of STJ_ESPELHO_DATASET_IDS) {
    try {
      const resources = await fetchPackageShow(datasetId);
      const list = opts.incremental
        ? filterSyncableResourcesLastDays(resources, opts.incrementalDays)
        : pickAllSyncableResources(resources);

      if (list.length === 0) {
        if (opts.incremental) {
          datasetsSucceeded++;
          continue;
        }
        throw new Error(`Nenhum resource JSON/CSV encontrado em ${datasetId}`);
      }

      let anyResourceFailed = false;
      let firstDownloadInDataset = true;
      for (const res of list) {
        const url = (res.url ?? "").trim();
        if (!url) continue;
        if (!firstDownloadInDataset) await sleep(STJ_INTER_RESOURCE_DELAY_MS);
        firstDownloadInDataset = false;
        try {
          const { unified, format, usedZipFallback } = await fetchResourceRecordsWithZipFallback(
            url,
            res,
            resources,
          );
          if (format === "csv") csvResourcesProcessed++;
          else {
            jsonResourcesProcessed++;
            if (usedZipFallback) zipFallbacksUsed++;
          }
          for (const u of unified) {
            const row = mapUnifiedToRow(u);
            if (row) rows.push(row);
          }
        } catch (e) {
          anyResourceFailed = true;
          const error = e instanceof Error ? e.message : String(e);
          failed.push({ datasetId, resourceUrl: url, error });
        }
      }

      if (!anyResourceFailed) {
        datasetsSucceeded++;
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      failed.push({ datasetId, error });
    }
  }

  const uniqueByRegistro = new Map<string, StjDecisionRow>();
  for (const row of rows) {
    uniqueByRegistro.set(row.numero_registro, row);
  }
  const deduped = [...uniqueByRegistro.values()];

  let affected = 0;
  for (let i = 0; i < deduped.length; i += UPSERT_BATCH) {
    const batch = deduped.slice(i, i + UPSERT_BATCH);
    const { data, error } = await supabase
      .from("stj_decisions")
      .upsert(batch, { onConflict: "numero_registro", ignoreDuplicates: false })
      .select("numero_registro");

    if (error) {
      throw new Error(`Supabase upsert stj_decisions: ${error.message}`);
    }
    affected += data?.length ?? batch.length;
  }

  return {
    inserted: affected,
    datasetsSucceeded,
    failed,
    jsonResourcesProcessed,
    csvResourcesProcessed,
    zipFallbacksUsed,
  };
}

export type StjFailedUrlRetryResult = {
  url: string;
  ok: boolean;
  error?: string;
  viaZipFallback?: boolean;
  /** Registros lidos do arquivo (antes do mapa para `stj_decisions`). */
  recordsParsed?: number;
};

export type StjFailedUrlsSyncResult = {
  inserted: number;
  results: StjFailedUrlRetryResult[];
  jsonResourcesProcessed: number;
  csvResourcesProcessed: number;
  zipFallbacksUsed: number;
};

async function ingestStjResourceUrlForRetry(
  url: string,
  packageCache: Map<string, CkanResource[]>,
): Promise<{ unified: StjUnifiedInput[]; format: "json" | "csv"; usedZipFallback: boolean }> {
  const u = url.trim();
  if (u.toLowerCase().endsWith(".zip")) {
    const res = await fetchStjWithRetry(u);
    if (!res.ok) {
      throw new Error(`Download failed: ${res.status} ${u}`);
    }
    const buf = await res.arrayBuffer();
    const unified = parseJsonRecordsFromZipBuffer(buf);
    return { unified, format: "json", usedZipFallback: false };
  }

  const datasetKey = extractStjDatasetKeyFromResourceUrl(u);
  if (!datasetKey) {
    throw new Error("URL inválida: não foi possível identificar o dataset (trecho /dataset/.../).");
  }

  let pkg = packageCache.get(datasetKey);
  if (!pkg) {
    pkg = await fetchPackageShow(datasetKey);
    packageCache.set(datasetKey, pkg);
  }

  const resMeta = pkg.find((r) => (r.url ?? "").trim() === u) ?? { url: u };
  return fetchResourceRecordsWithZipFallback(u, resMeta, pkg);
}

/**
 * Reprocessa apenas URLs que falharam (JSON/CSV ou ZIP direto), com o mesmo fallback ZIP dos JSON.
 * Útil para completar cargas sem refazer todos os datasets.
 */
export async function syncStjDecisionsFromFailedUrls(urls: string[]): Promise<StjFailedUrlsSyncResult> {
  const supabase = getSupabaseServiceClient();
  const uniqueUrls = [...new Set(urls.map((x) => x.trim()).filter(Boolean))];
  const rows: StjDecisionRow[] = [];
  const results: StjFailedUrlRetryResult[] = [];
  let jsonResourcesProcessed = 0;
  let csvResourcesProcessed = 0;
  let zipFallbacksUsed = 0;
  const packageCache = new Map<string, CkanResource[]>();

  let first = true;
  for (const url of uniqueUrls) {
    if (!first) await sleep(STJ_INTER_RESOURCE_DELAY_MS);
    first = false;
    try {
      const { unified, format, usedZipFallback } = await ingestStjResourceUrlForRetry(url, packageCache);
      if (format === "csv") csvResourcesProcessed++;
      else {
        jsonResourcesProcessed++;
        if (usedZipFallback) zipFallbacksUsed++;
      }
      for (const uni of unified) {
        const row = mapUnifiedToRow(uni);
        if (row) rows.push(row);
      }
      results.push({
        url,
        ok: true,
        viaZipFallback: usedZipFallback,
        recordsParsed: unified.length,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      results.push({ url, ok: false, error });
    }
  }

  const uniqueByRegistro = new Map<string, StjDecisionRow>();
  for (const row of rows) {
    uniqueByRegistro.set(row.numero_registro, row);
  }
  const deduped = [...uniqueByRegistro.values()];

  let affected = 0;
  for (let i = 0; i < deduped.length; i += UPSERT_BATCH) {
    const batch = deduped.slice(i, i + UPSERT_BATCH);
    const { data, error } = await supabase
      .from("stj_decisions")
      .upsert(batch, { onConflict: "numero_registro", ignoreDuplicates: false })
      .select("numero_registro");

    if (error) {
      throw new Error(`Supabase upsert stj_decisions: ${error.message}`);
    }
    affected += data?.length ?? batch.length;
  }

  return {
    inserted: affected,
    results,
    jsonResourcesProcessed,
    csvResourcesProcessed,
    zipFallbacksUsed,
  };
}

/**
 * Carga histórica completa: para cada um dos 10 datasets, baixa resources
 * **JSON** (metadados ou espelho) e **CSV** listados no CKAN e faz upsert em `stj_decisions` por `numero_registro`.
 */
export async function syncStjDecisions(): Promise<StjSyncResult> {
  return syncStjDecisionsInternal({ incremental: false, incrementalDays: 2 });
}

/**
 * Sync incremental: apenas resources cujo `created` no CKAN cai nos últimos `days` dias.
 */
export async function syncStjDecisionsIncremental(days = 2): Promise<StjSyncResult> {
  return syncStjDecisionsInternal({ incremental: true, incrementalDays: days });
}
