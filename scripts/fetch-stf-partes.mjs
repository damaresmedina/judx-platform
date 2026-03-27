/**
 * fetch-stf-partes.mjs — Extrai partes do portal STF para decisões favoráveis
 * Fonte: stf_decisoes WHERE resultado favorável AND incidente IS NOT NULL
 * Endpoint: https://portal.stf.jus.br/processos/abaPartes.asp?incidente={N}
 * Destino: stf_partes no Supabase
 *
 * Usage: node scripts/fetch-stf-partes.mjs [--limit N]
 */

import pg from 'pg';
const { Client } = pg;

// STF portal has broken SSL chain
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const DB_URL = 'postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres';
const PORTAL_URL = 'https://portal.stf.jus.br/processos/abaPartes.asp?incidente=';
const RATE_MS = 100; // 10 req/s
const BATCH_DB = 50;

const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);

// ── Table creation ───────────────────────────────────────

const CREATE_SQL = `
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
CREATE INDEX IF NOT EXISTS idx_stf_partes_tipo ON stf_partes(tipo);
CREATE INDEX IF NOT EXISTS idx_stf_partes_papel ON stf_partes(papel);
ALTER TABLE stf_partes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "stf_partes_service" ON stf_partes FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

// ── Classification ───────────────────────────────────────

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

  // OAB numbers in nome
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

// ── HTML Parser ──────────────────────────────────────────

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
  // Remove tags, keep structure via newlines
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(div|span|p|td|tr|table|tbody|thead|th|a|b|strong|i|em|font|ul|li|ol|h\d|section|article|header|footer|nav|main|aside|script|style|link|meta|title|head|html|body|form|input|button|select|option|textarea|label|fieldset|legend|img|hr)[^>]*>/gi, '\n')
    .replace(/&nbsp;?/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let currentPapel = null;
  for (const line of lines) {
    // Check if this line is a role label
    const normalized = normalizePapel(line);
    const isRole = Object.values(PAPEL_MAP).includes(normalized) ||
      /^(REQTE|REQDO|AUTOR|REU|INTDO|ADV|PROC|AM_CURIAE|ASSIST|COATOR|IMPTE|IMPDO|PACTE)/.test(normalized);

    if (isRole && line.length < 30) {
      currentPapel = normalized;
      continue;
    }

    // Skip very short lines or navigation stuff
    if (line.length < 3) continue;
    if (/^(Pesquisa|Processo|Número|Classe|Origem|Relator)/.test(line)) continue;

    if (currentPapel && line.length >= 3) {
      // Clean name
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

// ── Fetch with rate limit ────────────────────────────────

async function fetchPartes(incidente) {
  const url = PORTAL_URL + incidente;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': `https://portal.stf.jus.br/processos/detalhe.asp?incidente=${incidente}`,
    },
  });
  if (!res.ok) return [];
  const html = await res.text();
  return parsePartesHtml(html);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ─────────────────────────────────────────────────

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // Create table
  await client.query(CREATE_SQL);
  console.log('Table stf_partes ready.');

  // Get distinct incidentes from favorable decisions
  const q = await client.query(`
    SELECT DISTINCT incidente, processo
    FROM stf_decisoes
    WHERE descricao_andamento IN (
      'Procedente','Provido','Concedida a ordem',
      'Concedida a ordem de ofício','Deferido',
      'Procedente em parte','Provido em parte',
      'Agravo regimental provido','Liminar referendada'
    )
    AND incidente IS NOT NULL
    ORDER BY incidente
    ${LIMIT > 0 ? `LIMIT ${LIMIT}` : ''}
  `);

  const incidentes = q.rows;
  console.log(`Incidentes to fetch: ${incidentes.length}`);

  let fetched = 0;
  let inserted = 0;
  let errors = 0;
  const t0 = Date.now();

  for (let i = 0; i < incidentes.length; i++) {
    const { incidente, processo } = incidentes[i];

    try {
      const partes = await fetchPartes(incidente);

      if (partes.length > 0) {
        // Batch insert
        const values = [];
        const placeholders = [];
        let idx = 1;

        for (const p of partes) {
          placeholders.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5})`);
          values.push(incidente, processo, p.papel, p.nome, p.tipo, p.oab);
          idx += 6;
        }

        const sql = `
          INSERT INTO stf_partes (incidente, processo, papel, nome, tipo, oab)
          VALUES ${placeholders.join(',')}
          ON CONFLICT (incidente, papel, nome) DO NOTHING
        `;
        const res = await client.query(sql, values);
        inserted += res.rowCount;
      }

      fetched++;
    } catch (e) {
      errors++;
      if (errors <= 3) console.error(`  Error on ${incidente}:`, e.message);
    }

    // Rate limit
    await sleep(RATE_MS);

    // Progress
    if ((i + 1) % 50 === 0 || i + 1 === incidentes.length) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      const rate = (fetched / (elapsed || 1)).toFixed(1);
      console.log(`  ${i + 1}/${incidentes.length} — ${fetched} fetched, ${inserted} partes inserted, ${errors} errors — ${elapsed}s (${rate}/s)`);
    }
  }

  // Final stats
  const stats = await client.query(`
    SELECT tipo, COUNT(*) as n FROM stf_partes GROUP BY tipo ORDER BY n DESC
  `);
  const total = await client.query('SELECT COUNT(*) as n FROM stf_partes');

  console.log(`\n=== DONE ===`);
  console.log(`  Fetched: ${fetched}`);
  console.log(`  Partes inserted: ${inserted}`);
  console.log(`  Total in table: ${total.rows[0].n}`);
  console.log(`  Errors: ${errors}`);
  console.log(`\n=== By tipo ===`);
  stats.rows.forEach(r => console.log(`  ${r.tipo}: ${r.n}`));

  // 5 examples
  console.log('\n=== 5 exemplos ===');
  const ex = await client.query(`
    SELECT incidente, processo, papel, nome, tipo, oab
    FROM stf_partes ORDER BY id LIMIT 5
  `);
  ex.rows.forEach((r, i) => {
    console.log(`  [${i+1}] ${r.processo} (inc ${r.incidente})`);
    console.log(`      ${r.papel}: ${r.nome}`);
    console.log(`      tipo: ${r.tipo}${r.oab ? ' | OAB: ' + r.oab : ''}`);
  });

  await client.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
