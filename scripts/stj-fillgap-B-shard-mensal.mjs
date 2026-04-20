/**
 * stj-fillgap-B-shard-mensal.mjs
 *
 * Sharding mensal de jan/2000 a abr/2026 sobre @timestamp.
 * 4 workers em paralelo (deixa margem para A rodar simultâneo).
 *
 * Cada janela mensal gera sua própria subpasta:
 *   G:/datajud_raw/nivel_1_anteparos/STJ_shard_B/<YYYY-MM>/
 *
 * Aproveita worker existente em modo sharding (primary only).
 * Lockfile no nível da pasta: shards já completos pulados.
 *
 * Acumula manifest geral em STJ_shard_B/_manifest_geral.json.
 */
import { spawn } from 'child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const OUT_ROOT = 'G:/datajud_raw/nivel_1_anteparos/STJ_shard_B';
const WORKER = 'C:/Users/medin/projetos/judx-platform/scripts/datajud-scraper-worker.mjs';
const CONCURRENCY = 4;

mkdirSync(OUT_ROOT, { recursive: true });

// Gera 316 janelas mensais 2000-01 a 2026-05
function genShards() {
  const out = [];
  for (let y = 2000; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === 2026 && m > 5) break;
      const next = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
      const from = `${y}-${String(m).padStart(2,'0')}-01T00:00:00.000Z`;
      const to = next.toISOString();
      const tag = `${y}-${String(m).padStart(2,'0')}`;
      out.push({ tag, from, to });
    }
  }
  return out;
}

function isShardDone(tag) {
  const man = join(OUT_ROOT, tag, 'manifest.json');
  if (!existsSync(man)) return false;
  try { return JSON.parse(readFileSync(man,'utf-8')).done === true; }
  catch { return false; }
}

function runWorker(shard) {
  const outDir = join(OUT_ROOT, shard.tag);
  mkdirSync(outDir, { recursive: true });
  return new Promise((resolve) => {
    const t0 = Date.now();
    const proc = spawn('node', [WORKER, 'api_publica_stj', outDir, shard.from, shard.to], {
      cwd: 'C:/Users/medin/projetos/judx-platform',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let lastLine = '';
    proc.stdout.on('data', d => { lastLine = d.toString().trim().split('\n').pop(); });
    proc.stderr.on('data', d => { lastLine = d.toString().trim().split('\n').pop(); });
    proc.on('exit', (code) => {
      const dt = Math.round((Date.now()-t0)/1000);
      const man = join(outDir, 'manifest.json');
      let n = '?';
      if (existsSync(man)) { try { n = JSON.parse(readFileSync(man,'utf-8')).total_fetched; } catch {} }
      console.log(`  [${shard.tag}] exit=${code} fetched=${n} ${dt}s`);
      resolve({ shard, code, fetched: n, duration_s: dt });
    });
  });
}

const shards = genShards();
const pending = shards.filter(s => !isShardDone(s.tag));
console.log(`[B] ${shards.length} shards mensais total | ${pending.length} pendentes | ${shards.length-pending.length} já completos`);
console.log(`[B] concorrência: ${CONCURRENCY}`);

const t0 = Date.now();
const results = [];
let idx = 0;

async function worker() {
  while (idx < pending.length) {
    const my = pending[idx++];
    console.log(`[B][${idx}/${pending.length}] start ${my.tag}`);
    const r = await runWorker(my);
    results.push(r);
  }
}

await Promise.all(Array.from({length: CONCURRENCY}, worker));

const totalFetched = results.reduce((a,r) => a + (typeof r.fetched === 'number' ? r.fetched : 0), 0);
const dt = Math.round((Date.now()-t0)/1000);
writeFileSync(join(OUT_ROOT, '_manifest_geral.json'), JSON.stringify({
  mode: 'fillgap_B_shard_mensal',
  shards_total: shards.length,
  shards_executados: results.length,
  shards_ja_completos: shards.length - pending.length,
  total_fetched: totalFetched,
  duration_seconds: dt,
  completed_at: new Date().toISOString(),
  por_shard: results.map(r => ({ tag: r.shard.tag, fetched: r.fetched, code: r.code, s: r.duration_s }))
}, null, 2));
console.log(`[B] FIM: ${totalFetched.toLocaleString('pt-BR')} docs em ${dt}s (${results.length} shards executados)`);
