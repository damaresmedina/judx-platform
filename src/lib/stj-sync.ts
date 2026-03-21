import { createClient, SupabaseClient } from "@supabase/supabase-js";

const CKAN_BASE = "https://dadosabertos.web.stj.jus.br/api/3/action";

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

function getSupabaseServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!key) {
    throw new Error("Missing environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Classe, UF e número normalizado a partir do texto do processo (ambos os formatos). */
export function splitProcessoFields(raw: string | null | undefined): {
  classe: string;
  uf: string | null;
  processo: string;
} {
  const s = (raw ?? "").trim();
  if (!s) return { classe: "", uf: null, processo: "" };

  const ufMatch = s.match(/\/([A-Za-z]{2})\s*$/);
  const uf = ufMatch ? ufMatch[1].toUpperCase() : null;

  const firstDig = s.search(/\d/);
  const classe = firstDig === -1 ? s.trim() : s.slice(0, firstDig).trim();

  if (firstDig === -1) {
    return { classe: classe || "", uf, processo: "" };
  }

  let rest = s.slice(firstDig);
  rest = rest.replace(/\/[A-Za-z]{2}\s*$/i, "").trim();
  const processo = rest.replace(/[^\d.]/g, "");
  return { classe, uf, processo };
}

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
  const res = await fetch(u.toString(), { cache: "no-store" });
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
  const res = await fetch(url, { cache: "no-store" });
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
      for (const res of list) {
        const url = (res.url ?? "").trim();
        if (!url) continue;
        try {
          const { unified, format } = await fetchResourceRecords(url, res);
          if (format === "csv") csvResourcesProcessed++;
          else jsonResourcesProcessed++;
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
