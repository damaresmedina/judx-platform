#!/usr/bin/env node
/**
 * datajud-turbo.mjs — orquestrador minimalista pós-incidente 18/abr/2026
 *
 * Princípios (memória feedback_erros_18abr_extracao_datajud.md):
 *   1. Cada endpoint roda em processo isolado (worker v4 spawnado).
 *   2. Lockfile por endpoint (worker.lock com PID) — segunda invocação sai.
 *   3. Paralelismo ENTRE endpoints, nunca dentro. Respeita rate-limit global CNJ.
 *   4. TJSP é o único caso com sharding (71M docs, por ano de dataAjuizamento).
 *   5. Worker v4 com 3 passes (primary/secondary/tertiary) garante "nada descartado".
 *   6. Status final sintético, sem heartbeat verboso.
 *
 * Uso:
 *   node scripts/datajud-turbo.mjs                        # pendentes (não-done) + concurrency 4
 *   node scripts/datajud-turbo.mjs --concurrency=6        # custom concurrency
 *   node scripts/datajud-turbo.mjs TJRS TJSC              # só esses
 *   node scripts/datajud-turbo.mjs TJSP                   # dispara sharding TJSP
 *   node scripts/datajud-turbo.mjs --dry-run              # mostra plano sem executar
 */

import { spawn } from 'child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKER = join(__dirname, 'datajud-scraper-worker.mjs');
const RAW_ROOT = 'G:/datajud_raw';

// Catálogo dos 91 endpoints (copiado do orchestrator legado)
const CATALOG = {
  superior: [
    ['api_publica_stj', 'STJ', 3390010], ['api_publica_tst', 'TST', 4773267],
    ['api_publica_tse', 'TSE', 83871], ['api_publica_stm', 'STM', 25966],
  ],
  federal: [
    ['api_publica_trf1','TRF1',5063566],['api_publica_trf2','TRF2',4202908],
    ['api_publica_trf3','TRF3',16871517],['api_publica_trf4','TRF4',13966944],
    ['api_publica_trf5','TRF5',6537373],['api_publica_trf6','TRF6',4245582],
  ],
  estadual: [
    ['api_publica_tjac','TJAC',957465],['api_publica_tjal','TJAL',2943227],
    ['api_publica_tjam','TJAM',4319062],['api_publica_tjap','TJAP',673347],
    ['api_publica_tjba','TJBA',14640270],['api_publica_tjce','TJCE',4431686],
    ['api_publica_tjdft','TJDFT',3453628],['api_publica_tjes','TJES',2949131],
    ['api_publica_tjgo','TJGO',6675441],['api_publica_tjma','TJMA',4074375],
    ['api_publica_tjmg','TJMG',35376520],['api_publica_tjms','TJMS',3372661],
    ['api_publica_tjmt','TJMT',4278499],['api_publica_tjpa','TJPA',3312872],
    ['api_publica_tjpb','TJPB',2535961],['api_publica_tjpe','TJPE',6250191],
    ['api_publica_tjpi','TJPI',2067149],['api_publica_tjpr','TJPR',12382336],
    ['api_publica_tjrj','TJRJ',16485053],['api_publica_tjrn','TJRN',2545920],
    ['api_publica_tjro','TJRO',1997861],['api_publica_tjrr','TJRR',349531],
    ['api_publica_tjrs','TJRS',13419220],['api_publica_tjsc','TJSC',10267930],
    ['api_publica_tjse','TJSE',3005878],['api_publica_tjsp','TJSP',71899024],
    ['api_publica_tjto','TJTO',2676853],
  ],
  trabalho: Array.from({length:24},(_,i)=>i+1).map(n => [`api_publica_trt${n}`, `TRT${n}`, null]),
  eleitoral: 'ac,al,am,ap,ba,ce,es,go,ma,mg,ms,mt,pa,pb,pe,pi,pr,rj,rn,ro,rr,rs,sc,se,sp,to'
    .split(',').map(uf => [`api_publica_tre-${uf}`, `TRE-${uf.toUpperCase()}`, null]),
  militar: [
    ['api_publica_tjmmg','TJMMG',29995],['api_publica_tjmrs','TJMRS',10425],
    ['api_publica_tjmsp','TJMSP',19140],
  ],
};

const SIGLA2CAT = {};
for (const [cat, list] of Object.entries(CATALOG))
  for (const e of list) SIGLA2CAT[e[1]] = cat;

function levelOf(cat) {
  return cat === 'superior' ? 'nivel_1_anteparos' : `nivel_2_regionais/${cat}`;
}
function outDirFor(cat, sigla) {
  return `${RAW_ROOT}/${levelOf(cat)}/${sigla}`;
}

// -- Lockfile ---------------------------------------------------------------
function isProcessAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function acquireLock(outDir) {
  const lockPath = join(outDir, 'worker.lock');
  if (existsSync(lockPath)) {
    const txt = readFileSync(lockPath, 'utf-8').trim();
    const pid = parseInt(txt);
    if (Number.isFinite(pid) && isProcessAlive(pid)) {
      return { acquired: false, reason: `lock vivo (PID ${pid})` };
    }
    // stale — remove
    try { unlinkSync(lockPath); } catch {}
  }
  writeFileSync(lockPath, String(process.pid));
  return { acquired: true, path: lockPath };
}

function releaseLock(lockPath) {
  try { if (lockPath && existsSync(lockPath)) unlinkSync(lockPath); } catch {}
}

// -- Checkpoint already-done check -----------------------------------------
function isDone(outDir) {
  const chkPath = join(outDir, 'checkpoint.json');
  if (!existsSync(chkPath)) return false;
  try {
    const c = JSON.parse(readFileSync(chkPath, 'utf-8'));
    return c.done === true;
  } catch { return false; }
}

// -- Worker runner ---------------------------------------------------------
async function runWorker(alias, sigla, outDir, fromISO, toISO, label) {
  mkdirSync(outDir, { recursive: true });
  if (isDone(outDir)) {
    console.log(`[done] ${label || sigla} — já concluído`);
    return { sigla, code: 0, skipped: true };
  }
  const lock = acquireLock(outDir);
  if (!lock.acquired) {
    console.log(`[skip] ${label || sigla} — ${lock.reason}`);
    return { sigla, code: 0, skipped: true };
  }
  console.log(`[start] ${label || sigla} (${outDir})`);
  try {
    return await new Promise(resolve => {
      const args = [WORKER, alias, outDir];
      if (fromISO && toISO) args.push(fromISO, toISO);
      const child = spawn('node', args, { stdio: 'inherit' });
      child.on('exit', code => resolve({ sigla, code }));
    });
  } finally {
    releaseLock(lock.path);
  }
}

// -- Semaphore pool --------------------------------------------------------
async function runPool(factories, limit) {
  const running = new Set();
  for (const factory of factories) {
    while (running.size >= limit) await Promise.race(running);
    const p = factory().finally(() => running.delete(p));
    running.add(p);
  }
  await Promise.all(running);
}

// -- Build tasks ----------------------------------------------------------
function buildTasks(filter, opts) {
  const tasks = [];
  for (const [cat, list] of Object.entries(CATALOG)) {
    for (const entry of list) {
      const [alias, sigla] = entry;
      if (filter.length && !filter.includes(sigla) && !filter.includes(alias)) continue;
      const outDir = outDirFor(cat, sigla);
      if (!filter.length && !opts.includeDone && isDone(outDir)) continue;

      if (sigla === 'TJSP') {
        // sharding anual 2000-2026 (dataAjuizamento)
        for (let y = 2000; y <= 2026; y++) {
          const shardDir = join(outDir, 'shards', String(y));
          const label = `TJSP-${y}`;
          tasks.push({ sigla: label, factory: () => runWorker(
            alias, label, shardDir,
            `${y}-01-01T00:00:00Z`, `${y+1}-01-01T00:00:00Z`, label
          )});
        }
      } else {
        tasks.push({ sigla, factory: () => runWorker(alias, sigla, outDir) });
      }
    }
  }
  return tasks;
}

// -- CLI --------------------------------------------------------------------
const raw = process.argv.slice(2);
const opts = {
  concurrency: 4,
  dryRun: false,
  includeDone: false,
};
const filter = [];
for (const a of raw) {
  if (a === '--dry-run') opts.dryRun = true;
  else if (a === '--include-done') opts.includeDone = true;
  else if (a.startsWith('--concurrency=')) opts.concurrency = parseInt(a.split('=')[1]);
  else filter.push(a.toUpperCase());
}

const tasks = buildTasks(filter, opts);
console.log(`[turbo] ${tasks.length} tarefas | concurrency=${opts.concurrency} | filter=${filter.length?filter.join(','):'(pendentes)'}`);

if (opts.dryRun) {
  for (const t of tasks) console.log(`  ${t.sigla}`);
  process.exit(0);
}

const t0 = Date.now();
await runPool(tasks.map(t => t.factory), opts.concurrency);
const elapsed = ((Date.now()-t0)/3600000).toFixed(2);
console.log(`[turbo] concluído em ${elapsed}h`);
