import { fetchStjWithRetries, sleep, STJ_INTER_RESOURCE_DELAY_MS } from "@/src/lib/stj-fetch";
import { fetchPackageShow, type CkanResource } from "@/src/lib/stj-ckan";
import { getSupabaseServiceClient } from "@/src/lib/supabase-service";

export const STJ_DISTRIBUICAO_DATASET_ID = "atas-de-distribuicao" as const;

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

function isAtaJsonResource(r: CkanResource): boolean {
  const name = (r.name ?? "").trim().toLowerCase();
  if (name.includes("dicionario")) return false;
  return /^ata\d+\.json$/.test(name);
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
  failed: StjDistribuicaoFailure[];
  durationMs: number;
};

export async function syncStjDistribuicao(): Promise<StjDistribuicaoSyncResult> {
  const started = Date.now();
  const failed: StjDistribuicaoFailure[] = [];
  const rows: StjDistribuicaoRow[] = [];
  let resourcesProcessed = 0;

  const resources = await fetchPackageShow(STJ_DISTRIBUICAO_DATASET_ID);
  const list = resources.filter(isAtaJsonResource).sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"),
  );
  if (list.length === 0) {
    return {
      success: false,
      inserted: 0,
      resourcesProcessed: 0,
      failed: [{ error: "Nenhum resource ata*.json encontrado no dataset." }],
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
      resourcesProcessed++;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      failed.push({ resourceUrl: url, name: res.name ?? undefined, error });
    }
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
    failed,
    durationMs: Date.now() - started,
  };
}
