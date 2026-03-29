/**
 * fetch-stj-datajud-csv.mjs
 * ============================================================
 * Extrai TODOS os processos STJ (2016-2026) via Datajud API
 * Salva DIRETO em CSV — sem banco de dados
 * Um CSV por ano, append mode (pode retomar)
 *
 * Uso:
 *   node scripts/fetch-stj-datajud-csv.mjs                  # tudo 2016-2026
 *   node scripts/fetch-stj-datajud-csv.mjs --ano 2023       # só um ano
 * ============================================================
 */

import fs from 'fs';
import path from 'path';

const DATAJUD_URL = 'https://api-publica.datajud.cnj.jus.br/api_publica_stj/_search';
const DATAJUD_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
const LOG_DIR = 'logs';
const CSV_DIR = 'C:\\Users\\medin\\Desktop\\backup_judx\\resultados\\stj_datajud';
const BATCH_SIZE = 2000;
const DELAY_MS = 100;

const COLS = ['numero_processo','classe_codigo','classe_nome','data_ajuizamento','relator','gabinete','orgao_julgador_codigo','assuntos','ultima_fase','total_movimentos','formato','grau','nivel_sigilo','data_ultima_atualizacao'];

function log(file, msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(file, line + '\n');
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
  const g = orgao.nome.trim();
  // 1. Ministro/Ministra
  let m = g.match(/GABINETE\s+D[OA]\s+MINISTR[OA]\s+(.+)/i);
  if (m) return { relator: m[1].trim(), gabinete: g };
  // 2. Desembargador convocado (com ou sem GABINETE)
  m = g.match(/(?:GABINETE\s+D[OA]\s+)?DESEMBARGADOR[A]?\s+CONVOCAD[OA]\s+(?:DO\s+\S+\s+)?(.+)/i);
  if (m) return { relator: 'DESEMB. CONV. ' + m[1].replace(/\s*\(.*$/, '').trim(), gabinete: g };
  // 3. Presidência / Vice
  if (/VICE.PRESID/i.test(g)) return { relator: 'VICE-PRESIDENTE STJ', gabinete: g };
  if (/PRESID.NCIA$/i.test(g)) return { relator: 'PRESIDENTE STJ', gabinete: g };
  // 4. Presidente de seção
  m = g.match(/PRESIDENTE\s+D[AOA]\s+(.+)/i);
  if (m) return { relator: 'PRESIDENTE ' + m[1].trim(), gabinete: g };
  // 5. Fallback
  return { relator: '', gabinete: g };
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
    s.numeroProcesso,
    s.classe?.codigo || '',
    s.classe?.nome || '',
    parseData(s.dataAjuizamento),
    relator,
    gabinete,
    s.orgaoJulgador?.codigo || '',
    assuntos,
    ultimaFase,
    s.movimentos?.length || 0,
    s.formato?.nome || '',
    s.grau || '',
    s.nivelSigilo ?? '',
    s.dataHoraUltimaAtualizacao || ''
  ].map(csvEscape).join(',');
}

function gerarSemanas(ano) {
  const semanas = [];
  const fim = new Date(ano, 11, 31);
  const inicio = new Date(ano, 0, 1);
  let cursor = new Date(fim);
  while (cursor >= inicio) {
    const fimSem = new Date(cursor);
    const iniSem = new Date(cursor);
    iniSem.setDate(iniSem.getDate() - 6);
    if (iniSem < inicio) iniSem.setTime(inicio.getTime());
    semanas.push({ gte: iniSem.toISOString().slice(0,10), lte: fimSem.toISOString().slice(0,10) });
    cursor.setDate(cursor.getDate() - 7);
  }
  return semanas;
}

async function extrairAno(ano) {
  const logFile = path.join(LOG_DIR, `stj-csv-${ano}.log`);
  const csvFile = path.join(CSV_DIR, `stj_datajud_${ano}.csv`);

  // Verificar quantas linhas já temos (resume)
  let linhasExistentes = 0;
  let numerosExistentes = new Set();
  if (fs.existsSync(csvFile)) {
    const content = fs.readFileSync(csvFile, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    linhasExistentes = lines.length - 1; // menos header
    // Ler números existentes para evitar duplicatas
    for (let i = 1; i < lines.length; i++) {
      const num = lines[i].split(',')[0].replace(/"/g, '');
      if (num) numerosExistentes.add(num);
    }
    log(logFile, `Resume: ${linhasExistentes} linhas existentes, ${numerosExistentes.size} processos únicos`);
  } else {
    // Criar header
    fs.writeFileSync(csvFile, COLS.join(',') + '\n', 'utf8');
    log(logFile, `Novo arquivo: ${csvFile}`);
  }

  const semanas = gerarSemanas(ano);
  log(logFile, `Ano ${ano}: ${semanas.length} semanas`);

  let totalNovos = 0;
  let totalSkip = 0;
  let erros = 0;

  for (const sem of semanas) {
    // Contar
    let totalSem;
    try {
      const cr = await searchDatajud({ size: 0, query: { range: { dataAjuizamento: { gte: sem.gte, lte: sem.lte } } } });
      totalSem = cr.hits?.total?.value || 0;
    } catch (e) { erros++; continue; }

    if (totalSem === 0) continue;

    let extraidos = 0;
    while (extraidos < totalSem && extraidos < 10000) {
      const query = {
        size: BATCH_SIZE,
        from: extraidos,
        query: { range: { dataAjuizamento: { gte: sem.gte, lte: sem.lte } } },
        sort: ['_doc']
      };

      let result;
      for (let retry = 0; retry < 3; retry++) {
        try { result = await searchDatajud(query); break; }
        catch (e) { if (retry === 2) { erros++; result = null; } else await new Promise(r => setTimeout(r, 2000)); }
      }
      if (!result) break;

      const hits = result.hits?.hits || [];
      if (hits.length === 0) break;

      // Filtrar duplicatas e converter
      const newLines = [];
      for (const hit of hits) {
        const num = hit._source.numeroProcesso;
        if (!numerosExistentes.has(num)) {
          newLines.push(hitToRow(hit));
          numerosExistentes.add(num);
          totalNovos++;
        } else {
          totalSkip++;
        }
      }

      // Append ao CSV
      if (newLines.length > 0) {
        fs.appendFileSync(csvFile, newLines.join('\n') + '\n', 'utf8');
      }

      extraidos += hits.length;
      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    if (totalNovos % 5000 < BATCH_SIZE) {
      log(logFile, `[${ano}] ${sem.gte}/${sem.lte} | novos: ${totalNovos} | skip: ${totalSkip} | erros: ${erros}`);
    }
  }

  log(logFile, `[${ano}] COMPLETO — ${totalNovos} novos, ${totalSkip} duplicatas, ${erros} erros`);
  log(logFile, `Total no CSV: ${numerosExistentes.size} processos`);
}

async function main() {
  const args = process.argv.slice(2);
  const anoIdx = args.indexOf('--ano');
  const anoUnico = anoIdx > -1 ? parseInt(args[anoIdx + 1]) : null;

  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
  if (!fs.existsSync(CSV_DIR)) fs.mkdirSync(CSV_DIR, { recursive: true });

  if (anoUnico) {
    await extrairAno(anoUnico);
  } else {
    // Do mais recente ao mais antigo
    for (let ano = 2025; ano >= 2016; ano--) {
      await extrairAno(ano);
    }
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
