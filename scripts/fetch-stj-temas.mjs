/**
 * fetch-stj-temas.mjs — Camada 1A STJ
 * Extrai todos os 1420 temas repetitivos do STJ
 *
 * Usage: node scripts/fetch-stj-temas.mjs [--test]
 */

import pg from 'pg';
const { Client } = pg;
import { Buffer } from 'buffer';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const DB_URL = 'postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres';
const BASE = 'https://processo.stj.jus.br/repetitivos/temas_repetitivos';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const PER_PAGE = 100;
const TEST_MODE = process.argv.includes('--test');

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS stj_temas (
  id bigserial PRIMARY KEY,
  numero integer UNIQUE,
  tipo text DEFAULT 'repetitivo',
  situacao text,
  orgao_julgador text,
  ramo_direito text,
  questao text,
  tese_firmada text,
  anotacoes text,
  delimitacao text,
  repercussao_geral text,
  link_stf_rg text,
  assuntos text[],
  processos_afetados jsonb,
  data_afetacao date,
  data_julgamento date,
  data_acordao date,
  data_transito date,
  relator text,
  tribunal_origem text,
  ultima_atualizacao text,
  raw_source text DEFAULT 'stj_repetitivos',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stj_temas_numero ON stj_temas(numero);
CREATE INDEX IF NOT EXISTS idx_stj_temas_situacao ON stj_temas(situacao);
`;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Fetch with ISO-8859-1 decode ────────────────────────

async function fetchPage(url, cookies) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Cookie': cookies,
      'Referer': `${BASE}/pesquisa.jsp?novaConsulta=true&tipo_pesquisa=T`,
      'Accept-Charset': 'ISO-8859-1,utf-8',
    },
    signal: AbortSignal.timeout(60000),
  });
  const buf = await res.arrayBuffer();
  // Decode as latin1 (ISO-8859-1)
  const html = new TextDecoder('latin1').decode(new Uint8Array(buf));
  return { status: res.status, html };
}

// ── Parser ──────────────────────────────────────────────

function extractBetween(text, startLabel, endLabels) {
  const startIdx = text.indexOf(startLabel);
  if (startIdx === -1) return null;
  const after = text.slice(startIdx + startLabel.length);

  let endIdx = after.length;
  for (const end of endLabels) {
    const idx = after.indexOf(end);
    if (idx > -1 && idx < endIdx) endIdx = idx;
  }

  return after.slice(0, endIdx).trim().replace(/\s+/g, ' ');
}

function parseDate(s) {
  if (!s) return null;
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function normalizeSituacao(s) {
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.includes('trânsito') || lower.includes('transito')) return 'transito_em_julgado';
  if (lower.includes('julgado') || lower.includes('acórdão')) return 'julgado';
  if (lower.includes('afetado') || lower.includes('afetação')) return 'afetado';
  if (lower.includes('suspenso')) return 'suspenso';
  if (lower.includes('desafetado')) return 'desafetado';
  if (lower.includes('pendente')) return 'pendente';
  return s.trim().slice(0, 100);
}

function parseDocumentos(html) {
  const temas = [];

  // Strip scripts and styles
  const cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Split by "Documento N" markers
  const docParts = cleaned.split(/Documento\s+\d+/i);

  for (let i = 1; i < docParts.length; i++) {
    const block = docParts[i];

    // Strip HTML tags for text extraction
    const text = block
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const tema = {};

    // Tema number
    const temaNum = text.match(/Tema\s+(?:Repetitivo\s+)?(\d+)/i)
      || text.match(/Tema\s+n[º°]\s*(\d+)/i);
    if (!temaNum) continue;
    tema.numero = parseInt(temaNum[1]);

    // Fields extracted by label
    tema.situacao = normalizeSituacao(
      extractBetween(text, 'Situação', ['Órgão julgador', 'Ramo do direito', 'Questão'])
      || extractBetween(text, 'Situa\u00e7\u00e3o', ['Órgão', 'Ramo', 'Quest'])
    );

    tema.orgao_julgador = extractBetween(text,
      'Órgão julgador', ['Ramo do direito', 'Questão submetida'])
      || extractBetween(text, 'Órgão Julgador', ['Ramo', 'Quest']);

    tema.ramo_direito = extractBetween(text,
      'Ramo do direito', ['Questão submetida', 'Tese Firmada']);

    tema.questao = extractBetween(text,
      'Questão submetida a julgamento', ['Tese Firmada', 'Anotações NUGEPNAC', 'Delimitação', 'Repercussão']);

    tema.tese_firmada = extractBetween(text,
      'Tese Firmada', ['Anotações NUGEPNAC', 'Delimitação', 'Repercussão Geral', 'REsp', 'AgInt', 'AgRg']);

    tema.anotacoes = extractBetween(text,
      'Anotações NUGEPNAC', ['Delimitação do Julgado', 'Repercussão Geral', 'REsp', 'AgInt']);

    tema.delimitacao = extractBetween(text,
      'Delimitação do Julgado', ['Repercussão Geral', 'REsp', 'AgInt']);

    // Repercussão Geral — extract tema STF link
    const rgText = extractBetween(text,
      'Repercussão Geral', ['REsp', 'AgInt', 'AgRg', 'Tribunal de Origem']);
    tema.repercussao_geral = rgText;
    const stfTema = rgText?.match(/Tema\s+(\d+)\/STF/i);
    tema.link_stf_rg = stfTema ? `Tema ${stfTema[1]}/STF` : null;

    // Assuntos
    const assuntos = [];
    const assuntoBlock = extractBetween(text, 'Assuntos', ['Selecionar', 'Tema Repetitivo']);
    if (assuntoBlock) {
      const parts = assuntoBlock.match(/\(\d+\)\s*([^;(]+)/g) || [];
      for (const p of parts) {
        const m = p.match(/\(\d+\)\s*(.+)/);
        if (m) assuntos.push(m[1].trim().replace(/\.$/, ''));
      }
    }
    tema.assuntos = assuntos;

    // Processos afetados — look for REsp/AG patterns
    const processos = [];
    const procMatches = [...text.matchAll(/(REsp|AgInt|AgRg|EREsp|CC|MS|Pet)\s+(\d+)\/([A-Z]{2})/gi)];
    const seen = new Set();
    for (const pm of procMatches) {
      const key = `${pm[1]}_${pm[2]}_${pm[3]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      processos.push({ classe: pm[1], numero: pm[2], uf: pm[3] });
    }
    tema.processos_afetados = processos;

    // Relator — first occurrence
    const relMatch = text.match(/Relator\s+([A-ZÃÁÂÀÉÊÍÓÔÕÚÇ\s]+?)(?=\s+Embargos|\s+Afetação|\s+Julgado|\s+Acórdão)/i);
    tema.relator = relMatch ? relMatch[1].trim() : null;

    // Tribunal de Origem — first occurrence
    const tribMatch = text.match(/Tribunal de Origem\s+(\S+)/i);
    tema.tribunal_origem = tribMatch ? tribMatch[1].trim() : null;

    // Dates
    const afetMatch = text.match(/Afetação\s+(\d{2}\/\d{2}\/\d{4})/i);
    tema.data_afetacao = parseDate(afetMatch?.[1]);

    const julgMatch = text.match(/Julgado em\s+(\d{2}\/\d{2}\/\d{4})/i);
    tema.data_julgamento = parseDate(julgMatch?.[1]);

    const acordMatch = text.match(/Acórdão publicado em\s+(\d{2}\/\d{2}\/\d{4})/i);
    tema.data_acordao = parseDate(acordMatch?.[1]);

    const transitoMatch = text.match(/Trânsito em Julgado\s+(\d{2}\/\d{2}\/\d{4})/i);
    tema.data_transito = parseDate(transitoMatch?.[1]);

    // Última atualização
    const updMatch = text.match(/Última atualização:\s*(\d{2}\/\d{2}\/\d{4})/i);
    tema.ultima_atualizacao = updMatch ? updMatch[1] : null;

    temas.push(tema);
  }

  return temas;
}

// ── Main ────────────────────────────────────────────────

async function main() {
  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const keepalive = setInterval(() => { db.query('SELECT 1').catch(() => {}); }, 30000);

  await db.query(CREATE_TABLE);
  console.log('Table stj_temas ready.');

  // Step 1: Get session cookie
  console.log('Getting session...');
  const r0 = await fetch(`${BASE}/pesquisa.jsp?novaConsulta=true&tipo_pesquisa=T`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(30000),
  });
  const cookies = (r0.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
  const body0 = await r0.text();

  const totalMatch = body0.match(/(\d+)\s*documentos?\s*encontrados/i);
  const totalDocs = totalMatch ? parseInt(totalMatch[1]) : 0;
  console.log(`Total temas: ${totalDocs}`);

  // Test mode
  if (TEST_MODE) {
    const { html } = await fetchPage(`${BASE}/pesquisa.jsp?&l=${PER_PAGE}&i=1`, cookies);
    const temas = parseDocumentos(html);
    console.log(`[TEST] Parsed ${temas.length} temas from page 1 (l=${PER_PAGE})`);
    temas.slice(0, 3).forEach(t => {
      console.log(`\n  Tema ${t.numero}:`);
      console.log(`    Situação: ${t.situacao}`);
      console.log(`    Órgão: ${t.orgao_julgador}`);
      console.log(`    Ramo: ${t.ramo_direito}`);
      console.log(`    Questão: ${(t.questao || '').slice(0, 120)}...`);
      console.log(`    Tese: ${(t.tese_firmada || '').slice(0, 120)}...`);
      console.log(`    Relator: ${t.relator}`);
      console.log(`    Tribunal: ${t.tribunal_origem}`);
      console.log(`    Afetação: ${t.data_afetacao}`);
      console.log(`    Julgamento: ${t.data_julgamento}`);
      console.log(`    Trânsito: ${t.data_transito}`);
      console.log(`    RG STF: ${t.link_stf_rg}`);
      console.log(`    Processos: ${JSON.stringify(t.processos_afetados)}`);
      console.log(`    Assuntos: ${t.assuntos?.join('; ')}`);
    });
    clearInterval(keepalive);
    await db.end();
    return;
  }

  // Step 2: Paginate
  const t0 = Date.now();
  let totalParsed = 0, totalInserted = 0, totalErrors = 0;
  const pages = Math.ceil(totalDocs / PER_PAGE);
  console.log(`Pages: ${pages}`);

  for (let page = 0; page < pages; page++) {
    const startIdx = page * PER_PAGE + 1;
    const { status, html } = await fetchPage(`${BASE}/pesquisa.jsp?&l=${PER_PAGE}&i=${startIdx}`, cookies);

    if (status !== 200) {
      console.error(`  Page ${page + 1}: HTTP ${status} — skipping`);
      continue;
    }

    const temas = parseDocumentos(html);
    totalParsed += temas.length;

    for (const t of temas) {
      try {
        await db.query(
          `INSERT INTO stj_temas (numero, tipo, situacao, orgao_julgador, ramo_direito, questao, tese_firmada,
            anotacoes, delimitacao, repercussao_geral, link_stf_rg, assuntos, processos_afetados,
            data_afetacao, data_julgamento, data_acordao, data_transito, relator, tribunal_origem, ultima_atualizacao)
           VALUES ($1,'repetitivo',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
           ON CONFLICT (numero) DO UPDATE SET
             situacao=EXCLUDED.situacao, tese_firmada=EXCLUDED.tese_firmada, questao=EXCLUDED.questao,
             data_julgamento=COALESCE(EXCLUDED.data_julgamento, stj_temas.data_julgamento),
             data_transito=COALESCE(EXCLUDED.data_transito, stj_temas.data_transito),
             processos_afetados=EXCLUDED.processos_afetados, ultima_atualizacao=EXCLUDED.ultima_atualizacao,
             link_stf_rg=COALESCE(EXCLUDED.link_stf_rg, stj_temas.link_stf_rg),
             updated_at=now()`,
          [t.numero, t.situacao, t.orgao_julgador, t.ramo_direito, t.questao, t.tese_firmada,
           t.anotacoes, t.delimitacao, t.repercussao_geral, t.link_stf_rg,
           t.assuntos || [], JSON.stringify(t.processos_afetados || []),
           t.data_afetacao, t.data_julgamento, t.data_acordao, t.data_transito,
           t.relator, t.tribunal_origem, t.ultima_atualizacao]
        );
        totalInserted++;
      } catch (e) {
        totalErrors++;
        if (totalErrors <= 10) console.error(`  ERR tema ${t.numero}: ${e.message?.slice(0, 100)}`);
      }
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`  [${ts}] Page ${page + 1}/${pages} (i=${startIdx}) — ${temas.length} parsed, running: ${totalParsed}/${totalDocs} — ${totalInserted} inserted, ${totalErrors} err — ${elapsed}s`);

    await sleep(2000);
  }

  // Final stats
  console.log('\n=== FINAL STATS ===');

  const total = await db.query('SELECT COUNT(*) as n FROM stj_temas');
  console.log(`Total in table: ${total.rows[0].n}`);

  const bySituacao = await db.query('SELECT situacao, COUNT(*) as n FROM stj_temas GROUP BY situacao ORDER BY n DESC');
  console.log('\nBy situação:');
  bySituacao.rows.forEach(r => console.log(`  ${r.situacao || 'NULL'}: ${r.n}`));

  const byRamo = await db.query('SELECT ramo_direito, COUNT(*) as n FROM stj_temas WHERE ramo_direito IS NOT NULL GROUP BY ramo_direito ORDER BY n DESC LIMIT 10');
  console.log('\nTop 10 ramos do direito:');
  byRamo.rows.forEach(r => console.log(`  ${r.ramo_direito?.slice(0, 60)}: ${r.n}`));

  const comTese = await db.query("SELECT COUNT(*) as n FROM stj_temas WHERE tese_firmada IS NOT NULL AND tese_firmada != ''");
  const semTese = await db.query("SELECT COUNT(*) as n FROM stj_temas WHERE tese_firmada IS NULL OR tese_firmada = ''");
  console.log(`\nCom tese firmada: ${comTese.rows[0].n}`);
  console.log(`Sem tese (pendentes): ${semTese.rows[0].n}`);

  const comRG = await db.query("SELECT COUNT(*) as n FROM stj_temas WHERE link_stf_rg IS NOT NULL");
  console.log(`Com link STF (RG): ${comRG.rows[0].n}`);

  console.log(`\nParsed: ${totalParsed} | Inserted: ${totalInserted} | Errors: ${totalErrors}`);

  clearInterval(keepalive);
  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
