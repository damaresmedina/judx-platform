/**
 * fetch-stj-partes.mjs
 * Extrai partes, advogados, fases e decisões de processos STJ via FlareSolverr
 *
 * Requisitos: Docker + FlareSolverr rodando em localhost:8191
 * Uso: node scripts/fetch-stj-partes.mjs [--resume] [--limit N]
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const DB_URL = 'postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres';
const FLARE_URL = 'http://localhost:8191/v1';
const LOG_FILE = path.join('logs', 'stj-partes.log');
const BATCH_SIZE = 1; // one at a time (FlareSolverr is slow per request)
const DELAY_MS = 2000; // 2s between requests to be polite
const MAX_TIMEOUT = 60000;

// Polo mapping
const POLO_ATIVO = ['AGRAVANTE', 'RECORRENTE', 'IMPETRANTE', 'AUTOR', 'REQUERENTE', 'EMBARGANTE', 'EXEQUENTE', 'APELANTE'];
const POLO_PASSIVO = ['AGRAVADO', 'RECORRIDO', 'IMPETRADO', 'REU', 'REQUERIDO', 'EMBARGADO', 'EXECUTADO', 'APELADO'];

// Metadados do cabeçalho que NÃO são partes — filtrar
const METADATA_LABELS = [
  'PROCESSO', 'LOCALIZAÇÃO', 'LOCALIZAÇ', 'TIPO', 'AUTUAÇÃO', 'AUTUAÇ',
  'NÚMERO ÚNICO', 'NUMERO UNICO', 'NÚMEROS DE ORIGEM', 'NUMEROS DE ORIGEM',
  'RAMO DO DIREITO', 'ASSUNTO', 'RELATOR', 'ÚLTIMA FASE', 'ULTIMA FASE',
  'TRIBUNAL DE ORIGEM', '\u00A0', '&NBSP;'
];

function isMetadata(papel) {
  const up = papel.replace(/:$/, '').trim().toUpperCase();
  return METADATA_LABELS.some(m => up.startsWith(m) || up === m);
}

function getPolo(papel) {
  const up = papel.replace(/:$/, '').trim().toUpperCase();
  if (POLO_ATIVO.some(p => up.startsWith(p))) return 'ativo';
  if (POLO_PASSIVO.some(p => up.startsWith(p))) return 'passivo';
  // INTERES. / INTERESSADO = terceiro, sem polo definido mas é parte legítima
  if (up.startsWith('INTERES') || up.startsWith('REPR.') || up.startsWith('OUTRO NOME')) return 'terceiro';
  return null;
}

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
    throw new Error(`FlareSolverr error: ${data.status} / ${data.solution?.status} / ${data.message || ''}`);
  }
  return data.solution.response;
}

function parsePartes(html) {
  const partes = [];
  const startIdx = html.indexOf('idDetalhesPartesAdvogadosProcuradores');
  if (startIdx === -1) return partes;

  // Find the end of the partes section (next major section or div end)
  let endIdx = html.indexOf('idDivFases', startIdx);
  if (endIdx === -1) endIdx = startIdx + 10000;
  const section = html.substring(startIdx, endIdx);

  // Parse label+text pairs
  const re = /classSpanDetalhesLabel">([^<]*)<\/span>\s*[\s\S]*?classSpanDetalhesTexto">([\s\S]*?)<\/span>/g;
  let m;
  let currentPolo = null;

  while ((m = re.exec(section)) !== null) {
    const papel = m[1].trim().replace(/:$/, '');
    // Extract name from text (may have <a> tags and HTML comments)
    let text = m[2]
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<a[^>]*>/g, '')
      .replace(/<\/a>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text || !papel) continue;

    const papelUp = papel.toUpperCase();

    // Filtrar metadados do cabeçalho — não são partes
    if (isMetadata(papelUp)) continue;

    const polo = getPolo(papelUp);

    // If it's a party (not advogado/procurador), update current polo
    if (!papelUp.includes('ADVOGADO') && !papelUp.includes('PROCURADOR') && polo) {
      currentPolo = polo;
    }

    // Determine tipo
    let tipo = 'parte';
    let oab = null;
    if (papelUp.includes('ADVOGADO')) {
      tipo = 'advogado';
      // Extract OAB: "NOME - UF999999"
      const oabMatch = text.match(/\s-\s([A-Z]{2}\d+)$/);
      if (oabMatch) oab = oabMatch[1];
    } else if (papelUp.includes('PROCURADOR')) {
      tipo = 'procurador';
    } else if (papelUp.includes('AMICUS') || papelUp.includes('CURIAE')) {
      tipo = 'amicus_curiae';
    }

    partes.push({
      papel,
      nome: text,
      tipo,
      oab,
      polo: (tipo === 'parte') ? polo : currentPolo
    });
  }

  return partes;
}

function parseDecisoes(html) {
  const decisoes = [];
  const startIdx = html.indexOf('id="idDivDecisoes"');
  if (startIdx === -1) return decisoes;

  let endIdx = html.indexOf('id="idDivPeticoes"', startIdx);
  if (endIdx === -1) endIdx = startIdx + 20000;
  const section = html.substring(startIdx, endIdx);

  // Extract decisoes monocraticas and acordaos
  // Pattern: <a ...>AREsp 2971391<span ...>(2025/0230443-8 - 07/10/2025)</span></a>
  const re = /clsDecisoesMonocraticasTopoLink[^>]*>.*?<span[^>]*>([^<]*)<\/span>\s*<span[^>]*>\(([^)]*)\)<\/span>/g;
  let m;
  while ((m = re.exec(section)) !== null) {
    const proc = m[1].trim();
    const meta = m[2].trim(); // "2025/0230443-8 - 07/10/2025"
    const parts = meta.split(' - ');
    const registro = parts[0]?.trim();
    const data = parts[1]?.trim();
    decisoes.push({ processo: proc, registro, data, tipo: 'monocratica' });
  }

  // Acordaos
  const reAc = /clsAcordaosTopoLink[^>]*>.*?<span[^>]*>([^<]*)<\/span>\s*<span[^>]*>\(([^)]*)\)<\/span>/g;
  while ((m = reAc.exec(section)) !== null) {
    const proc = m[1].trim();
    const meta = m[2].trim();
    const parts = meta.split(' - ');
    decisoes.push({ processo: proc, registro: parts[0]?.trim(), data: parts[1]?.trim(), tipo: 'acordao' });
  }

  return decisoes;
}

function parseFases(html) {
  const fases = [];
  const startIdx = html.indexOf('id="idDivFases"');
  if (startIdx === -1) return fases;

  let endIdx = html.indexOf('id="idDivDecisoes"', startIdx);
  if (endIdx === -1) endIdx = startIdx + 50000;
  const section = html.substring(startIdx, endIdx);

  // Each fase: <span class="classSpanFaseData">23/03/2026</span><span class="classSpanFaseHora">21:31</span>
  //            <span class="classSpanFaseTexto">...texto...<span class="clsFaseCodigoConselhoNacionalJustica">(85)</span>
  const re = /classSpanFaseData">(\d{2}\/\d{2}\/\d{4})<\/span>\s*<span class="classSpanFaseHora">(\d{2}:\d{2})<\/span>[\s\S]*?classSpanFaseTexto">([\s\S]*?)<\/span>\s*<span class="classSpanLinguagemSimples">/g;
  let m;
  while ((m = re.exec(section)) !== null) {
    const dataStr = m[1].trim(); // DD/MM/YYYY
    const hora = m[2].trim();
    let texto = m[3].trim();

    // Extract CNJ code if present
    const cnjMatch = texto.match(/clsFaseCodigoConselhoNacionalJustica[^>]*>\((\d+)\)/);
    const codigoCnj = cnjMatch ? cnjMatch[1] : null;

    // Clean texto
    texto = texto.replace(/<span[^>]*>[\s\S]*?<\/span>/g, '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

    // Convert date DD/MM/YYYY to YYYY-MM-DD
    const [dd, mm, yyyy] = dataStr.split('/');
    const dataIso = `${yyyy}-${mm}-${dd}`;

    fases.push({ data: dataIso, hora, texto, codigo_cnj: codigoCnj });
  }

  return fases;
}

function parseDetalhes(html) {
  const detalhes = {};
  const startIdx = html.indexOf('id="idDivDetalhes"');
  if (startIdx === -1) return detalhes;

  // Pegar toda a seção de detalhes (incluindo partes, para capturar metadados misturados)
  let endIdx = html.indexOf('id="idDivFases"', startIdx);
  if (endIdx === -1) endIdx = startIdx + 20000;
  const section = html.substring(startIdx, endIdx);

  const re = /classSpanDetalhesLabel">([^<]*)<\/span>\s*[\s\S]*?classSpanDetalhesTexto">([\s\S]*?)<\/span>/g;
  let m;
  while ((m = re.exec(section)) !== null) {
    const rawLabel = m[1].trim().replace(/:$/, '');
    const label = rawLabel.toLowerCase().replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
    let text = m[2].replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (!text) continue;

    // Capturar campos relevantes
    if (label.startsWith('relator')) {
      // "Min. MARIA ISABEL GALLOTTI - QUARTA TURMA"
      const relMatch = text.match(/^(?:Min\.\s*)?(.+?)\s*-\s*(.+)$/i);
      if (relMatch) {
        detalhes.relator = relMatch[1].trim();
        detalhes.orgao_julgador = relMatch[2].trim();
      } else {
        detalhes.relator = text;
      }
    } else if (label.startsWith('ramo do direito')) {
      detalhes.ramo_direito = text;
    } else if (label.startsWith('assunto')) {
      detalhes.assuntos = text;
    } else if (label.startsWith('tribunal de origem')) {
      detalhes.tribunal_origem = text;
    } else if (label.startsWith('n' ) && label.includes('meros de origem')) {
      detalhes.numeros_origem = text;
    } else if (label.startsWith('localiza')) {
      detalhes.localizacao = text;
    } else if (label.startsWith('autua')) {
      detalhes.autuacao = text;
    } else if (label.startsWith('tipo')) {
      detalhes.tipo_processo = text;
    } else if (label.startsWith('n') && label.includes('nico')) {
      detalhes.numero_unico = text;
    } else if (label.startsWith('ltima fase') || label.startsWith('última fase')) {
      detalhes.ultima_fase = text;
    }
  }

  return detalhes;
}

const BACKUP_DIR = 'C:\\Users\\medin\\Desktop\\backup_judx\\resultados';

function toCsvRow(obj, cols) {
  return cols.map(c => {
    let v = obj[c] ?? '';
    v = String(v).replace(/"/g, '""');
    if (v.includes(',') || v.includes('"') || v.includes('\n')) v = `"${v}"`;
    return v;
  }).join(',');
}

async function exportCSV(client) {
  const today = new Date().toISOString().slice(0, 10);

  // stj_partes
  const partes = await client.query('SELECT processo, numero, classe, papel, nome, tipo, oab, polo, created_at FROM stj_partes ORDER BY created_at');
  const pCols = ['processo', 'numero', 'classe', 'papel', 'nome', 'tipo', 'oab', 'polo', 'created_at'];
  const pFile = path.join(BACKUP_DIR, `stj_partes_${today}.csv`);
  fs.writeFileSync(pFile, pCols.join(',') + '\n' + partes.rows.map(r => toCsvRow(r, pCols)).join('\n'), 'utf8');
  log(`CSV backup: ${pFile} (${partes.rows.length} rows)`);

  // stj_fases
  const fases = await client.query('SELECT processo, numero, data, hora, texto, codigo_cnj, created_at FROM stj_fases ORDER BY created_at');
  const fCols = ['processo', 'numero', 'data', 'hora', 'texto', 'codigo_cnj', 'created_at'];
  const fFile = path.join(BACKUP_DIR, `stj_fases_${today}.csv`);
  fs.writeFileSync(fFile, fCols.join(',') + '\n' + fases.rows.map(r => toCsvRow(r, fCols)).join('\n'), 'utf8');
  log(`CSV backup: ${fFile} (${fases.rows.length} rows)`);

  // stj_decisoes_detalhe
  const decs = await client.query('SELECT processo, numero, registro, data, tipo, created_at FROM stj_decisoes_detalhe ORDER BY created_at');
  const dCols = ['processo', 'numero', 'registro', 'data', 'tipo', 'created_at'];
  const dFile = path.join(BACKUP_DIR, `stj_decisoes_detalhe_${today}.csv`);
  fs.writeFileSync(dFile, dCols.join(',') + '\n' + decs.rows.map(r => toCsvRow(r, dCols)).join('\n'), 'utf8');
  log(`CSV backup: ${dFile} (${decs.rows.length} rows)`);
}

async function main() {
  const args = process.argv.slice(2);
  const resume = args.includes('--resume');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx > -1 ? parseInt(args[limitIdx + 1]) : null;

  // Ensure logs dir
  if (!fs.existsSync('logs')) fs.mkdirSync('logs');

  const client = new Client(DB_URL);
  await client.connect();
  log('Conectado ao banco JudX');

  // Get all process numbers — contramostra primeiro (sementes já temos via repetitivos), mais recente primeiro
  const contramostra = await client.query('SELECT numero, classe FROM (SELECT DISTINCT ON (numero) numero, classe FROM stj_contramostra) t ORDER BY numero DESC');
  const sementes = await client.query('SELECT numero, classe FROM (SELECT DISTINCT ON (numero) numero, classe FROM stj_processos_semente) t ORDER BY numero DESC');

  // Contramostra primeiro, depois sementes — ambos do mais recente ao mais antigo
  const allProcs = new Map();
  for (const r of contramostra.rows) allProcs.set(r.numero, { numero: r.numero, classe: r.classe, fonte: 'contramostra' });
  for (const r of sementes.rows) {
    if (!allProcs.has(r.numero)) allProcs.set(r.numero, { numero: r.numero, classe: r.classe, fonte: 'semente' });
  }

  // Manter ordem: contramostra (recente→antigo) + sementes (recente→antigo)
  let processos = [];
  for (const r of contramostra.rows) {
    if (allProcs.has(r.numero) && allProcs.get(r.numero).fonte === 'contramostra') {
      processos.push(allProcs.get(r.numero));
      allProcs.delete(r.numero);
    }
  }
  for (const r of sementes.rows) {
    if (allProcs.has(r.numero)) {
      processos.push(allProcs.get(r.numero));
      allProcs.delete(r.numero);
    }
  }
  log(`Total processos: ${processos.length} (${contramostra.rows.length} contramostra primeiro, ${sementes.rows.length} sementes depois) — mais recente ao mais antigo`);

  // If resume, skip already extracted
  if (resume) {
    const done = await client.query('SELECT DISTINCT processo FROM stj_partes');
    const doneSet = new Set(done.rows.map(r => r.processo));
    const before = processos.length;
    processos = processos.filter(p => !doneSet.has(`${p.classe} ${p.numero}`));
    log(`Resume: ${before - processos.length} já extraídos, ${processos.length} restantes`);
  }

  if (limit) {
    processos = processos.slice(0, limit);
    log(`Limitado a ${limit} processos`);
  }

  let success = 0, errors = 0, totalPartes = 0, totalFases = 0, totalDecisoes = 0;

  for (let i = 0; i < processos.length; i++) {
    const proc = processos[i];
    const termo = encodeURIComponent(`${proc.classe} ${proc.numero}`);
    const url = `https://processo.stj.jus.br/processo/pesquisa/?termo=${termo}&aplicacao=processos.ea&tipoPesquisa=tipoPesquisaGenerica&chkordem=DESC&chkMorto=MORTO`;

    try {
      const html = await fetchViaFlare(url);

      // Parse processo identifier from page
      const procMatch = html.match(/idSpanClasseDescricao[\s\S]*?>([\s\S]*?)<\/span/);
      let procId = procMatch ? procMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : `${proc.classe} ${proc.numero}`;
      // Clean: "AREsp nº 2971391 / SP" -> "AREsp 2971391"
      procId = procId.replace(/\s*nº\s*/i, ' ').replace(/\s*\/\s*\w+$/, '').trim();

      // Parse all sections
      const partes = parsePartes(html);
      const decisoes = parseDecisoes(html);
      const fases = parseFases(html);
      const detalhes = parseDetalhes(html);

      // Insert detalhes do processo (relator, turma, ramo, assuntos, tribunal, etc.)
      if (Object.keys(detalhes).length > 0) {
        const cols = ['processo', 'numero', 'classe'];
        const vals = [procId, proc.numero, proc.classe];
        const detFields = ['relator', 'orgao_julgador', 'ramo_direito', 'assuntos', 'tribunal_origem', 'numeros_origem', 'localizacao', 'autuacao', 'tipo_processo', 'numero_unico', 'ultima_fase'];
        for (const f of detFields) {
          if (detalhes[f]) { cols.push(f); vals.push(detalhes[f]); }
        }
        const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
        const updateSet = cols.slice(1).map((c, i) => `${c} = $${i + 2}`).join(', ');
        await client.query(
          `INSERT INTO stj_processo_detalhes (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (processo) DO UPDATE SET ${updateSet}`,
          vals
        );
      }

      // Insert partes
      if (partes.length > 0) {
        const values = [];
        const params = [];
        let paramIdx = 1;
        for (const p of partes) {
          values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
          params.push(procId, proc.numero, proc.classe, p.papel, p.nome, p.tipo, p.oab, p.polo);
        }
        await client.query(
          `INSERT INTO stj_partes (processo, numero, classe, papel, nome, tipo, oab, polo) VALUES ${values.join(',')} ON CONFLICT DO NOTHING`,
          params
        );
        totalPartes += partes.length;
      }

      // Insert fases
      if (fases.length > 0) {
        const values = [];
        const params = [];
        let paramIdx = 1;
        for (const f of fases) {
          values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
          params.push(procId, proc.numero, f.data, f.hora, f.texto, f.codigo_cnj);
        }
        await client.query(
          `INSERT INTO stj_fases (processo, numero, data, hora, texto, codigo_cnj) VALUES ${values.join(',')}`,
          params
        );
        totalFases += fases.length;
      }

      // Insert decisoes
      if (decisoes.length > 0) {
        const values = [];
        const params = [];
        let paramIdx = 1;
        for (const d of decisoes) {
          values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
          params.push(procId, proc.numero, d.registro, d.data, d.tipo);
        }
        await client.query(
          `INSERT INTO stj_decisoes_detalhe (processo, numero, registro, data, tipo) VALUES ${values.join(',')}`,
          params
        );
        totalDecisoes += decisoes.length;
      }

      success++;
      const pct = ((i + 1) / processos.length * 100).toFixed(1);
      if ((i + 1) % 10 === 0 || i === 0) {
        log(`[${pct}%] ${i + 1}/${processos.length} | ${procId} | ${partes.length} partes | ${fases.length} fases | ${decisoes.length} decisões | total: ${totalPartes}p ${totalFases}f ${totalDecisoes}d | erros: ${errors}`);
      }

      // Backup CSV a cada 500 processos
      if ((i + 1) % 500 === 0) {
        log(`Gerando backup CSV intermediário (${i + 1} processos)...`);
        await exportCSV(client);
      }

    } catch (err) {
      errors++;
      log(`ERRO ${proc.classe} ${proc.numero}: ${err.message}`);
    }

    // Delay between requests
    if (i < processos.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  log(`\n=== FINALIZADO ===`);
  log(`Sucesso: ${success} | Erros: ${errors} | Partes: ${totalPartes} | Fases: ${totalFases} | Decisões: ${totalDecisoes}`);

  // Final counts
  const cPartes = await client.query('SELECT COUNT(*) FROM stj_partes');
  const cFases = await client.query('SELECT COUNT(*) FROM stj_fases');
  const cDecisoes = await client.query('SELECT COUNT(*) FROM stj_decisoes_detalhe');
  log(`stj_partes: ${cPartes.rows[0].count} | stj_fases: ${cFases.rows[0].count} | stj_decisoes_detalhe: ${cDecisoes.rows[0].count}`);

  // === BACKUP CSV ===
  await exportCSV(client);

  await client.end();
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
