/**
 * diagnostico-datajud-dimensao.mjs
 * Consulta cada um dos 91 endpoints da API Pública Datajud CNJ e reporta
 * o total de documentos (track_total_hits=true) com User-Agent Mozilla.
 *
 * Output: Desktop/backup_judx/resultados/2026-04-17_datajud_dimensao.csv
 *         Desktop/backup_judx/resultados/2026-04-17_datajud_dimensao.md
 *
 * Uso: node scripts/diagnostico-datajud-dimensao.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import os from 'os';

const ENV_PATH = join(process.cwd(), '.env.local');
const envText = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf-8') : '';
const APIKEY = envText.match(/^DATAJUD_APIKEY=(.+)$/m)?.[1]?.trim();
const UA = envText.match(/^DATAJUD_USER_AGENT=(.+)$/m)?.[1]?.trim()
  || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BASE = 'https://api-publica.datajud.cnj.jus.br';

if (!APIKEY) {
  console.error('Faltou DATAJUD_APIKEY em .env.local');
  process.exit(1);
}

const OUT_DIR = join(os.homedir(), 'Desktop', 'backup_judx', 'resultados');
mkdirSync(OUT_DIR, { recursive: true });

const ENDPOINTS = [
  // Tribunais Superiores (sem STF — não está no Datajud)
  ['superior','TST','api_publica_tst','Tribunal Superior do Trabalho'],
  ['superior','TSE','api_publica_tse','Tribunal Superior Eleitoral'],
  ['superior','STJ','api_publica_stj','Superior Tribunal de Justiça'],
  ['superior','STM','api_publica_stm','Superior Tribunal Militar'],
  // Justiça Federal
  ...['trf1','trf2','trf3','trf4','trf5','trf6'].map(a => ['federal', a.toUpperCase(), `api_publica_${a}`, `Tribunal Regional Federal ${a.toUpperCase()}`]),
  // Justiça Estadual (27 TJs)
  ...['tjac','tjal','tjam','tjap','tjba','tjce','tjdft','tjes','tjgo','tjma','tjmg','tjms','tjmt','tjpa','tjpb','tjpe','tjpi','tjpr','tjrj','tjrn','tjro','tjrr','tjrs','tjsc','tjse','tjsp','tjto']
    .map(a => ['estadual', a.toUpperCase(), `api_publica_${a}`, `Tribunal de Justiça — ${a.slice(2).toUpperCase()}`]),
  // Justiça do Trabalho (24 TRTs)
  ...Array.from({length:24}, (_,i)=>i+1).map(n => ['trabalho', `TRT${n}`, `api_publica_trt${n}`, `Tribunal Regional do Trabalho — ${n}ª Região`]),
  // Justiça Eleitoral (27 TREs)
  ...['ac','al','am','ap','ba','ce','dft','es','go','ma','mg','ms','mt','pa','pb','pe','pi','pr','rj','rn','ro','rr','rs','sc','se','sp','to']
    .map(uf => ['eleitoral', `TRE-${uf.toUpperCase()}`, `api_publica_tre-${uf}`, `Tribunal Regional Eleitoral — ${uf.toUpperCase()}`]),
  // Justiça Militar Estadual (3)
  ['militar','TJMMG','api_publica_tjmmg','Tribunal de Justiça Militar — MG'],
  ['militar','TJMRS','api_publica_tjmrs','Tribunal de Justiça Militar — RS'],
  ['militar','TJMSP','api_publica_tjmsp','Tribunal de Justiça Militar — SP'],
];

console.log(`[diag] ${ENDPOINTS.length} endpoints a consultar (UA Mozilla, APIKey set)`);

async function countOne(categoria, sigla, alias, nome) {
  const url = `${BASE}/${alias}/_search`;
  const body = JSON.stringify({ size: 0, track_total_hits: true, query: { match_all: {} } });
  const started = Date.now();
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `APIKey ${APIKEY}`,
        'User-Agent': UA,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body,
    });
    const elapsed = Date.now() - started;
    if (!r.ok) {
      return { categoria, sigla, alias, nome, total: null, status: r.status, erro: r.statusText, ms: elapsed };
    }
    const j = await r.json();
    const total = j?.hits?.total?.value ?? null;
    return { categoria, sigla, alias, nome, total, status: 200, erro: null, ms: elapsed };
  } catch (e) {
    return { categoria, sigla, alias, nome, total: null, status: null, erro: String(e.message ?? e), ms: Date.now()-started };
  }
}

// Concurrência limitada
async function runPool(tasks, limit = 8) {
  const results = [];
  const running = new Set();
  let i = 0;
  const startNext = () => {
    if (i >= tasks.length) return;
    const idx = i++;
    const p = Promise.resolve().then(tasks[idx]).then(r => { running.delete(p); results[idx] = r; });
    running.add(p);
  };
  while (i < tasks.length && running.size < limit) startNext();
  while (running.size > 0) {
    await Promise.race(running);
    if (i < tasks.length) startNext();
  }
  return results;
}

const tasks = ENDPOINTS.map(([c,s,a,n]) => () => countOne(c,s,a,n));
const t0 = Date.now();
const results = await runPool(tasks, 10);
const secs = ((Date.now()-t0)/1000).toFixed(1);

// --- CSV ---
const csvPath = join(OUT_DIR, '2026-04-17_datajud_dimensao.csv');
const csvLines = ['categoria,sigla,alias,nome,total_documentos,status_http,ms,erro'];
for (const r of results) {
  const safe = s => String(s ?? '').replace(/"/g,'""');
  csvLines.push(`"${safe(r.categoria)}","${safe(r.sigla)}","${safe(r.alias)}","${safe(r.nome)}",${r.total ?? ''},${r.status ?? ''},${r.ms},"${safe(r.erro)}"`);
}
writeFileSync(csvPath, csvLines.join('\n'), 'utf-8');

// --- Agregados por categoria ---
const byCat = {};
for (const r of results) {
  byCat[r.categoria] ??= { count: 0, total: 0, ok: 0, erro: 0 };
  byCat[r.categoria].count++;
  if (r.total != null) { byCat[r.categoria].total += r.total; byCat[r.categoria].ok++; }
  else byCat[r.categoria].erro++;
}

// --- Markdown ---
const mdPath = join(OUT_DIR, '2026-04-17_datajud_dimensao.md');
const fmt = n => n == null ? '—' : n.toLocaleString('pt-BR');
const md = [];
md.push('# Datajud CNJ — Dimensão dos Endpoints');
md.push('');
md.push(`Consulta: 17/abr/2026  |  UA Mozilla  |  ${ENDPOINTS.length} endpoints  |  ${secs}s total`);
md.push('');
md.push('## Agregados por categoria');
md.push('');
md.push('| Categoria | Endpoints | OK | Erro | Total documentos |');
md.push('|---|---:|---:|---:|---:|');
const catOrder = ['superior','federal','estadual','trabalho','eleitoral','militar'];
let grandTotal = 0, grandOk = 0, grandErro = 0;
for (const c of catOrder) {
  const x = byCat[c]; if (!x) continue;
  md.push(`| ${c} | ${x.count} | ${x.ok} | ${x.erro} | ${fmt(x.total)} |`);
  grandTotal += x.total; grandOk += x.ok; grandErro += x.erro;
}
md.push(`| **TOTAL** | **${ENDPOINTS.length}** | **${grandOk}** | **${grandErro}** | **${fmt(grandTotal)}** |`);
md.push('');
md.push('## Por tribunal (ordem decrescente de volume)');
md.push('');
md.push('| Categoria | Sigla | Tribunal | Documentos | HTTP | ms |');
md.push('|---|---|---|---:|---:|---:|');
const sorted = [...results].sort((a,b) => (b.total ?? -1) - (a.total ?? -1));
for (const r of sorted) {
  md.push(`| ${r.categoria} | ${r.sigla} | ${r.nome} | ${fmt(r.total)} | ${r.status ?? '—'} | ${r.ms} |`);
}
md.push('');
md.push(`## Arquivos gerados`);
md.push(`- ${csvPath}`);
md.push(`- ${mdPath}`);
writeFileSync(mdPath, md.join('\n'), 'utf-8');

console.log(`[diag] concluído: ${grandOk} ok, ${grandErro} erro, total ${fmt(grandTotal)} docs`);
console.log(`[diag] ${csvPath}`);
console.log(`[diag] ${mdPath}`);
