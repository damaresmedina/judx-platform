/**
 * datajud-scraper-worker.mjs v2 — com sharding temporal + sort corrigido
 *
 * Uso:
 *   node scripts/datajud-scraper-worker.mjs <alias> <outDir> [fromISO] [toISO]
 *
 * Sharding: se fromISO e toISO forem passados, filtra por @timestamp BETWEEN.
 *           Sem sharding = baixa tudo.
 * Sort: @timestamp asc (o campo _id é proibido pelo cluster do CNJ)
 * Paginação: search_after com o último sort[] recebido
 * Retry: 3× com backoff (2s, 8s, 32s) em 429/5xx
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

if (!alias || !OUT) { console.error('Uso: node worker.mjs <alias> <outDir> [fromISO] [toISO]'); process.exit(1); }

const sigla = alias.replace(/^api_publica_/,'').toUpperCase();
const shardTag = (FROM_ISO && TO_ISO) ? `[${FROM_ISO.slice(0,10)}..${TO_ISO.slice(0,10)}]` : '[ALL]';
mkdirSync(OUT, { recursive: true });

const CHK_PATH = join(OUT, 'checkpoint.json');
const ERR_PATH = join(OUT, 'errors.log');
const MAN_PATH = join(OUT, 'manifest.json');

const PAGE_SIZE = 1000;
const SLEEP_BETWEEN_REQUESTS_MS = 100;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const logErr = (msg) => appendFileSync(ERR_PATH, `[${new Date().toISOString()}] ${msg}\n`);

function loadCheckpoint() {
  if (!existsSync(CHK_PATH)) return { search_after: null, total_fetched: 0, done: false, file_index: 0 };
  try { return JSON.parse(readFileSync(CHK_PATH,'utf-8')); }
  catch { return { search_after: null, total_fetched: 0, done: false, file_index: 0 }; }
}
function saveCheckpoint(c) { writeFileSync(CHK_PATH, JSON.stringify(c,null,2)); }

function buildQuery() {
  if (FROM_ISO && TO_ISO) {
    return { range: { '@timestamp': { gte: FROM_ISO, lt: TO_ISO } } };
  }
  return { match_all: {} };
}

async function fetchPage(searchAfter) {
  const body = {
    size: PAGE_SIZE,
    track_total_hits: true,
    sort: [{ '@timestamp': { order: 'asc' } }],
    query: buildQuery(),
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

async function main() {
  let chk = loadCheckpoint();
  if (chk.done) { console.log(`[${sigla}${shardTag}] já concluído (${chk.total_fetched} docs)`); return; }

  const t0 = Date.now();
  let pagesInThisRun = 0;
  let totalEsperado = null;

  console.log(`[${sigla}${shardTag}] start (retoma de ${chk.total_fetched}, file_index=${chk.file_index})`);

  while (true) {
    let json;
    try {
      json = await fetchPage(chk.search_after);
    } catch (e) {
      logErr(`[${sigla}${shardTag}] falha search_after=${JSON.stringify(chk.search_after)}: ${e.message}`);
      console.error(`[${sigla}${shardTag}] ERRO: ${e.message}`);
      break;
    }
    if (totalEsperado == null) {
      totalEsperado = json?.hits?.total?.value ?? null;
    }
    const hits = json?.hits?.hits ?? [];
    if (hits.length === 0) {
      chk.done = true;
      saveCheckpoint(chk);
      break;
    }

    chk.file_index++;
    const partPath = join(OUT, `part-${String(chk.file_index).padStart(6,'0')}.ndjson.gz`);
    await writeNdjsonGz(hits, partPath);

    chk.total_fetched += hits.length;
    chk.search_after = hits[hits.length-1].sort;
    saveCheckpoint(chk);

    pagesInThisRun++;
    if (pagesInThisRun % 10 === 0) {
      const elapsed = (Date.now()-t0)/1000;
      const rate = chk.total_fetched / elapsed;
      console.log(`[${sigla}${shardTag}] ${chk.total_fetched.toLocaleString('pt-BR')}/${totalEsperado?.toLocaleString('pt-BR') ?? '?'} — ${rate.toFixed(0)} docs/s`);
    }

    await sleep(SLEEP_BETWEEN_REQUESTS_MS);
    if (hits.length < PAGE_SIZE) { chk.done = true; saveCheckpoint(chk); break; }
  }

  writeFileSync(MAN_PATH, JSON.stringify({
    alias, sigla, shard: shardTag, from_iso: FROM_ISO, to_iso: TO_ISO,
    total_fetched: chk.total_fetched, total_esperado: totalEsperado,
    done: chk.done, file_index: chk.file_index,
    completed_at: new Date().toISOString(),
    duration_seconds: Math.round((Date.now()-t0)/1000),
  }, null, 2));

  console.log(`[${sigla}${shardTag}] FIM: ${chk.total_fetched.toLocaleString('pt-BR')} em ${Math.round((Date.now()-t0)/1000)}s`);
}

main().catch(e => { console.error(e); process.exit(1); });
