/**
 * fetch-stf-amostra-partes.mjs
 * Amostra aleatória de 2.000 incidentes (favoráveis + desfavoráveis + sem mérito)
 * para calcular taxa de sucesso real advogado × relator.
 *
 * Usage: node scripts/fetch-stf-amostra-partes.mjs [--limit=N]
 */

import pg from 'pg';
const { Client } = pg;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const DB_URL = 'postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres';
const PORTAL_URL = 'https://portal.stf.jus.br/processos/abaPartes.asp?incidente=';
const CONCURRENCY = 40;
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '2000', 10);

// ── Papéis STF ───────────────────────────────────────────

const PAPEIS = [
  'REQTE.(S)','REQDO.(A/S)','AUTOR(A/S)(ES)','RÉU(É)(S)',
  'INTDO.(A/S)','ADV.(A/S)','PROC.(A/S)(ES)','AM. CURIAE',
  'AGDO.(A/S)','AGTE.(S)','IMPTE.(S)','IMPDO.(A/S)',
  'PACTE.(S)','COATOR(A/S)','RELATOR(A)',
  'APDO.(A/S)','APTE.(S)','RECTE.(S)','RECDO.(A/S)',
  'ASSTE.(S)','SSTDO.(A/S)','LITISCONSORTE(S)',
  'EXEC.(S)','EXDO.(A/S)','EMBTE.(S)','EMBDO.(A/S)',
];

const POLO = {
  'REQTE.(S)':'ativo','AUTOR(A/S)(ES)':'ativo',
  'AGTE.(S)':'ativo','IMPTE.(S)':'ativo',
  'PACTE.(S)':'ativo','RECTE.(S)':'ativo',
  'APTE.(S)':'ativo','EMBTE.(S)':'ativo','EXEC.(S)':'ativo',
  'REQDO.(A/S)':'passivo','RÉU(É)(S)':'passivo',
  'AGDO.(A/S)':'passivo','IMPDO.(A/S)':'passivo',
  'COATOR(A/S)':'passivo','RECDO.(A/S)':'passivo',
  'APDO.(A/S)':'passivo','EMBDO.(A/S)':'passivo',
  'EXDO.(A/S)':'passivo','SSTDO.(A/S)':'passivo',
  'INTDO.(A/S)':'terceiro','AM. CURIAE':'terceiro',
  'LITISCONSORTE(S)':'terceiro','ASSTE.(S)':'terceiro',
  'ADV.(A/S)':'advogado','PROC.(A/S)(ES)':'advogado',
  'RELATOR(A)':'terceiro',
};

const PAPEIS_UPPER_MAP = {};
PAPEIS.forEach(p => { PAPEIS_UPPER_MAP[p.toUpperCase()] = p; });

function matchPapel(line) {
  const upper = line.trim().toUpperCase();
  if (PAPEIS_UPPER_MAP[upper]) return PAPEIS_UPPER_MAP[upper];
  const norm = upper.replace(/\s+/g, ' ');
  for (const p of PAPEIS) {
    if (norm === p.toUpperCase().replace(/\s+/g, ' ')) return p;
  }
  return null;
}

// ── Classification ───────────────────────────────────────

const ENTE = ['ESTADO DE','ESTADO DO','MUNICÍPIO','MUNICIPIO','UNIÃO','GOVERNO','GOVERNADOR','FAZENDA','MINISTÉRIO','MINISTERIO','PROCURADOR','ADVOGADO-GERAL','DEFENSORIA','TRIBUNAL','CÂMARA','SENADO','CONGRESSO','ASSEMBLEIA','PRESIDENTE DA REPÚBLICA','INSTITUTO NACIONAL','INSS','IBAMA','INCRA','FUNAI','DISTRITO FEDERAL','PROCURADORIA','SECRETARIA','AGÊNCIA','AUTARQUIA','CAIXA ECONÔMICA','BNDES','MINISTRO DE ESTADO','CONSELHO NACIONAL','DNIT','ANATEL','ANVISA','ANEEL'];
const PJ = ['ASSOCIAÇÃO','ASSOCIACAO','LTDA','S.A.','S/A','EMPRESA','BANCO','FEDERAÇÃO','FEDERACAO','CONFEDERAÇÃO','CONFEDERACAO','SINDICATO','PARTIDO','CONSELHO FEDERAL','FUNDAÇÃO','FUNDACAO','COOPERATIVA','COMPANHIA','CONDOMÍNIO','ORGANIZAÇÃO','ORDEM DOS'];

function classifyTipo(nome, papel) {
  const upper = (nome ?? '').toUpperCase();
  if (POLO[papel] === 'advogado') return 'oab';
  if (/\(\d+[A-Z]?\/[A-Z]{2}/.test(nome ?? '')) return 'oab';
  if (ENTE.some(p => upper.includes(p))) return 'ente_publico';
  if (PJ.some(p => upper.includes(p))) return 'pessoa_juridica';
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
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;?/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, '').replace(/\n{2,}/g, '\n').trim();

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let currentPapel = null;

  for (const line of lines) {
    const papel = matchPapel(line);
    if (papel) { currentPapel = papel; continue; }
    if (!currentPapel || line.length < 3) continue;
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
CREATE TABLE IF NOT EXISTS stf_amostra_partes (
  id bigserial PRIMARY KEY,
  incidente bigint NOT NULL,
  processo text,
  classe text,
  relator text,
  descricao_andamento text,
  resultado_normalizado text,
  data_decisao text,
  papel text,
  polo text,
  nome text,
  tipo text,
  oab text,
  UNIQUE(incidente, papel, nome)
);
CREATE INDEX IF NOT EXISTS idx_stf_ap_incidente ON stf_amostra_partes(incidente);
CREATE INDEX IF NOT EXISTS idx_stf_ap_resultado ON stf_amostra_partes(resultado_normalizado);
CREATE INDEX IF NOT EXISTS idx_stf_ap_polo ON stf_amostra_partes(polo);
CREATE INDEX IF NOT EXISTS idx_stf_ap_tipo ON stf_amostra_partes(tipo);
CREATE INDEX IF NOT EXISTS idx_stf_ap_relator ON stf_amostra_partes(relator);
ALTER TABLE stf_amostra_partes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "stf_ap_service" ON stf_amostra_partes FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

// ── Main ─────────────────────────────────────────────────

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query('DROP TABLE IF EXISTS stf_amostra_partes CASCADE');
  await client.query(CREATE_SQL);
  console.log('Table stf_amostra_partes created.');

  // Amostra aleatória de incidentes com resultado classificado
  const q = await client.query(`
    SELECT DISTINCT ON (incidente)
      incidente, processo, classe, relator_decisao, descricao_andamento, data_decisao,
      CASE
        WHEN descricao_andamento IN (
          'Procedente','Provido','Concedida a ordem',
          'Concedida a ordem de ofício','Deferido',
          'Procedente em parte','Provido em parte',
          'Agravo regimental provido','Agravo regimental provido em parte',
          'Liminar referendada','Embargos recebidos','Embargos recebidos em parte',
          'Decisão pela existência de repercussão geral',
          'Julgado mérito de tema com repercussão geral',
          'Recebida denúncia','Concedida a ordem de ofício'
        ) THEN 'favoravel'
        WHEN descricao_andamento IN (
          'Agravo regimental não provido','Embargos rejeitados',
          'Negado seguimento','Agravo regimental não conhecido',
          'Não provido','Denegada a ordem','Improcedente',
          'Não conhecido(s)','Denegada a segurança','Indeferido',
          'Embargos não conhecidos','Liminar indeferida',
          'Embargos recebidos como agravo regimental desde logo não provido',
          'Decisão pela inexistência de repercussão geral por se tratar de matéria infraconstitucional',
          'Decisão pela inexistência de repercussão geral',
          'Denegada a suspensão'
        ) THEN 'desfavoravel'
        ELSE 'sem_merito'
      END as resultado_normalizado
    FROM stf_decisoes
    WHERE incidente IS NOT NULL
    ORDER BY incidente, data_decisao DESC
  `);

  // Shuffle and take sample
  const all = q.rows;
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  const sample = all.slice(0, LIMIT);

  // Count by resultado
  const counts = { favoravel: 0, desfavoravel: 0, sem_merito: 0 };
  sample.forEach(r => { counts[r.resultado_normalizado] = (counts[r.resultado_normalizado] || 0) + 1; });
  console.log(`Amostra: ${sample.length} incidentes`);
  console.log(`  favoravel: ${counts.favoravel}, desfavoravel: ${counts.desfavoravel}, sem_merito: ${counts.sem_merito}`);

  let fetched = 0, inserted = 0, errors = 0;
  const t0 = Date.now();

  for (let i = 0; i < sample.length; i += CONCURRENCY) {
    const batch = sample.slice(i, i + CONCURRENCY);

    // Fetch all in parallel
    const fetchResults = await Promise.allSettled(
      batch.map(async (r) => {
        const partes = await fetchPartes(r.incidente);
        return { row: r, partes };
      })
    );

    // Insert sequentially (DB writes)
    for (const fr of fetchResults) {
      if (fr.status === 'rejected') {
        errors++;
        if (errors <= 5) console.error(`  Error: ${(fr.reason?.message ?? '').slice(0, 80)}`);
        continue;
      }
      const { row: r, partes } = fr.value;
      fetched++;

      if (partes.length === 0) continue;

      const values = [];
      const ph = [];
      let idx = 1;
      for (const p of partes) {
        ph.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6},$${idx+7},$${idx+8},$${idx+9},$${idx+10},$${idx+11})`);
        values.push(
          r.incidente, r.processo, r.classe, r.relator_decisao,
          r.descricao_andamento, r.resultado_normalizado, r.data_decisao,
          p.papel, p.polo, p.nome, p.tipo, p.oab
        );
        idx += 12;
      }
      try {
        const res = await client.query(`
          INSERT INTO stf_amostra_partes
            (incidente, processo, classe, relator, descricao_andamento,
             resultado_normalizado, data_decisao, papel, polo, nome, tipo, oab)
          VALUES ${ph.join(',')}
          ON CONFLICT (incidente, papel, nome) DO NOTHING
        `, values);
        inserted += res.rowCount;
      } catch (e) {
        errors++;
        if (errors <= 5) console.error(`  DB error ${r.incidente}: ${(e.message ?? '').slice(0, 80)}`);
      }
    }

    const done = Math.min(i + CONCURRENCY, sample.length);
    if (done % 500 < CONCURRENCY || done === sample.length) {
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`  ${done}/${sample.length} — ${fetched} ok, ${inserted} partes, ${errors} err — ${el}s`);
    }
  }

  // ── Analytics ────────────────────────────────────────
  console.log('\n=== RESULTADO ===');
  const tot = await client.query('SELECT COUNT(*) as n FROM stf_amostra_partes');
  const byRes = await client.query('SELECT resultado_normalizado, COUNT(DISTINCT incidente) as n FROM stf_amostra_partes GROUP BY resultado_normalizado ORDER BY n DESC');
  console.log(`Total partes: ${tot.rows[0].n}`);
  console.log('Incidentes por resultado:');
  byRes.rows.forEach(r => console.log(`  ${r.resultado_normalizado}: ${r.n}`));

  console.log('\n=== Taxa de sucesso advogado × relator (min 5 processos) ===');
  const taxa = await client.query(`
    SELECT
      nome as advogado,
      relator,
      COUNT(DISTINCT incidente) as total_processos,
      SUM(CASE WHEN resultado_normalizado = 'favoravel' THEN 1 ELSE 0 END) as ganhou,
      ROUND(
        SUM(CASE WHEN resultado_normalizado = 'favoravel' THEN 1 ELSE 0 END) * 100.0
        / COUNT(DISTINCT incidente), 1
      ) as taxa_sucesso_pct
    FROM stf_amostra_partes
    WHERE polo = 'advogado'
      AND tipo = 'oab'
      AND nome NOT LIKE '%PROCURADOR%'
      AND nome NOT LIKE '%ADVOGADO-GERAL%'
    GROUP BY nome, relator
    HAVING COUNT(DISTINCT incidente) >= 5
    ORDER BY taxa_sucesso_pct DESC, total_processos DESC
    LIMIT 30
  `);

  if (taxa.rows.length === 0) {
    console.log('  Nenhum advogado com >= 5 processos na amostra.');
    console.log('  Reduzindo threshold para >= 3...');
    const taxa3 = await client.query(`
      SELECT nome as advogado, relator,
        COUNT(DISTINCT incidente) as total_processos,
        SUM(CASE WHEN resultado_normalizado = 'favoravel' THEN 1 ELSE 0 END) as ganhou,
        ROUND(SUM(CASE WHEN resultado_normalizado = 'favoravel' THEN 1 ELSE 0 END) * 100.0 / COUNT(DISTINCT incidente), 1) as taxa_sucesso_pct
      FROM stf_amostra_partes
      WHERE polo = 'advogado' AND tipo = 'oab'
        AND nome NOT LIKE '%PROCURADOR%' AND nome NOT LIKE '%ADVOGADO-GERAL%'
      GROUP BY nome, relator HAVING COUNT(DISTINCT incidente) >= 3
      ORDER BY taxa_sucesso_pct DESC, total_processos DESC LIMIT 30
    `);
    printTaxa(taxa3.rows);
  } else {
    printTaxa(taxa.rows);
  }

  // Top advogados por volume (todas as decisões)
  console.log('\n=== Top 20 advogados por volume total ===');
  const vol = await client.query(`
    SELECT nome, COUNT(DISTINCT incidente) as total,
      SUM(CASE WHEN resultado_normalizado = 'favoravel' THEN 1 ELSE 0 END) as ganhou,
      ROUND(SUM(CASE WHEN resultado_normalizado = 'favoravel' THEN 1 ELSE 0 END) * 100.0 / COUNT(DISTINCT incidente), 1) as taxa
    FROM stf_amostra_partes
    WHERE polo = 'advogado' AND tipo = 'oab'
      AND nome NOT LIKE '%PROCURADOR%' AND nome NOT LIKE '%ADVOGADO-GERAL%'
    GROUP BY nome ORDER BY total DESC LIMIT 20
  `);
  console.log(pad('Advogado', 55) + pad('Total', 7) + pad('Ganhou', 8) + 'Taxa');
  console.log('-'.repeat(78));
  vol.rows.forEach(r => console.log(pad(r.nome.slice(0, 53), 55) + pad(String(r.total), 7) + pad(String(r.ganhou), 8) + r.taxa + '%'));

  // Polo ativo: quem ganha vs quem perde
  console.log('\n=== Polo ativo: entes vs privados ===');
  const poloAtivo = await client.query(`
    SELECT tipo, resultado_normalizado,
      COUNT(DISTINCT incidente) as n
    FROM stf_amostra_partes
    WHERE polo = 'ativo'
    GROUP BY tipo, resultado_normalizado
    ORDER BY tipo, resultado_normalizado
  `);
  console.log(pad('Tipo', 20) + pad('Resultado', 15) + 'N');
  console.log('-'.repeat(40));
  poloAtivo.rows.forEach(r => console.log(pad(r.tipo, 20) + pad(r.resultado_normalizado, 15) + r.n));

  await client.end();
}

function printTaxa(rows) {
  console.log(pad('Advogado', 45) + pad('Relator', 28) + pad('Tot', 5) + pad('Win', 5) + 'Taxa');
  console.log('-'.repeat(90));
  rows.forEach(r => console.log(
    pad(r.advogado.slice(0, 43), 45) +
    pad((r.relator || '').slice(0, 26), 28) +
    pad(String(r.total_processos), 5) +
    pad(String(r.ganhou), 5) +
    r.taxa_sucesso_pct + '%'
  ));
}

function pad(s, n) { return (String(s) + ' '.repeat(n)).slice(0, n); }

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
