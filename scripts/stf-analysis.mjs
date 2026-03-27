import pg from 'pg';
const { Client } = pg;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const DB_URL = 'postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres';
const PORTAL = 'https://portal.stf.jus.br/processos/abaPartes.asp?incidente=';
const CONC = 40;

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

function tipo(nome, papel) {
  const u = (nome ?? '').toUpperCase();
  if (POLO[papel] === 'advogado') return 'oab';
  if (/\(\d+[A-Z]?\/[A-Z]{2}/.test(nome ?? '')) return 'oab';
  if (ENTE.some(p => u.includes(p))) return 'ente_publico';
  if (PJP.some(p => u.includes(p))) return 'pessoa_juridica';
  return 'pessoa_fisica';
}
function oab(nome) { const m = (nome ?? '').match(/\(([^)]+\/[A-Z]{2}[^)]*)\)/); return m ? m[1] : null; }

function parse(html) {
  const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n').replace(/&nbsp;?/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, '').trim();
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const partes = []; let cur = null;
  for (const line of lines) {
    const p = matchPapel(line);
    if (p) { cur = p; continue; }
    if (!cur || line.length < 3) continue;
    if (/^(Pesquisa|Processo|Número|Classe|Origem|Relator|Acompanhamento|Por Parte|Por Número)/i.test(line)) continue;
    const nome = line.replace(/\s+/g, ' ').trim();
    if (nome.length >= 3) partes.push({ papel: cur, polo: POLO[cur] ?? 'desc', nome, tipo: tipo(nome, cur), oab: oab(nome) });
  }
  return partes;
}

async function fetchP(inc) {
  const r = await fetch(PORTAL + inc, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
  if (!r.ok) return [];
  return parse(await r.text());
}

function pad(s, n) { return (String(s) + ' '.repeat(n)).slice(0, n); }

async function main() {
  const c = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  await c.query('DROP TABLE IF EXISTS stf_amostra_partes CASCADE');
  await c.query(`
    CREATE TABLE stf_amostra_partes (
      id bigserial PRIMARY KEY, incidente bigint NOT NULL, processo text,
      classe text, relator text, descricao_andamento text,
      resultado_normalizado text, data_decisao text,
      papel text, polo text, nome text, tipo text, oab text,
      UNIQUE(incidente, papel, nome)
    )
  `);
  await c.query(`CREATE INDEX idx_sap_res ON stf_amostra_partes(resultado_normalizado)`);
  await c.query(`CREATE INDEX idx_sap_polo ON stf_amostra_partes(polo)`);
  await c.query(`CREATE INDEX idx_sap_classe ON stf_amostra_partes(classe)`);
  await c.query(`ALTER TABLE stf_amostra_partes ENABLE ROW LEVEL SECURITY`);
  await c.query(`DO $$ BEGIN CREATE POLICY "sap_svc" ON stf_amostra_partes FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  console.log('Table ready.');

  const FAV = `'Procedente','Provido','Concedida a ordem','Concedida a ordem de ofício','Deferido','Procedente em parte','Provido em parte','Agravo regimental provido','Agravo regimental provido em parte','Liminar referendada','Embargos recebidos','Embargos recebidos em parte','Decisão pela existência de repercussão geral','Julgado mérito de tema com repercussão geral','Recebida denúncia'`;
  const DESF = `'Agravo regimental não provido','Embargos rejeitados','Negado seguimento','Agravo regimental não conhecido','Não provido','Denegada a ordem','Improcedente','Não conhecido(s)','Denegada a segurança','Indeferido','Embargos não conhecidos','Liminar indeferida','Embargos recebidos como agravo regimental desde logo não provido','Decisão pela inexistência de repercussão geral por se tratar de matéria infraconstitucional','Decisão pela inexistência de repercussão geral','Denegada a suspensão'`;

  const q = await c.query(`
    SELECT * FROM (
      SELECT DISTINCT ON (incidente)
        incidente, processo, classe, relator_decisao, descricao_andamento, data_decisao,
        CASE WHEN descricao_andamento IN (${FAV}) THEN 'favoravel'
             WHEN descricao_andamento IN (${DESF}) THEN 'desfavoravel'
             ELSE 'sem_merito' END as resultado_normalizado
      FROM stf_decisoes WHERE incidente IS NOT NULL
      ORDER BY incidente, data_decisao DESC
    ) t ORDER BY RANDOM() LIMIT 2000
  `);
  const sample = q.rows;
  const cnt = { favoravel: 0, desfavoravel: 0, sem_merito: 0 };
  sample.forEach(r => { cnt[r.resultado_normalizado]++; });
  console.log(`Amostra: ${sample.length} (fav:${cnt.favoravel} desf:${cnt.desfavoravel} sem:${cnt.sem_merito})`);

  let fetched = 0, inserted = 0, errors = 0;
  const t0 = Date.now();

  for (let i = 0; i < sample.length; i += CONC) {
    const batch = sample.slice(i, i + CONC);
    const results = await Promise.allSettled(batch.map(async r => ({ row: r, partes: await fetchP(r.incidente) })));

    for (const fr of results) {
      if (fr.status === 'rejected') { errors++; continue; }
      const { row: r, partes } = fr.value;
      fetched++;
      if (!partes.length) continue;

      const vals = [], ph = [];
      let idx = 1;
      for (const p of partes) {
        ph.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6},$${idx+7},$${idx+8},$${idx+9},$${idx+10},$${idx+11})`);
        vals.push(r.incidente, r.processo, r.classe, r.relator_decisao, r.descricao_andamento, r.resultado_normalizado, r.data_decisao, p.papel, p.polo, p.nome, p.tipo, p.oab);
        idx += 12;
      }
      try {
        const res = await c.query(`INSERT INTO stf_amostra_partes (incidente,processo,classe,relator,descricao_andamento,resultado_normalizado,data_decisao,papel,polo,nome,tipo,oab) VALUES ${ph.join(',')} ON CONFLICT (incidente,papel,nome) DO NOTHING`, vals);
        inserted += res.rowCount;
      } catch (e) { errors++; if (errors <= 3) console.error('DB:', e.message?.slice(0, 80)); }
    }

    const done = Math.min(i + CONC, sample.length);
    if (done % 500 < CONC || done === sample.length) {
      console.log(`  ${done}/${sample.length} — ${fetched} ok, ${inserted} partes, ${errors} err — ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }

  console.log(`\nDone: ${fetched} fetched, ${inserted} partes in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  // ═══ ANALYSIS ═══

  // Verification: papel distribution
  console.log('\n=== Verificação: papéis ===');
  const pap = await c.query('SELECT papel, polo, COUNT(*) as n FROM stf_amostra_partes GROUP BY papel, polo ORDER BY n DESC LIMIT 25');
  console.log(pad('Papel', 25) + pad('Polo', 12) + 'N');
  pap.rows.forEach(r => console.log(pad(r.papel, 25) + pad(r.polo, 12) + r.n));

  // ANALYSIS 1: Polo ativo SEM Rcl
  console.log('\n========== 1. POLO ATIVO × RESULTADO (SEM Rcl) ==========');
  const pa = await c.query(`
    SELECT tipo, resultado_normalizado, COUNT(DISTINCT incidente) as total
    FROM stf_amostra_partes WHERE polo='ativo' AND classe NOT IN ('RCL','Rcl')
    GROUP BY tipo, resultado_normalizado ORDER BY tipo, total DESC
  `);
  console.log(pad('Tipo', 20) + pad('Resultado', 15) + 'Total');
  pa.rows.forEach(r => console.log(pad(r.tipo, 20) + pad(r.resultado_normalizado, 15) + r.total));

  // ANALYSIS 2: Rcl isolada
  console.log('\n========== 2. Rcl ISOLADA ==========');
  const rcl = await c.query(`
    SELECT resultado_normalizado, COUNT(DISTINCT incidente) as total
    FROM stf_amostra_partes WHERE classe IN ('RCL','Rcl')
    GROUP BY resultado_normalizado ORDER BY total DESC
  `);
  const rclTotal = rcl.rows.reduce((s, r) => s + parseInt(r.total), 0);
  rcl.rows.forEach(r => console.log(`  ${r.resultado_normalizado}: ${r.total} (${(r.total / rclTotal * 100).toFixed(1)}%)`));

  console.log('\nRcl por ramo (from stf_decisoes):');
  const rclR = await c.query(`
    SELECT ramo_direito, COUNT(*) as total,
      SUM(CASE WHEN descricao_andamento IN ('Procedente','Provido','Deferido','Procedente em parte') THEN 1 ELSE 0 END) as providas
    FROM stf_decisoes WHERE classe IN ('RCL','Rcl')
    AND ramo_direito IS NOT NULL AND ramo_direito != '*NI*'
    GROUP BY ramo_direito ORDER BY total DESC LIMIT 15
  `);
  console.log(pad('Ramo', 65) + pad('Total', 8) + 'Providas');
  rclR.rows.forEach(r => console.log(pad(r.ramo_direito.slice(0, 63), 65) + pad(String(r.total), 8) + r.providas));

  // ANALYSIS 3: Advogado × relator SEM Rcl
  console.log('\n========== 3. ADVOGADO × RELATOR (SEM Rcl) ==========');
  const taxa = await c.query(`
    SELECT nome as advogado, relator,
      COUNT(DISTINCT incidente) as total,
      COUNT(DISTINCT CASE WHEN resultado_normalizado='favoravel' THEN incidente END) as ganhou,
      ROUND(COUNT(DISTINCT CASE WHEN resultado_normalizado='favoravel' THEN incidente END)*100.0/NULLIF(COUNT(DISTINCT incidente),0),1) as taxa
    FROM stf_amostra_partes
    WHERE polo='advogado' AND tipo='oab'
      AND classe NOT IN ('RCL','Rcl')
      AND nome NOT LIKE '%PROCURADOR%' AND nome NOT LIKE '%ADVOGADO-GERAL%'
      AND nome NOT LIKE '%DEFENSOR%' AND nome NOT LIKE '%SEM REPRESENTAÇÃO%'
    GROUP BY nome, relator HAVING COUNT(DISTINCT incidente)>=3
    ORDER BY taxa DESC, total DESC LIMIT 30
  `);
  console.log(pad('Advogado', 45) + pad('Relator', 28) + pad('Tot', 5) + pad('Win', 5) + 'Taxa');
  taxa.rows.forEach(r => console.log(pad(r.advogado.slice(0, 43), 45) + pad((r.relator || '').slice(0, 26), 28) + pad(String(r.total), 5) + pad(String(r.ganhou), 5) + r.taxa + '%'));

  // Top advogados by volume SEM Rcl
  console.log('\n=== Top 20 advogados volume (SEM Rcl) ===');
  const vol = await c.query(`
    SELECT nome, COUNT(DISTINCT incidente) as total,
      COUNT(DISTINCT CASE WHEN resultado_normalizado='favoravel' THEN incidente END) as ganhou,
      ROUND(COUNT(DISTINCT CASE WHEN resultado_normalizado='favoravel' THEN incidente END)*100.0/NULLIF(COUNT(DISTINCT incidente),0),1) as taxa
    FROM stf_amostra_partes WHERE polo='advogado' AND tipo='oab'
      AND classe NOT IN ('RCL','Rcl')
      AND nome NOT LIKE '%PROCURADOR%' AND nome NOT LIKE '%ADVOGADO-GERAL%'
      AND nome NOT LIKE '%DEFENSOR%' AND nome NOT LIKE '%SEM REPRESENTAÇÃO%'
    GROUP BY nome ORDER BY total DESC LIMIT 20
  `);
  console.log(pad('Advogado', 55) + pad('Total', 7) + pad('Win', 5) + 'Taxa');
  vol.rows.forEach(r => console.log(pad(r.nome.slice(0, 53), 55) + pad(String(r.total), 7) + pad(String(r.ganhou), 5) + r.taxa + '%'));

  // Taxa base por relator SEM Rcl
  console.log('\n=== Taxa base por relator (SEM Rcl) ===');
  const rel = await c.query(`
    SELECT relator, COUNT(DISTINCT incidente) as total,
      COUNT(DISTINCT CASE WHEN resultado_normalizado='favoravel' THEN incidente END) as fav,
      ROUND(COUNT(DISTINCT CASE WHEN resultado_normalizado='favoravel' THEN incidente END)*100.0/NULLIF(COUNT(DISTINCT incidente),0),1) as taxa
    FROM stf_amostra_partes WHERE classe NOT IN ('RCL','Rcl')
    GROUP BY relator HAVING COUNT(DISTINCT incidente)>=10 ORDER BY total DESC
  `);
  console.log(pad('Relator', 35) + pad('Total', 7) + pad('Fav', 5) + 'Taxa');
  rel.rows.forEach(r => console.log(pad((r.relator || '').slice(0, 33), 35) + pad(String(r.total), 7) + pad(String(r.fav), 5) + r.taxa + '%'));

  await c.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
