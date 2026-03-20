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
  created?: string | null;
  url?: string | null;
};

type CkanPackageShowResult = {
  success: boolean;
  result?: { resources?: CkanResource[] };
};

type StjEspelhoRecord = {
  id?: string | number | null;
  numeroProcesso?: string | null;
  numeroRegistro?: string | null;
  siglaClasse?: string | null;
  nomeOrgaoJulgador?: string | null;
  ministroRelator?: string | null;
  dataDecisao?: string | null;
  ementa?: string | null;
  tipoDeDecisao?: string | null;
  decisao?: string | null;
  tema?: unknown;
};

export type StjDecisionRow = {
  processo: string;
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

function pickLatestJsonResource(resources: CkanResource[]): CkanResource | null {
  const jsonResources = resources.filter((r) => {
    const fmt = (r.format ?? "").trim().toUpperCase();
    const url = (r.url ?? "").trim();
    return fmt === "JSON" && url.length > 0;
  });
  if (jsonResources.length === 0) return null;
  return jsonResources.reduce((best, cur) => {
    const tCur = Date.parse(cur.created ?? "") || 0;
    const tBest = Date.parse(best.created ?? "") || 0;
    return tCur >= tBest ? cur : best;
  });
}

async function fetchPackageShow(datasetId: string): Promise<CkanResource[]> {
  const u = new URL(`${CKAN_BASE}/package_show`);
  u.searchParams.set("id", datasetId);
  const res = await fetch(u.toString(), { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`CKAN package_show failed for ${datasetId}: ${res.status}`);
  }
  const body = (await res.json()) as CkanPackageShowResult;
  if (!body.success || !body.result?.resources) {
    throw new Error(`CKAN package_show invalid response for ${datasetId}`);
  }
  return body.result.resources;
}

function normalizeToArray(raw: unknown): StjEspelhoRecord[] {
  if (Array.isArray(raw)) return raw as StjEspelhoRecord[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const v of Object.values(o)) {
      if (Array.isArray(v)) return v as StjEspelhoRecord[];
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

function temaToString(tema: unknown): string | null {
  if (tema == null) return null;
  if (typeof tema === "string") return tema.trim() || null;
  try {
    return JSON.stringify(tema);
  } catch {
    return String(tema);
  }
}

/** Heurística: primeiro segmento da ementa antes de ponto ou quebra de linha (área temática). */
function inferRamoDireito(ementa: string | null | undefined): string | null {
  if (!ementa || typeof ementa !== "string") return null;
  const first = ementa.split(/[.\n]/)[0]?.trim();
  if (!first) return null;
  return first.length > 500 ? first.slice(0, 500) + "…" : first;
}

export function mapStjRecordToRow(r: StjEspelhoRecord): StjDecisionRow | null {
  const reg = (r.numeroRegistro ?? "").trim();
  const proc = (r.numeroProcesso ?? "").trim();
  const sigla = (r.siglaClasse ?? "").trim();
  const processo =
    reg ||
    [sigla, proc].filter(Boolean).join(" ").trim() ||
    (r.id != null ? String(r.id) : "");
  if (!processo) return null;

  return {
    processo,
    relator: r.ministroRelator?.trim() ?? null,
    orgao_julgador: r.nomeOrgaoJulgador?.trim() ?? null,
    data_julgamento: parseDataDecisao(r.dataDecisao),
    ementa: r.ementa?.trim() ?? null,
    tema: temaToString(r.tema),
    resultado: r.tipoDeDecisao?.trim() ?? null,
    ramo_direito: inferRamoDireito(r.ementa),
  };
}

async function fetchEspelhoJsonArray(resourceUrl: string): Promise<StjEspelhoRecord[]> {
  const res = await fetch(resourceUrl, { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`Download JSON failed: ${res.status} ${resourceUrl}`);
  }
  const raw = await res.json();
  return normalizeToArray(raw);
}

const UPSERT_BATCH = 200;

export type StjSyncDatasetFailure = {
  datasetId: string;
  error: string;
};

export type StjSyncResult = {
  /** Linhas afetadas pelo upsert (inserções + atualizações). */
  inserted: number;
  /** Quantidade de datasets CKAN processados sem erro. */
  datasetsSucceeded: number;
  /** Datasets que falharam (ex.: HTTP 520, JSON ausente), com mensagem. */
  failed: StjSyncDatasetFailure[];
};

/**
 * Sincroniza espelhos de acórdãos dos 10 datasets STJ (resource JSON mais recente por dataset)
 * para a tabela `stj_decisions`, usando a service role (ignora RLS).
 * Datasets individuais que falharem são ignorados; o restante segue.
 */
export async function syncStjDecisions(): Promise<StjSyncResult> {
  const supabase = getSupabaseServiceClient();
  const rows: StjDecisionRow[] = [];
  const failed: StjSyncDatasetFailure[] = [];
  let datasetsSucceeded = 0;

  for (const datasetId of STJ_ESPELHO_DATASET_IDS) {
    try {
      const resources = await fetchPackageShow(datasetId);
      const latest = pickLatestJsonResource(resources);
      if (!latest?.url) {
        throw new Error(`Nenhum resource JSON encontrado em ${datasetId}`);
      }
      const records = await fetchEspelhoJsonArray(latest.url);
      for (const rec of records) {
        const row = mapStjRecordToRow(rec);
        if (row) rows.push(row);
      }
      datasetsSucceeded++;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      failed.push({ datasetId, error });
    }
  }

  const uniqueByProcesso = new Map<string, StjDecisionRow>();
  for (const row of rows) {
    uniqueByProcesso.set(row.processo, row);
  }
  const deduped = [...uniqueByProcesso.values()];

  let affected = 0;
  for (let i = 0; i < deduped.length; i += UPSERT_BATCH) {
    const batch = deduped.slice(i, i + UPSERT_BATCH);
    const { data, error } = await supabase
      .from("stj_decisions")
      .upsert(batch, { onConflict: "processo", ignoreDuplicates: false })
      .select("processo");

    if (error) {
      throw new Error(`Supabase upsert stj_decisions: ${error.message}`);
    }
    affected += data?.length ?? batch.length;
  }

  return { inserted: affected, datasetsSucceeded, failed };
}
