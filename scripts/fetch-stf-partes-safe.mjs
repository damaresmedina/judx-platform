/**
 * fetch-stf-partes-safe.mjs — Extrai partes de TODOS os incidentes STF
 * Rate-limited conservador para não levar ban.
 *
 * Usage: node scripts/fetch-stf-partes-safe.mjs [--limit=N] [--test]
 */

import pg from 'pg';
const { Client } = pg;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const DB_URL = 'postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres';
const PORTAL_URL = 'https://portal.stf.jus.br/processos/abaPartes.asp?incidente=';

// ── Conservative rate limit config ──────────────────────
const CONFIG = {
  concurrency: 3,
  delayMs: 400,
  pauseEvery: 500,
  pauseDuration: 60000,
  retryOn429: 300000,
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
  ]
};

const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);
const TEST_MODE = process.argv.includes('--test');

// ── Classification ──────────────────────────────────────

const ENTE_PUBLICO = [
  'ESTADO DE', 'ESTADO DO', 'MUNICÍPIO', 'MUNICIPIO', 'UNIÃO',
  'GOVERNO', 'GOVERNADOR', 'FAZENDA', 'MINISTÉRIO', 'MINISTERIO',
  'PROCURADOR', 'ADVOGADO-GERAL', 'DEFENSORIA', 'TRIBUNAL',
  'CÂMARA', 'SENADO', 'CONGRESSO', 'ASSEMBLEIA', 'PRESIDENTE DA REPÚBLICA',
  'INSTITUTO NACIONAL', 'INSS', 'IBAMA', 'INCRA', 'FUNAI',
  'DISTRITO FEDERAL', 'PROCURADORIA', 'SECRETARIA', 'AGÊNCIA',
];

const PJ = [
  'ASSOCIAÇÃO', 'ASSOCIACAO', 'LTDA', 'S.A.', 'S/A', 'EMPRESA',
  'BANCO', 'FEDERAÇÃO', 'FEDERACAO', 'CONFEDERAÇÃO', 'CONFEDERACAO',
  'SINDICATO', 'PARTIDO', 'CONSELHO', 'FUNDAÇÃO', 'FUNDACAO',
  'INSTITUTO', 'COOPERATIVA', 'COMPANHIA', 'CONDOMÍNIO',
  'ORGANIZAÇÃO', 'ORDEM DOS',
];

function classifyTipo(nome, papel) {
  const upper = (nome ?? '').toUpperCase();
  const papelUp = (papel ?? '').toUpperCase();
  if (/\(\d+\/[A-Z]{2}/.test(nome ?? '')) return 'oab';
  if (papelUp.includes('ADV')) return 'oab';
  if (papelUp.includes('PROC')) return 'ente_publico';
  if (ENTE_PUBLICO.some(p => upper.includes(p))) return 'ente_publico';
  if (PJ.some(p => upper.includes(p))) return 'pessoa_juridica';
  return 'pessoa_fisica';
}

function extractOab(nome) {
  if (!nome) return null;
  const m = nome.match(/\(([^)]+)\)/);
  return m ? m[1] : null;
}

// ── HTML Parser ─────────────────────────────────────────

const PAPEL_MAP = {
  'REQTE.': 'REQTE', 'REQTE.(S)': 'REQTE',
  'REQDO.': 'REQDO', 'REQDO.(A/S)': 'REQDO',
  'AUTOR(A/S)(ES)': 'AUTOR', 'AUTOR(ES)': 'AUTOR', 'AUTOR': 'AUTOR',
  'RÉU(É)(S)': 'REU', 'RÉU': 'REU', 'REU': 'REU',
  'INTDO.(A/S)': 'INTDO', 'INTDO.': 'INTDO',
  'ADV.(A/S)': 'ADV', 'ADV.': 'ADV',
  'PROC.(A/S)(ES)': 'PROC', 'PROC.': 'PROC',
  'AM. CURIAE': 'AM_CURIAE', 'AMICUS CURIAE': 'AM_CURIAE',
  'ASSIST.(S)': 'ASSIST', 'ASSIST.': 'ASSIST',
  'COATOR(A/S)(ES)': 'COATOR',
  'IMPTE.(S)': 'IMPTE', 'IMPTE.': 'IMPTE',
  'IMPDO.(A/S)': 'IMPDO', 'IMPDO.': 'IMPDO',
  'PACTE.(S)': 'PACTE', 'PACTE.': 'PACTE',
};

function normalizePapel(raw) {
  const trimmed = (raw ?? '').trim();
  return PAPEL_MAP[trimmed] ?? trimmed.replace(/[.()/]/g, '').trim().toUpperCase();
}

function parsePartesHtml(html) {
  const partes = [];
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(div|span|p|td|tr|table|tbody|thead|th|a|b|strong|i|em|font|ul|li|ol|h\d|section|article|header|footer|nav|main|aside|script|style|link|meta|title|head|html|body|form|input|button|select|option|textarea|label|fieldset|legend|img|hr)[^>]*>/gi, '\n')
    .replace(/&nbsp;?/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let currentPapel = null;
  for (const line of lines) {
    const normalized = normalizePapel(line);
    const isRole = Object.values(PAPEL_MAP).includes(normalized) ||
      /^(REQTE|REQDO|AUTOR|REU|INTDO|ADV|PROC|AM_CURIAE|ASSIST|COATOR|IMPTE|IMPDO|PACTE)/.test(normalized);

    if (isRole && line.length < 30) {
      currentPapel = normalized;
      continue;
    }

    if (line.length < 3) continue;
    if (/^(Pesquisa|Processo|Número|Classe|Origem|Relator)/.test(line)) continue;

    if (currentPapel && line.length >= 3) {
      const nome = line.replace(/\s+/g, ' ').trim();
      if (nome.length >= 3) {
        partes.push({
          papel: currentPapel,
          nome,
          tipo: classifyTipo(nome, currentPapel),
          oab: extractOab(nome),
        });
      }
    }
  }

  return partes;
}

// ── Fetch with concurrency control ──────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let uaIndex = 0;
function nextUA() {
  return CONFIG.userAgents[uaIndex++ % CONFIG.userAgents.length];
}

let totalRequests = 0;
let consecutive429 = 0;

async function fetchPartes(incidente) {
  totalRequests++;

  // Pause every N requests
  if (totalRequests > 1 && totalRequests % CONFIG.pauseEvery === 0) {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`  [${ts}] Cooling down (${CONFIG.pauseDuration / 1000}s pause after ${totalRequests} requests)...`);
    await sleep(CONFIG.pauseDuration);
  }

  const url = PORTAL_URL + incidente;
  const res = await fetch(url, {
    headers: {
      'User-Agent': nextUA(),
      'Referer': `https://portal.stf.jus.br/processos/detalhe.asp?incidente=${incidente}`,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 429 || res.status === 403) {
    consecutive429++;
    const waitMs = CONFIG.retryOn429 * consecutive429;
    const ts = new Date().toISOString().slice(11, 19);
    console.error(`  [${ts}] GOT ${res.status}! Waiting ${waitMs / 60000} min (attempt ${consecutive429})...`);
    await sleep(waitMs);
    return fetchPartes(incidente); // retry
  }

  consecutive429 = 0;
  if (!res.ok) return [];
  const html = await res.text();
  return parsePartesHtml(html);
}

// ── Concurrent batch processor ──────────────────────────

async function processBatch(items, client) {
  let fetched = 0, inserted = 0, errors = 0, empty = 0;

  for (let i = 0; i < items.length; i += CONFIG.concurrency) {
    const chunk = items.slice(i, i + CONFIG.concurrency);

    const results = await Promise.allSettled(
      chunk.map(async ({ incidente, processo }) => {
        const partes = await fetchPartes(incidente);

        if (partes.length === 0) {
          empty++;
          return 0;
        }

        const values = [];
        const placeholders = [];
        let idx = 1;
        for (const p of partes) {
          placeholders.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5})`);
          values.push(incidente, processo, p.papel, p.nome, p.tipo, p.oab);
          idx += 6;
        }

        const sql = `INSERT INTO stf_partes (incidente, processo, papel, nome, tipo, oab)
          VALUES ${placeholders.join(',')} ON CONFLICT (incidente, papel, nome) DO NOTHING`;
        const res = await client.query(sql, values);
        return res.rowCount;
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        fetched++;
        inserted += r.value;
      } else {
        errors++;
        if (errors <= 10) console.error(`  ERR:`, r.reason?.message?.slice(0, 100));
      }
    }

    // Delay between chunks
    await sleep(CONFIG.delayMs);
  }

  return { fetched, inserted, errors, empty };
}

// ── Main ────────────────────────────────────────────────

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // Keepalive
  const keepalive = setInterval(() => { client.query('SELECT 1').catch(() => {}); }, 30000);

  // Ensure table
  await client.query(`
    CREATE TABLE IF NOT EXISTS stf_partes (
      id bigserial PRIMARY KEY,
      incidente bigint NOT NULL,
      processo text,
      papel text,
      nome text,
      tipo text,
      oab text,
      raw_source text DEFAULT 'portal_stf',
      created_at timestamptz DEFAULT now(),
      UNIQUE(incidente, papel, nome)
    );
    CREATE INDEX IF NOT EXISTS idx_stf_partes_incidente ON stf_partes(incidente);
  `);

  // Get missing incidentes
  const q = await client.query(`
    SELECT DISTINCT d.incidente, MIN(d.processo) as processo
    FROM stf_decisoes d
    LEFT JOIN stf_partes p ON p.incidente = d.incidente
    WHERE d.incidente IS NOT NULL
      AND p.incidente IS NULL
    GROUP BY d.incidente
    ORDER BY d.incidente
    ${LIMIT > 0 ? `LIMIT ${LIMIT}` : ''}
  `);

  const items = q.rows;
  const ts0 = new Date().toISOString().slice(11, 19);
  console.log(`[${ts0}] Missing incidentes: ${items.length}`);
  if (TEST_MODE) console.log('[TEST MODE] Will process first 1000 only');

  const toProcess = TEST_MODE ? items.slice(0, 1000) : items;
  const t0 = Date.now();

  // Process in reporting chunks of 100
  let totalFetched = 0, totalInserted = 0, totalErrors = 0, totalEmpty = 0;

  for (let i = 0; i < toProcess.length; i += 100) {
    const chunk = toProcess.slice(i, i + 100);
    const r = await processBatch(chunk, client);
    totalFetched += r.fetched;
    totalInserted += r.inserted;
    totalErrors += r.errors;
    totalEmpty += r.empty;

    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    const done = i + chunk.length;
    const rate = (totalFetched / (elapsed || 1)).toFixed(1);
    const eta = ((toProcess.length - done) / (rate || 1) / 60).toFixed(0);
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`  [${ts}] ${done}/${toProcess.length} — ${totalFetched} fetched, ${totalInserted} partes, ${totalEmpty} empty, ${totalErrors} err — ${elapsed}s (${rate}/s, ETA ${eta}m)`);
  }

  // Final stats
  const stats = await client.query('SELECT tipo, COUNT(*) as n FROM stf_partes GROUP BY tipo ORDER BY n DESC');
  const total = await client.query('SELECT COUNT(*) as n FROM stf_partes');

  console.log(`\n=== DONE ===`);
  console.log(`  Fetched: ${totalFetched}`);
  console.log(`  Partes inserted: ${totalInserted}`);
  console.log(`  Empty pages: ${totalEmpty}`);
  console.log(`  Total in table: ${total.rows[0].n}`);
  console.log(`  Errors: ${totalErrors}`);
  console.log(`\n=== By tipo ===`);
  stats.rows.forEach(r => console.log(`  ${r.tipo}: ${r.n}`));

  clearInterval(keepalive);
  await client.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
