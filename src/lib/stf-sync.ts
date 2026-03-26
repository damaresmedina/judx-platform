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
// Qlik Engine limit: max 10.000 cells per page. With 20 cols → max 499 rows.
const QLIK_PAGE_SIZE = 400;

const PORTAL_BASE = "https://portal.stf.jus.br/processos";
const REPGERAL_BASE = "https://sistemas.stf.jus.br/repgeral/votacao";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html, application/json, */*",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "Accept-Encoding": "identity",
  Connection: "keep-alive",
};

// Headers específicos para o portal (diferente do Qlik/transparencia)
const PORTAL_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "Accept-Encoding": "identity",
  Connection: "keep-alive",
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
 * Opens a Qlik Engine session and fetches all rows by creating ad-hoc
 * session hypercubes with qInitialDataFetch (the only method that reliably
 * returns data from the STF Qlik server).
 *
 * Paginates by creating new session objects with incrementing qTop offsets.
 */
type QlikSelection = { fieldName: string; value: string };

async function qlikFetchAllPages(
  fieldDefs: string[],
  pageSize: number,
  onPage: (rows: QlikCell[][], colCount: number) => Promise<void>,
  maxRows?: number,
  selection?: QlikSelection, // server-side field filter (e.g. Ano decisão = "2024")
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
    let totalRows = 0;
    let totalCols = 0;
    let rowsFetched = 0;
    let closed = false;
    let selectionPending = false;

    const send = (method: string, handle: number, params: unknown): number => {
      const id = ++msgId;
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, handle, params }));
      return id;
    };

    const timeout = setTimeout(() => {
      if (!closed) {
        closed = true;
        console.warn(`${LOG_PREFIX} Qlik timeout after 10 min`);
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

    // Creates a new session object at the given offset and reads data from layout
    const fetchPage = (offset: number) => {
      // On first page totalRows is still 0 (set after GetLayout), so use pageSize directly.
      const effectiveMax = maxRows ? (totalRows > 0 ? Math.min(totalRows, maxRows) : maxRows) : (totalRows > 0 ? totalRows : Infinity);
      const remaining = effectiveMax - offset;
      const height = remaining <= 0 ? pageSize : Math.min(pageSize, remaining);

      send("CreateSessionObject", appHandle, [{
        qInfo: { qType: "judx-page" },
        qHyperCubeDef: {
          qDimensions: fieldDefs.map((f) => ({ qDef: { qFieldDefs: [f] } })),
          qMeasures: [],
          qInitialDataFetch: [{
            qLeft: 0,
            qTop: offset,
            qWidth: fieldDefs.length,
            qHeight: height,
          }],
        },
      }]);
    };

    ws.on("open", () => {
      send("OpenDoc", -1, [QLIK_APP_ID]);
    });

    ws.on("message", (rawData) => {
      const msg: QlikMessage = JSON.parse(rawData.toString());
      if (!msg.id) return;

      (async () => {
        // OpenDoc response
        if (msg.result?.qReturn && (msg.result.qReturn as Record<string, unknown>).qType === "Doc") {
          if (msg.error) throw new Error(`OpenDoc: ${msg.error.message}`);
          appHandle = (msg.result.qReturn as Record<string, unknown>).qHandle as number;

          // Apply server-side selection if requested
          if (selection) {
            selectionPending = true;
            send("GetField", appHandle, [selection.fieldName]);
          } else {
            fetchPage(0);
          }
          return;
        }

        // GetField response — apply selection
        if (selectionPending && msg.result?.qReturn && (msg.result.qReturn as Record<string, unknown>).qType === "Field") {
          const fieldHandle = (msg.result.qReturn as Record<string, unknown>).qHandle as number;
          const val = selection!.value;
          const isNum = !isNaN(Number(val));
          console.log(`${LOG_PREFIX} Applying selection: ${selection!.fieldName}=${val}`);
          // Positional params: [qFieldValues[], qToggleMode, qSoftLock]
          send("SelectValues", fieldHandle, [
            [{ qText: val, qIsNumeric: isNum, qNumber: isNum ? Number(val) : 0 }],
            false,
            false,
          ]);
          return;
        }

        // SelectValues response — start fetching pages
        if (selectionPending && msg.result?.qReturn === true) {
          selectionPending = false;
          console.log(`${LOG_PREFIX} Selection applied, fetching data...`);
          fetchPage(0);
          return;
        }

        // CreateSessionObject response
        if (msg.result?.qReturn && (msg.result.qReturn as Record<string, unknown>).qType === "GenericObject") {
          const objHandle = (msg.result.qReturn as Record<string, unknown>).qHandle as number;
          send("GetLayout", objHandle, {});
          return;
        }

        // GetLayout response (contains data in qDataPages via qInitialDataFetch)
        if (msg.result?.qLayout) {
          const hc = (msg.result.qLayout as Record<string, unknown>).qHyperCube as Record<string, unknown> | undefined;
          if (!hc) throw new Error("No HyperCube in layout");

          const size = hc.qSize as { qcy: number; qcx: number };
          if (totalRows === 0) {
            totalRows = size.qcy;
            totalCols = size.qcx;
            console.log(`${LOG_PREFIX} Session HC: ${totalRows} rows x ${totalCols} cols`);
          }

          const dataPages = hc.qDataPages as Array<{ qMatrix: QlikCell[][] }> | undefined;
          const matrix = dataPages?.[0]?.qMatrix || [];

          if (matrix.length === 0) {
            finish();
            return;
          }

          await onPage(matrix, totalCols);
          rowsFetched += matrix.length;

          if (rowsFetched % 10000 < pageSize) {
            console.log(`${LOG_PREFIX} Progress: ${rowsFetched}/${totalRows} (${((rowsFetched / totalRows) * 100).toFixed(1)}%)`);
          }

          const effectiveMax = maxRows ? Math.min(totalRows, maxRows) : totalRows;
          if (rowsFetched >= effectiveMax || matrix.length < pageSize) {
            finish();
            return;
          }

          // Next page
          fetchPage(rowsFetched);
          return;
        }

        // Error responses
        if (msg.error) {
          throw new Error(`Qlik API error: ${msg.error.message}`);
        }
      })().catch((err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`${LOG_PREFIX} Qlik error: ${errMsg}`);
        if (!closed) {
          closed = true;
          clearTimeout(timeout);
          ws.close();
          reject(new Error(errMsg));
        }
      });
    });

    ws.on("error", (err) => {
      console.error(`${LOG_PREFIX} WS error: ${err.message}`);
      if (!closed) {
        closed = true;
        clearTimeout(timeout);
        reject(new Error(`WebSocket error: ${err.message}`));
      }
    });

    ws.on("close", (code) => {
      console.log(`${LOG_PREFIX} WS closed: code=${code}, fetched=${rowsFetched}`);
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

/** Qlik field names → DB column names, in order. */
const DECISOES_FIELDS = [
  { qlik: "idFatoDecisao",                db: "id_fato_decisao" },
  { qlik: "Processo",                     db: "processo" },
  { qlik: "Relator atual",               db: "relator_atual" },
  { qlik: "Meio Processo",               db: "meio_processo" },
  { qlik: "Origem decisão",              db: "origem_decisao" },
  { qlik: "Ambiente julgamento",          db: "ambiente_julgamento" },
  { qlik: "Data Autuação",               db: "data_autuacao" },
  { qlik: "Data Baixa",                  db: "data_baixa" },
  { qlik: "Ano decisão",                 db: "ano_decisao" },
  { qlik: "Data decisão",                db: "data_decisao" },
  { qlik: "Tipo decisão",                db: "tipo_decisao" },
  { qlik: "Andamento decisão",           db: "andamento_decisao" },
  { qlik: "Observação decisão",           db: "observacao_andamento" },
  { qlik: "Ramo Direito",                db: "ramo_direito" },
  { qlik: "Assunto Concatenado",          db: "assuntos_processo" },
  { qlik: "Processo em Tramitação",       db: "indicador_tramitacao" },
  { qlik: "Órgão julgador",              db: "orgao_julgador" },
  { qlik: "Descrição Procedência Processo", db: "descricao_procedencia" },
  { qlik: "Descrição Órgão Origem",       db: "descricao_orgao_origem" },
  { qlik: "Seq. Objeto Incidente",         db: "incidente" },
] as const;

const DECISOES_QLIK_FIELDS = DECISOES_FIELDS.map((f) => f.qlik);
const DECISOES_DB_COLS = DECISOES_FIELDS.map((f) => f.db);

export type StfDecisionRow = Record<(typeof DECISOES_DB_COLS)[number], string | null>;

export type StfDecisoesSyncResult = {
  fetched: number;
  upserted: number;
  errors: number;
};

/**
 * Extrai decisões do STF via Qlik WebSocket e salva em stf_decisions.
 * @param yearFilter — se informado, filtra por ano da decisão client-side (ex: "2024").
 * @param limit — máximo de linhas a buscar do Qlik (0 = sem limite).
 */
export async function syncStfDecisoes(yearFilter?: string, limit?: number): Promise<StfDecisoesSyncResult> {
  const supabase = getSupabaseServiceClient();
  let upserted = 0;
  let errors = 0;

  console.log(`${LOG_PREFIX} syncStfDecisoes started${yearFilter ? ` (year=${yearFilter})` : " (full)"}`);

  const { totalRows } = await qlikFetchAllPages(
    DECISOES_QLIK_FIELDS as unknown as string[],
    QLIK_PAGE_SIZE,
    async (rows) => {
      const batch: Record<string, unknown>[] = [];

      for (const row of rows) {
        const record: Record<string, unknown> = { court_id: "STF" };
        for (let i = 0; i < DECISOES_DB_COLS.length && i < row.length; i++) {
          record[DECISOES_DB_COLS[i]] = cellText(row[i]);
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
    limit || undefined,
    yearFilter ? { fieldName: "Ano decisão", value: yearFilter } : undefined,
  );

  console.log(`${LOG_PREFIX} syncStfDecisoes done: fetched=${totalRows}, upserted=${upserted}, errors=${errors}`);
  return { fetched: totalRows, upserted, errors };
}

// ────────────────────────────────────────────────────────────
// Módulo 2 — syncStfPartes
// ────────────────────────────────────────────────────────────

const PARTES_FIELDS = [
  { qlik: "Processo",              db: "processo" },
  { qlik: "Polo ativo",            db: "polo_ativo" },
  { qlik: "Polo passivo",          db: "polo_passivo" },
  { qlik: "Advogado polo ativo",   db: "advogado_polo_ativo" },
  { qlik: "Advogado polo passivo", db: "advogado_polo_passivo" },
] as const;

const PARTES_QLIK_FIELDS = PARTES_FIELDS.map((f) => f.qlik);
const PARTES_DB_COLS = PARTES_FIELDS.map((f) => f.db);

export type StfParteRow = Record<(typeof PARTES_DB_COLS)[number], string | null>;

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
    PARTES_QLIK_FIELDS as unknown as string[],
    QLIK_PAGE_SIZE,
    async (rows) => {
      const batch: Record<string, unknown>[] = [];

      for (const row of rows) {
        const record: Record<string, unknown> = { court_id: "STF" };
        for (let i = 0; i < PARTES_DB_COLS.length && i < row.length; i++) {
          record[PARTES_DB_COLS[i]] = cellText(row[i]);
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
          ...PORTAL_HEADERS,
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
