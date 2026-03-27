/**
 * fetch-stf-partes-completo.mjs
 * Extrai partes de TODOS os 117K incidentes do stf_decisoes.
 * Concorrência 40, skip já extraídos, progress a cada 1000.
 *
 * Usage: node scripts/fetch-stf-partes-completo.mjs
 */

import pg from 'pg';
const { Client } = pg;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const DB_URL = 'postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres';
const PORTAL = 'https://portal.stf.jus.br/processos/abaPartes.asp?incidente=';
const CONC = 10;
const DELAY_MS = 500; // 500ms between batches = ~20 req/s

// ── Papéis ───────────────────────────────────────────────

const PAPEIS = [
  'REQTE.(S)','REQDO.(A/S)','AUTOR(A/S)(ES)','RÉU(É)(S)',
  'INTDO.(A/S)','ADV.(A/S)','PROC.(A/S)(ES)','AM. CURIAE',
  'AGDO.(A/S)','AGTE.(S)','IMPTE.(S)','IMPDO.(A/S)',
  'PACTE.(S)','COATOR(A/S)','COATOR(A/S)(ES)',
  'RECLTE.(S)','RECLDO.(A/S)',
  'BENEF.(A/S)','APDO.(A/S)','APTE.(S)',
  'RECTE.(S)','RECDO.(A/S)','EMBTE.(S)','EMBDO.(A/S)',
  'LITISCONSORTE(S)','EXEC.(S)','EXDO.(A/S)',
  'ASSTE.(S)','SSTDO.(A/S)','RELATOR(A)',
  'AUT. POL.','MIN. PÚBLICA','CUSTOS LEGIS',
];

const POLO = {
  'REQTE.(S)':'ativo','AUTOR(A/S)(ES)':'ativo','AGTE.(S)':'ativo',
  'IMPTE.(S)':'ativo','PACTE.(S)':'ativo','RECTE.(S)':'ativo',
  'APTE.(S)':'ativo','EMBTE.(S)':'ativo','EXEC.(S)':'ativo','RECLTE.(S)':'ativo',
  'REQDO.(A/S)':'passivo','RÉU(É)(S)':'passivo','AGDO.(A/S)':'passivo',
  'IMPDO.(A/S)':'passivo','COATOR(A/S)':'passivo','COATOR(A/S)(ES)':'passivo',
  'RECDO.(A/S)':'passivo','APDO.(A/S)':'passivo','EMBDO.(A/S)':'passivo',
  'EXDO.(A/S)':'passivo','SSTDO.(A/S)':'passivo','RECLDO.(A/S)':'passivo',
  'INTDO.(A/S)':'terceiro','AM. CURIAE':'terceiro','LITISCONSORTE(S)':'terceiro',
  'ASSTE.(S)':'terceiro','BENEF.(A/S)':'terceiro','RELATOR(A)':'terceiro',
  'AUT. POL.':'terceiro','MIN. PÚBLICA':'terceiro','CUSTOS LEGIS':'terceiro',
  'ADV.(A/S)':'advogado','PROC.(A/S)(ES)':'advogado',
};

const PM = {}; PAPEIS.forEach(p => { PM[p.toUpperCase()] = p; });
function matchPapel(line) {
  const u = line.trim().toUpperCase();
  if (PM[u]) return PM[u];
  const n = u.replace(/\s+/g, ' ');
  for (const p of PAPEIS) if (n === p.toUpperCase().replace(/\s+/g, ' ')) return p;
  return null;
}

const ENTE = ['ESTADO DE','ESTADO DO','MUNICÍPIO','MUNICIPIO','UNIÃO','GOVERNO','GOVERNADOR','FAZENDA','MINISTÉRIO','MINISTERIO','PROCURADOR','ADVOGADO-GERAL','DEFENSORIA','TRIBUNAL','CÂMARA','SENADO','CONGRESSO','ASSEMBLEIA','PRESIDENTE','INSTITUTO NACIONAL','INSS','IBAMA','INCRA','FUNAI','DISTRITO FEDERAL','PROCURADORIA','AUTARQUIA','CAIXA ECONÔMICA'];
const PJP = ['ASSOCIAÇÃO','ASSOCIACAO','LTDA','S.A.','S/A','EMPRESA','BANCO','FEDERAÇÃO','FEDERACAO','CONFEDERAÇÃO','CONFEDERACAO','SINDICATO','PARTIDO','FUNDAÇÃO','FUNDACAO','COOPERATIVA','COMPANHIA','ORGANIZAÇÃO','ORDEM DOS'];

function classifyTipo(nome, papel) {
  const u = (nome ?? '').toUpperCase();
  if (POLO[papel] === 'advogado') return 'oab';
  if (/\(\d+[A-Z]?\/[A-Z]{2}/.test(nome ?? '')) return 'oab';
  if (ENTE.some(p => u.includes(p))) return 'ente_publico';
  if (PJP.some(p => u.includes(p))) return 'pessoa_juridica';
  return 'pessoa_fisica';
}

function extractOab(nome) {
  const m = (nome ?? '').match(/\(([^)]+\/[A-Z]{2}[^)]*)\)/);
  return m ? m[1] : null;
}

function parse(html) {
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;?/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, '')
    .trim();
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const partes = []; let cur = null;
  for (const line of lines) {
    const p = matchPapel(line);
    if (p) { cur = p; continue; }
    if (!cur || line.length < 3) continue;
    if (/^(Pesquisa|Processo|Número|Classe|Origem|Relator|Acompanhamento|Por Parte|Por Número)/i.test(line)) continue;
    const nome = line.replace(/\s+/g, ' ').trim();
    if (nome.length >= 3) partes.push({ papel: cur, polo: POLO[cur] ?? 'desc', nome, tipo: classifyTipo(nome, cur), oab: extractOab(nome) });
  }
  return partes;
}

async function fetchP(inc, retries = 2) {
  const r = await fetch(PORTAL + inc, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (r.status === 403 && retries > 0) {
    await new Promise(r => setTimeout(r, 2000));
    return fetchP(inc, retries - 1);
  }
  if (!r.ok) return [];
  const html = await r.text();
  if (html.length < 200) return []; // blocked or empty
  return parse(html);
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  const c = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  // Ensure table with correct schema
  await c.query(`
    CREATE TABLE IF NOT EXISTS stf_partes_completo (
      id bigserial PRIMARY KEY,
      incidente bigint NOT NULL,
      processo text,
      papel text,
      polo text,
      nome text,
      tipo text,
      oab text,
      UNIQUE(incidente, papel, nome)
    )
  `);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_spc_inc ON stf_partes_completo(incidente)`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_spc_polo ON stf_partes_completo(polo)`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_spc_tipo ON stf_partes_completo(tipo)`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_spc_papel ON stf_partes_completo(papel)`);
  await c.query(`ALTER TABLE stf_partes_completo ENABLE ROW LEVEL SECURITY`);
  await c.query(`DO $$ BEGIN CREATE POLICY "spc_svc" ON stf_partes_completo FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  // Get all distinct incidentes
  const all = await c.query(`
    SELECT DISTINCT ON (incidente) incidente, processo
    FROM stf_decisoes WHERE incidente IS NOT NULL
    ORDER BY incidente
  `);

  // Skip already extracted
  const done = await c.query('SELECT DISTINCT incidente FROM stf_partes_completo');
  const doneSet = new Set(done.rows.map(r => Number(r.incidente)));

  const todo = all.rows.filter(r => !doneSet.has(Number(r.incidente)));
  console.log(`Total: ${all.rows.length}, Done: ${doneSet.size}, Todo: ${todo.length}`);

  let fetched = 0, inserted = 0, errors = 0, empty = 0;
  const t0 = Date.now();

  for (let i = 0; i < todo.length; i += CONC) {
    const batch = todo.slice(i, i + CONC);

    const results = await Promise.allSettled(
      batch.map(async r => ({ row: r, partes: await fetchP(r.incidente) }))
    );

    // Rate limit between batches
    await new Promise(r => setTimeout(r, DELAY_MS));

    for (const fr of results) {
      if (fr.status === 'rejected') { errors++; continue; }
      const { row: r, partes } = fr.value;
      fetched++;
      if (!partes.length) { empty++; continue; }

      const vals = [], ph = [];
      let idx = 1;
      for (const p of partes) {
        ph.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6})`);
        vals.push(r.incidente, r.processo, p.papel, p.polo, p.nome, p.tipo, p.oab);
        idx += 7;
      }
      try {
        const res = await c.query(
          `INSERT INTO stf_partes_completo (incidente,processo,papel,polo,nome,tipo,oab) VALUES ${ph.join(',')} ON CONFLICT (incidente,papel,nome) DO NOTHING`,
          vals
        );
        inserted += res.rowCount;
      } catch (e) {
        errors++;
        if (errors <= 5) console.error('DB:', e.message?.slice(0, 100));
      }
    }

    const done = Math.min(i + CONC, todo.length);
    if (done % 1000 < CONC || done === todo.length) {
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      const rate = (fetched / (el || 1)).toFixed(1);
      const eta = ((todo.length - done) / (rate || 1) / 60).toFixed(0);
      console.log(`  ${done}/${todo.length} — ${fetched} ok, ${inserted} partes, ${errors} err, ${empty} empty — ${el}s (${rate}/s, ETA ${eta}m)`);
    }
  }

  const el = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n=== DONE ===`);
  console.log(`  Fetched: ${fetched}, Inserted: ${inserted}, Errors: ${errors}, Empty: ${empty}`);
  console.log(`  Time: ${el}s`);

  const final = await c.query('SELECT COUNT(*) as n, COUNT(DISTINCT incidente) as inc FROM stf_partes_completo');
  console.log(`  Table: ${final.rows[0].n} rows, ${final.rows[0].inc} incidentes`);

  const tipos = await c.query('SELECT tipo, COUNT(*) as n FROM stf_partes_completo GROUP BY tipo ORDER BY n DESC');
  console.log('\nPor tipo:');
  tipos.rows.forEach(r => console.log(`  ${r.tipo}: ${r.n}`));

  const polos = await c.query('SELECT polo, COUNT(*) as n FROM stf_partes_completo GROUP BY polo ORDER BY n DESC');
  console.log('\nPor polo:');
  polos.rows.forEach(r => console.log(`  ${r.polo}: ${r.n}`));

  await c.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
