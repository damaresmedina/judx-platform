/**
 * bom-dia.mjs — Diagnóstico compacto para início de sessão
 * Output mínimo para economizar contexto Claude
 *
 * Usage: node scripts/bom-dia.mjs
 */

import pg from 'pg';
const { Client } = pg;
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';

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

async function main() {
  const out = [];
  const d = new Date().toLocaleDateString('pt-BR');

  // Bancos — sequencial para evitar conflito de conexão
  const jx = await queryDB(JUDX_URL, [
      ['stf', "SELECT COUNT(*) FROM stf_decisoes"],
      ['cases', "SELECT COUNT(*) FROM judx_case"],
      ['dec', "SELECT COUNT(*) FROM judx_decision"],
      ['partes', "SELECT COUNT(*) FROM stf_partes"],
      ['stj_t', "SELECT COUNT(*) FROM stj_temas"],
      ['stj_u', "SELECT COUNT(*) FROM stj_universal"],
      ['last', "SELECT MAX(created_at)::date::text as d FROM stf_partes"],
    ]);
  const ic = await queryDB(ICONS_URL, [
      ['obj', "SELECT COUNT(*) FROM objects"],
      ['edg', "SELECT COUNT(*) FROM edges"],
    ]);

  out.push(`BOM-DIA ${d}`);
  if (jx._conn) { out.push(`JudX: CONEXAO FALHOU`); }
  else { out.push(`JudX: stf=${jx.stf} cases=${jx.cases} dec=${jx.dec} partes=${jx.partes} stj_temas=${jx.stj_t} stj_univ=${jx.stj_u} last=${jx.last}`); }
  if (ic._conn) { out.push(`ICONS: CONEXAO FALHOU`); }
  else { out.push(`ICONS: obj=${ic.obj} edg=${ic.edg}`); }

  // Processos background
  try {
    const procs = execSync('wmic process where "name=\'node.exe\'" get processid,commandline /format:csv 2>nul', { encoding: 'utf8' });
    const scripts = procs.split('\n').filter(l => l.includes('scripts/') && !l.includes('bom-dia'))
      .map(l => { const m = l.match(/scripts\/([^\s,"]+)/); return m?.[1]; }).filter(Boolean);
    if (scripts.length) out.push(`BG: ${scripts.join(', ')}`);
  } catch {}

  // Sites — check rápido
  const sites = [];
  for (const [n, u] of [['icons.org.br', 'https://icons.org.br'], ['judx', 'https://judx-platform.vercel.app']]) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(5000) });
      sites.push(`${n}:${r.ok ? 'OK' : r.status}`);
    } catch { sites.push(`${n}:OFF`); }
  }
  out.push(`Sites: ${sites.join(' ')}`);

  // Pendências — só itens NÃO riscados do STATUS.md
  try {
    const status = readFileSync('C:\\Users\\medin\\projetos\\judx-platform\\STATUS.md', 'utf8');
    const pending = status.match(/^- \[ \] .+$/gm);
    if (pending?.length) {
      out.push(`Pendente(${pending.length}):`);
      pending.forEach(p => out.push(p.replace('- [ ] ', '  ')));
    }
  } catch {}

  console.log(out.join('\n'));
}

main().catch(e => console.error('ERRO:', e.message)).finally(() => process.exit(0));
