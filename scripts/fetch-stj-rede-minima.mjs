/**
 * fetch-stj-rede-minima.mjs — Etapa 1: enriquece processos-semente
 * Re-extrai da página de temas (já funciona) com parser granular por processo
 *
 * Usage: node scripts/fetch-stj-rede-minima.mjs [--test] [--limit=N]
 */

import pg from 'pg';
const { Client } = pg;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const DB_URL = 'postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres';
const BASE = 'https://processo.stj.jus.br/repetitivos/temas_repetitivos';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const PER_PAGE = 100;
const TEST_MODE = process.argv.includes('--test');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS stj_processos_semente (
  id bigserial PRIMARY KEY,
  tema_numero integer,
  processo text,
  classe text,
  numero text,
  uf_origem text,
  tribunal_origem text,
  relator text,
  rrc boolean,
  data_afetacao date,
  data_julgamento date,
  data_acordao date,
  data_transito date,
  dias_ate_afetacao integer,
  observacao text,
  tipo text DEFAULT 'semente',
  raw_source text DEFAULT 'stj_repetitivos',
  created_at timestamptz DEFAULT now(),
  UNIQUE(tema_numero, processo)
);
CREATE INDEX IF NOT EXISTS idx_stj_semente_tema ON stj_processos_semente(tema_numero);
CREATE INDEX IF NOT EXISTS idx_stj_semente_trib ON stj_processos_semente(tribunal_origem);
`;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseDate(s) {
  if (!s) return null;
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

// ── Parser: extract per-process details from tema page ──

function parseProcessosFromTemaBlock(text, temaNumero) {
  const processos = [];

  // Split by process references (REsp, EREsp, AgInt, etc.)
  const procPattern = /((?:REsp|EREsp|AgInt|AgRg|CC|MS|Pet)\s+\d+\/[A-Z]{2})/g;
  const matches = [...text.matchAll(procPattern)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const procName = match[1];
    const startIdx = match.index;
    const endIdx = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const block = text.slice(startIdx, endIdx);

    // Parse class/number/UF
    const pMatch = procName.match(/(REsp|EREsp|AgInt|AgRg|CC|MS|Pet)\s+(\d+)\/([A-Z]{2})/);
    if (!pMatch) continue;

    const proc = {
      tema_numero: temaNumero,
      processo: procName,
      classe: pMatch[1],
      numero: pMatch[2],
      uf_origem: pMatch[3],
    };

    // Tribunal de Origem
    const trib = block.match(/Tribunal de Origem\s+(\S+)/i);
    proc.tribunal_origem = trib ? trib[1].trim() : null;

    // Relator
    const rel = block.match(/Relator\s+([A-ZÃÁÂÀÉÊÍÓÔÕÚÇ\s]+?)(?=\s*(?:Embargos|Afetação|Julgado|Acórdão|Processo|$))/i);
    proc.relator = rel ? rel[1].trim() : null;

    // RRC
    const rrc = block.match(/RRC\s+(Sim|Não)/i);
    proc.rrc = rrc ? rrc[1].toLowerCase() === 'sim' : null;

    // Dates
    const afet = block.match(/Afetação\s+(\d{2}\/\d{2}\/\d{4})/i);
    proc.data_afetacao = parseDate(afet?.[1]);

    const julg = block.match(/Julgado em\s+(\d{2}\/\d{2}\/\d{4})/i);
    proc.data_julgamento = parseDate(julg?.[1]);

    const acord = block.match(/Acórdão publicado em\s+(\d{2}\/\d{2}\/\d{4})/i);
    proc.data_acordao = parseDate(acord?.[1]);

    const trans = block.match(/Trânsito em Julgado\s+(\d{2}\/\d{2}\/\d{4})/i);
    proc.data_transito = parseDate(trans?.[1]);

    // Observação (desafetação, etc.)
    const obs = block.match(/(Processo desafetado[^.]+\.|Observação:[^.]+\.)/i);
    proc.observacao = obs ? obs[1].trim() : null;

    processos.push(proc);
  }

  return processos;
}

function parseAllProcessos(html) {
  const all = [];

  // Clean HTML
  const cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Split by "Documento N"
  const docs = cleaned.split(/Documento\s+\d+/i);

  for (let i = 1; i < docs.length; i++) {
    const block = docs[i];
    const text = block
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Get tema number
    const temaMatch = text.match(/Tema\s+(?:Repetitivo\s+)?(\d+)/i);
    if (!temaMatch) continue;
    const temaNum = parseInt(temaMatch[1]);

    const processos = parseProcessosFromTemaBlock(text, temaNum);
    all.push(...processos);
  }

  return all;
}

// ── Main ────────────────────────────────────────────────

async function main() {
  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const keepalive = setInterval(() => { db.query('SELECT 1').catch(() => {}); }, 30000);

  await db.query(CREATE_TABLE);
  console.log('Table stj_processos_semente ready.');

  // Get session
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

  const pages = LIMIT > 0 ? Math.ceil(LIMIT / PER_PAGE) : Math.ceil(totalDocs / PER_PAGE);
  const t0 = Date.now();
  let totalParsed = 0, totalInserted = 0, totalErrors = 0;

  for (let page = 0; page < pages; page++) {
    const startIdx = page * PER_PAGE + 1;

    // Fetch with latin1 decode
    const r = await fetch(`${BASE}/pesquisa.jsp?&l=${PER_PAGE}&i=${startIdx}`, {
      headers: { 'User-Agent': UA, 'Cookie': cookies, 'Referer': `${BASE}/pesquisa.jsp?novaConsulta=true&tipo_pesquisa=T` },
      signal: AbortSignal.timeout(60000),
    });
    const buf = await r.arrayBuffer();
    const html = new TextDecoder('latin1').decode(new Uint8Array(buf));

    const processos = parseAllProcessos(html);
    totalParsed += processos.length;

    for (const p of processos) {
      try {
        await db.query(
          `INSERT INTO stj_processos_semente
            (tema_numero, processo, classe, numero, uf_origem, tribunal_origem,
             relator, rrc, data_afetacao, data_julgamento, data_acordao, data_transito, observacao)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (tema_numero, processo) DO UPDATE SET
             tribunal_origem=COALESCE(EXCLUDED.tribunal_origem, stj_processos_semente.tribunal_origem),
             relator=COALESCE(EXCLUDED.relator, stj_processos_semente.relator),
             rrc=COALESCE(EXCLUDED.rrc, stj_processos_semente.rrc),
             data_afetacao=COALESCE(EXCLUDED.data_afetacao, stj_processos_semente.data_afetacao),
             data_julgamento=COALESCE(EXCLUDED.data_julgamento, stj_processos_semente.data_julgamento)`,
          [p.tema_numero, p.processo, p.classe, p.numero, p.uf_origem,
           p.tribunal_origem, p.relator, p.rrc, p.data_afetacao,
           p.data_julgamento, p.data_acordao, p.data_transito, p.observacao]
        );
        totalInserted++;
      } catch (e) {
        totalErrors++;
        if (totalErrors <= 10) console.error(`  ERR ${p.processo}: ${e.message?.slice(0, 100)}`);
      }
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`  [${ts}] Page ${page + 1}/${pages} (i=${startIdx}) — ${processos.length} processos parsed, total: ${totalParsed} — ${totalInserted} inserted, ${totalErrors} err — ${elapsed}s`);

    if (TEST_MODE && page === 0) {
      console.log('\n[TEST] First 5 processos:');
      processos.slice(0, 5).forEach(p => {
        console.log(`\n  ${p.processo} (Tema ${p.tema_numero})`);
        console.log(`    Tribunal: ${p.tribunal_origem} | Relator: ${p.relator} | RRC: ${p.rrc}`);
        console.log(`    Afetação: ${p.data_afetacao} | Julgamento: ${p.data_julgamento} | Trânsito: ${p.data_transito}`);
        console.log(`    Obs: ${p.observacao || '—'}`);
      });
      break;
    }

    await sleep(2000);
  }

  // Stats
  console.log('\n=== STATS ===');
  const total = await db.query('SELECT COUNT(*) as n FROM stj_processos_semente');
  console.log(`Total in table: ${total.rows[0].n}`);

  const coverage = await db.query(`
    SELECT
      COUNT(*) as total,
      COUNT(tribunal_origem) as com_tribunal,
      COUNT(relator) as com_relator,
      COUNT(rrc) as com_rrc,
      COUNT(data_afetacao) as com_afetacao,
      COUNT(data_julgamento) as com_julgamento
    FROM stj_processos_semente
  `);
  const cv = coverage.rows[0];
  console.log(`  Com tribunal: ${cv.com_tribunal}/${cv.total}`);
  console.log(`  Com relator: ${cv.com_relator}/${cv.total}`);
  console.log(`  Com RRC: ${cv.com_rrc}/${cv.total}`);
  console.log(`  Com afetação: ${cv.com_afetacao}/${cv.total}`);
  console.log(`  Com julgamento: ${cv.com_julgamento}/${cv.total}`);

  const topTrib = await db.query(`
    SELECT tribunal_origem, COUNT(*) as n
    FROM stj_processos_semente WHERE tribunal_origem IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10
  `);
  console.log('\nTop tribunais de origem:');
  topTrib.rows.forEach(r => console.log(`  ${r.tribunal_origem}: ${r.n}`));

  // 3 examples
  console.log('\n=== 3 EXEMPLOS COMPLETOS ===');
  const ex = await db.query(`
    SELECT s.*, t.ramo_direito, t.situacao as tema_situacao, t.data_afetacao as tema_afetacao
    FROM stj_processos_semente s
    JOIN stj_temas t ON t.numero = s.tema_numero
    WHERE s.tribunal_origem IS NOT NULL AND s.relator IS NOT NULL AND s.data_afetacao IS NOT NULL
    ORDER BY s.data_afetacao DESC
    LIMIT 3
  `);
  for (const r of ex.rows) {
    const afet = r.data_afetacao ? new Date(r.data_afetacao).toISOString().slice(0,10) : '?';
    const julg = r.data_julgamento ? new Date(r.data_julgamento).toISOString().slice(0,10) : 'pendente';
    console.log(`\n  ${r.processo} — Tema ${r.tema_numero} (${r.tema_situacao})`);
    console.log(`    Ramo: ${r.ramo_direito}`);
    console.log(`    Tribunal: ${r.tribunal_origem} | Relator: ${r.relator} | RRC: ${r.rrc}`);
    console.log(`    Afetação: ${afet} | Julgamento: ${julg}`);
    console.log(`    Obs: ${r.observacao || '—'}`);
  }

  clearInterval(keepalive);
  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
