/**
 * atualizar-stj-portal.mjs
 * ============================================================
 * Atualização via portal STJ (FlareSolverr)
 * Busca processos recentes que o Datajud ainda não tem
 * Salva em CSV local (append ao ano correspondente)
 *
 * Uso: node scripts/atualizar-stj-portal.mjs [--limit N]
 * Requisito: Docker + FlareSolverr rodando na porta 8191
 * ============================================================
 */

import fs from 'fs';
import path from 'path';

const FLARE_URL = 'http://localhost:8191/v1';
const CSV_DIR = 'C:\\Users\\medin\\Desktop\\backup_judx\\resultados\\stj_datajud';
const LOG_FILE = path.join('logs', 'stj-portal-atualizar.log');
const DELAY_MS = 3000; // 3s entre requests — ser educado com o portal
const MAX_TIMEOUT = 60000;

const COLS = ['numero_processo','classe_codigo','classe_nome','data_ajuizamento','relator','gabinete','orgao_julgador_codigo','assuntos','ultima_fase','total_movimentos','formato','grau','nivel_sigilo','data_ultima_atualizacao'];

// Metadados que NÃO são partes
const METADATA_LABELS = [
  'PROCESSO', 'LOCALIZAÇÃO', 'LOCALIZAÇ', 'TIPO', 'AUTUAÇÃO', 'AUTUAÇ',
  'NÚMERO ÚNICO', 'NUMERO UNICO', 'NÚMEROS DE ORIGEM', 'NUMEROS DE ORIGEM',
  'RAMO DO DIREITO', 'ASSUNTO', 'RELATOR', 'ÚLTIMA FASE', 'ULTIMA FASE',
  'TRIBUNAL DE ORIGEM', '\u00A0', '&NBSP;'
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function csvEscape(v) {
  if (v == null) return '';
  let s = String(v).replace(/"/g, '""');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) s = `"${s}"`;
  return s;
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
  if (endIdx === -1) endIdx = startIdx + 30000;
  const section = html.substring(startIdx, endIdx);

  const re = /classSpanDetalhesLabel">([^<]*)<\/span>\s*[\s\S]*?classSpanDetalhesTexto">([\s\S]*?)<\/span>/g;
  let m;
  while ((m = re.exec(section)) !== null) {
    const label = m[1].trim().replace(/:$/, '').toUpperCase();
    let text = m[2].replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (!text) continue;

    if (label.startsWith('RELATOR')) {
      const rel = text.match(/^(?:Min\.\s*)?(.+?)\s*-\s*(.+)$/i);
      if (rel) { d.relator = rel[1].trim(); d.orgao = rel[2].trim(); }
      else d.relator = text;
    } else if (label.startsWith('RAMO DO DIREITO')) {
      d.ramo = text;
    } else if (label.startsWith('ASSUNTO')) {
      d.assuntos = text;
    } else if (label.startsWith('AUTUA')) {
      d.autuacao = text;
    } else if (label === 'TIPO') {
      d.formato = text;
    } else if (label.includes('NICO') || label.includes('NÚMERO ÚNICO')) {
      d.numero_unico = text;
    }
  }

  // Extrair classe e número do processo
  const procMatch = html.match(/idSpanClasseDescricao[\s\S]*?>([\s\S]*?)<\/span/);
  if (procMatch) {
    let procId = procMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    procId = procId.replace(/\s*nº\s*/i, ' ').replace(/\s*\/\s*\w+$/, '').trim();
    d.processo = procId;
    // Separar classe e número
    const parts = procId.match(/^(.+?)\s+(\d+)$/);
    if (parts) { d.classe = parts[1]; d.numero = parts[2]; }
  }

  return d;
}

function carregarNumerosExistentes() {
  const numeros = new Set();
  if (!fs.existsSync(CSV_DIR)) return numeros;
  const files = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv'));
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
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx > -1 ? parseInt(args[limitIdx + 1]) : 100;

  if (!fs.existsSync('logs')) fs.mkdirSync('logs');
  if (!fs.existsSync(CSV_DIR)) fs.mkdirSync(CSV_DIR, { recursive: true });

  const hoje = new Date().toISOString().slice(0, 10);
  log(`=== ATUALIZAÇÃO VIA PORTAL STJ — ${hoje} ===`);

  // Carregar existentes
  const existentes = carregarNumerosExistentes();
  log(`${existentes.size} processos nos CSVs`);

  // Buscar processos recentes — pesquisa por classe e ano
  const anoAtual = new Date().getFullYear();
  const classes = ['AREsp', 'REsp', 'HC', 'RHC', 'CC', 'RMS', 'MS'];
  let novos = 0;
  let erros = 0;

  for (const classe of classes) {
    if (novos >= limit) break;

    const url = `https://processo.stj.jus.br/processo/pesquisa/?aplicacao=processos.ea&tipoPesquisa=tipoPesquisaGenerica&termo=${classe}&chkordem=DESC&chkMorto=MORTO`;

    try {
      log(`Buscando ${classe}...`);
      const html = await fetchViaFlare(url);

      // Extrair lista de processos da página de resultados
      // Pattern: links para processos individuais
      const procLinks = [];
      const linkRe = /processo\/pesquisa\/\?.*?num_registro=(\d+)/g;
      let lm;
      while ((lm = linkRe.exec(html)) !== null) {
        if (!procLinks.includes(lm[1])) procLinks.push(lm[1]);
      }

      // Também tentar padrão de número CNJ
      const cnjRe = /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/g;
      while ((lm = cnjRe.exec(html)) !== null) {
        const num = lm[1].replace(/[.-]/g, '');
        if (!procLinks.includes(num) && !existentes.has(num)) procLinks.push(num);
      }

      log(`  ${classe}: ${procLinks.length} processos encontrados na listagem`);

      // Se caiu direto na página de detalhes (1 resultado)
      if (html.includes('idDivDetalhes')) {
        const det = parseDetalhes(html);
        if (det.numero_unico) {
          const num = det.numero_unico.replace(/[.-]/g, '');
          if (!existentes.has(num)) {
            const ano = det.autuacao?.match(/\d{4}$/)?.[0] || String(anoAtual);
            const row = [
              num, '', det.classe || classe, det.autuacao || '',
              det.relator || '', det.orgao || '', '', det.assuntos || '',
              '', 0, det.formato || '', 'SUP', 0, hoje
            ].map(csvEscape).join(',');

            const csvFile = path.join(CSV_DIR, `stj_datajud_${ano}.csv`);
            if (!fs.existsSync(csvFile)) fs.writeFileSync(csvFile, COLS.join(',') + '\n');
            fs.appendFileSync(csvFile, row + '\n');
            existentes.add(num);
            novos++;
            log(`  + ${det.processo} (${ano})`);
          }
        }
      }

    } catch (err) {
      erros++;
      log(`ERRO ${classe}: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  log(`=== COMPLETO — ${novos} novos, ${erros} erros ===`);
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
