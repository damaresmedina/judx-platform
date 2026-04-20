/**
 * stj-fillgap-A-tiebreak.mjs
 *
 * Cobre o gap dos 10.910 docs STJ rerodando o primary com sort COMPOSTO
 * [@timestamp asc, id.keyword asc] que torna a paginação determinística.
 *
 * Output: G:/datajud_raw/nivel_1_anteparos/STJ_repass_A/
 *   - part-NNNNNN.ndjson.gz
 *   - checkpoint.json, manifest.json, errors.log
 *
 * Princípio: nada é descartado. Esses arquivos novos somam ao raw existente;
 * dedup por _id na carga DuckDB.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, createWriteStream } from 'fs';
import { join } from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const ENV = readFileSync('C:\\Users\\medin\\projetos\\judx-platform\\.env.local', 'utf-8');
const APIKEY = ENV.match(/^DATAJUD_APIKEY=(.+)$/m)[1].trim();
const BASE = 'https://api-publica.datajud.cnj.jus.br';
const ALIAS = 'api_publica_stj';
const OUT = 'G:/datajud_raw/nivel_1_anteparos/STJ_repass_A';
mkdirSync(OUT, { recursive: true });

const CHK = join(OUT, 'checkpoint.json');
const ERR = join(OUT, 'errors.log');
const MAN = join(OUT, 'manifest.json');

const PAGE = 1000;
const SLEEP = 100;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const logErr = (m) => appendFileSync(ERR, `[${new Date().toISOString()}] ${m}\n`);

let chk = existsSync(CHK)
  ? JSON.parse(readFileSync(CHK, 'utf-8'))
  : { search_after: null, total_fetched: 0, file_index: 0, done: false };

async function fetchPage(searchAfter) {
  const body = {
    size: PAGE,
    track_total_hits: true,
    sort: [{ '@timestamp': { order: 'asc' } }, { 'id.keyword': { order: 'asc' } }],
    query: { match_all: {} },
    ...(searchAfter ? { search_after: searchAfter } : {})
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(`${BASE}/${ALIAS}/_search`, {
        method: 'POST',
        headers: {
          'Authorization': `APIKey ${APIKEY}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        },
        body: JSON.stringify(body)
      });
      if (r.status === 429 || (r.status >= 500 && r.status < 600)) {
        await sleep(2000 * Math.pow(4, attempt - 1));
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0,300)}`);
      return await r.json();
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(2000 * Math.pow(4, attempt - 1));
    }
  }
}

async function writeNdjsonGz(hits, path) {
  const lines = hits.map(h => JSON.stringify(h)).join('\n') + '\n';
  await pipeline(Readable.from(lines), createGzip({ level: 6 }), createWriteStream(path));
}

const t0 = Date.now();
let totalEsperado = null;
let pages = 0;
console.log(`[A-tiebreak] start (file_index=${chk.file_index}, fetched=${chk.total_fetched})`);

while (true) {
  let json;
  try {
    json = await fetchPage(chk.search_after);
  } catch (e) {
    logErr(`falha search_after=${JSON.stringify(chk.search_after)}: ${e.message}`);
    console.error(`[A-tiebreak] ERRO: ${e.message}`);
    process.exit(1);
  }
  if (totalEsperado == null) totalEsperado = json?.hits?.total?.value ?? null;
  const hits = json?.hits?.hits ?? [];
  if (hits.length === 0) break;

  chk.file_index++;
  await writeNdjsonGz(hits, join(OUT, `part-${String(chk.file_index).padStart(6,'0')}.ndjson.gz`));
  chk.total_fetched += hits.length;
  chk.search_after = hits[hits.length - 1].sort;
  writeFileSync(CHK, JSON.stringify(chk, null, 2));

  pages++;
  if (pages % 20 === 0) {
    const rate = chk.total_fetched / ((Date.now() - t0) / 1000);
    console.log(`[A-tiebreak] ${chk.total_fetched.toLocaleString('pt-BR')}/${totalEsperado?.toLocaleString('pt-BR') ?? '?'} — ${rate.toFixed(0)} docs/s`);
  }
  await sleep(SLEEP);
  if (hits.length < PAGE) break;
}

chk.done = true;
writeFileSync(CHK, JSON.stringify(chk, null, 2));
writeFileSync(MAN, JSON.stringify({
  alias: ALIAS, sigla: 'STJ', mode: 'fillgap_A_tiebreak',
  sort: '[@timestamp asc, id.keyword asc]',
  total_fetched: chk.total_fetched, total_esperado: totalEsperado,
  done: true, file_index: chk.file_index,
  completed_at: new Date().toISOString(),
  duration_seconds: Math.round((Date.now() - t0) / 1000)
}, null, 2));
console.log(`[A-tiebreak] FIM: ${chk.total_fetched.toLocaleString('pt-BR')} em ${Math.round((Date.now()-t0)/1000)}s`);
