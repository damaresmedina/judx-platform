/**
 * completar-stj-gaps.mjs — Preenche os ~173K faltantes de 2017-2024
 * Pagina por DIA (max ~1.6K/dia, nunca estoura 10K)
 * Também captura os 3.193 sem dataAjuizamento
 *
 * Uso:
 *   node scripts/completar-stj-gaps.mjs              # todos 2017-2024 + sem data
 *   node scripts/completar-stj-gaps.mjs --ano 2021   # só um ano
 */

import fs from 'fs';
import path from 'path';

const DATAJUD_URL = 'https://api-publica.datajud.cnj.jus.br/api_publica_stj/_search';
const DATAJUD_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
const CSV_DIR = 'C:\\Users\\medin\\Desktop\\backup_judx\\resultados\\stj_datajud';
const LOG_DIR = 'logs';
const BATCH_SIZE = 2000;
const DELAY_MS = 80;

const COLS = ['numero_processo','classe_codigo','classe_nome','data_ajuizamento','relator','gabinete','orgao_julgador_codigo','assuntos','ultima_fase','total_movimentos','formato','grau','nivel_sigilo','data_ultima_atualizacao'];

function log(file, msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(file, line + '\n');
}

async function searchDatajud(query) {
  for (let retry = 0; retry < 3; retry++) {
    try {
      const resp = await fetch(DATAJUD_URL, {
        method: 'POST',
        headers: { 'Authorization': `ApiKey ${DATAJUD_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(query)
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    } catch (e) {
      if (retry === 2) throw e;
      await new Promise(r => setTimeout(r, 2000 * (retry + 1)));
    }
  }
}

function extrairRelator(orgao) {
  if (!orgao?.nome) return { relator: '', gabinete: '' };
  const g = orgao.nome.trim();
  let m = g.match(/GABINETE\s+D[OA]\s+MINISTR[OA]\s+(.+)/i);
  if (m) return { relator: m[1].trim(), gabinete: g };
  m = g.match(/(?:GABINETE\s+D[OA]\s+)?DESEMBARGADOR[A]?\s+CONVOCAD[OA]\s+(?:DO\s+\S+\s+)?(.+)/i);
  if (m) return { relator: 'DESEMB. CONV. ' + m[1].replace(/\s*\(.*$/, '').trim(), gabinete: g };
  if (/VICE.PRESID/i.test(g)) return { relator: 'VICE-PRESIDENTE STJ', gabinete: g };
  if (/PRESID.NCIA$/i.test(g)) return { relator: 'PRESIDENTE STJ', gabinete: g };
  m = g.match(/PRESIDENTE\s+D[AOA]\s+(.+)/i);
  if (m) return { relator: 'PRESIDENTE ' + m[1].trim(), gabinete: g };
  return { relator: '', gabinete: g };
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
  const movs = s.movimentos || [];
  const ultimaFase = movs.length ? [...movs].sort((a,b) => new Date(b.dataHora||0) - new Date(a.dataHora||0))[0]?.nome || '' : '';
  const dataAj = s.dataAjuizamento ? String(s.dataAjuizamento).slice(0,10) : '';

  return [
    s.numeroProcesso,
    s.classe?.codigo || '',
    s.classe?.nome || '',
    dataAj,
    relator,
    gabinete,
    s.orgaoJulgador?.codigo || '',
    assuntos,
    ultimaFase,
    movs.length || 0,
    s.formato?.nome || '',
    s.grau || '',
    s.nivelSigilo ?? '',
    s.dataHoraUltimaAtualizacao || ''
  ].map(csvEscape).join(',');
}

function carregarNumerosExistentes(csvFile) {
  const nums = new Set();
  if (fs.existsSync(csvFile)) {
    const content = fs.readFileSync(csvFile, 'utf8');
    const lines = content.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const num = lines[i].split(',')[0]?.replace(/"/g, '');
      if (num) nums.add(num);
    }
  }
  return nums;
}

function gerarDias(ano) {
  const dias = [];
  const inicio = new Date(ano, 0, 1);
  const fim = new Date(ano, 11, 31);
  for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
    dias.push(d.toISOString().slice(0, 10));
  }
  return dias;
}

async function completarAno(ano) {
  const logFile = path.join(LOG_DIR, `stj-gap-${ano}.log`);
  const csvFile = path.join(CSV_DIR, `stj_datajud_${ano}.csv`);

  log(logFile, `=== COMPLETANDO ${ano} ===`);

  // Carregar números existentes
  const existentes = carregarNumerosExistentes(csvFile);
  log(logFile, `Existentes no CSV: ${existentes.size}`);

  // Contar total real na API
  const countR = await searchDatajud({
    size: 0, track_total_hits: true,
    query: { range: { dataAjuizamento: { gte: `${ano}-01-01`, lte: `${ano}-12-31` } } }
  });
  const totalApi = countR.hits?.total?.value || 0;
  const faltam = totalApi - existentes.size;
  log(logFile, `Total API: ${totalApi} | Faltam: ${faltam}`);

  if (faltam <= 0) {
    log(logFile, `Nada a completar para ${ano}`);
    return 0;
  }

  // Garantir header
  if (!fs.existsSync(csvFile)) {
    fs.writeFileSync(csvFile, COLS.join(',') + '\n');
  }

  // Paginar por DIA
  const dias = gerarDias(ano);
  let totalNovos = 0;
  let erros = 0;

  for (const dia of dias) {
    // Contar dia
    let totalDia;
    try {
      const cr = await searchDatajud({
        size: 0, track_total_hits: true,
        query: { range: { dataAjuizamento: { gte: dia, lte: dia } } }
      });
      totalDia = cr.hits?.total?.value || 0;
    } catch { erros++; continue; }

    if (totalDia === 0) continue;

    // Paginar dentro do dia
    let from = 0;
    while (from < totalDia) {
      let result;
      try {
        result = await searchDatajud({
          size: BATCH_SIZE, from,
          query: { range: { dataAjuizamento: { gte: dia, lte: dia } } },
          sort: ['_doc']
        });
      } catch { erros++; break; }

      const hits = result.hits?.hits || [];
      if (hits.length === 0) break;

      const newLines = [];
      for (const hit of hits) {
        const num = hit._source.numeroProcesso;
        if (!existentes.has(num)) {
          newLines.push(hitToRow(hit));
          existentes.add(num);
          totalNovos++;
        }
      }

      if (newLines.length > 0) {
        fs.appendFileSync(csvFile, newLines.join('\n') + '\n');
      }

      from += hits.length;
      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    // Log a cada 1000 novos
    if (totalNovos > 0 && totalNovos % 1000 < BATCH_SIZE) {
      log(logFile, `[${ano}] ${dia} | +${totalNovos} novos | erros: ${erros}`);
    }
  }

  log(logFile, `[${ano}] COMPLETO — +${totalNovos} novos, ${erros} erros | Total CSV: ${existentes.size}`);
  return totalNovos;
}

async function capturarSemData() {
  const logFile = path.join(LOG_DIR, 'stj-gap-sem-data.log');
  const csvFile = path.join(CSV_DIR, 'stj_datajud_sem_data.csv');

  log(logFile, '=== PROCESSOS SEM DATA AJUIZAMENTO ===');

  // Contar
  const cr = await searchDatajud({
    size: 0, track_total_hits: true,
    query: { bool: { must_not: { exists: { field: 'dataAjuizamento' } } } }
  });
  const total = cr.hits?.total?.value || 0;
  log(logFile, `Total sem data: ${total}`);

  if (total === 0) return 0;

  // Carregar existentes
  const existentes = carregarNumerosExistentes(csvFile);
  if (!fs.existsSync(csvFile)) {
    fs.writeFileSync(csvFile, COLS.join(',') + '\n');
  }

  let novos = 0;
  let from = 0;
  while (from < total && from < 10000) {
    const result = await searchDatajud({
      size: BATCH_SIZE, from,
      query: { bool: { must_not: { exists: { field: 'dataAjuizamento' } } } },
      sort: ['_doc']
    });

    const hits = result.hits?.hits || [];
    if (hits.length === 0) break;

    const newLines = [];
    for (const hit of hits) {
      const num = hit._source.numeroProcesso;
      if (!existentes.has(num)) {
        newLines.push(hitToRow(hit));
        existentes.add(num);
        novos++;
      }
    }

    if (newLines.length > 0) {
      fs.appendFileSync(csvFile, newLines.join('\n') + '\n');
    }

    from += hits.length;
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  log(logFile, `Sem data: +${novos} novos | Total: ${existentes.size}`);
  return novos;
}

async function main() {
  const args = process.argv.slice(2);
  const anoIdx = args.indexOf('--ano');
  const anoUnico = anoIdx > -1 ? parseInt(args[anoIdx + 1]) : null;

  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
  if (!fs.existsSync(CSV_DIR)) fs.mkdirSync(CSV_DIR, { recursive: true });

  let totalGeral = 0;

  if (anoUnico) {
    totalGeral += await completarAno(anoUnico);
  } else {
    // 2017-2024 (anos com gap)
    for (const ano of [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]) {
      totalGeral += await completarAno(ano);
    }
    // Sem data
    totalGeral += await capturarSemData();
  }

  console.log(`\n=== TOTAL GERAL: +${totalGeral} processos recuperados ===`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
