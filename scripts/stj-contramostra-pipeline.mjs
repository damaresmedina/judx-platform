/**
 * stj-contramostra-pipeline.mjs
 * Extrai processos de contramostra do CKAN STJ (metadados diários)
 * Para cada ano: busca AREsp e REsp que NÃO estão nas sementes
 * Meta: ~2× sementes por ano = ~5.000 processos contramostra
 *
 * Usage: node scripts/stj-contramostra-pipeline.mjs [--ano=2015] [--dry-run] [--all]
 */

import pg from 'pg';
const { Client } = pg;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const DB_URL = 'postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres';
const CKAN_BASE = 'https://dadosabertos.web.stj.jus.br';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const ANO_ARG = process.argv.find(a => a.startsWith('--ano='));
const TARGET_ANO = ANO_ARG ? parseInt(ANO_ARG.split('=')[1]) : null;
const DRY_RUN = process.argv.includes('--dry-run');
const ALL = process.argv.includes('--all');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseDate(s) {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? s.slice(0, 10) : null;
}

// ── Fetch CKAN resource list ────────────────────────────

async function getMetadataUrls() {
  const res = await fetch(`${CKAN_BASE}/api/3/action/package_show?id=integras-de-decisoes-terminativas-e-acordaos-do-diario-da-justica`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  const resources = data.result?.resources || [];
  return resources
    .filter(r => r.name?.toLowerCase().includes('metadados'))
    .map(r => ({ name: r.name, url: r.url }));
}

// ── Parse processo from CKAN metadata ───────────────────

function parseTimestamp(val) {
  if (!val) return null;
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) return val.slice(0, 10);
  // Millisecond timestamp
  const n = Number(val);
  if (n > 1000000000000) return new Date(n).toISOString().slice(0, 10);
  if (n > 1000000000) return new Date(n * 1000).toISOString().slice(0, 10);
  return null;
}

function parseProcesso(record) {
  const proc = (record.processo || '').trim();
  const m = proc.match(/^(AREsp|REsp|EREsp|AgInt|AgRg|HC|RHC|CC|MS|Pet|Rcl)\s+(\d+)/);
  if (!m) return null;

  // Handle both 2022 format (ministro) and 2024+ format (NM_MINISTRO)
  const relator = (record.NM_MINISTRO || record.ministro || '').trim() || null;
  const dataPub = parseTimestamp(record.dataPublicacao);

  return {
    processo: `${m[1]} ${m[2]}`,
    classe: m[1],
    numero: m[2],
    relator,
    data_decisao: dataPub,
    teor: (record.teor || '').replace(/None/g, '').trim() || null,
    tipo_doc: (record.tipoDocumento || '').trim() || null,
  };
}

// ── Main ────────────────────────────────────────────────

async function main() {
  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const keepalive = setInterval(() => { db.query('SELECT 1').catch(() => {}); }, 30000);

  // Load seed processes to exclude
  const seeds = await db.query("SELECT DISTINCT numero FROM stj_processos_semente");
  const seedSet = new Set(seeds.rows.map(r => r.numero));
  console.log(`Seed processes to exclude: ${seedSet.size}`);

  // Load already-extracted contramostra
  const existing = await db.query("SELECT DISTINCT numero FROM stj_contramostra");
  const existingSet = new Set(existing.rows.map(r => r.numero));
  console.log(`Already extracted: ${existingSet.size}`);

  // Get sementes per year for quota
  const seedsByYear = await db.query(`
    SELECT EXTRACT(YEAR FROM data_afetacao)::int as ano, COUNT(*) as n
    FROM stj_processos_semente WHERE data_afetacao IS NOT NULL
    GROUP BY 1 ORDER BY 1
  `);
  const yearQuotas = {};
  for (const r of seedsByYear.rows) {
    yearQuotas[r.ano] = parseInt(r.n) * 2; // 2× seeds
  }
  console.log('Year quotas (2× seeds):', yearQuotas);

  // Get all metadata URLs
  console.log('\nFetching CKAN resource list...');
  const metaUrls = await getMetadataUrls();
  console.log(`Metadata files: ${metaUrls.length}`);

  // Filter by year
  const targetYears = TARGET_ANO ? [TARGET_ANO] :
    ALL ? Object.keys(yearQuotas).map(Number).filter(y => y >= 2022) :
    [];

  if (targetYears.length === 0) {
    console.log('\nNo target year specified. Use --ano=YYYY or --all');
    console.log('Available years in CKAN: 2022-2026');
    console.log('Seed years needing contramostra:');
    for (const [y, q] of Object.entries(yearQuotas).sort()) {
      const avail = parseInt(y) >= 2022 ? 'CKAN available' : 'NO SOURCE';
      console.log(`  ${y}: need ${q} contramostra — ${avail}`);
    }
    clearInterval(keepalive);
    await db.end();
    return;
  }

  const t0 = Date.now();
  let totalInserted = 0, totalSkipped = 0, totalErrors = 0;

  for (const year of targetYears) {
    const quota = yearQuotas[year] || 100;
    console.log(`\n=== YEAR ${year} — quota: ${quota} ===`);

    // Find metadata files for this year
    const yearStr = String(year);
    const yearFiles = metaUrls.filter(m => m.name.includes(yearStr));
    console.log(`  Metadata files for ${year}: ${yearFiles.length}`);

    let yearInserted = 0;
    const classCounts = { AREsp: 0, REsp: 0, other: 0 };

    for (const meta of yearFiles) {
      if (yearInserted >= quota) break;

      try {
        const res = await fetch(meta.url, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(60000),
        });
        const records = await res.json();

        for (const rec of records) {
          if (yearInserted >= quota) break;

          const p = parseProcesso(rec);
          if (!p) continue;
          if (!['AREsp', 'REsp'].includes(p.classe)) continue;
          if (seedSet.has(p.numero)) continue; // exclude seeds
          if (existingSet.has(p.numero)) continue; // already extracted

          if (DRY_RUN) {
            if (yearInserted < 5) {
              console.log(`  [DRY] ${p.processo} | ${p.relator} | ${p.data_decisao} | ${p.teor}`);
            }
            yearInserted++;
            existingSet.add(p.numero); // prevent dupes in dry run
            classCounts[p.classe] = (classCounts[p.classe] || 0) + 1;
            continue;
          }

          try {
            await db.query(
              `INSERT INTO stj_contramostra (processo, classe, numero, relator, data_decisao, ano_afetacao, tipo)
               VALUES ($1, $2, $3, $4, $5, $6, 'contramostra')
               ON CONFLICT (processo) DO NOTHING`,
              [p.processo, p.classe, p.numero, p.relator, p.data_decisao, year]
            );
            yearInserted++;
            totalInserted++;
            existingSet.add(p.numero);
            classCounts[p.classe] = (classCounts[p.classe] || 0) + 1;
          } catch (e) {
            totalErrors++;
            if (totalErrors <= 5) console.error(`  ERR: ${e.message?.slice(0, 80)}`);
          }
        }

        // Rate limit between files
        await sleep(1500 + Math.random() * 1500);

      } catch (e) {
        console.error(`  FETCH ERR ${meta.name}: ${e.message?.slice(0, 80)}`);
      }

      // Progress every 10 files
      if (yearFiles.indexOf(meta) % 10 === 9) {
        const ts = new Date().toISOString().slice(11, 19);
        console.log(`  [${ts}] ${meta.name} — ${yearInserted}/${quota} inserted (AREsp: ${classCounts.AREsp}, REsp: ${classCounts.REsp})`);
      }
    }

    const ts = new Date().toISOString().slice(11, 19);
    console.log(`  [${ts}] Year ${year} done: ${yearInserted} inserted (AREsp: ${classCounts.AREsp}, REsp: ${classCounts.REsp})`);
  }

  // Stats
  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n=== DONE in ${elapsed}s ===`);
  console.log(`  Inserted: ${totalInserted} | Errors: ${totalErrors}`);

  if (!DRY_RUN) {
    const total = await db.query("SELECT COUNT(*) as n FROM stj_contramostra");
    const byCl = await db.query("SELECT classe, COUNT(*) as n FROM stj_contramostra GROUP BY 1 ORDER BY 2 DESC");
    const byAno = await db.query("SELECT ano_afetacao, COUNT(*) as n FROM stj_contramostra GROUP BY 1 ORDER BY 1");
    console.log(`  Total in table: ${total.rows[0].n}`);
    console.log('  By class:', byCl.rows.map(r => `${r.classe}:${r.n}`).join(', '));
    console.log('  By year:', byAno.rows.map(r => `${r.ano_afetacao}:${r.n}`).join(', '));
  }

  clearInterval(keepalive);
  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
