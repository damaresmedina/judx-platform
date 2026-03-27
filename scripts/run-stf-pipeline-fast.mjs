/**
 * run-stf-pipeline-fast.mjs — Pipeline STF via pg direto (não Supabase REST)
 * Processa em lotes de 500 com cache de entidades. ~100x mais rápido.
 *
 * Usage: node scripts/run-stf-pipeline-fast.mjs
 */

import pg from 'pg';
const { Client } = pg;

const DB_URL = 'postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres';
const BATCH = 500;

// ── Classification ───────────────────────────────────────

function inferKind(t) {
  const s = (t ?? '').toLowerCase();
  if (/colegiada/.test(s)) return 'acordao';
  if (/monocr[aá]tica/.test(s)) return 'monocratica';
  if (/final|recurso\s+interno/.test(s)) return 'acordao';
  if (/interlocut[oó]ria/.test(s)) return 'decisao_interlocutoria';
  return 'outra';
}

function inferResult(d) {
  const s = (d ?? '').toLowerCase().trim();
  if (!s) return 'nao_conhecido';
  if (s.includes('agravo regimental não provido')) return 'improcedente';
  if (s.includes('agravo regimental não conhecido')) return 'nao_conhecido';
  if (s.includes('agravo regimental provido em parte')) return 'parcialmente_procedente';
  if (s.includes('agravo regimental provido')) return 'procedente';
  if (s.includes('embargos rejeitados')) return 'improcedente';
  if (s.includes('embargos não conhecidos')) return 'nao_conhecido';
  if (s.includes('embargos recebidos em parte')) return 'parcialmente_procedente';
  if (s.includes('embargos recebidos como agravo')) return 'improcedente';
  if (s.includes('embargos recebidos')) return 'procedente';
  if (s.includes('negado seguimento')) return 'nao_conhecido';
  if (s.includes('determinada a devolução')) return 'prejudicado';
  if (s.includes('homologada a desistência')) return 'prejudicado';
  if (s.includes('extinto o processo')) return 'prejudicado';
  if (s.includes('prejudicado')) return 'prejudicado';
  if (s.includes('determinado arquivamento')) return 'prejudicado';
  if (s.includes('declarada a extinção')) return 'prejudicado';
  if (s.includes('provido em parte')) return 'parcialmente_procedente';
  if (s.includes('não provido')) return 'improcedente';
  if (s.includes('provido')) return 'procedente';
  if (s.includes('procedente em parte')) return 'parcialmente_procedente';
  if (s.includes('procedente')) return 'procedente';
  if (s.includes('improcedente')) return 'improcedente';
  if (s.includes('não conhecido')) return 'nao_conhecido';
  if (s.includes('concedida a ordem')) return 'procedente';
  if (s.includes('denegada a ordem')) return 'improcedente';
  if (s.includes('denegada a segurança')) return 'improcedente';
  if (s.includes('denegada a suspensão')) return 'improcedente';
  if (s.includes('deferido em parte')) return 'parcialmente_procedente';
  if (s.includes('deferido')) return 'deferido';
  if (s.includes('indeferido')) return 'indeferido';
  if (s.includes('liminar referendada')) return 'deferido';
  if (s.includes('liminar indeferida')) return 'indeferido';
  if (s.includes('existência de repercussão geral')) return 'procedente';
  if (s.includes('inexistência de repercussão geral')) return 'improcedente';
  if (s.includes('julgado mérito de tema')) return 'procedente';
  if (s.includes('reconhecida a repercussão geral')) return 'procedente';
  if (s.includes('recebida denúncia')) return 'procedente';
  if (s.includes('decisão referendada')) return 'deferido';
  if (s.includes('segredo de justiça')) return 'nao_conhecido';
  if (s.includes('sobrestado')) return 'prejudicado';
  return 'nao_conhecido';
}

function parseEnv(a) {
  const s = (a ?? '').toLowerCase();
  if (/virtual/.test(s)) return 'virtual';
  if (/presencial/.test(s)) return 'presencial';
  return 'nao_informado';
}

function parseDate(d) {
  if (!d) return null;
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function slugify(t) {
  return (t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function safe(v) {
  if (v == null || v === '' || v === '-' || v === '*NI*') return null;
  return String(v).trim();
}

const SEM_MERITO = ['agravo regimental não provido','agravo regimental não conhecido','embargos rejeitados','embargos não conhecidos','negado seguimento','determinada a devolução','embargos recebidos como agravo'];

// ── Main ─────────────────────────────────────────────────

async function main() {
  const c = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  // Keepalive — evita timeout do Supabase
  const keepalive = setInterval(() => {
    c.query('SELECT 1').catch(() => {});
  }, 30000);

  // Ensure court
  let courtRes = await c.query("SELECT id FROM judx_court WHERE acronym='STF'");
  let courtId;
  if (courtRes.rows.length === 0) {
    const ins = await c.query("INSERT INTO judx_court (acronym, name) VALUES ('STF','Supremo Tribunal Federal') RETURNING id");
    courtId = ins.rows[0].id;
  } else {
    courtId = courtRes.rows[0].id;
  }
  console.log('Court STF:', courtId);

  // Entity caches
  const organs = new Map();
  const classes = new Map();
  const subjects = new Map();
  const judges = new Map();

  async function getOrgan(name) {
    if (!name) return null;
    const norm = slugify(name);
    if (organs.has(norm)) return organs.get(norm);
    const r = await c.query(
      `INSERT INTO judx_organ (court_id, name, normalized_name) VALUES ($1,$2,$3)
       ON CONFLICT (court_id, normalized_name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [courtId, name, norm]
    );
    organs.set(norm, r.rows[0].id);
    return r.rows[0].id;
  }

  async function getClass(name) {
    if (!name) return null;
    const norm = slugify(name);
    if (classes.has(norm)) return classes.get(norm);
    const r = await c.query(
      `INSERT INTO judx_procedural_class (court_id, raw_name, normalized_name) VALUES ($1,$2,$3)
       ON CONFLICT (court_id, normalized_name) DO UPDATE SET raw_name=EXCLUDED.raw_name RETURNING id`,
      [courtId, name, norm]
    );
    classes.set(norm, r.rows[0].id);
    return r.rows[0].id;
  }

  async function getSubject(name) {
    if (!name) return null;
    const norm = slugify(name);
    if (subjects.has(norm)) return subjects.get(norm);
    const r = await c.query(
      `INSERT INTO judx_subject (name, normalized_name) VALUES ($1,$2)
       ON CONFLICT (normalized_name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [name, norm]
    );
    subjects.set(norm, r.rows[0].id);
    return r.rows[0].id;
  }

  async function getJudge(name) {
    if (!name) return null;
    const norm = slugify(name);
    if (judges.has(norm)) return judges.get(norm);
    const r = await c.query(
      `INSERT INTO judx_judge (court_id, name, normalized_name) VALUES ($1,$2,$3)
       ON CONFLICT (court_id, normalized_name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [courtId, name, norm]
    );
    judges.set(norm, r.rows[0].id);
    return r.rows[0].id;
  }

  // Count total and already done
  const total = (await c.query('SELECT COUNT(*) as n FROM stf_decisoes')).rows[0].n;
  const alreadyDone = (await c.query(`SELECT COUNT(*) as n FROM judx_case WHERE court_id=$1`, [courtId])).rows[0].n;
  console.log(`Total: ${total}, Already: ${alreadyDone}`);

  // Process in batches using cursor-style pagination
  let offset = 0;
  let processed = 0, upserted = 0, errors = 0;
  const t0 = Date.now();

  async function processRow(raw) {
    const classe = safe(raw.classe) || raw.processo?.split(' ')[0]?.toUpperCase() || null;
    const subject = safe(raw.assunto) || safe(raw.ramo_direito);
    const summary = safe(raw.observacao_andamento);
    const decidedAt = parseDate(safe(raw.data_decisao));

    const organId = await getOrgan(safe(raw.orgao_julgador));
    const classId = await getClass(classe);
    const subjectId = await getSubject(subject);

    const caseRes = await c.query(
      `INSERT INTO judx_case (external_number, court_id, organ_id, procedural_class_id,
        main_subject_id, phase, decided_at, state_involved, summary, metadata)
       VALUES ($1,$2,$3,$4,$5,'outra',$6,false,$7,$8)
       ON CONFLICT (external_number) DO UPDATE SET
         decided_at=COALESCE(EXCLUDED.decided_at, judx_case.decided_at),
         organ_id=COALESCE(EXCLUDED.organ_id, judx_case.organ_id),
         procedural_class_id=COALESCE(EXCLUDED.procedural_class_id, judx_case.procedural_class_id),
         main_subject_id=COALESCE(EXCLUDED.main_subject_id, judx_case.main_subject_id)
       RETURNING id`,
      [raw.processo, courtId, organId, classId, subjectId, decidedAt,
       summary?.slice(0, 500) || null,
       JSON.stringify({ source_table: 'stf_decisoes', incidente: raw.incidente, link_processo: raw.link_processo })]
    );
    const caseId = caseRes.rows[0].id;

    const kind = inferKind(raw.tipo_decisao);
    const result = inferResult(raw.descricao_andamento);
    const env = parseEnv(raw.ambiente_julgamento);
    const descLower = (raw.descricao_andamento ?? '').toLowerCase();
    const semMerito = SEM_MERITO.some(p => descLower.includes(p));

    await c.query(
      `INSERT INTO judx_decision (case_id, decision_date, kind, result, session_environment, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT DO NOTHING`,
      [caseId, decidedAt, kind, result, env,
       JSON.stringify({
         cod_andamento: raw.cod_andamento, descricao_andamento: raw.descricao_andamento,
         subgrupo_andamento: raw.subgrupo_andamento, sem_apreciacao_merito: semMerito,
         source_table: 'stf_decisoes', source_id: `${raw.processo}_${raw.cod_andamento ?? raw.id}`,
       })]
    );

    const relator = safe(raw.relator_decisao);
    if (relator) await getJudge(relator);
  }

  while (true) {
    const batch = await c.query(
      `SELECT * FROM stf_decisoes ORDER BY id LIMIT $1 OFFSET $2`,
      [BATCH, offset]
    );
    if (batch.rows.length === 0) break;

    // Batch transaction — ON CONFLICT handles dupes, catch handles errors
    await c.query('BEGIN');
    let batchOk = true;
    for (const raw of batch.rows) {
      try {
        await processRow(raw);
        upserted++;
      } catch (e) {
        errors++;
        if (errors <= 20) console.error(`  ERR [${new Date().toISOString()}]:`, raw.processo, e.message?.slice(0, 100));
        // Transaction is poisoned — rollback and skip rest of batch
        batchOk = false;
        break;
      }
      processed++;
    }
    if (batchOk) {
      await c.query('COMMIT');
    } else {
      await c.query('ROLLBACK').catch(() => {});
      processed += batch.rows.length; // count as processed to advance offset
      console.error(`  BATCH ROLLBACK at offset ${offset}, skipping`);
    }

    offset += batch.rows.length;
    const el = ((Date.now() - t0) / 1000).toFixed(0);
    const rate = (processed / (el || 1)).toFixed(0);
    const eta = ((total - offset) / (rate || 1) / 60).toFixed(0);

    if (offset % 1000 < BATCH || batch.rows.length < BATCH) {
      const ts = new Date().toISOString().slice(11, 19);
      console.log(`  [${ts}] ${offset}/${total} — ${upserted} ok, ${errors} err — ${el}s (${rate}/s, ETA ${eta}m)`);
    }

    if (batch.rows.length < BATCH) break;
  }

  const el = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\nDONE: ${processed} processed, ${upserted} upserted, ${errors} errors in ${el}s`);

  const finalCases = (await c.query(`SELECT COUNT(*) as n FROM judx_case WHERE court_id=$1`, [courtId])).rows[0].n;
  const finalDecs = (await c.query(`SELECT COUNT(*) as n FROM judx_decision d JOIN judx_case c ON c.id=d.case_id WHERE c.court_id=$1`, [courtId])).rows[0].n;
  console.log(`Final: ${finalCases} cases, ${finalDecs} decisions`);

  clearInterval(keepalive);
  await c.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
