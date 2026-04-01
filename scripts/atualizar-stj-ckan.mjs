/**
 * atualizar-stj-ckan.mjs
 * ============================================================
 * Atualização diária STJ via CKAN (dados abertos)
 * Busca metadados de decisões do ano corrente e adiciona ao CSV
 * Funciona com fetch direto — sem FlareSolverr, sem Selenium
 *
 * Uso:
 *   node scripts/atualizar-stj-ckan.mjs              # ano corrente
 *   node scripts/atualizar-stj-ckan.mjs --ano 2026   # ano específico
 *   node scripts/atualizar-stj-ckan.mjs --push       # faz push para GitHub após
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const CKAN_BASE = 'https://dadosabertos.web.stj.jus.br';
const CSV_DIR = path.join('C:', 'Users', 'medin', 'Desktop', 'backup_judx', 'resultados', 'stj_datajud');
const BACKUP_REPO = path.join('C:', 'Users', 'medin', 'projetos', 'judx-backup');
const LOG_FILE = path.join('logs', 'stj-ckan-atualizar.log');
const COLS = ['numero_processo','classe','data_publicacao','data_recebimento','data_distribuicao','relator','tipo_documento','teor','descricao','assuntos','numero_registro','recurso'];

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

async function main() {
  const args = process.argv.slice(2);
  const anoIdx = args.indexOf('--ano');
  const ano = anoIdx > -1 ? parseInt(args[anoIdx + 1]) : new Date().getFullYear();
  const doPush = args.includes('--push');

  if (!fs.existsSync('logs')) fs.mkdirSync('logs');
  if (!fs.existsSync(CSV_DIR)) fs.mkdirSync(CSV_DIR, { recursive: true });

  const hoje = new Date().toISOString().slice(0, 10);
  log(`=== ATUALIZAÇÃO CKAN STJ ${ano} — ${hoje} ===`);

  // Pegar lista de metadados do CKAN
  const res = await fetch(`${CKAN_BASE}/api/3/action/package_show?id=integras-de-decisoes-terminativas-e-acordaos-do-diario-da-justica`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(30000)
  });
  const data = await res.json();
  const resources = data.result?.resources || [];
  const metaFiles = resources
    .filter(r => r.name?.includes(`metadados${ano}`))
    .map(r => ({ name: r.name, url: r.url }));

  log(`${metaFiles.length} dias de metadados para ${ano}`);

  // Carregar números já extraídos
  const csvFile = path.join(CSV_DIR, `stj_ckan_${ano}.csv`);
  const numeros = new Set();

  if (fs.existsSync(csvFile)) {
    const content = fs.readFileSync(csvFile, 'utf8');
    const lines = content.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const num = lines[i].split(',')[0]?.replace(/"/g, '');
      if (num) numeros.add(num);
    }
    log(`Resume: ${numeros.size} processos já no CSV`);
  } else {
    fs.writeFileSync(csvFile, COLS.join(',') + '\n', 'utf8');
    log(`Novo CSV: ${csvFile}`);
  }

  let totalNovos = 0;

  for (const m of metaFiles) {
    try {
      const r = await fetch(m.url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(30000)
      });
      const json = await r.json();
      let novos = 0;

      for (const rec of json) {
        const proc = (rec.processo || '').trim();
        const pm = proc.match(/^(AREsp|REsp|EREsp|AgInt|AgRg|HC|RHC|CC|MS|Pet|Rcl|RMS|EDcl|AI)\s+(\d+)/);
        const num = rec.numeroRegistro || proc.replace(/\s+/g, '');
        if (numeros.has(num)) continue;
        numeros.add(num);

        const row = [
          num,
          pm ? pm[1] : (proc.split(' ')[0] || ''),
          rec.dataPublicacao || '',
          rec.dataRecebimento || '',
          rec['dataDistribuição'] || '',
          rec.NM_MINISTRO || '',
          rec.tipoDocumento || '',
          (rec.teor || '').slice(0, 200),
          (rec.descricaoMonocratica || '').slice(0, 200),
          rec.assuntos || '',
          rec.numeroRegistro || '',
          rec.recurso || ''
        ].map(csvEscape).join(',');

        fs.appendFileSync(csvFile, row + '\n');
        novos++;
        totalNovos++;
      }

      if (novos > 0) log(`${m.name}: ${json.length} registros, ${novos} novos`);
    } catch (e) {
      log(`ERRO ${m.name}: ${e.message}`);
    }
  }

  log(`Total novos: ${totalNovos} | Total no CSV: ${numeros.size}`);

  // Push para GitHub se solicitado
  if (doPush) {
    try {
      log('Copiando para judx-backup...');
      fs.copyFileSync(csvFile, path.join(BACKUP_REPO, path.basename(csvFile)));

      log('Push para GitHub...');
      execSync(`git add -A && git commit -m "Atualização CKAN STJ ${ano} — ${hoje} (+${totalNovos} processos)" && git push`, {
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
  }

  log(`=== COMPLETO ===\n`);
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
