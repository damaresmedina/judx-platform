/**
 * atualizar-stj-diario.mjs
 * ============================================================
 * Atualização diária dos CSVs STJ Datajud
 * Busca processos novos dos últimos 30 dias e adiciona aos CSVs
 * Depois faz push para GitHub (judx-backup)
 *
 * Uso: node scripts/atualizar-stj-diario.mjs
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const DATAJUD_URL = 'https://api-publica.datajud.cnj.jus.br/api_publica_stj/_search';
const DATAJUD_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
const CSV_DIR = 'C:\\Users\\medin\\Desktop\\backup_judx\\resultados\\stj_datajud';
const BACKUP_REPO = 'C:\\Users\\medin\\projetos\\judx-backup';
const LOG_FILE = path.join('logs', 'stj-atualizacao-diaria.log');
const BATCH_SIZE = 2000;
const DELAY_MS = 100;

const COLS = ['numero_processo','classe_codigo','classe_nome','data_ajuizamento','relator','gabinete','orgao_julgador_codigo','assuntos','ultima_fase','total_movimentos','formato','grau','nivel_sigilo','data_ultima_atualizacao'];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function searchDatajud(query) {
  const resp = await fetch(DATAJUD_URL, {
    method: 'POST',
    headers: { 'Authorization': `ApiKey ${DATAJUD_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(query)
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

function extrairRelator(orgao) {
  if (!orgao?.nome) return { relator: '', gabinete: '' };
  const m = orgao.nome.match(/GABINETE\s+D[OA]\s+MINISTR[OA]\s+(.+)/i);
  return m ? { relator: m[1].trim(), gabinete: orgao.nome } : { relator: '', gabinete: orgao.nome };
}

function parseData(d) {
  if (!d) return '';
  const s = String(d);
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const comp = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (comp) return `${comp[1]}-${comp[2]}-${comp[3]}`;
  return '';
}

function csvEscape(v) {
  if (v == null) return '';
  let s = String(v).replace(/"/g, '""');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) s = `"${s}"`;
  return s;
}

function hitToRow(hit) {
  const s = hit._source;
  const { relator, gabinete } = extrairRelator(s.orgaoJulgador);
  const assuntos = (s.assuntos || []).map(a => a.nome).join('; ');
  const ultimaFase = s.movimentos?.length ? [...s.movimentos].sort((a,b) => new Date(b.dataHora||0) - new Date(a.dataHora||0))[0]?.nome || '' : '';
  return [
    s.numeroProcesso, s.classe?.codigo || '', s.classe?.nome || '', parseData(s.dataAjuizamento),
    relator, gabinete, s.orgaoJulgador?.codigo || '', assuntos, ultimaFase,
    s.movimentos?.length || 0, s.formato?.nome || '', s.grau || '',
    s.nivelSigilo ?? '', s.dataHoraUltimaAtualizacao || ''
  ].map(csvEscape).join(',');
}

function carregarNumerosExistentes() {
  const numeros = new Set();
  const files = fs.readdirSync(CSV_DIR).filter(f => f.startsWith('stj_datajud_') && f.endsWith('.csv'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(CSV_DIR, file), 'utf8');
    const lines = content.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const num = lines[i].split(',')[0]?.replace(/"/g, '');
      if (num) numeros.add(num);
    }
  }
  return numeros;
}

async function main() {
  if (!fs.existsSync('logs')) fs.mkdirSync('logs');

  const hoje = new Date().toISOString().slice(0, 10);
  log(`=== ATUALIZAÇÃO DIÁRIA STJ — ${hoje} ===`);

  // Carregar todos os números já extraídos
  log('Carregando números existentes...');
  const existentes = carregarNumerosExistentes();
  log(`${existentes.size} processos já nos CSVs`);

  // Buscar últimos 30 dias (por dataHoraUltimaAtualizacao — pega processos novos E atualizados)
  const dataInicio = new Date();
  dataInicio.setDate(dataInicio.getDate() - 30);
  const gte = dataInicio.toISOString().slice(0, 10);

  log(`Buscando processos atualizados desde ${gte}...`);

  // Contar
  const countResult = await searchDatajud({
    size: 0,
    query: { range: { '@timestamp': { gte } } }
  });
  const total = countResult.hits?.total?.value || 0;
  log(`${total} processos atualizados nos últimos 30 dias`);

  let novos = 0;
  let extraidos = 0;
  const novosPorAno = {};

  while (extraidos < total && extraidos < 10000) {
    const query = {
      size: BATCH_SIZE,
      from: extraidos,
      query: { range: { '@timestamp': { gte } } },
      sort: ['_doc']
    };

    let result;
    for (let retry = 0; retry < 3; retry++) {
      try { result = await searchDatajud(query); break; }
      catch (e) { if (retry === 2) result = null; else await new Promise(r => setTimeout(r, 2000)); }
    }
    if (!result) break;

    const hits = result.hits?.hits || [];
    if (hits.length === 0) break;

    // Agrupar por ano e append
    const porAno = {};
    for (const hit of hits) {
      const num = hit._source.numeroProcesso;
      if (!existentes.has(num)) {
        const data = parseData(hit._source.dataAjuizamento);
        const ano = data.slice(0, 4) || '2026';
        if (!porAno[ano]) porAno[ano] = [];
        porAno[ano].push(hitToRow(hit));
        existentes.add(num);
        novos++;
        novosPorAno[ano] = (novosPorAno[ano] || 0) + 1;
      }
    }

    // Append aos CSVs por ano
    for (const [ano, lines] of Object.entries(porAno)) {
      const csvFile = path.join(CSV_DIR, `stj_datajud_${ano}.csv`);
      if (!fs.existsSync(csvFile)) {
        fs.writeFileSync(csvFile, COLS.join(',') + '\n', 'utf8');
      }
      fs.appendFileSync(csvFile, lines.join('\n') + '\n', 'utf8');
    }

    extraidos += hits.length;
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  log(`Novos: ${novos} processos adicionados`);
  for (const [ano, n] of Object.entries(novosPorAno).sort()) {
    log(`  ${ano}: +${n}`);
  }

  // Copiar CSVs atualizados para o repo de backup
  log('Copiando para judx-backup...');
  const csvFiles = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv'));
  for (const f of csvFiles) {
    fs.copyFileSync(path.join(CSV_DIR, f), path.join(BACKUP_REPO, f));
  }

  // Git push
  try {
    log('Push para GitHub...');
    execSync('git add -A && git commit -m "Atualização diária STJ ' + hoje + '" && git push', {
      cwd: BACKUP_REPO,
      stdio: 'pipe',
      timeout: 300000
    });
    log('Push OK');
  } catch (e) {
    const msg = e.stdout?.toString() || e.stderr?.toString() || e.message;
    if (msg.includes('nothing to commit')) {
      log('Sem alterações para push');
    } else {
      log(`Erro push: ${msg.slice(0, 200)}`);
    }
  }

  log(`=== COMPLETO — ${novos} novos processos, total ${existentes.size} ===\n`);
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
