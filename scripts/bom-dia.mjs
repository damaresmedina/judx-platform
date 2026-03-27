/**
 * bom-dia.mjs — Relatório de estado para início de sessão
 * Verifica bancos, processos em background, e reporta tudo
 *
 * Usage: node scripts/bom-dia.mjs
 */

import pg from 'pg';
const { Client } = pg;
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const JUDX_URL = 'postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres';
const ICONS_URL = 'postgresql://postgres:RHuQvsf4shpsPRjP@db.hetuhkhhppxjliiaerlu.supabase.co:6543/postgres';

function line(char = '─', len = 60) { return char.repeat(len); }
function ts() { return new Date().toISOString().slice(11, 19); }

async function checkDB(label, url, queries) {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await c.connect();
    console.log(`\n  ${label}:`);
    for (const [name, sql] of queries) {
      try {
        const r = await c.query(sql);
        const val = r.rows[0];
        const parts = Object.entries(val).map(([k, v]) => `${k}: ${v}`).join(' | ');
        console.log(`    ${name.padEnd(25)} ${parts}`);
      } catch (e) {
        console.log(`    ${name.padEnd(25)} ERRO: ${e.message.slice(0, 60)}`);
      }
    }
    await c.end();
  } catch (e) {
    console.log(`    CONEXÃO FALHOU: ${e.message.slice(0, 60)}`);
  }
}

async function main() {
  const now = new Date();
  console.log(`\n${line('═')}`);
  console.log(`  BOM DIA — ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`);
  console.log(line('═'));

  // 1. Processos em background
  console.log(`\n📡 PROCESSOS NODE EM BACKGROUND:`);
  try {
    const procs = execSync('wmic process where "name=\'node.exe\'" get processid,commandline /format:csv 2>nul', { encoding: 'utf8' });
    const lines = procs.split('\n').filter(l => l.includes('scripts/'));
    if (lines.length === 0) {
      console.log('    Nenhum pipeline rodando.');
    } else {
      lines.forEach(l => {
        const parts = l.trim().split(',');
        const cmd = parts.slice(1, -1).join(',').trim();
        const pid = parts[parts.length - 1]?.trim();
        const script = cmd.match(/scripts\/([^\s]+)/)?.[1] || cmd.slice(-60);
        console.log(`    PID ${pid} → ${script}`);
      });
    }
  } catch { console.log('    Não foi possível verificar.'); }

  // 2. Logs recentes
  console.log(`\n📋 LOGS RECENTES:`);
  const logFiles = [
    ['Pipeline STF', 'logs/pipeline-fast.log'],
    ['Partes STF', 'logs/partes-full.log'],
    ['Partes teste', 'logs/partes-test.log'],
  ];
  for (const [name, path] of logFiles) {
    const fullPath = `C:\\Users\\medin\\projetos\\judx-platform\\${path}`;
    if (existsSync(fullPath)) {
      try {
        const content = readFileSync(fullPath, 'utf8');
        const lines = content.trim().split('\n');
        const last = lines[lines.length - 1]?.trim();
        const done = last?.includes('DONE') ? ' ✅ COMPLETO' : '';
        console.log(`    ${name.padEnd(20)} ${last?.slice(0, 70)}${done}`);
      } catch { console.log(`    ${name.padEnd(20)} (erro ao ler)`); }
    } else {
      console.log(`    ${name.padEnd(20)} (sem log)`);
    }
  }

  // 3. Banco JudX
  console.log(`\n📊 BANCO JUDX:`);
  await checkDB('Tabelas', JUDX_URL, [
    ['stf_decisoes', "SELECT COUNT(*) as rows FROM stf_decisoes"],
    ['judx_case', "SELECT COUNT(*) as rows FROM judx_case"],
    ['judx_decision', "SELECT COUNT(*) as rows FROM judx_decision"],
    ['stf_partes', "SELECT COUNT(DISTINCT incidente) as incidentes, COUNT(*) as partes FROM stf_partes"],
    ['stj_temas', "SELECT COUNT(*) as rows FROM stj_temas"],
    ['stj_processos_semente', "SELECT COUNT(*) as rows FROM stj_processos_semente"],
    ['stj_contramostra', "SELECT COUNT(*) as rows FROM stj_contramostra"],
  ]);

  // 4. Banco ICONS
  console.log(`\n📊 BANCO ICONS:`);
  await checkDB('Tabelas', ICONS_URL, [
    ['objects', "SELECT COUNT(*) as rows FROM objects"],
    ['edges (total)', "SELECT COUNT(*) as rows FROM edges"],
    ['ancora_normativa', "SELECT COUNT(*) as rows FROM edges WHERE type_slug = 'ancora_normativa'"],
  ]);

  // 5. Último insert (atividade recente)
  console.log(`\n⏱️  ATIVIDADE RECENTE:`);
  await checkDB('Últimos inserts', JUDX_URL, [
    ['judx_case', "SELECT MAX(created_at)::text as ultimo FROM judx_case"],
    ['stf_partes', "SELECT MAX(created_at)::text as ultimo FROM stf_partes"],
    ['stj_contramostra', "SELECT MAX(extraido_em)::text as ultimo FROM stj_contramostra"],
  ]);

  // 6. Deploy status
  console.log(`\n🌐 SITES:`);
  for (const [name, url] of [['icons.org.br', 'https://icons.org.br'], ['judx-platform', 'https://judx-platform.vercel.app']]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      console.log(`    ${name.padEnd(20)} ${res.status === 200 ? '✅ online' : `⚠️ HTTP ${res.status}`}`);
    } catch {
      console.log(`    ${name.padEnd(20)} ❌ offline/timeout`);
    }
  }

  // 7. STATUS.md summary
  console.log(`\n📌 PRÓXIMOS PASSOS (do STATUS.md):`);
  try {
    const status = readFileSync('C:\\Users\\medin\\projetos\\judx-platform\\STATUS.md', 'utf8');
    const nextSection = status.match(/## PRÓXIMOS PASSOS\n([\s\S]*?)(?=\n---|\n## |$)/);
    if (nextSection) {
      nextSection[1].trim().split('\n').forEach(l => {
        if (l.trim()) console.log(`    ${l.trim()}`);
      });
    }
  } catch { console.log('    (não encontrou STATUS.md)'); }

  console.log(`\n${line('═')}`);
  console.log(`  Relatório gerado em ${ts()}. Bom trabalho!`);
  console.log(line('═'));
}

main().catch(e => console.error('ERRO:', e.message));
