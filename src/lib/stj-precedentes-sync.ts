import { fetchStjWithRetries, sleep, STJ_INTER_RESOURCE_DELAY_MS } from "@/src/lib/stj-fetch";
import { csvGet, parseCsv } from "@/src/lib/stj-csv";
import { getSupabaseServiceClient } from "@/src/lib/supabase-service";

export const STJ_PRECEDENTES_DATASET_ID = "precedentes-qualificados" as const;

/** URL estável do CSV de temas (resource STJ / dados abertos; não confundir com dicionario-temas.csv). */
export const STJ_PRECEDENTES_TEMAS_CSV_URL =
  "https://dadosabertos.web.stj.jus.br/dataset/4238da2f-c07b-4c1a-b345-4402accacdcf/resource/df29da13-7d6b-41ba-ad96-cd1a5bbd191c/download/temas.csv" as const;

/** URL estável do CSV de processos (resource STJ / dados abertos). */
export const STJ_PRECEDENTES_PROCESSOS_CSV_URL =
  "https://dadosabertos.web.stj.jus.br/dataset/4238da2f-c07b-4c1a-b345-4402accacdcf/resource/7ed21202-0049-4fcb-aa7c-48d810d3c499/download/processos.csv" as const;

const CSV_SEP = "," as const;

const UPSERT_BATCH = 300;

function parseOptionalInt(s: string): number | null {
  const t = s.trim().replace(/\./g, "").replace(",", ".");
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

/** Datas comuns nos CSVs: DD/MM/YYYY ou ISO. */
export function parseOptionalDate(s: string): string | null {
  const raw = s.trim();
  if (!raw) return null;
  const oneLine = raw.split(/\r?\n/)[0]?.trim() ?? "";
  if (!oneLine) return null;
  const m = oneLine.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(oneLine)) return oneLine.slice(0, 10);
  return null;
}

export type StjPrecedentesTemasRow = {
  sequencial_precedente: number;
  tipo_precedente: string | null;
  numero_precedente: string | null;
  ministro_relator: string | null;
  leading_case: string | null;
  origem_uf: string | null;
  tribunal_origem: string | null;
  tipo_justica_origem: string | null;
  quantidade_processos_suspenso_na_origem: number | null;
  data_julgamento: string | null;
  data_afetacao: string | null;
  situacao_processo_stf: string | null;
};

export type StjPrecedentesProcessosRow = {
  numero_registro: string;
  sequencial_precedente: number;
  processo: string | null;
};

export type StjPrecedentesSyncResult = {
  success: boolean;
  temasUpserted: number;
  processosUpserted: number;
  durationMs: number;
  error?: string;
};

function mapTemasRow(row: Record<string, string>): StjPrecedentesTemasRow | null {
  const seq = parseOptionalInt(csvGet(row, "sequencialprecedente"));
  if (seq == null) return null;
  const q = parseOptionalInt(
    csvGet(row, "quantidadeprocessossuspensonaorigem", "quantidade_processos_suspenso_na_origem"),
  );
  return {
    sequencial_precedente: seq,
    tipo_precedente: csvGet(row, "tipoprecedente") || null,
    numero_precedente: csvGet(row, "numeroprecedente") || null,
    ministro_relator: csvGet(row, "ministrorelator") || null,
    leading_case: csvGet(row, "leadingcase") || null,
    origem_uf: csvGet(row, "origemuf") || null,
    tribunal_origem: csvGet(row, "tribunalorigem") || null,
    tipo_justica_origem: csvGet(row, "tipojusticaorigem") || null,
    quantidade_processos_suspenso_na_origem: q,
    data_julgamento: parseOptionalDate(csvGet(row, "datajulgamento")),
    data_afetacao: parseOptionalDate(csvGet(row, "dataprimeiraafetacao", "dataafetacao")),
    situacao_processo_stf:
      csvGet(row, "situacaoprocessostf", "situacao") || null,
  };
}

function mapProcessosRow(row: Record<string, string>): StjPrecedentesProcessosRow | null {
  const seq = parseOptionalInt(csvGet(row, "sequencialprecedente"));
  const nr = csvGet(row, "numeroregistro");
  if (seq == null || !nr) return null;
  return {
    numero_registro: nr,
    sequencial_precedente: seq,
    processo: csvGet(row, "processo") || null,
  };
}

/** CSV pode repetir a mesma chave; Postgres não permite ON CONFLICT com a mesma linha duas vezes no batch. */
function dedupeTemasRows(rows: StjPrecedentesTemasRow[]): StjPrecedentesTemasRow[] {
  const bySeq = new Map<number, StjPrecedentesTemasRow>();
  for (const row of rows) {
    bySeq.set(row.sequencial_precedente, row);
  }
  return [...bySeq.values()];
}

function dedupeProcessosRows(rows: StjPrecedentesProcessosRow[]): StjPrecedentesProcessosRow[] {
  const byKey = new Map<string, StjPrecedentesProcessosRow>();
  for (const row of rows) {
    const key = `${row.numero_registro}\0${row.sequencial_precedente}`;
    byKey.set(key, row);
  }
  return [...byKey.values()];
}

export async function syncStjPrecedentes(): Promise<StjPrecedentesSyncResult> {
  const started = Date.now();
  try {
    const temasUrl = STJ_PRECEDENTES_TEMAS_CSV_URL;
    const procUrl = STJ_PRECEDENTES_PROCESSOS_CSV_URL;

    const temasText = await (await fetchStjWithRetries(temasUrl)).text();
    await sleep(STJ_INTER_RESOURCE_DELAY_MS);
    const procText = await (await fetchStjWithRetries(procUrl)).text();

    const temasRows = dedupeTemasRows(
      parseCsv(temasText, CSV_SEP)
        .map(mapTemasRow)
        .filter((x): x is StjPrecedentesTemasRow => x != null),
    );
    const procRows = dedupeProcessosRows(
      parseCsv(procText, CSV_SEP)
        .map(mapProcessosRow)
        .filter((x): x is StjPrecedentesProcessosRow => x != null),
    );

    const supabase = getSupabaseServiceClient();

    let temasUpserted = 0;
    for (let i = 0; i < temasRows.length; i += UPSERT_BATCH) {
      const batch = temasRows.slice(i, i + UPSERT_BATCH);
      const { data, error } = await supabase
        .from("stj_precedentes_temas")
        .upsert(batch, { onConflict: "sequencial_precedente", ignoreDuplicates: false })
        .select("sequencial_precedente");
      if (error) throw new Error(`Supabase upsert stj_precedentes_temas: ${error.message}`);
      temasUpserted += data?.length ?? batch.length;
    }

    let processosUpserted = 0;
    for (let i = 0; i < procRows.length; i += UPSERT_BATCH) {
      const batch = procRows.slice(i, i + UPSERT_BATCH);
      const { data, error } = await supabase
        .from("stj_precedentes_processos")
        .upsert(batch, {
          onConflict: "numero_registro,sequencial_precedente",
          ignoreDuplicates: true,
        })
        .select("numero_registro");
      if (error) throw new Error(`Supabase upsert stj_precedentes_processos: ${error.message}`);
      processosUpserted += data?.length ?? batch.length;
    }

    return {
      success: true,
      temasUpserted,
      processosUpserted,
      durationMs: Date.now() - started,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      temasUpserted: 0,
      processosUpserted: 0,
      durationMs: Date.now() - started,
      error: msg,
    };
  }
}
