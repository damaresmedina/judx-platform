/**
 * run-stf-pipeline.mjs — Runs STF normalization pipeline directly (no HTTP)
 * Bypasses Next.js timeout. Reads from stf_decisoes, writes to judx_* tables.
 *
 * Usage: node scripts/run-stf-pipeline.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ejwyguskoiraredinqmb.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqd3lndXNrb2lyYXJlZGlucW1iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDAyMjk2NywiZXhwIjoyMDg5NTk4OTY3fQ.EpS4OHMuwWvcgqAB5BwnAj7FJCQgIodUZRC9xm0Z1XU';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const BATCH_SIZE = 1000;
const COURT_ACRONYM = 'STF';

// ── Helpers ──────────────────────────────────────────────

function safe(v) { return (v == null || v === '' || v === '-' || v === '*NI*') ? null : String(v).trim(); }

function inferRamo(classe, grupoOrigem) {
  const c = (classe ?? '').toUpperCase();
  if (['ADI','ADC','ADPF','ADO'].includes(c)) return 'controle_concentrado';
  if (['RE','ARE'].includes(c) && grupoOrigem === 'Recursal') return 'controle_incidental';
  if (c === 'RCL') return 'reclamacao';
  return 'competencia_originaria';
}

function inferKind(tipo) {
  const t = (tipo ?? '').toLowerCase();
  if (/colegiada/.test(t)) return 'acordao';
  if (/monocr[aá]tica/.test(t)) return 'monocratica';
  if (/final/.test(t)) return 'acordao';
  if (/recurso\s+interno/.test(t)) return 'acordao';
  if (/interlocut[oó]ria/.test(t)) return 'decisao_interlocutoria';
  return 'outra';
}

const SEM_MERITO_PATTERNS = [
  'agravo regimental não provido', 'agravo regimental não conhecido',
  'embargos rejeitados', 'embargos não conhecidos',
  'negado seguimento', 'determinada a devolução',
  'embargos recebidos como agravo',
];

function inferResult(descricao) {
  const d = (descricao ?? '').toLowerCase().trim();
  if (!d || d === '-' || d === '*ni*') return 'nao_conhecido';

  // Recursos internos
  if (d.includes('agravo regimental não provido')) return 'improcedente';
  if (d.includes('agravo regimental não conhecido')) return 'nao_conhecido';
  if (d.includes('agravo regimental provido em parte')) return 'parcialmente_procedente';
  if (d.includes('agravo regimental provido')) return 'procedente';
  if (d.includes('embargos rejeitados')) return 'improcedente';
  if (d.includes('embargos não conhecidos')) return 'nao_conhecido';
  if (d.includes('embargos recebidos em parte')) return 'parcialmente_procedente';
  if (d.includes('embargos recebidos como agravo')) return 'improcedente';
  if (d.includes('embargos recebidos')) return 'procedente';

  // Terminativas sem mérito
  if (d.includes('negado seguimento')) return 'nao_conhecido';
  if (d.includes('determinada a devolução')) return 'prejudicado';
  if (d.includes('homologada a desistência')) return 'prejudicado';
  if (d.includes('extinto o processo')) return 'prejudicado';
  if (d.includes('prejudicado')) return 'prejudicado';
  if (d.includes('determinado arquivamento')) return 'prejudicado';
  if (d.includes('declarada a extinção da punibilidade')) return 'prejudicado';
  if (d.includes('reconsidero e determino')) return 'nao_conhecido';

  // Mérito — recursos
  if (d.includes('provido em parte')) return 'parcialmente_procedente';
  if (d.includes('não provido')) return 'improcedente';
  if (d.includes('provido')) return 'procedente';

  // Mérito — ações originárias
  if (d.includes('procedente em parte')) return 'parcialmente_procedente';
  if (d.includes('procedente')) return 'procedente';
  if (d.includes('improcedente')) return 'improcedente';
  if (d.includes('não conhecido')) return 'nao_conhecido';

  // HC / MS
  if (d.includes('concedida a ordem')) return 'procedente';
  if (d.includes('denegada a ordem')) return 'improcedente';
  if (d.includes('denegada a segurança')) return 'improcedente';
  if (d.includes('denegada a suspensão')) return 'improcedente';
  if (d.includes('deferido em parte')) return 'parcialmente_procedente';
  if (d.includes('deferido')) return 'deferido';
  if (d.includes('indeferido')) return 'indeferido';
  if (d.includes('liminar referendada')) return 'deferido';
  if (d.includes('liminar indeferida')) return 'indeferido';

  // RG
  if (d.includes('existência de repercussão geral')) return 'procedente';
  if (d.includes('inexistência de repercussão geral')) return 'improcedente';
  if (d.includes('julgado mérito de tema')) return 'procedente';
  if (d.includes('reconhecida a repercussão geral')) return 'procedente';

  // Penal
  if (d.includes('recebida denúncia')) return 'procedente';

  // Outros
  if (d.includes('decisão referendada')) return 'deferido';
  if (d.includes('segredo de justiça')) return 'nao_conhecido';
  if (d.includes('sobrestado')) return 'prejudicado';

  return 'nao_conhecido';
}

function isSemMerito(descricao) {
  const d = (descricao ?? '').toLowerCase();
  return SEM_MERITO_PATTERNS.some(p => d.includes(p));
}

function parseEnvironment(amb) {
  const raw = (amb ?? '').trim().toLowerCase();
  if (!raw) return 'nao_informado';
  if (/virtual/.test(raw)) return 'virtual';
  if (/presencial/.test(raw)) return 'presencial';
  return 'nao_informado';
}

function slugify(text) {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return null;
}

// ── Entity caches ──────────────────────────────────────

const cache = {
  courtId: null,
  organs: new Map(),
  classes: new Map(),
  subjects: new Map(),
  judges: new Map(),
};

async function ensureCourt() {
  if (cache.courtId) return cache.courtId;
  const { data } = await supabase.from('judx_court').select('id').eq('acronym', COURT_ACRONYM).maybeSingle();
  if (data) { cache.courtId = data.id; return data.id; }
  const { data: ins } = await supabase.from('judx_court').insert({ acronym: COURT_ACRONYM, name: 'Supremo Tribunal Federal' }).select('id').single();
  cache.courtId = ins.id;
  return ins.id;
}

async function ensureOrgan(courtId, name) {
  if (!name) return null;
  const norm = slugify(name);
  const key = `${courtId}_${norm}`;
  if (cache.organs.has(key)) return cache.organs.get(key);
  const { data } = await supabase.from('judx_organ').upsert({ court_id: courtId, name, normalized_name: norm }, { onConflict: 'court_id,normalized_name' }).select('id').single();
  cache.organs.set(key, data?.id ?? null);
  return data?.id ?? null;
}

async function ensureClass(courtId, name) {
  if (!name) return null;
  const norm = slugify(name);
  const key = `${courtId}_${norm}`;
  if (cache.classes.has(key)) return cache.classes.get(key);
  const { data } = await supabase.from('judx_procedural_class').upsert({ court_id: courtId, raw_name: name, normalized_name: norm }, { onConflict: 'court_id,normalized_name' }).select('id').single();
  cache.classes.set(key, data?.id ?? null);
  return data?.id ?? null;
}

async function ensureSubject(name) {
  if (!name) return null;
  const norm = slugify(name);
  if (cache.subjects.has(norm)) return cache.subjects.get(norm);
  const { data } = await supabase.from('judx_subject').upsert({ name, normalized_name: norm }, { onConflict: 'normalized_name' }).select('id').single();
  cache.subjects.set(norm, data?.id ?? null);
  return data?.id ?? null;
}

async function ensureJudge(courtId, name) {
  if (!name) return null;
  const norm = slugify(name);
  const key = `${courtId}_${norm}`;
  if (cache.judges.has(key)) return cache.judges.get(key);
  const { data } = await supabase.from('judx_judge').upsert({ court_id: courtId, name, normalized_name: norm }, { onConflict: 'court_id,normalized_name' }).select('id').single();
  cache.judges.set(key, data?.id ?? null);
  return data?.id ?? null;
}

// ── Process a single row ────────────────────────────────

async function processRow(raw, courtId) {
  const classe = safe(raw.classe) || raw.processo?.split(' ')[0]?.toUpperCase() || null;
  const grupoOrigem = safe(raw.grupo_origem);
  const subject = safe(raw.assunto) || safe(raw.ramo_direito);
  const summary = safe(raw.observacao_andamento);
  const decidedAt = parseDate(safe(raw.data_decisao));

  // Parallel entity resolution
  const [organId, classId, subjectId] = await Promise.all([
    ensureOrgan(courtId, safe(raw.orgao_julgador)),
    ensureClass(courtId, classe),
    ensureSubject(subject),
  ]);

  // Upsert case
  const caseRow = {
    external_number: raw.processo,
    court_id: courtId,
    organ_id: organId,
    procedural_class_id: classId,
    main_subject_id: subjectId,
    phase: 'outra',
    decided_at: decidedAt,
    state_involved: false,
    summary: summary ? summary.slice(0, 500) : null,
    metadata: {
      incidente: raw.incidente,
      link_processo: raw.link_processo,
      grupo_origem: grupoOrigem,
      tipo_classe: raw.tipo_classe,
      ramo: inferRamo(classe, grupoOrigem),
    },
  };

  const { data: caseData, error: caseErr } = await supabase
    .from('judx_case')
    .upsert(caseRow, { onConflict: 'external_number' })
    .select('id')
    .single();

  if (caseErr || !caseData) {
    if (caseErr && !processRow._loggedCaseErr) {
      console.error('  Case upsert error:', caseErr.message, caseErr.details);
      processRow._loggedCaseErr = true;
    }
    return false;
  }
  const caseId = caseData.id;

  // Upsert decision
  const kind = inferKind(raw.tipo_decisao);
  const result = inferResult(raw.descricao_andamento);
  const env = parseEnvironment(raw.ambiente_julgamento);

  const decRow = {
    case_id: caseId,
    decision_date: decidedAt,
    kind,
    result,
    session_environment: env,
    metadata: {
      cod_andamento: raw.cod_andamento,
      subgrupo_andamento: raw.subgrupo_andamento,
      descricao_andamento: raw.descricao_andamento,
      observacao_andamento: raw.observacao_andamento,
      indicador_colegiado: raw.indicador_colegiado,
      ramo_direito: raw.ramo_direito,
      assunto_completo: raw.assunto_completo,
      id_fato_decisao: raw.id_fato_decisao,
      raw_source: raw.raw_source,
      ramo: inferRamo(classe, grupoOrigem),
      sem_apreciacao_merito: isSemMerito(raw.descricao_andamento),
      source_table: 'stf_decisoes',
      source_id: `${raw.processo}_${raw.cod_andamento ?? raw.id}`,
    },
  };

  // Check for existing to avoid insert dupe
  if (decidedAt) {
    const { data: existing } = await supabase
      .from('judx_decision')
      .select('id')
      .eq('case_id', caseId)
      .eq('decision_date', decidedAt)
      .eq('kind', kind)
      .maybeSingle();
    if (existing) return true; // already exists, skip
  }

  const { error: decErr } = await supabase.from('judx_decision').insert(decRow);
  if (decErr) {
    if (!processRow._loggedDecErr) {
      console.error('  Decision insert error:', decErr.message, decErr.details);
      processRow._loggedDecErr = true;
    }
    return false;
  }

  // Upsert judge (relator_decisao)
  const relator = safe(raw.relator_decisao);
  if (relator) await ensureJudge(courtId, relator);

  return true;
}

// ── Main pipeline ────────────────────────────────────────

async function main() {
  console.log('=== STF Pipeline (direct) ===');
  const courtId = await ensureCourt();
  console.log(`Court: ${COURT_ACRONYM} -> ${courtId}`);

  let offset = 0;
  let processed = 0;
  let upserted = 0;
  let errors = 0;
  const t0 = Date.now();

  while (true) {
    const { data: batch, error } = await supabase
      .from('stf_decisoes')
      .select('*')
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) { console.error('Read error:', error.message); break; }
    if (!batch || batch.length === 0) break;

    for (const raw of batch) {
      processed++;
      try {
        const ok = await processRow(raw, courtId);
        if (ok) upserted++;
        else errors++;
      } catch (e) {
        errors++;
        if (errors <= 5) console.error(`  ERROR on ${raw.processo}:`, e.message ?? e);
      }
    }

    offset += batch.length;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    const rate = (processed / (elapsed || 1)).toFixed(0);
    console.log(`  ${processed} processed, ${upserted} upserted, ${errors} errors — ${elapsed}s (${rate}/s)`);

    if (batch.length < BATCH_SIZE) break;
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== DONE ===`);
  console.log(`  processed: ${processed}`);
  console.log(`  upserted:  ${upserted}`);
  console.log(`  errors:    ${errors}`);
  console.log(`  time:      ${elapsed}s`);

  // Final stats
  const { count: cases } = await supabase.from('judx_case').select('*', { count: 'exact', head: true }).eq('court_id', courtId);
  const { data: decs } = await supabase.rpc('', {}).catch(() => null);
  console.log(`  judx_case STF: ${cases}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
