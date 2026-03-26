// Responsabilidade única: extração STF → stf_*. Nunca aciona ICONS diretamente.
// Nunca aciona judx-normalizer. Dado bruto preservado integralmente.

import WebSocket from "ws";
import { getSupabaseServiceClient } from "@/src/lib/supabase-service";

// ────────────────────────────────────────────────────────────
// Constantes
// ────────────────────────────────────────────────────────────

const LOG_PREFIX = "[stf-sync]";

const QLIK_APP_ID = "023307ab-d927-4144-aabb-831b360515bb";
const QLIK_WS_URL = `wss://transparencia.stf.jus.br/app/${QLIK_APP_ID}`;
const QLIK_OBJ_DECISOES = "UbMrYBg";
const QLIK_OBJ_PARTES = "pRRETQ";
const QLIK_PAGE_SIZE = 1000;

const PORTAL_BASE = "https://portal.stf.jus.br/processos";
const REPGERAL_BASE = "https://sistemas.stf.jus.br/repgeral/votacao";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html, application/json, */*",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  Origin: "https://transparencia.stf.jus.br",
};

const UPSERT_BATCH = 200;

const INCIDENTE_ABAS = [
  "abaPartes",
  "abaInformacoes",
  "abaAndamentos",
  "abaDecisoes",
  "abaPautas",
  "abaSessao",
  "abaDeslocamentos",
  "abaPeticoes",
] as const;

type IncidenteAba = (typeof INCIDENTE_ABAS)[number];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ────────────────────────────────────────────────────────────
// Qlik Engine WebSocket — generic helper
// ────────────────────────────────────────────────────────────

type QlikCell = { qText?: string; qNum?: number; qElemNumber?: number };
type QlikMessage = {
  jsonrpc: string;
  id?: number;
  method?: string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
  params?: Record<string, unknown>;
  change?: number[];
};

/**
 * Opens a Qlik Engine session, fetches all rows from a hypercube object
 * in pages of `pageSize`, and calls `onPage` for each page.
 *
 * Returns total rows fetched. Closes the WebSocket when done.
 */
async function qlikFetchAllPages(
  objectId: string,
  pageSize: number,
  onPage: (rows: QlikCell[][], colCount: number) => Promise<void>,
  options?: { yearFilter?: string },
): Promise<{ totalRows: number; totalCols: number }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(QLIK_WS_URL, {
      headers: {
        ...BROWSER_HEADERS,
        Referer: "https://transparencia.stf.jus.br/extensions/decisoes/decisoes.html",
      },
      rejectUnauthorized: false,
    });

    let msgId = 0;
    let appHandle = -1;
    let objHandle = -1;
    let totalRows = 0;
    let totalCols = 0;
    let rowsFetched = 0;
    let closed = false;

    const send = (method: string, handle: number, params: unknown): number => {
      const id = ++msgId;
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, handle, params }));
      return id;
    };

    const timeout = setTimeout(() => {
      if (!closed) {
        closed = true;
        console.warn(`${LOG_PREFIX} Qlik timeout after 10 min for object ${objectId}`);
        ws.close();
        resolve({ totalRows: rowsFetched, totalCols });
      }
    }, 10 * 60 * 1000);

    const finish = () => {
      if (!closed) {
        closed = true;
        clearTimeout(timeout);
        ws.close();
        resolve({ totalRows: rowsFetched, totalCols });
      }
    };

    // State machine IDs
    let idOpenDoc = -1;
    let idGetObj = -1;
    let idGetLayout = -1;
    let idSelectYear = -1;
    let idGetData = -1;

    ws.on("open", () => {
      idOpenDoc = send("OpenDoc", -1, [QLIK_APP_ID]);
    });

    ws.on("message", async (data) => {
      const msg: QlikMessage = JSON.parse(data.toString());
      if (!msg.id) return; // skip notifications

      try {
        if (msg.id === idOpenDoc) {
          if (msg.error) throw new Error(`OpenDoc: ${msg.error.message}`);
          appHandle = (msg.result?.qReturn as Record<string, unknown>)?.qHandle as number ?? 1;

          // Apply year filter if requested
          if (options?.yearFilter) {
            idSelectYear = send("GetField", appHandle, { qFieldName: "[Ano decisão]" });
          } else {
            idGetObj = send("GetObject", appHandle, { qId: objectId });
          }
        }

        if (msg.id === idSelectYear) {
          const fieldHandle = (msg.result?.qReturn as Record<string, unknown>)?.qHandle as number;
          if (fieldHandle) {
            idSelectYear = send("SelectMatch", fieldHandle, { qMatch: options!.yearFilter!, qSoftLock: false });
            // After select, re-assign idSelectYear to catch the result
            // Actually SelectMatch returns on a new id, we need a different approach
            // Let's just get the object after a short delay
            await sleep(500);
          }
          idGetObj = send("GetObject", appHandle, { qId: objectId });
        }

        if (msg.id === idGetObj) {
          if (msg.error) throw new Error(`GetObject ${objectId}: ${msg.error.message}`);
          objHandle = (msg.result?.qReturn as Record<string, unknown>)?.qHandle as number ?? 2;
          idGetLayout = send("GetLayout", objHandle, {});
        }

        if (msg.id === idGetLayout) {
          if (msg.error) throw new Error(`GetLayout: ${msg.error.message}`);
          const layout = msg.result?.qLayout as Record<string, unknown> | undefined;
          const hc = layout?.qHyperCube as Record<string, unknown> | undefined;
          if (!hc) throw new Error("No HyperCube in layout");

          const size = hc.qSize as { qcy: number; qcx: number };
          totalRows = size.qcy;
          totalCols = size.qcx;

          const dims = (hc.qDimensionInfo as Array<{ qFallbackTitle: string }>) || [];
          console.log(
            `${LOG_PREFIX} Object ${objectId}: ${totalRows} rows x ${totalCols} cols. Dims: ${dims.map((d) => d.qFallbackTitle).join(", ")}`,
          );

          if (totalRows === 0) {
            finish();
            return;
          }

          // Fetch first page
          idGetData = send("GetHyperCubeData", objHandle, {
            qPath: "/qHyperCubeDef",
            qPages: [{ qLeft: 0, qTop: 0, qWidth: totalCols, qHeight: Math.min(pageSize, totalRows) }],
          });
        }

        if (msg.id === idGetData) {
          if (msg.error) throw new Error(`GetHyperCubeData: ${msg.error.message}`);
          const pages = msg.result as unknown as Array<{ qMatrix: QlikCell[][] }>;
          const matrix = pages?.[0]?.qMatrix || [];

          if (matrix.length === 0) {
            finish();
            return;
          }

          await onPage(matrix, totalCols);
          rowsFetched += matrix.length;

          if (rowsFetched % 10000 < pageSize) {
            console.log(`${LOG_PREFIX} ${objectId}: ${rowsFetched}/${totalRows} rows (${((rowsFetched / totalRows) * 100).toFixed(1)}%)`);
          }

          if (rowsFetched >= totalRows || matrix.length < pageSize) {
            finish();
            return;
          }

          // Fetch next page
          idGetData = send("GetHyperCubeData", objHandle, {
            qPath: "/qHyperCubeDef",
            qPages: [{ qLeft: 0, qTop: rowsFetched, qWidth: totalCols, qHeight: Math.min(pageSize, totalRows - rowsFetched) }],
          });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`${LOG_PREFIX} Qlik error: ${errMsg}`);
        closed = true;
        clearTimeout(timeout);
        ws.close();
        reject(new Error(errMsg));
      }
    });

    ws.on("error", (err) => {
      if (!closed) {
        closed = true;
        clearTimeout(timeout);
        reject(new Error(`WebSocket error: ${err.message}`));
      }
    });

    ws.on("close", () => {
      if (!closed) {
        closed = true;
        clearTimeout(timeout);
        resolve({ totalRows: rowsFetched, totalCols });
      }
    });
  });
}

function cellText(cell: QlikCell | undefined): string | null {
  if (!cell) return null;
  const t = cell.qText?.trim();
  if (t === undefined || t === "" || t === "-") return null;
  return t;
}

// ────────────────────────────────────────────────────────────
// Módulo 1 — syncStfDecisoes
// ────────────────────────────────────────────────────────────

/** Colunas do objeto UbMrYBg na ordem retornada pelo Qlik. */
const DECISOES_COLS = [
  "id_fato_decisao",
  "processo",
  "relator_atual",
  "meio_processo",
  "origem_decisao",
  "ambiente_julgamento",
  "data_autuacao",
  "data_baixa",
  "indicador_colegiado",
  "ano_decisao",
  "data_decisao",
  "tipo_decisao",
  "andamento_decisao",
  "observacao_andamento",
  "ramo_direito",
  "assuntos_processo",
  "indicador_tramitacao",
  "orgao_julgador",
  "descricao_procedencia",
  "descricao_orgao_origem",
] as const;

export type StfDecisionRow = Record<(typeof DECISOES_COLS)[number], string | null>;

export type StfDecisoesSyncResult = {
  fetched: number;
  upserted: number;
  errors: number;
};

/**
 * Extrai decisões do STF via Qlik WebSocket e salva em stf_decisions.
 * @param yearFilter — se informado, filtra por ano da decisão (ex: "2024") para carga incremental.
 */
export async function syncStfDecisoes(yearFilter?: string): Promise<StfDecisoesSyncResult> {
  const supabase = getSupabaseServiceClient();
  let upserted = 0;
  let errors = 0;

  console.log(`${LOG_PREFIX} syncStfDecisoes started${yearFilter ? ` (year=${yearFilter})` : " (full)"}`);

  const { totalRows } = await qlikFetchAllPages(
    QLIK_OBJ_DECISOES,
    QLIK_PAGE_SIZE,
    async (rows) => {
      const batch: Record<string, unknown>[] = [];

      for (const row of rows) {
        const record: Record<string, unknown> = { court_id: "STF" };
        for (let i = 0; i < DECISOES_COLS.length && i < row.length; i++) {
          record[DECISOES_COLS[i]] = cellText(row[i]);
        }

        if (!record.processo) continue;
        batch.push(record);
      }

      if (batch.length === 0) return;

      // Upsert in sub-batches
      for (let i = 0; i < batch.length; i += UPSERT_BATCH) {
        const sub = batch.slice(i, i + UPSERT_BATCH);
        const { error } = await supabase
          .from("stf_decisions")
          .upsert(sub, { onConflict: "id_fato_decisao", ignoreDuplicates: false });

        if (error) {
          console.error(`${LOG_PREFIX} upsert stf_decisions: ${error.message}`);
          errors++;
        } else {
          upserted += sub.length;
        }
      }
    },
    yearFilter ? { yearFilter } : undefined,
  );

  console.log(`${LOG_PREFIX} syncStfDecisoes done: fetched=${totalRows}, upserted=${upserted}, errors=${errors}`);
  return { fetched: totalRows, upserted, errors };
}

// ────────────────────────────────────────────────────────────
// Módulo 2 — syncStfPartes
// ────────────────────────────────────────────────────────────

const PARTES_COLS = [
  "processo",
  "polo_ativo",
  "polo_passivo",
  "advogado_polo_ativo",
  "advogado_polo_passivo",
] as const;

export type StfParteRow = Record<(typeof PARTES_COLS)[number], string | null>;

export type StfPartesSyncResult = {
  fetched: number;
  inserted: number;
  errors: number;
};

/**
 * Extrai partes do STF via Qlik WebSocket e salva em stf_partes.
 * Insert (não upsert — sem chave natural única para partes).
 */
export async function syncStfPartes(): Promise<StfPartesSyncResult> {
  const supabase = getSupabaseServiceClient();
  let inserted = 0;
  let errors = 0;

  console.log(`${LOG_PREFIX} syncStfPartes started`);

  // Limpa tabela antes de carga completa (sem chave natural para upsert)
  const { error: truncErr } = await supabase.from("stf_partes").delete().neq("id", 0);
  if (truncErr) {
    console.warn(`${LOG_PREFIX} Failed to clear stf_partes: ${truncErr.message}`);
  }

  const { totalRows } = await qlikFetchAllPages(
    QLIK_OBJ_PARTES,
    QLIK_PAGE_SIZE,
    async (rows) => {
      const batch: Record<string, unknown>[] = [];

      for (const row of rows) {
        const record: Record<string, unknown> = { court_id: "STF" };
        for (let i = 0; i < PARTES_COLS.length && i < row.length; i++) {
          record[PARTES_COLS[i]] = cellText(row[i]);
        }

        if (!record.processo) continue;
        batch.push(record);
      }

      if (batch.length === 0) return;

      for (let i = 0; i < batch.length; i += UPSERT_BATCH) {
        const sub = batch.slice(i, i + UPSERT_BATCH);
        const { error } = await supabase.from("stf_partes").insert(sub);

        if (error) {
          console.error(`${LOG_PREFIX} insert stf_partes: ${error.message}`);
          errors++;
        } else {
          inserted += sub.length;
        }
      }
    },
  );

  console.log(`${LOG_PREFIX} syncStfPartes done: fetched=${totalRows}, inserted=${inserted}, errors=${errors}`);
  return { fetched: totalRows, inserted, errors };
}

// ────────────────────────────────────────────────────────────
// Módulo 3 — syncStfIncidente
// ────────────────────────────────────────────────────────────

export type StfIncidenteSyncResult = {
  incidente: number;
  abasOk: number;
  abasFailed: string[];
};

/**
 * Busca as 8 abas do portal STF para um incidente e salva HTML bruto.
 * Append-only — cada fetch é um novo registro, preservando histórico.
 */
export async function syncStfIncidente(incidente: number): Promise<StfIncidenteSyncResult> {
  const supabase = getSupabaseServiceClient();
  let abasOk = 0;
  const abasFailed: string[] = [];

  console.log(`${LOG_PREFIX} syncStfIncidente ${incidente} started`);

  // Fetch all tabs in parallel
  const results = await Promise.allSettled(
    INCIDENTE_ABAS.map(async (aba) => {
      const url = `${PORTAL_BASE}/${aba}.asp?incidente=${incidente}`;
      const res = await fetch(url, {
        headers: {
          ...BROWSER_HEADERS,
          Referer: `${PORTAL_BASE}/detalhe.asp?incidente=${incidente}`,
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${aba}`);
      }

      const html = await res.text();
      return { aba, html };
    }),
  );

  // Collect successful results for batch insert
  const rows: Array<{ court_id: string; incidente: number; aba: string; html: string }> = [];

  for (const r of results) {
    if (r.status === "fulfilled") {
      rows.push({
        court_id: "STF",
        incidente,
        aba: r.value.aba,
        html: r.value.html,
      });
      abasOk++;
    } else {
      const abaName = INCIDENTE_ABAS[results.indexOf(r)] ?? "unknown";
      abasFailed.push(abaName);
      console.warn(`${LOG_PREFIX} incidente ${incidente} ${abaName}: ${r.reason}`);
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("stf_incidente_raw").insert(rows);
    if (error) {
      console.error(`${LOG_PREFIX} insert stf_incidente_raw: ${error.message}`);
    }
  }

  console.log(
    `${LOG_PREFIX} syncStfIncidente ${incidente} done: ${abasOk}/8 OK${abasFailed.length > 0 ? `, failed: ${abasFailed.join(", ")}` : ""}`,
  );

  return { incidente, abasOk, abasFailed };
}

/**
 * Busca incidentes em lote com throttle para não sobrecarregar o portal.
 * @param incidentes — lista de IDs de incidente
 * @param delayMs — pausa entre incidentes (default 2000ms)
 */
export async function syncStfIncidentesBatch(
  incidentes: number[],
  delayMs = 2000,
): Promise<StfIncidenteSyncResult[]> {
  const results: StfIncidenteSyncResult[] = [];

  for (let i = 0; i < incidentes.length; i++) {
    if (i > 0) await sleep(delayMs);
    try {
      const r = await syncStfIncidente(incidentes[i]);
      results.push(r);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${LOG_PREFIX} incidente ${incidentes[i]} error: ${msg}`);
      results.push({ incidente: incidentes[i], abasOk: 0, abasFailed: [...INCIDENTE_ABAS] });
    }
  }

  return results;
}

// ────────────────────────────────────────────────────────────
// Módulo 4 — syncStfRepercussaoGeral
// ────────────────────────────────────────────────────────────

export type StfRepercussaoGeralSyncResult = {
  tema: number;
  ok: boolean;
  error?: string;
};

/**
 * Busca JSON da API de repercussão geral para um tema e salva em stf_repercussao_geral.
 * Append-only — cada fetch é um novo registro.
 */
export async function syncStfRepercussaoGeral(tema: number): Promise<StfRepercussaoGeralSyncResult> {
  const supabase = getSupabaseServiceClient();

  try {
    const res = await fetch(`${REPGERAL_BASE}?tema=${tema}`, {
      headers: BROWSER_HEADERS,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const payload = await res.json();

    const { error } = await supabase.from("stf_repercussao_geral").insert({
      court_id: "STF",
      tema,
      payload_json: payload,
    });

    if (error) {
      throw new Error(`Supabase insert: ${error.message}`);
    }

    console.log(`${LOG_PREFIX} repercussão geral tema ${tema} OK`);
    return { tema, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} repercussão geral tema ${tema}: ${msg}`);
    return { tema, ok: false, error: msg };
  }
}

/**
 * Busca repercussão geral em lote para múltiplos temas.
 * @param temas — lista de números de tema
 * @param delayMs — pausa entre temas (default 500ms)
 */
export async function syncStfRepercussaoGeralBatch(
  temas: number[],
  delayMs = 500,
): Promise<StfRepercussaoGeralSyncResult[]> {
  const results: StfRepercussaoGeralSyncResult[] = [];

  for (let i = 0; i < temas.length; i++) {
    if (i > 0) await sleep(delayMs);
    const r = await syncStfRepercussaoGeral(temas[i]);
    results.push(r);
  }

  return results;
}
