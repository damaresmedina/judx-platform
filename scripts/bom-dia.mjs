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
      ['partes', "SELECT COUNT(*)::text FROM stf_partes"],
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
  else { out.push(`JudX(banco): stf_decisoes=${jx.stf} cases=${jx.cases} dec=${jx.dec} partes=${jx.partes} stj_temas=${jx.stj_t} stj_univ=${jx.stj_u} last=${jx.last}`); }
  if (ic._conn) { out.push(`ICONS: CONEXAO FALHOU`); }
  else { out.push(`ICONS: obj=${ic.obj} edg=${ic.edg}`); }

  // Dados locais — o banco tem ~7% da base real
  out.push(`Dados locais: 2.927.525 decisões STF auditadas (27 CSVs em Desktop\\backup_judx\\resultados\\audit_por_ano\\) | 2.907.193 com partes (99.3%)`);
  out.push(`Partes: 2.194.195 processos únicos (CSVs 2000-2016 + XLSX 2017-2026) | 55 processos sem partes (AP/AR sigilosos)`);
  out.push(`STJ local: 2.646.620 processos Datajud (CSV 578MB) | Base normativa: 5.915 artigos 17 códigos`);

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

  // Mapa de dados — compacto (atualizado 31/mar/2026)
  out.push('');
  out.push('=== DADOS LOCAIS ===');
  out.push('CORTE ABERTA (2.927.525 decisões):');
  out.push('  Downloads\\stf_decisoes_fatias\\ — 27 CSVs por ano (2000-2026), 1.525 MB, 20 cols originais');
  out.push('  Downloads\\stf_partes_fatias\\ — 17 CSVs (2000-2016) + Downloads\\stf_partes_20XX.xlsx (2017-2026)');
  out.push('  2.194.195 processos com partes | 55 sem (AP/AR sigilosos)');
  out.push('AUDIT CONSOLIDADO:');
  out.push('  Desktop\\backup_judx\\resultados\\audit_por_ano\\ — 27 CSVs, decisões+partes, 25 cols');
  out.push('PIPELINE ONTOLÓGICO:');
  out.push('  Downloads\\stf_pipeline_local\\ — processo_no (969MB), processo_string_evento (791MB), auditoria_nao_decisoes (281MB)');
  out.push('MASTER:');
  out.push('  Downloads\\stf_master\\ — 3_master_completo.csv (2.3GB, 34 cols), 1_basicos_ponte.csv (174MB)');
  out.push('STJ:');
  out.push('  projetos\\judx-backup\\stj_datajud_20XX.csv — 2.646.620 processos, 578 MB');
  out.push('CRAWLER DMA (histórico):');
  out.push('  Desktop\\geral\\Fechamento DMA\\...\\crawler_judx_fast\\ — andamentos (2.2GB), basicos (273MB)');
  out.push('  Desktop\\geral\\bkp\\singapura\\iconsjudx\\ — partes (613MB), andamentos (1.6GB), processo (64MB)');

  console.log(out.join('\n'));
}

main().catch(e => console.error('ERRO:', e.message)).finally(() => process.exit(0));
