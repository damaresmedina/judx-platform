/**
 * datajud-auditoria-gap.mjs — auditoria genérica de gap + fillgap automático
 *
 * PROTOCOLO (formalizado a partir do STJ 20/abr/2026):
 *   1) Bate hits.total.value do Datajud com track_total_hits:true
 *   2) Conta IDs únicos no raw local
 *   3) Calcula gap = universo - unique_raw
 *   4) Se gap > 0 e não --dry-run: dispara fillgap com sort composto
 *      [@timestamp asc, id.keyword asc] em pasta {SIGLA}_repass_A/
 *
 * Uso:
 *   node scripts/datajud-auditoria-gap.mjs TJMG                # diagnostica + fillgap se gap
 *   node scripts/datajud-auditoria-gap.mjs TJMG --dry-run      # só diagnóstico
 *   node scripts/datajud-auditoria-gap.mjs TJMG TJSP TJRJ      # múltiplos em série
 *
 * Saídas por sigla:
 *   G:/datajud_raw/<nivel>/<sigla>/_audit_gap.json     # relatório de diagnóstico
 *   G:/datajud_raw/<nivel>/<sigla>_repass_A/           # fillgap (se gap>0)
 *
 * (c) 2026 Damares Medina · JudX
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, readdirSync, createReadStream, createWriteStream } from 'fs';
import { join } from 'path';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { createInterface } from 'readline';

// ── Config ──────────────────────────────────────────────────────────────────
const ENV = readFileSync('C:\\Users\\medin\\projetos\\judx-platform\\.env.local', 'utf-8');
const APIKEY = ENV.match(/^DATAJUD_APIKEY=(.+)$/m)[1].trim();
const BASE = 'https://api-publica.datajud.cnj.jus.br';
const RAW_ROOT = 'G:/datajud_raw';
const PAGE = 1000;
const SLEEP_MS = 100;

// ── Catálogo dos 90 endpoints (sigla → {alias, category}) ───────────────────
const CATALOGO = {
  // superiores
  STJ:  { alias:'api_publica_stj',  category:'superior' },
  TST:  { alias:'api_publica_tst',  category:'superior' },
  TSE:  { alias:'api_publica_tse',  category:'superior' },
  STM:  { alias:'api_publica_stm',  category:'superior' },
  // federal
  TRF1: { alias:'api_publica_trf1', category:'federal' },
  TRF2: { alias:'api_publica_trf2', category:'federal' },
  TRF3: { alias:'api_publica_trf3', category:'federal' },
  TRF4: { alias:'api_publica_trf4', category:'federal' },
  TRF5: { alias:'api_publica_trf5', category:'federal' },
  TRF6: { alias:'api_publica_trf6', category:'federal' },
  // estadual
  TJAC:{alias:'api_publica_tjac',category:'estadual'}, TJAL:{alias:'api_publica_tjal',category:'estadual'},
  TJAM:{alias:'api_publica_tjam',category:'estadual'}, TJAP:{alias:'api_publica_tjap',category:'estadual'},
  TJBA:{alias:'api_publica_tjba',category:'estadual'}, TJCE:{alias:'api_publica_tjce',category:'estadual'},
  TJDFT:{alias:'api_publica_tjdft',category:'estadual'}, TJES:{alias:'api_publica_tjes',category:'estadual'},
  TJGO:{alias:'api_publica_tjgo',category:'estadual'}, TJMA:{alias:'api_publica_tjma',category:'estadual'},
  TJMG:{alias:'api_publica_tjmg',category:'estadual'}, TJMS:{alias:'api_publica_tjms',category:'estadual'},
  TJMT:{alias:'api_publica_tjmt',category:'estadual'}, TJPA:{alias:'api_publica_tjpa',category:'estadual'},
  TJPB:{alias:'api_publica_tjpb',category:'estadual'}, TJPE:{alias:'api_publica_tjpe',category:'estadual'},
  TJPI:{alias:'api_publica_tjpi',category:'estadual'}, TJPR:{alias:'api_publica_tjpr',category:'estadual'},
  TJRJ:{alias:'api_publica_tjrj',category:'estadual'}, TJRN:{alias:'api_publica_tjrn',category:'estadual'},
  TJRO:{alias:'api_publica_tjro',category:'estadual'}, TJRR:{alias:'api_publica_tjrr',category:'estadual'},
  TJRS:{alias:'api_publica_tjrs',category:'estadual'}, TJSC:{alias:'api_publica_tjsc',category:'estadual'},
  TJSE:{alias:'api_publica_tjse',category:'estadual'}, TJSP:{alias:'api_publica_tjsp',category:'estadual'},
  TJTO:{alias:'api_publica_tjto',category:'estadual'},
  // trabalho (TRT1-TRT24)
  ...Object.fromEntries(
    Array.from({length:24},(_,i)=>i+1).map(n =>
      [`TRT${n}`, { alias:`api_publica_trt${n}`, category:'trabalho' }]
    )
  ),
  // eleitoral (TRE-UF) — 26 estados + DF
  ...Object.fromEntries(
    ['AC','AL','AM','AP','BA','CE','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO','DFT']
      .map(uf => [`TRE-${uf}`, { alias:`api_publica_tre-${uf.toLowerCase()}`, category:'eleitoral' }])
  ),
  // militar estadual
  TJMMG:{alias:'api_publica_tjmmg',category:'militar'},
  TJMRS:{alias:'api_publica_tjmrs',category:'militar'},
  TJMSP:{alias:'api_publica_tjmsp',category:'militar'},
};

function getLevel(category) {
  if (category === 'superior') return 'nivel_1_anteparos';
  return 'nivel_2_regionais/' + category;
}

function rawPathFor(sigla) {
  const c = CATALOGO[sigla];
  if (!c) throw new Error(`Sigla desconhecida: ${sigla}. Use uma das: ${Object.keys(CATALOGO).join(', ')}`);
  return { rawDir: `${RAW_ROOT}/${getLevel(c.category)}/${sigla}`, alias: c.alias, category: c.category };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchDatajud(alias, body) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(`${BASE}/${alias}/_search`, {
        method: 'POST',
        headers: {
          'Authorization': `APIKey ${APIKEY}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        },
        body: JSON.stringify(body)
      });
      if (r.status === 429 || (r.status >= 500 && r.status < 600)) {
        await sleep(2000 * Math.pow(4, attempt - 1));
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0,300)}`);
      return await r.json();
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(2000 * Math.pow(4, attempt - 1));
    }
  }
}

async function universoDatajud(alias) {
  const j = await fetchDatajud(alias, { size: 0, track_total_hits: true, query: { match_all: {} } });
  return j.hits.total.value;
}

async function countUniqueIdsInRaw(rawDir) {
  if (!existsSync(rawDir)) return { unique: 0, lines: 0, files: 0, missing: true };
  const files = readdirSync(rawDir).filter(f => f.endsWith('.ndjson.gz')).sort();
  const ids = new Set();
  let lines = 0;
  let last = Date.now();
  for (let i = 0; i < files.length; i++) {
    const fp = join(rawDir, files[i]);
    await new Promise((resolve, reject) => {
      const rl = createInterface({
        input: createReadStream(fp).pipe(createGunzip()),
        crlfDelay: Infinity
      });
      rl.on('line', (line) => {
        lines++;
        try {
          const d = JSON.parse(line);
          const id = d._id ?? d._source?.id ?? d.id;
          if (id) ids.add(id);
        } catch {}
      });
      rl.on('close', resolve);
      rl.on('error', reject);
    });
    if (Date.now() - last > 5000 || i === files.length - 1) {
      const pct = ((i+1) / files.length * 100).toFixed(1);
      console.log(`    [${i+1}/${files.length}] ${pct}%  lines:${lines.toLocaleString('pt-BR')}  unique:${ids.size.toLocaleString('pt-BR')}`);
      last = Date.now();
    }
  }
  return { unique: ids.size, lines, files: files.length, missing: false };
}

// ── Fillgap ─────────────────────────────────────────────────────────────────
async function writeNdjsonGz(hits, path) {
  const lines = hits.map(h => JSON.stringify(h)).join('\n') + '\n';
  await pipeline(Readable.from(lines), createGzip({ level: 6 }), createWriteStream(path));
}

async function runFillgap(sigla, alias, outDir) {
  mkdirSync(outDir, { recursive: true });
  const CHK = join(outDir, 'checkpoint.json');
  const ERR = join(outDir, 'errors.log');
  const MAN = join(outDir, 'manifest.json');
  let chk = existsSync(CHK)
    ? JSON.parse(readFileSync(CHK, 'utf-8'))
    : { search_after: null, total_fetched: 0, file_index: 0, done: false };

  const t0 = Date.now();
  let totalEsperado = null;
  let pages = 0;
  console.log(`  [${sigla} fillgap] start (file_index=${chk.file_index}, fetched=${chk.total_fetched})`);

  while (true) {
    const body = {
      size: PAGE,
      track_total_hits: true,
      sort: [{ '@timestamp': { order: 'asc' } }, { 'id.keyword': { order: 'asc' } }],
      query: { match_all: {} },
      ...(chk.search_after ? { search_after: chk.search_after } : {})
    };
    let json;
    try {
      json = await fetchDatajud(alias, body);
    } catch (e) {
      appendFileSync(ERR, `[${new Date().toISOString()}] falha search_after=${JSON.stringify(chk.search_after)}: ${e.message}\n`);
      console.error(`  [${sigla} fillgap] ERRO: ${e.message}`);
      throw e;
    }
    if (totalEsperado == null) totalEsperado = json?.hits?.total?.value ?? null;
    const hits = json?.hits?.hits ?? [];
    if (hits.length === 0) break;

    chk.file_index++;
    await writeNdjsonGz(hits, join(outDir, `part-${String(chk.file_index).padStart(6,'0')}.ndjson.gz`));
    chk.total_fetched += hits.length;
    chk.search_after = hits[hits.length - 1].sort;
    writeFileSync(CHK, JSON.stringify(chk, null, 2));

    pages++;
    if (pages % 50 === 0) {
      const rate = chk.total_fetched / ((Date.now() - t0) / 1000);
      const pct = totalEsperado ? (chk.total_fetched / totalEsperado * 100).toFixed(2) : '?';
      console.log(`  [${sigla}] ${chk.total_fetched.toLocaleString('pt-BR')}/${totalEsperado?.toLocaleString('pt-BR') ?? '?'} (${pct}%) — ${rate.toFixed(0)} docs/s`);
    }
    await sleep(SLEEP_MS);
    if (hits.length < PAGE) break;
  }

  chk.done = true;
  writeFileSync(CHK, JSON.stringify(chk, null, 2));
  writeFileSync(MAN, JSON.stringify({
    alias, sigla, mode: 'fillgap_A_tiebreak',
    sort: '[@timestamp asc, id.keyword asc]',
    total_fetched: chk.total_fetched, total_esperado: totalEsperado,
    done: true, file_index: chk.file_index,
    completed_at: new Date().toISOString(),
    duration_seconds: Math.round((Date.now() - t0) / 1000)
  }, null, 2));
  console.log(`  [${sigla} fillgap] FIM: ${chk.total_fetched.toLocaleString('pt-BR')} em ${Math.round((Date.now()-t0)/1000)}s`);
  return chk.total_fetched;
}

// ── Por sigla ───────────────────────────────────────────────────────────────
async function auditar(sigla, dryRun) {
  const { rawDir, alias, category } = rawPathFor(sigla);
  console.log(`\n════ AUDITORIA ${sigla} (${category}) ════`);
  console.log(`  alias:   ${alias}`);
  console.log(`  raw:     ${rawDir}`);

  const t0 = Date.now();
  console.log(`  [1/3] consultando universo Datajud...`);
  const universo = await universoDatajud(alias);
  console.log(`        universo: ${universo.toLocaleString('pt-BR')}`);

  console.log(`  [2/3] contando IDs únicos no raw...`);
  const { unique, lines, files, missing } = await countUniqueIdsInRaw(rawDir);
  if (missing) {
    console.log(`        RAW NÃO EXISTE — rodar scraper primeiro`);
  }
  console.log(`        arquivos:${files}  linhas:${lines.toLocaleString('pt-BR')}  únicos:${unique.toLocaleString('pt-BR')}`);

  const gap = universo - unique;
  const pctGap = universo ? (gap / universo * 100).toFixed(3) : '0';
  console.log(`  [3/3] GAP: ${gap.toLocaleString('pt-BR')} (${pctGap}%)`);

  // Relatório
  const reportPath = join(rawDir, '_audit_gap.json');
  if (!missing) {
    writeFileSync(reportPath, JSON.stringify({
      sigla, alias, category,
      universo_datajud: universo,
      raw_lines: lines,
      raw_unique: unique,
      raw_files: files,
      raw_duplicatas: lines - unique,
      gap,
      gap_pct: pctGap,
      audit_duration_seconds: Math.round((Date.now() - t0) / 1000),
      audit_completed_at: new Date().toISOString(),
    }, null, 2));
  }

  // Decisão
  if (gap <= 0) {
    console.log(`  ✓ sem gap (universo ≤ raw). Nada a fazer.`);
    return { sigla, universo, unique, gap, fillgap: false };
  }
  if (dryRun) {
    console.log(`  [dry-run] gap detectado, fillgap NÃO disparado.`);
    return { sigla, universo, unique, gap, fillgap: 'skipped_dry_run' };
  }

  // Fillgap automático
  const fillgapDir = rawDir + '_repass_A';
  console.log(`  ⟶ disparando fillgap em ${fillgapDir}`);
  const fetched = await runFillgap(sigla, alias, fillgapDir);
  return { sigla, universo, unique, gap, fillgap: 'done', fillgap_fetched: fetched };
}

// ── Main ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const siglas = args.filter(a => !a.startsWith('--'));

if (siglas.length === 0) {
  console.log(`Uso: node datajud-auditoria-gap.mjs <SIGLA> [SIGLA2 ...] [--dry-run]`);
  console.log(`Exemplo: node datajud-auditoria-gap.mjs TJMG TJSP --dry-run`);
  console.log(`Siglas disponíveis: ${Object.keys(CATALOGO).join(', ')}`);
  process.exit(1);
}

const t_all = Date.now();
const results = [];
for (const sigla of siglas) {
  try {
    const r = await auditar(sigla, dryRun);
    results.push(r);
  } catch (e) {
    console.error(`[${sigla}] ERRO: ${e.message}`);
    results.push({ sigla, error: e.message });
  }
}

console.log(`\n════ RESUMO (${Math.round((Date.now()-t_all)/60000)}min) ════`);
for (const r of results) {
  if (r.error) {
    console.log(`  ${r.sigla}: ERRO — ${r.error}`);
  } else {
    const fill = r.fillgap === 'done' ? `✓ fillgap: +${r.fillgap_fetched?.toLocaleString('pt-BR') ?? '?'}` : (r.fillgap === 'skipped_dry_run' ? '[dry-run]' : '—');
    console.log(`  ${r.sigla}: universo=${r.universo.toLocaleString('pt-BR')} · unique=${r.unique.toLocaleString('pt-BR')} · gap=${r.gap.toLocaleString('pt-BR')} · ${fill}`);
  }
}
