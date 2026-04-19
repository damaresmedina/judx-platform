/**
 * datajud-scraper-worker.mjs v4 — 3 passes para honrar "nada pode ser descartado"
 *
 * Uso:
 *   node scripts/datajud-scraper-worker.mjs <alias> <outDir> [fromISO] [toISO]
 *
 * Retry: 3× com backoff (2s, 8s, 32s) em 429/5xx
 *
 * Passes:
 *   primary   — query match_all, sort @timestamp asc.
 *               Arquivos: part-NNNNNN.ndjson.gz
 *               Ao detectar sentinela Long.MAX_VALUE (>1e14), transiciona para secondary.
 *   secondary — query { must_not: exists @timestamp }, sort dataAjuizamento asc.
 *               Arquivos: orphans-NNNNNN.ndjson.gz
 *               Ao detectar sentinela, transiciona para tertiary (docs sem dataAjuizamento).
 *   tertiary  — query { must_not: @timestamp & must_not: dataAjuizamento }, sort id.keyword asc.
 *               Arquivos: ghosts-NNNNNN.ndjson.gz
 *               Captura docs com classe=-1 ("Inválido"): só _id e id no _source.
 *               A chave CNJ vive no _id (formato TRIB_GRAU_numeroProcesso).
 *               Princípio: "inconsistência é sinal da trilha" (nota técnica 17/abr, 5.3).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, createWriteStream } from 'fs';
import { join } from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const ENV_PATH = join(process.cwd(), '.env.local');
const envText = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf-8') : '';
const APIKEY = envText.match(/^DATAJUD_APIKEY=(.+)$/m)?.[1]?.trim();
const UA = envText.match(/^DATAJUD_USER_AGENT=(.+)$/m)?.[1]?.trim()
  || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BASE = 'https://api-publica.datajud.cnj.jus.br';

if (!APIKEY) { console.error('Faltou DATAJUD_APIKEY em .env.local'); process.exit(1); }

const alias = process.argv[2];
const OUT = process.argv[3];
const FROM_ISO = process.argv[4] || null;
const TO_ISO = process.argv[5] || null;
// 6º arg opcional: campo para o range (default @timestamp; usar 'dataAjuizamento' para
// sharding por época processual — valores esperados no formato CNJ YYYYMMDDHHmmss)
const DATE_FIELD = process.argv[6] || '@timestamp';

if (!alias || !OUT) { console.error('Uso: node worker.mjs <alias> <outDir> [fromISO] [toISO]'); process.exit(1); }

const sigla = alias.replace(/^api_publica_/,'').toUpperCase();
const shardTag = (FROM_ISO && TO_ISO) ? `[${FROM_ISO.slice(0,10)}..${TO_ISO.slice(0,10)}]` : '[ALL]';
mkdirSync(OUT, { recursive: true });

const CHK_PATH = join(OUT, 'checkpoint.json');
const ERR_PATH = join(OUT, 'errors.log');
const MAN_PATH = join(OUT, 'manifest.json');

const PAGE_SIZE = 1000;
const SLEEP_BETWEEN_REQUESTS_MS = 100;
// Sentinela Long.MAX_VALUE devolvida pelo ES quando @timestamp é null
// (>ano 2100 em ms = ~4.1e12). Qualquer valor acima disso é sentinela.
const TIMESTAMP_SENTINEL_THRESHOLD = 4102444800000;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const logErr = (msg) => appendFileSync(ERR_PATH, `[${new Date().toISOString()}] ${msg}\n`);

const DEFAULT_CHECKPOINT = {
  search_after: null,
  total_fetched: 0,
  total_fetched_secondary: 0,
  total_fetched_ghosts: 0,
  done: false,
  file_index: 0,
  pass: 'primary',
  primary_done: false,
  secondary_done: false,
};

function loadCheckpoint() {
  if (!existsSync(CHK_PATH)) return { ...DEFAULT_CHECKPOINT };
  try {
    const raw = JSON.parse(readFileSync(CHK_PATH,'utf-8'));
    return { ...DEFAULT_CHECKPOINT, ...raw };
  } catch {
    return { ...DEFAULT_CHECKPOINT };
  }
}
function saveCheckpoint(c) { writeFileSync(CHK_PATH, JSON.stringify(c,null,2)); }

function isSentinelSort(sortArr) {
  if (!Array.isArray(sortArr) || sortArr.length === 0) return false;
  const v = sortArr[0];
  return typeof v === 'number' && v > TIMESTAMP_SENTINEL_THRESHOLD;
}

function buildQuery(pass) {
  if (pass === 'tertiary') {
    return {
      bool: {
        must_not: [
          { exists: { field: '@timestamp' } },
          { exists: { field: 'dataAjuizamento' } },
        ],
      },
    };
  }
  if (pass === 'secondary') {
    return { bool: { must_not: [{ exists: { field: '@timestamp' } }] } };
  }
  // Sentinela 'NULL' em FROM_ISO ativa modo "must_not exists DATE_FIELD"
  // usado para shard dedicado aos docs sem dataAjuizamento (ex.: ~34,8M no TJSP).
  if (FROM_ISO === 'NULL') {
    return { bool: { must_not: [{ exists: { field: DATE_FIELD } }] } };
  }
  if (FROM_ISO && TO_ISO) {
    return { range: { [DATE_FIELD]: { gte: FROM_ISO, lt: TO_ISO } } };
  }
  return { match_all: {} };
}

function buildSort(pass) {
  if (pass === 'tertiary') return [{ 'id.keyword': { order: 'asc' } }];
  if (pass === 'secondary') return [{ 'dataAjuizamento': { order: 'asc' } }];
  return [{ '@timestamp': { order: 'asc' } }];
}

function fileNamePrefix(pass) {
  if (pass === 'tertiary') return 'ghosts';
  if (pass === 'secondary') return 'orphans';
  return 'part';
}

async function fetchPage(searchAfter, pass) {
  const body = {
    size: PAGE_SIZE,
    track_total_hits: true,
    sort: buildSort(pass),
    query: buildQuery(pass),
    ...(searchAfter ? { search_after: searchAfter } : {})
  };
  const url = `${BASE}/${alias}/_search`;
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `APIKey ${APIKEY}`,
          'User-Agent': UA,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (r.status === 429 || (r.status >= 500 && r.status < 600)) {
        lastErr = `HTTP ${r.status} attempt ${attempt}`;
        await sleep(2000 * Math.pow(4, attempt-1));
        continue;
      }
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`HTTP ${r.status}: ${text.slice(0,300)}`);
      }
      return await r.json();
    } catch (e) {
      lastErr = e.message;
      await sleep(2000 * Math.pow(4, attempt-1));
    }
  }
  throw new Error(`Falhou após 3 tentativas: ${lastErr}`);
}

async function writeNdjsonGz(hits, filePath) {
  const lines = hits.map(h => JSON.stringify(h)).join('\n') + '\n';
  await pipeline(Readable.from(lines), createGzip({ level: 6 }), createWriteStream(filePath));
}

function counterFor(chk, pass) {
  if (pass === 'tertiary') return chk.total_fetched_ghosts;
  if (pass === 'secondary') return chk.total_fetched_secondary;
  return chk.total_fetched;
}

function addToCounter(chk, pass, n) {
  if (pass === 'tertiary') chk.total_fetched_ghosts += n;
  else if (pass === 'secondary') chk.total_fetched_secondary += n;
  else chk.total_fetched += n;
}

async function runPass(chk, t0) {
  const pass = chk.pass;
  let pagesInThisRun = 0;
  let totalEsperado = null;
  console.log(`[${sigla}${shardTag}][${pass}] start (primary=${chk.total_fetched}, secondary=${chk.total_fetched_secondary}, ghosts=${chk.total_fetched_ghosts}, file_index=${chk.file_index})`);

  while (true) {
    let json;
    try {
      json = await fetchPage(chk.search_after, pass);
    } catch (e) {
      logErr(`[${sigla}${shardTag}][${pass}] falha search_after=${JSON.stringify(chk.search_after)}: ${e.message}`);
      console.error(`[${sigla}${shardTag}][${pass}] ERRO: ${e.message}`);
      return false;
    }
    if (totalEsperado == null) {
      totalEsperado = json?.hits?.total?.value ?? null;
    }
    const hits = json?.hits?.hits ?? [];
    if (hits.length === 0) return true;

    chk.file_index++;
    const prefix = fileNamePrefix(pass);
    const partPath = join(OUT, `${prefix}-${String(chk.file_index).padStart(6,'0')}.ndjson.gz`);
    await writeNdjsonGz(hits, partPath);

    addToCounter(chk, pass, hits.length);

    const lastSort = hits[hits.length-1].sort;

    // Transição por sentinela: @timestamp ou dataAjuizamento devolvidos como Long.MAX_VALUE
    if (pass === 'primary' && isSentinelSort(lastSort)) {
      console.log(`[${sigla}${shardTag}][primary] sentinela em sort=${JSON.stringify(lastSort)} — transição para secondary`);
      chk.primary_done = true;
      chk.pass = 'secondary';
      chk.search_after = null;
      saveCheckpoint(chk);
      return true;
    }
    if (pass === 'secondary' && isSentinelSort(lastSort)) {
      console.log(`[${sigla}${shardTag}][secondary] sentinela em sort=${JSON.stringify(lastSort)} — transição para tertiary`);
      chk.secondary_done = true;
      chk.pass = 'tertiary';
      chk.search_after = null;
      saveCheckpoint(chk);
      return true;
    }

    chk.search_after = lastSort;
    saveCheckpoint(chk);

    pagesInThisRun++;
    if (pagesInThisRun % 10 === 0) {
      const counter = counterFor(chk, pass);
      const rate = counter / ((Date.now()-t0)/1000);
      console.log(`[${sigla}${shardTag}][${pass}] ${counter.toLocaleString('pt-BR')}/${totalEsperado?.toLocaleString('pt-BR') ?? '?'} — ${rate.toFixed(0)} docs/s`);
    }

    await sleep(SLEEP_BETWEEN_REQUESTS_MS);
    if (hits.length < PAGE_SIZE) return true;
  }
}

async function main() {
  let chk = loadCheckpoint();
  if (chk.done) {
    console.log(`[${sigla}${shardTag}] já concluído (primary=${chk.total_fetched} + secondary=${chk.total_fetched_secondary} + ghosts=${chk.total_fetched_ghosts})`);
    return;
  }

  const t0 = Date.now();
  // Modo SHARDING: quando FROM_ISO está definido (range ou 'NULL'), o worker só faz
  // o primary pass — o filtro pertence ao shard. Secondary/tertiary no modo completo
  // pegam dados globais (@timestamp null / dataAjuizamento null), que repetidos por
  // N shards duplicariam massivamente. Em modo sharding, primary only.
  const SHARDING_MODE = !!FROM_ISO;

  // Primary
  if (!chk.primary_done) {
    const ok = await runPass(chk, t0);
    if (!ok) return;
    if (chk.pass === 'primary') {
      chk.primary_done = true;
      chk.pass = SHARDING_MODE ? 'done' : 'secondary';
      chk.search_after = null;
      saveCheckpoint(chk);
    }
  }

  if (SHARDING_MODE) {
    chk.done = true;
    saveCheckpoint(chk);
    writeFileSync(MAN_PATH, JSON.stringify({
      alias, sigla, shard: shardTag, mode: 'sharding', from_iso: FROM_ISO, to_iso: TO_ISO, date_field: DATE_FIELD,
      total_fetched: chk.total_fetched, done: chk.done, file_index: chk.file_index,
      completed_at: new Date().toISOString(),
      duration_seconds: Math.round((Date.now()-t0)/1000),
    }, null, 2));
    console.log(`[${sigla}${shardTag}] FIM (sharding): primary=${chk.total_fetched.toLocaleString('pt-BR')} em ${Math.round((Date.now()-t0)/1000)}s`);
    return;
  }

  // Secondary
  if (!chk.secondary_done) {
    if (chk.pass !== 'secondary') {
      chk.pass = 'secondary';
      chk.search_after = null;
      saveCheckpoint(chk);
    }
    const ok = await runPass(chk, t0);
    if (!ok) return;
    if (chk.pass === 'secondary') {
      chk.secondary_done = true;
      chk.pass = 'tertiary';
      chk.search_after = null;
      saveCheckpoint(chk);
    }
  }

  // Tertiary
  if (chk.pass !== 'tertiary') {
    chk.pass = 'tertiary';
    chk.search_after = null;
    saveCheckpoint(chk);
  }
  const okTer = await runPass(chk, t0);
  if (!okTer) return;

  chk.done = true;
  saveCheckpoint(chk);

  writeFileSync(MAN_PATH, JSON.stringify({
    alias, sigla, shard: shardTag, from_iso: FROM_ISO, to_iso: TO_ISO,
    total_fetched: chk.total_fetched,
    total_fetched_secondary: chk.total_fetched_secondary,
    total_fetched_ghosts: chk.total_fetched_ghosts,
    total_combined: chk.total_fetched + chk.total_fetched_secondary + chk.total_fetched_ghosts,
    done: chk.done, file_index: chk.file_index,
    completed_at: new Date().toISOString(),
    duration_seconds: Math.round((Date.now()-t0)/1000),
  }, null, 2));

  console.log(`[${sigla}${shardTag}] FIM: primary=${chk.total_fetched.toLocaleString('pt-BR')} + secondary=${chk.total_fetched_secondary.toLocaleString('pt-BR')} + ghosts=${chk.total_fetched_ghosts.toLocaleString('pt-BR')} em ${Math.round((Date.now()-t0)/1000)}s`);
}

main().catch(e => { console.error(e); process.exit(1); });
