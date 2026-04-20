/**
 * writer-painel-fillgap.mjs
 * A cada 20s reescreve o PAINEL_SESSAO_AO_VIVO.html com dados frescos
 * dos jobs A (repass) e B (shard mensal).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const PAINEL = 'C:/Users/medin/Desktop/backup_judx/resultados/PAINEL_SESSAO_AO_VIVO.html';
const LOG_A = 'C:/Users/medin/AppData/Local/Temp/claude/C--Users-medin/cf028dd8-859b-464f-b740-0ef84e204295/tasks/b20twma0q.output';
const LOG_B = 'C:/Users/medin/AppData/Local/Temp/claude/C--Users-medin/cf028dd8-859b-464f-b740-0ef84e204295/tasks/bnu897k6s.output';
const CHK_A = 'G:/datajud_raw/nivel_1_anteparos/STJ_repass_A/checkpoint.json';
const SHARD_B = 'G:/datajud_raw/nivel_1_anteparos/STJ_shard_B';
const TOTAL_UNIVERSO = 3390010;
const SHARDS_TOTAL = 317;

function safeRead(p, n=8000) { try { const t = readFileSync(p,'utf-8'); return t.length>n? t.slice(-n): t; } catch { return ''; } }
function safeJson(p) { try { return JSON.parse(readFileSync(p,'utf-8')); } catch { return null; } }
function tailLines(t,n=15) { return t.split('\n').filter(l=>l.trim()).slice(-n).join('\n'); }
function fmt(n) { return typeof n==='number'? n.toLocaleString('pt-BR'): n; }

function renderA() {
  const chk = safeJson(CHK_A);
  const log = safeRead(LOG_A, 30000);
  const lastRate = (log.match(/(\d+) docs\/s/g) ?? []).slice(-1)[0] ?? '— docs/s';
  const fetched = chk?.total_fetched ?? 0;
  const pct = (fetched / TOTAL_UNIVERSO * 100).toFixed(2);
  const done = chk?.done === true;
  const status = done ? '<span class="ok">CONCLUÍDO</span>' : '<span class="warn">RODANDO</span>';
  const eta = (() => {
    const m = log.match(/(\d+) docs\/s/g);
    if (!m || !m.length) return '—';
    const r = parseInt(m[m.length-1]);
    if (!r) return '—';
    const restante = TOTAL_UNIVERSO - fetched;
    const s = Math.round(restante / r);
    return `~${Math.floor(s/60)}min ${s%60}s`;
  })();
  return {
    stats: `
      <div class="row"><span class="k">Status</span><span class="v">${status}</span></div>
      <div class="row"><span class="k">Docs baixados</span><span class="v big">${fmt(fetched)} / ${fmt(TOTAL_UNIVERSO)}</span></div>
      <div class="row"><span class="k">Progresso</span><span class="v">${pct}%</span></div>
      <div class="row"><span class="k">Taxa atual</span><span class="v">${lastRate}</span></div>
      <div class="row"><span class="k">ETA</span><span class="v">${eta}</span></div>
      <div class="row"><span class="k">Arquivos gerados</span><span class="v">${chk?.file_index ?? 0}</span></div>`,
    bar: pct,
    log: tailLines(log, 10) || 'sem output ainda'
  };
}

function renderB() {
  const log = safeRead(LOG_B, 30000);
  let totalDocs = 0, completos = 0, vazios = 0, comDocs = 0;
  if (existsSync(SHARD_B)) {
    const dirs = readdirSync(SHARD_B).filter(d => /^\d{4}-\d{2}$/.test(d));
    for (const d of dirs) {
      const man = safeJson(join(SHARD_B, d, 'manifest.json'));
      if (man?.done) {
        completos++;
        if ((man.total_fetched||0) > 0) { totalDocs += man.total_fetched; comDocs++; }
        else vazios++;
      }
    }
  }
  const pct = (completos / SHARDS_TOTAL * 100).toFixed(1);
  const allDone = completos === SHARDS_TOTAL;
  const status = allDone ? '<span class="ok">CONCLUÍDO</span>' : '<span class="warn">RODANDO</span>';
  const gap = totalDocs - 3379100;
  const gapColor = gap >= 10910 ? 'ok' : (gap >= 0 ? 'warn' : 'err');
  return {
    stats: `
      <div class="row"><span class="k">Status</span><span class="v">${status}</span></div>
      <div class="row"><span class="k">Shards completos</span><span class="v big">${completos} / ${SHARDS_TOTAL}</span></div>
      <div class="row"><span class="k">Progresso</span><span class="v">${pct}%</span></div>
      <div class="row"><span class="k">Shards com docs / vazios</span><span class="v">${comDocs} / ${vazios}</span></div>
      <div class="row"><span class="k">Total docs B (acumulado)</span><span class="v big">${fmt(totalDocs)}</span></div>
      <div class="row"><span class="k">B vs raw original (17/abr)</span><span class="v ${gapColor}">${gap>=0?'+':''}${fmt(gap)}</span></div>`,
    bar: pct,
    log: tailLines(log, 14) || 'sem output ainda'
  };
}

function buildHtml() {
  const a = renderA();
  const b = renderB();
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="20">
<title>JudX · Fillgap STJ</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#0b1020;color:#e6e9f2;padding:24px;min-height:100vh}
  h1{font-size:20px;font-weight:600;margin-bottom:4px}
  .sub{color:#8a93a6;font-size:13px;margin-bottom:24px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  .card{background:#141a2e;border:1px solid #243049;border-radius:10px;padding:18px}
  .card h2{font-size:14px;color:#9faece;margin-bottom:14px;text-transform:uppercase;letter-spacing:.05em}
  .row{display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-bottom:1px solid #1f2842}
  .row:last-child{border:0}
  .k{color:#9faece;font-size:13px}
  .v{font-family:'JetBrains Mono','Consolas',monospace;font-weight:600;font-size:15px}
  .v.big{font-size:20px;color:#7ee0a8}
  .bar{height:8px;background:#1f2842;border-radius:4px;overflow:hidden;margin:10px 0}
  .bar>span{display:block;height:100%;background:linear-gradient(90deg,#4a90e2,#7ee0a8);transition:width .5s}
  .meta{color:#8a93a6;font-size:11px;margin-top:18px}
  pre{font-family:'JetBrains Mono',Consolas,monospace;font-size:11px;color:#a8b3cc;background:#0f1426;padding:10px;border-radius:6px;max-height:260px;overflow-y:auto;white-space:pre-wrap;margin-top:10px}
  .ok{color:#7ee0a8}.warn{color:#e8c98e}.err{color:#ff7676}
</style>
</head>
<body>
<h1>JudX · Fillgap STJ — Cobertura dos 10.910 docs faltantes</h1>
<div class="sub">Atualizado: ${new Date().toLocaleString('pt-BR')} · auto-refresh 20s</div>
<div class="grid">
  <div class="card">
    <h2>Universo Datajud STJ</h2>
    <div class="row"><span class="k">Endpoint AGORA</span><span class="v big">3.390.010</span></div>
    <div class="row"><span class="k">Raw 17/abr (sem tiebreak)</span><span class="v">3.379.100</span></div>
    <div class="row"><span class="k">Gap original</span><span class="v warn">10.910</span></div>
    <div class="row"><span class="k">Causa diagnosticada</span><span class="v">race em search_after sem tiebreak</span></div>
  </div>
  <div class="card">
    <h2>A · Repass com tiebreak (@timestamp + id.keyword)</h2>
    ${a.stats}
    <div class="bar"><span style="width:${a.bar}%"></span></div>
    <pre>${a.log.replace(/[<>]/g, c => c==='<'?'&lt;':'&gt;')}</pre>
  </div>
  <div class="card" style="grid-column:1/-1">
    <h2>B · Sharding mensal · 4 workers paralelos</h2>
    ${b.stats}
    <div class="bar"><span style="width:${b.bar}%"></span></div>
    <pre>${b.log.replace(/[<>]/g, c => c==='<'?'&lt;':'&gt;')}</pre>
  </div>
</div>
<div class="meta">
Logs: <code>%TEMP%\\stj-fillgap-A.log</code> · <code>%TEMP%\\stj-fillgap-B.log</code><br>
Output A: <code>G:\\datajud_raw\\nivel_1_anteparos\\STJ_repass_A\\</code><br>
Output B: <code>G:\\datajud_raw\\nivel_1_anteparos\\STJ_shard_B\\&lt;YYYY-MM&gt;\\</code><br>
Backup do checkpoint anterior: <code>STJ\\checkpoint.json.before-fill-gap-20abr.bak</code>
</div>
</body></html>`;
}

console.log('[painel] writer iniciado, atualizando a cada 20s...');
while (true) {
  try { writeFileSync(PAINEL, buildHtml()); }
  catch (e) { console.error('[painel] erro:', e.message); }
  await new Promise(r => setTimeout(r, 20000));
}
