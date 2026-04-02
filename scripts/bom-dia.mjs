/**
 * bom-dia.mjs — Diagnóstico compacto para início de sessão
 * Baseado em MEMORIA_PROJUS v5 (01/abr/2026)
 *
 * Usage: node scripts/bom-dia.mjs
 */

import pg from 'pg';
const { Client } = pg;
import { execSync } from 'child_process';
import { readFileSync, existsSync, statSync } from 'fs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const JUDX_URL = 'postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres';
const ICONS_URL = 'postgresql://postgres:RHuQvsf4shpsPRjP@db.hetuhkhhppxjliiaerlu.supabase.co:5432/postgres';

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

async function queryDB(url, queries) {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000, statement_timeout: 8000 });
  const results = {};
  try {
    await withTimeout(c.connect(), 8000);
    for (const [name, sql] of queries) {
      try {
        const r = await withTimeout(c.query(sql), 8000);
        results[name] = Object.values(r.rows[0]).join('|');
      } catch { results[name] = 'ERRO'; }
    }
    await c.end().catch(() => {});
  } catch { results._conn = 'FALHOU'; }
  return results;
}

function fileLines(path) {
  try { return readFileSync(path, 'utf-8').split('\n').length - 1; } catch { return 0; }
}

function fileExists(path) {
  try { return statSync(path).size; } catch { return 0; }
}

async function main() {
  const out = [];
  const d = new Date().toLocaleDateString('pt-BR');

  // ── Bancos ──
  const jx = await queryDB(JUDX_URL, [
      ['stf', "SELECT COUNT(*) FROM stf_decisoes"],
      ['cases', "SELECT COUNT(*) FROM judx_case"],
      ['dec', "SELECT COUNT(*) FROM judx_decision"],
      ['partes', "SELECT COUNT(*)::text FROM stf_partes"],
      ['prov', "SELECT COUNT(*) FROM v_provimento_merito WHERE categoria_provimento IS NOT NULL"],
      ['stj_t', "SELECT COUNT(*) FROM stj_temas"],
      ['stj_dj', "SELECT COUNT(*) FROM stj_decisoes_dj"],
      ['last', "SELECT MAX(created_at)::date::text as d FROM stf_partes"],
    ]);
  const ic = await queryDB(ICONS_URL, [
      ['obj', "SELECT COUNT(*) FROM objects"],
      ['edg', "SELECT COUNT(*) FROM edges"],
    ]);

  out.push(`BOM-DIA ${d}`);
  out.push(`Contexto: MEMORIA_PROJUS v5 (01/abr/2026)`);

  // ── JudX banco ──
  if (jx._conn) { out.push(`JudX banco: CONEXAO FALHOU`); }
  else {
    out.push(`JudX(banco): stf_decisoes=${jx.stf} cases=${jx.cases} dec=${jx.dec} partes=${jx.partes}`);
    out.push(`  v_provimento_merito=${jx.prov} | stj_temas=${jx.stj_t} stj_dj=${jx.stj_dj} | last=${jx.last}`);
  }

  // ── ICONS banco ──
  if (ic._conn) { out.push(`ICONS: CONEXAO FALHOU`); }
  else { out.push(`ICONS: obj=${ic.obj} edg=${ic.edg} (edges semânticos: 0 — pipeline não executado)`); }

  // ── Corpus local (CAMADA 1) ──
  out.push('');
  out.push('=== CORPUS LOCAL (2.927.525 decisões STF) ===');
  out.push('  Decisões: Downloads\\stf_decisoes_fatias\\ (27 CSVs, 1.525 MB, 2000-2026)');
  out.push('  Relatores: 100% corrigidos (663.504 Presidência→ministro_real)');
  out.push('  Partes: 2.194.195 processos (CSVs+XLSX) | 68,7% polo real | 31,3% *NI* (2018+)');

  // ── Scraper status ──
  const scraperCSV = 'C:\\Users\\medin\\Desktop\\backup_judx\\resultados\\partes_portal_FINAL.csv';
  const scraperCP = 'C:\\Users\\medin\\Desktop\\backup_judx\\resultados\\cp_final.txt';
  const scraperLines = fileLines(scraperCSV);
  let scraperPos = '';
  try { scraperPos = readFileSync(scraperCP, 'utf-8').trim(); } catch {}
  let scraperRunning = false;
  try {
    const ps = execSync('tasklist /FI "IMAGENAME eq python.exe" /FO CSV 2>nul', { encoding: 'utf8' });
    scraperRunning = ps.includes('python.exe');
  } catch {}
  out.push(`  Scraper portal: ${scraperLines} processos recuperados | checkpoint=${scraperPos} | ${scraperRunning ? 'RODANDO' : 'PARADO'}`);

  // ── Taxa de provimento (produto lançado 01/abr) ──
  out.push('');
  out.push('=== PRODUTO: Taxa de Provimento (judx.com.br/taxa-provimento) ===');
  out.push('  681.575 ocorrências (2010-2026) | RE 17,1% | ARE 1,2% | AI 1,8% | Geral 3,7%');
  out.push('  Dados Qlik: Desktop\\backup_judx\\resultados\\taxa_provimento\\');
  out.push('  Stripe: teste (produção pendente Revolut Business)');

  // ── Sites ──
  const sites = [];
  for (const [n, u] of [['icons.org.br', 'https://icons.org.br'], ['judx.com.br', 'https://judx-platform.vercel.app']]) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(5000) });
      sites.push(`${n}:${r.ok ? 'OK' : r.status}`);
    } catch { sites.push(`${n}:OFF`); }
  }
  out.push(`Sites: ${sites.join(' ')}`);

  // ── Pendências do STATUS.md ──
  try {
    const status = readFileSync('C:\\Users\\medin\\projetos\\judx-platform\\STATUS.md', 'utf8');
    const pending = status.match(/^- \[ \] .+$/gm);
    if (pending?.length) {
      out.push(`Pendente(${pending.length}):`);
      pending.forEach(p => out.push(p.replace('- [ ] ', '  ')));
    }
  } catch {}

  // ── Pendências comerciais (MEMORIA_PROJUS v5) ──
  out.push('');
  out.push('=== PENDÊNCIAS COMERCIAIS ===');
  out.push('  Revolut Business: em abertura (documentos perdidos)');
  out.push('  Stripe produção: aguarda IBAN Revolut');
  out.push('  Faturação AT: software a contratar (Invoicexpress/Moloni)');
  out.push('  Post LinkedIn: rascunho pendente aprovação');

  // ── STJ ──
  out.push('');
  out.push('=== STJ ===');
  out.push('  2.646.620 processos Datajud (CSV 578MB) | 1.420 temas repetitivos | 203K decisões DJe');

  // ── Processos background ──
  try {
    const procs = execSync('wmic process where "name=\'node.exe\'" get processid,commandline /format:csv 2>nul', { encoding: 'utf8' });
    const scripts = procs.split('\n').filter(l => l.includes('scripts/') && !l.includes('bom-dia'))
      .map(l => { const m = l.match(/scripts\/([^\s,"]+)/); return m?.[1]; }).filter(Boolean);
    if (scripts.length) out.push(`BG: ${scripts.join(', ')}`);
  } catch {}

  console.log(out.join('\n'));
}

main().catch(e => console.error('ERRO:', e.message)).finally(() => process.exit(0));
