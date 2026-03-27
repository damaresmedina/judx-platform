/**
 * fetch-stf-partes-favoraveis.mjs
 * Extrai partes do portal STF para decisões com resultado favorável.
 * Usage: node scripts/fetch-stf-partes-favoraveis.mjs [--limit=N]
 */

import pg from 'pg';
const { Client } = pg;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const DB_URL = 'postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres';
const PORTAL_URL = 'https://portal.stf.jus.br/processos/abaPartes.asp?incidente=';
const RATE_MS = 200; // 5 req/s
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);

// ── Papéis do portal STF ─────────────────────────────────

const PAPEIS = [
  'REQTE.(S)', 'REQDO.(A/S)', 'AUTOR(A/S)(ES)', 'RÉU(É)(S)',
  'INTDO.(A/S)', 'ADV.(A/S)', 'PROC.(A/S)(ES)', 'AM. CURIAE',
  'AGDO.(A/S)', 'AGTE.(S)', 'IMPTE.(S)', 'IMPDO.(A/S)',
  'PACTE.(S)', 'COATOR(A/S)', 'RELATOR(A)',
  'APDO.(A/S)', 'APTE.(S)', 'RECTE.(S)', 'RECDO.(A/S)',
  'ASSTE.(S)', 'SSTDO.(A/S)', 'LITISCONSORTE(S)',
  'EXEC.(S)', 'EXDO.(A/S)', 'EMBTE.(S)', 'EMBDO.(A/S)',
];

const POLO = {
  'REQTE.(S)': 'ativo', 'AUTOR(A/S)(ES)': 'ativo',
  'AGTE.(S)': 'ativo', 'IMPTE.(S)': 'ativo',
  'PACTE.(S)': 'ativo', 'RECTE.(S)': 'ativo',
  'APTE.(S)': 'ativo', 'EMBTE.(S)': 'ativo',
  'EXEC.(S)': 'ativo',
  'REQDO.(A/S)': 'passivo', 'RÉU(É)(S)': 'passivo',
  'AGDO.(A/S)': 'passivo', 'IMPDO.(A/S)': 'passivo',
  'COATOR(A/S)': 'passivo', 'RECDO.(A/S)': 'passivo',
  'APDO.(A/S)': 'passivo', 'EMBDO.(A/S)': 'passivo',
  'EXDO.(A/S)': 'passivo', 'SSTDO.(A/S)': 'passivo',
  'INTDO.(A/S)': 'terceiro', 'AM. CURIAE': 'terceiro',
  'LITISCONSORTE(S)': 'terceiro', 'ASSTE.(S)': 'terceiro',
  'ADV.(A/S)': 'advogado', 'PROC.(A/S)(ES)': 'advogado',
  'RELATOR(A)': 'terceiro',
};

// Build a set of all papel strings for fast lookup (case-insensitive)
const PAPEIS_UPPER = new Set(PAPEIS.map(p => p.toUpperCase()));
// Also map uppercase → original for normalization
const PAPEIS_NORM = {};
PAPEIS.forEach(p => { PAPEIS_NORM[p.toUpperCase()] = p; });

function matchPapel(line) {
  const trimmed = line.trim();
  const upper = trimmed.toUpperCase();
  if (PAPEIS_UPPER.has(upper)) return PAPEIS_NORM[upper];
  // Try without trailing whitespace variations
  for (const p of PAPEIS) {
    if (upper === p.toUpperCase()) return p;
    // Some pages have slight variations like extra spaces
    if (upper.replace(/\s+/g, ' ') === p.toUpperCase().replace(/\s+/g, ' ')) return p;
  }
  return null;
}

// ── Classification ───────────────────────────────────────

const ENTE_PUBLICO = [
  'ESTADO DE','ESTADO DO','MUNICÍPIO','MUNICIPIO','UNIÃO',
  'GOVERNO','GOVERNADOR','FAZENDA','MINISTÉRIO','MINISTERIO',
  'PROCURADOR','ADVOGADO-GERAL','DEFENSORIA','TRIBUNAL',
  'CÂMARA','SENADO','CONGRESSO','ASSEMBLEIA','PRESIDENTE DA REPÚBLICA',
  'INSTITUTO NACIONAL','INSS','IBAMA','INCRA','FUNAI',
  'DISTRITO FEDERAL','PROCURADORIA','SECRETARIA','AGÊNCIA',
  'AUTARQUIA','CAIXA ECONÔMICA','BNDES','MINISTRO DE ESTADO',
  'CONSELHO NACIONAL','DNIT','ANATEL','ANVISA','ANEEL',
];
const PJ_PATTERNS = [
  'ASSOCIAÇÃO','ASSOCIACAO','LTDA','S.A.','S/A','EMPRESA',
  'BANCO','FEDERAÇÃO','FEDERACAO','CONFEDERAÇÃO','CONFEDERACAO',
  'SINDICATO','PARTIDO','CONSELHO FEDERAL','FUNDAÇÃO','FUNDACAO',
  'COOPERATIVA','COMPANHIA','CONDOMÍNIO','ORGANIZAÇÃO','ORDEM DOS',
  'ADVOGADOS ASSOCIADOS',
];

function classifyTipo(nome, papel) {
  const upper = (nome ?? '').toUpperCase();
  const polo = POLO[papel] ?? '';
  if (polo === 'advogado') return 'oab';
  if (/\(\d+[A-Z]?\/[A-Z]{2}/.test(nome ?? '')) return 'oab';
  if (ENTE_PUBLICO.some(p => upper.includes(p))) return 'ente_publico';
  if (PJ_PATTERNS.some(p => upper.includes(p))) return 'pessoa_juridica';
  return 'pessoa_fisica';
}

function extractOab(nome) {
  if (!nome) return null;
  const m = nome.match(/\(([^)]+\/[A-Z]{2}[^)]*)\)/);
  return m ? m[1] : null;
}

// ── HTML Parser ──────────────────────────────────────────

function parsePartesHtml(html) {
  const partes = [];
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(div|span|p|td|tr|table|tbody|thead|th|a|b|strong|i|em|font|ul|li|ol|h\d|section|article|header|footer|nav|main|aside)[^>]*>/gi, '\n')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/&nbsp;?/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let currentPapel = null;
  for (const line of lines) {
    const papel = matchPapel(line);
    if (papel) {
      currentPapel = papel;
      continue;
    }

    if (!currentPapel) continue;
    if (line.length < 3) continue;
    // Skip navigation/search elements
    if (/^(Pesquisa|Processo|Número|Classe|Origem|Relator|Acompanhamento|Por Parte|Por Número)/i.test(line)) continue;

    const nome = line.replace(/\s+/g, ' ').trim();
    if (nome.length >= 3) {
      partes.push({
        papel: currentPapel,
        polo: POLO[currentPapel] ?? 'desconhecido',
        nome,
        tipo: classifyTipo(nome, currentPapel),
        oab: extractOab(nome),
      });
    }
  }

  return partes;
}

// ── Network ──────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPartes(incidente) {
  const res = await fetch(PORTAL_URL + incidente, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': `https://portal.stf.jus.br/processos/detalhe.asp?incidente=${incidente}`,
    },
  });
  if (!res.ok) return [];
  return parsePartesHtml(await res.text());
}

// ── Schema ───────────────────────────────────────────────

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS stf_partes_favoraveis (
  id bigserial PRIMARY KEY,
  incidente bigint NOT NULL,
  processo text,
  classe text,
  relator text,
  descricao_andamento text,
  data_decisao text,
  papel text,
  polo text,
  nome text,
  tipo text,
  oab text,
  UNIQUE(incidente, papel, nome)
);
CREATE INDEX IF NOT EXISTS idx_stf_pf_incidente ON stf_partes_favoraveis(incidente);
CREATE INDEX IF NOT EXISTS idx_stf_pf_papel ON stf_partes_favoraveis(papel);
CREATE INDEX IF NOT EXISTS idx_stf_pf_polo ON stf_partes_favoraveis(polo);
CREATE INDEX IF NOT EXISTS idx_stf_pf_tipo ON stf_partes_favoraveis(tipo);
CREATE INDEX IF NOT EXISTS idx_stf_pf_relator ON stf_partes_favoraveis(relator);
CREATE INDEX IF NOT EXISTS idx_stf_pf_classe ON stf_partes_favoraveis(classe);
ALTER TABLE stf_partes_favoraveis ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "stf_pf_service" ON stf_partes_favoraveis FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

// ── Main ─────────────────────────────────────────────────

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // Drop old table if exists (schema changed — added polo)
  await client.query('DROP TABLE IF EXISTS stf_partes_favoraveis CASCADE');
  await client.query(CREATE_SQL);
  console.log('Table stf_partes_favoraveis created.');

  // Get incidentes
  const q = await client.query(`
    SELECT DISTINCT ON (incidente)
      incidente, processo, classe, relator_decisao, descricao_andamento, data_decisao
    FROM stf_decisoes
    WHERE descricao_andamento IN (
      'Procedente','Provido','Concedida a ordem',
      'Concedida a ordem de ofício','Deferido',
      'Procedente em parte','Provido em parte',
      'Agravo regimental provido','Liminar referendada',
      'Decisão pela existência de repercussão geral',
      'Reconhecida a repercussão geral e julgado o mérito com reafirmação de jurisprudência predominante'
    )
    AND incidente IS NOT NULL
    ORDER BY incidente, data_decisao DESC
  `);

  let rows = q.rows;
  if (LIMIT > 0) rows = rows.slice(0, LIMIT);
  console.log(`Incidentes: ${rows.length} (of ${q.rows.length} total)`);

  let fetched = 0, inserted = 0, errors = 0;
  const t0 = Date.now();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    try {
      const partes = await fetchPartes(r.incidente);

      if (partes.length > 0) {
        const values = [];
        const ph = [];
        let idx = 1;
        for (const p of partes) {
          ph.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6},$${idx+7},$${idx+8},$${idx+9},$${idx+10})`);
          values.push(
            r.incidente, r.processo, r.classe, r.relator_decisao,
            r.descricao_andamento, r.data_decisao,
            p.papel, p.polo, p.nome, p.tipo, p.oab
          );
          idx += 11;
        }

        const res = await client.query(`
          INSERT INTO stf_partes_favoraveis
            (incidente, processo, classe, relator, descricao_andamento, data_decisao,
             papel, polo, nome, tipo, oab)
          VALUES ${ph.join(',')}
          ON CONFLICT (incidente, papel, nome) DO NOTHING
        `, values);
        inserted += res.rowCount;
      }
      fetched++;
    } catch (e) {
      errors++;
      if (errors <= 5) console.error(`  Error ${r.incidente}: ${(e.message ?? '').slice(0, 80)}`);
    }

    await sleep(RATE_MS);

    if ((i + 1) % 500 === 0 || i + 1 === rows.length) {
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`  ${i+1}/${rows.length} — ${fetched} ok, ${inserted} partes, ${errors} err — ${el}s`);
    }
  }

  // ── Analytics ────────────────────────────────────────
  console.log('\n=== RESULTADO ===');
  const tot = await client.query('SELECT COUNT(*) as n FROM stf_partes_favoraveis');
  console.log(`Total partes: ${tot.rows[0].n}`);

  const polos = await client.query('SELECT polo, COUNT(*) as n FROM stf_partes_favoraveis GROUP BY polo ORDER BY n DESC');
  console.log('\nPor polo:');
  polos.rows.forEach(r => console.log(`  ${r.polo}: ${r.n}`));

  const tipos = await client.query('SELECT tipo, COUNT(*) as n FROM stf_partes_favoraveis GROUP BY tipo ORDER BY n DESC');
  console.log('\nPor tipo:');
  tipos.rows.forEach(r => console.log(`  ${r.tipo}: ${r.n}`));

  // Check AGDO specifically
  const agdo = await client.query("SELECT papel, polo, COUNT(*) as n FROM stf_partes_favoraveis WHERE papel = 'AGDO.(A/S)' GROUP BY papel, polo");
  console.log('\nAGDO.(A/S) check:', agdo.rows.length > 0 ? `${agdo.rows[0].n} rows, polo=${agdo.rows[0].polo}` : 'nenhum encontrado');

  console.log('\n=== Top 20 advogados ===');
  const adv = await client.query(`
    SELECT nome, COUNT(DISTINCT incidente) as processos_ganhos,
      COUNT(DISTINCT relator) as relatores_distintos
    FROM stf_partes_favoraveis WHERE polo = 'advogado'
    GROUP BY nome ORDER BY processos_ganhos DESC LIMIT 20
  `);
  console.log(pad('Advogado', 60) + pad('Proc', 6) + 'Rel');
  console.log('-'.repeat(72));
  adv.rows.forEach(r => console.log(pad(r.nome.slice(0, 58), 60) + pad(String(r.processos_ganhos), 6) + r.relatores_distintos));

  console.log('\n=== Top 20 advogado × relator ===');
  const combo = await client.query(`
    SELECT nome, relator, COUNT(DISTINCT incidente) as processos_ganhos
    FROM stf_partes_favoraveis WHERE polo = 'advogado'
    GROUP BY nome, relator ORDER BY processos_ganhos DESC LIMIT 20
  `);
  console.log(pad('Advogado', 50) + pad('Relator', 30) + 'Proc');
  console.log('-'.repeat(85));
  combo.rows.forEach(r => console.log(pad(r.nome.slice(0, 48), 50) + pad((r.relator || '').slice(0, 28), 30) + r.processos_ganhos));

  await client.end();
}

function pad(s, n) { return (String(s) + ' '.repeat(n)).slice(0, n); }

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
