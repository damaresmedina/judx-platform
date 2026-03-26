/**
 * load-stf.mjs — Carga dos arquivos brutos STF para Supabase
 * Carga 1: 372e → stf_decisoes (145K decisões)
 * Carga 2: 7c9f → stf_processos (21K processos)
 *
 * Uso: node scripts/load-stf.mjs
 */

import XLSX from 'xlsx';
import pg from 'pg';

const { Client } = pg;

const DB_URL = 'postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres';
const BATCH_SIZE = 500;

const FILE_372E = 'C:/projetos/judx/stf/372e45fb-d150-4c7f-84ce-5a7c477beac8.xlsx';
const FILE_7C9F = 'C:/projetos/judx/stf/7c9ff254-fde9-48ca-b98d-ff3383e0235f.xlsx';

// ── Helpers ──────────────────────────────────────────────

function readExcel(path) {
  console.log(`  Reading ${path}...`);
  const wb = XLSX.readFile(path);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

function cleanInt(val) {
  if (val == null || val === '' || val === '-' || val === '*NI*') return null;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/\./g, '');
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? null : n;
}

function toBool(val) {
  if (val == null || val === '' || val === '-' || val === '*NI*') return null;
  if (typeof val === 'boolean') return val;
  if (val === 1 || val === '1' || val === 'Sim') return true;
  if (val === 0 || val === '0' || val === 'Não') return false;
  return null;
}

function excelDateToISO(val) {
  if (val == null || val === '' || val === '-' || val === '*NI*') return null;
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  return String(val);
}

function cleanText(val) {
  if (val == null || val === '' || val === '-' || val === '*NI*') return null;
  return String(val).trim();
}

function extractIncidenteFromURL(url) {
  if (!url) return null;
  const m = String(url).match(/incidente=(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Build a multi-row INSERT with parameterized values.
 * Returns { text, values } for pg client.query()
 */
function buildBatchInsert(table, columns, rows, conflictClause) {
  const colCount = columns.length;
  const placeholders = [];
  const values = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowPlaceholders = [];
    for (let j = 0; j < colCount; j++) {
      values.push(row[j]);
      rowPlaceholders.push(`$${i * colCount + j + 1}`);
    }
    placeholders.push(`(${rowPlaceholders.join(',')})`);
  }

  const text = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders.join(',')} ${conflictClause}`;
  return { text, values };
}

// ── Carga 1: 372e → stf_decisoes ────────────────────────

const DECISOES_COLS = [
  'processo','orgao_julgador','relator_decisao','relator_atual',
  'data_autuacao','data_decisao','data_baixa',
  'grupo_origem','tipo_classe','classe','ramo_direito',
  'assunto','assunto_completo','incidente','link_processo',
  'cod_andamento','subgrupo_andamento','descricao_andamento','observacao_andamento',
  'tipo_decisao','preferencia_covid19','preferencia_criminal',
  'sigla_ultimo_recurso','recurso_interno_pendente','em_tramitacao',
  'decisoes_virtual','raw_source'
];

function mapDecisaoRow(r) {
  return [
    cleanText(r['Processo']),
    cleanText(r['Órgão julgador']),
    cleanText(r['Relator da decisão']),
    cleanText(r['Relator atual']),
    excelDateToISO(r['Data autuação']),
    cleanText(r['Data decisão']),
    excelDateToISO(r['Data baixa']),
    cleanText(r['Grupo de origem']),
    cleanText(r['Tipo de classe']),
    cleanText(r['Classe']),
    cleanText(r['Ramos do Direito']),
    cleanText(r['Assunto']),
    cleanText(r['Assunto completo']),
    cleanInt(r['Seq Objeto Incidente']),
    cleanText(r['Link processo']),
    cleanText(r['Cod andamento']),
    cleanText(r['Subgrupo andamento']),
    cleanText(r['Descrição andamento']),
    cleanText(r['Observação andamento']),
    cleanText(r['Tipo decisão']),
    toBool(r['Preferência Covid19']),
    toBool(r['Preferência criminal']),
    cleanText(r['Sigla último recurso']),
    toBool(r['Recurso interno pendente']),
    toBool(r['Em tramitação']),
    toBool(r['Decisões virtual']),
    '372e'
  ];
}

async function loadDecisoes(client) {
  console.log('\n=== CARGA 1: 372e → stf_decisoes ===');

  // Truncate any partial data from aborted run
  await client.query('TRUNCATE stf_decisoes RESTART IDENTITY');
  console.log('  Table truncated.');

  const rows = readExcel(FILE_372E);
  console.log(`  ${rows.length} rows read from Excel`);

  const conflict = 'ON CONFLICT (processo, data_decisao, cod_andamento, md5(COALESCE(observacao_andamento, \'\'))) DO NOTHING';
  let inserted = 0;
  const t0 = Date.now();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const mapped = [];
    for (const r of batch) {
      const m = mapDecisaoRow(r);
      if (m[0]) mapped.push(m); // skip rows without processo
    }

    if (mapped.length > 0) {
      const q = buildBatchInsert('stf_decisoes', DECISOES_COLS, mapped, conflict);
      const res = await client.query(q);
      inserted += res.rowCount;
    }

    const done = Math.min(i + BATCH_SIZE, rows.length);
    if (done % 10000 === 0 || done >= rows.length) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  ${done}/${rows.length} — ${inserted} inserted — ${elapsed}s`);
    }
  }

  console.log(`  DONE: ${inserted} inserted`);
  return inserted;
}

// ── Carga 2: 7c9f → stf_processos ──────────────────────

const PROCESSOS_COLS = [
  'processo','classe','numero','numero_unico','incidente','link_processo',
  'relator','situacao_processual','grupo_origem','tipo_classe',
  'ramo_direito','assuntos','legislacao','meio_processo',
  'data_autuacao','data_autuacao_agregada',
  'data_ultima_decisao','data_ultimo_andamento',
  'grupo_ultimo_andamento','descricao_ultimo_andamento',
  'localizacao_atual','processo_criminal','situacao_decisao_final',
  'processo_sobrestado','pedido_vista','raw_source'
];

function mapProcessoRow(r) {
  return [
    cleanText(r['Processo']),
    cleanText(r['Classe']),
    r['Número'] != null ? parseInt(r['Número'], 10) || null : null,
    cleanText(r['Número único']),
    extractIncidenteFromURL(r['Link do processo']),
    cleanText(r['Link do processo']),
    cleanText(r['Relator']),
    cleanText(r['Situação processual']),
    cleanText(r['Grupo origem']),
    cleanText(r['Tipo classe']),
    cleanText(r['Ramo do Direito']),
    cleanText(r['Assuntos']),
    cleanText(r['Legislação']),
    cleanText(r['Meio processo']),
    excelDateToISO(r['Data autuação']),
    cleanText(r['Data autuação agregada']),
    cleanText(r['Data última decisão']),
    r['Data último andamento'] != null && typeof r['Data último andamento'] === 'number'
      ? new Date(Math.round((r['Data último andamento'] - 25569) * 86400 * 1000)).toISOString()
      : null,
    cleanText(r['Grupo último andamento']),
    cleanText(r['Descrição último andamento']),
    cleanText(r['Localização atual']),
    cleanText(r['Processo criminal']),
    cleanText(r['Situação da decisão final']),
    toBool(r['Processo sobrestado']),
    toBool(r['Pedido de Vista']),
    '7c9f'
  ];
}

async function loadProcessos(client) {
  console.log('\n=== CARGA 2: 7c9f → stf_processos ===');

  await client.query('TRUNCATE stf_processos RESTART IDENTITY');
  console.log('  Table truncated.');

  const rows = readExcel(FILE_7C9F);
  console.log(`  ${rows.length} rows read from Excel`);

  const conflict = 'ON CONFLICT (processo) DO NOTHING';
  let inserted = 0;
  const t0 = Date.now();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const mapped = [];
    for (const r of batch) {
      const m = mapProcessoRow(r);
      if (m[0]) mapped.push(m);
    }

    if (mapped.length > 0) {
      const q = buildBatchInsert('stf_processos', PROCESSOS_COLS, mapped, conflict);
      const res = await client.query(q);
      inserted += res.rowCount;
    }

    const done = Math.min(i + BATCH_SIZE, rows.length);
    if (done % 5000 === 0 || done >= rows.length) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  ${done}/${rows.length} — ${inserted} inserted — ${elapsed}s`);
    }
  }

  console.log(`  DONE: ${inserted} inserted`);
  return inserted;
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to Supabase.');

  try {
    await loadDecisoes(client);
    await loadProcessos(client);

    const r1 = await client.query('SELECT count(*) as n FROM stf_decisoes');
    const r2 = await client.query('SELECT count(*) as n FROM stf_processos');
    const sz = await client.query('SELECT pg_size_pretty(pg_database_size(current_database())) as s');
    console.log('\n=== RESULTADO FINAL ===');
    console.log(`  stf_decisoes:  ${r1.rows[0].n} rows`);
    console.log(`  stf_processos: ${r2.rows[0].n} rows`);
    console.log(`  DB size:       ${sz.rows[0].s}`);
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
