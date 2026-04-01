/**
 * fetch-stj-detalhes.mjs
 * FASE 1: Extrai APENAS metadados (relator, turma, ramo, assuntos, tribunal, autuação)
 * Rápido — ignora partes, fases e decisões.
 *
 * Uso: node scripts/fetch-stj-detalhes.mjs [--resume] [--limit N]
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const DB_URL = 'postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres';
const FLARE_URL = 'http://localhost:8191/v1';
const LOG_FILE = path.join('logs', 'stj-detalhes.log');
const DELAY_MS = 2000;
const MAX_TIMEOUT = 60000;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function fetchViaFlare(url) {
  const resp = await fetch(FLARE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmd: 'request.get', url, maxTimeout: MAX_TIMEOUT })
  });
  const data = await resp.json();
  if (data.status !== 'ok' || data.solution?.status !== 200) {
    throw new Error(`FlareSolverr: ${data.message || data.status}`);
  }
  return data.solution.response;
}

function parseDetalhes(html) {
  const d = {};
  const startIdx = html.indexOf('id="idDivDetalhes"');
  if (startIdx === -1) return d;

  let endIdx = html.indexOf('id="idDivFases"', startIdx);
  if (endIdx === -1) endIdx = startIdx + 20000;
  const section = html.substring(startIdx, endIdx);

  const re = /classSpanDetalhesLabel">([^<]*)<\/span>\s*[\s\S]*?classSpanDetalhesTexto">([\s\S]*?)<\/span>/g;
  let m;
  while ((m = re.exec(section)) !== null) {
    const label = m[1].trim().replace(/:$/, '').toUpperCase();
    let text = m[2].replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (!text) continue;

    if (label.startsWith('RELATOR')) {
      const relMatch = text.match(/^(?:Min\.\s*)?(.+?)\s*-\s*(.+)$/i);
      if (relMatch) { d.relator = relMatch[1].trim(); d.orgao_julgador = relMatch[2].trim(); }
      else d.relator = text;
    } else if (label.startsWith('RAMO DO DIREITO')) {
      d.ramo_direito = text;
    } else if (label.startsWith('ASSUNTO')) {
      d.assuntos = text;
    } else if (label.startsWith('TRIBUNAL DE ORIGEM')) {
      d.tribunal_origem = text;
    } else if (label.includes('MEROS DE ORIGEM') || label.includes('NÚMEROS DE ORIGEM')) {
      d.numeros_origem = text;
    } else if (label.startsWith('LOCALIZA')) {
      d.localizacao = text;
    } else if (label.startsWith('AUTUA')) {
      d.autuacao = text;
    } else if (label === 'TIPO') {
      d.tipo_processo = text;
    } else if (label.includes('NICO') || label.includes('NÚMERO ÚNICO')) {
      d.numero_unico = text;
    } else if (label.includes('LTIMA FASE') || label.includes('ÚLTIMA FASE')) {
      d.ultima_fase = text;
    }
  }
  return d;
}

async function main() {
  const args = process.argv.slice(2);
  const resume = args.includes('--resume');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx > -1 ? parseInt(args[limitIdx + 1]) : null;

  if (!fs.existsSync('logs')) fs.mkdirSync('logs');

  const client = new Client(DB_URL);
  await client.connect();
  log('Conectado ao banco JudX');

  // Todos os processos (contramostra + sementes)
  const contramostra = await client.query('SELECT DISTINCT ON (numero) numero, classe FROM stj_contramostra ORDER BY numero DESC');
  const sementes = await client.query('SELECT DISTINCT ON (numero) numero, classe FROM stj_processos_semente ORDER BY numero DESC');

  const seen = new Set();
  let processos = [];
  for (const r of contramostra.rows) { if (!seen.has(r.numero)) { seen.add(r.numero); processos.push(r); } }
  for (const r of sementes.rows) { if (!seen.has(r.numero)) { seen.add(r.numero); processos.push(r); } }
  log(`Total: ${processos.length} processos`);

  // Resume: pular já extraídos
  if (resume) {
    const done = await client.query('SELECT processo FROM stj_processo_detalhes');
    const doneSet = new Set(done.rows.map(r => r.processo));
    const before = processos.length;
    processos = processos.filter(p => {
      const procId = `${p.classe} ${p.numero}`.replace(/\s*nº\s*/i, ' ').replace(/\s*\/\s*\w+$/, '').trim();
      return !doneSet.has(procId);
    });
    log(`Resume: ${before - processos.length} já feitos, ${processos.length} restantes`);
  }

  if (limit) { processos = processos.slice(0, limit); log(`Limitado a ${limit}`); }

  let success = 0, errors = 0;

  for (let i = 0; i < processos.length; i++) {
    const proc = processos[i];
    const termo = encodeURIComponent(`${proc.classe} ${proc.numero}`);
    const url = `https://processo.stj.jus.br/processo/pesquisa/?termo=${termo}&aplicacao=processos.ea&tipoPesquisa=tipoPesquisaGenerica&chkordem=DESC&chkMorto=MORTO`;

    try {
      const html = await fetchViaFlare(url);

      // Extrair nome do processo da página
      const procMatch = html.match(/idSpanClasseDescricao[\s\S]*?>([\s\S]*?)<\/span/);
      let procId = procMatch ? procMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : `${proc.classe} ${proc.numero}`;
      procId = procId.replace(/\s*nº\s*/i, ' ').replace(/\s*\/\s*\w+$/, '').trim();

      const det = parseDetalhes(html);

      if (Object.keys(det).length > 0) {
        const cols = ['processo', 'numero', 'classe'];
        const vals = [procId, proc.numero, proc.classe];
        const detFields = ['relator', 'orgao_julgador', 'ramo_direito', 'assuntos', 'tribunal_origem', 'numeros_origem', 'localizacao', 'autuacao', 'tipo_processo', 'numero_unico', 'ultima_fase'];
        for (const f of detFields) {
          if (det[f]) { cols.push(f); vals.push(det[f]); }
        }
        const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
        const updateSet = cols.slice(1).map((c, i) => `${c} = $${i + 2}`).join(', ');
        await client.query(
          `INSERT INTO stj_processo_detalhes (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (processo) DO UPDATE SET ${updateSet}`,
          vals
        );
      }

      success++;
      if ((i + 1) % 10 === 0 || i === 0) {
        const pct = ((i + 1) / processos.length * 100).toFixed(1);
        log(`[${pct}%] ${i + 1}/${processos.length} | ${procId} | relator: ${det.relator || '-'} | turma: ${det.orgao_julgador || '-'} | ok: ${success} erros: ${errors}`);
      }

    } catch (err) {
      errors++;
      log(`ERRO ${proc.classe} ${proc.numero}: ${err.message}`);
    }

    if (i < processos.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  log(`\n=== FASE 1 COMPLETA ===`);
  log(`Sucesso: ${success} | Erros: ${errors}`);

  // Backup CSV
  const today = new Date().toISOString().slice(0, 10);
  const rows = await client.query('SELECT * FROM stj_processo_detalhes ORDER BY id');
  if (rows.rows.length > 0) {
    const cols = Object.keys(rows.rows[0]);
    const csvFile = path.join('C:\\Users\\medin\\Desktop\\backup_judx\\resultados', `stj_detalhes_${today}.csv`);
    const csv = cols.join(',') + '\n' + rows.rows.map(r => cols.map(c => {
      let v = String(r[c] ?? '').replace(/"/g, '""');
      if (v.includes(',') || v.includes('"') || v.includes('\n')) v = `"${v}"`;
      return v;
    }).join(',')).join('\n');
    fs.writeFileSync(csvFile, csv, 'utf8');
    log(`CSV: ${csvFile} (${rows.rows.length} rows)`);
  }

  const count = await client.query('SELECT count(*) FROM stj_processo_detalhes');
  log(`stj_processo_detalhes: ${count.rows[0].count} registros`);

  await client.end();
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
