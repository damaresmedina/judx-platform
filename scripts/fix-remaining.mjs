/**
 * Fix remaining items that failed due to pooler limitations:
 * - Tables with expression-based UNIQUE constraints
 * - Functions (rewritten without $$)
 * - DO blocks for triggers (expanded to individual statements)
 * - INSERT with semicolons in text
 */
import pg from "pg";
const { Client } = pg;

const CONN = {
  host: "db.ejwyguskoiraredinqmb.supabase.co",
  port: 6543,
  database: "postgres",
  user: "postgres",
  password: "Zb9cHoRww7WxgT0C",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
};

async function run(label, sql) {
  const client = new Client(CONN);
  try {
    await client.connect();
    await client.query(sql);
    console.log(`  + ${label}`);
    return true;
  } catch (e) {
    const msg = e.message.replace(/\n/g, " ").slice(0, 120);
    if (msg.includes("already exists") || msg.includes("duplicate")) {
      console.log(`  ~ ${label} (already exists)`);
      return true;
    }
    console.error(`  X ${label}: ${msg}`);
    return false;
  } finally {
    try { await client.end(); } catch {}
  }
}

let ok = 0, errs = 0;
const r = async (l, s) => { (await run(l, s)) ? ok++ : errs++; };

// ── 1. Tables with expression UNIQUE (convert to CREATE INDEX) ──
console.log("\n=== TABLES WITH EXPRESSION UNIQUE ===");

await r("judx_judge_position_in_case",
  `CREATE TABLE IF NOT EXISTS judx_judge_position_in_case (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id uuid NOT NULL REFERENCES judx_case(id) ON DELETE CASCADE,
    decision_id uuid REFERENCES judx_decision(id) ON DELETE CASCADE,
    judge_id uuid NOT NULL REFERENCES judx_judge(id) ON DELETE CASCADE,
    role judx_judge_role_enum NOT NULL,
    vote_type judx_vote_type_enum NOT NULL DEFAULT 'nao_aplicavel',
    authored_vote boolean NOT NULL DEFAULT false,
    leading_vote boolean NOT NULL DEFAULT false,
    majority_side boolean,
    opinion_length_words integer,
    rhetorical_density judx_density_enum NOT NULL DEFAULT 'nao_informada',
    created_at timestamptz NOT NULL DEFAULT now()
  )`);

await r("judx_judge_position_in_case unique index",
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_judx_jpc_unique
   ON judx_judge_position_in_case (case_id, COALESCE(decision_id, '00000000-0000-0000-0000-000000000000'::uuid), judge_id, role)`);

await r("judx_decision_line_case",
  `CREATE TABLE IF NOT EXISTS judx_decision_line_case (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_line_id uuid NOT NULL REFERENCES judx_decision_line(id) ON DELETE CASCADE,
    case_id uuid NOT NULL REFERENCES judx_case(id) ON DELETE CASCADE,
    decision_id uuid REFERENCES judx_decision(id) ON DELETE CASCADE,
    line_position judx_line_position_enum NOT NULL,
    environmental_transition_relevance boolean NOT NULL DEFAULT false,
    analytical_note text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);

await r("judx_decision_line_case unique index",
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_judx_dlc_unique
   ON judx_decision_line_case (decision_line_id, case_id, COALESCE(decision_id, '00000000-0000-0000-0000-000000000000'::uuid))`);

// ── 2. Missing indexes ──
console.log("\n=== MISSING INDEXES ===");

await r("idx_judx_judge_case",
  `CREATE INDEX IF NOT EXISTS idx_judx_judge_case ON judx_judge_position_in_case(case_id)`);

await r("idx_judx_situated_profile_judge index",
  `CREATE INDEX IF NOT EXISTS idx_judx_situated_profile_judge ON judx_situated_profile(judge_id)`);

// ── 3. Functions (rewritten with single-quote escaping) ──
console.log("\n=== FUNCTIONS ===");

await r("judx_detect_recurrent_patterns", `
  CREATE OR REPLACE FUNCTION judx_detect_recurrent_patterns(p_court_id uuid, p_min_cases integer DEFAULT 3)
  RETURNS TABLE (technique judx_decision_technique_enum, result judx_decision_result_enum, environment judx_session_environment_enum, state_profile judx_litigation_profile_enum, case_count bigint)
  LANGUAGE sql AS
  'SELECT d.technique, d.result, d.session_environment, c.state_litigation_profile, count(*) as case_count
   FROM judx_decision d JOIN judx_case c ON c.id = d.case_id
   WHERE c.court_id = p_court_id
   GROUP BY d.technique, d.result, d.session_environment, c.state_litigation_profile
   HAVING count(*) >= p_min_cases ORDER BY count(*) DESC'
`);

await r("judx_detect_judge_sensitivity", `
  CREATE OR REPLACE FUNCTION judx_detect_judge_sensitivity(p_judge_id uuid)
  RETURNS TABLE (role judx_judge_role_enum, session_environment judx_session_environment_enum, technique judx_decision_technique_enum, result judx_decision_result_enum, n bigint)
  LANGUAGE sql AS
  'SELECT jp.role, d.session_environment, d.technique, d.result, count(*) as n
   FROM judx_judge_position_in_case jp JOIN judx_decision d ON d.id = jp.decision_id
   WHERE jp.judge_id = p_judge_id
   GROUP BY jp.role, d.session_environment, d.technique, d.result ORDER BY n DESC'
`);

await r("judx_detect_presential_selection", `
  CREATE OR REPLACE FUNCTION judx_detect_presential_selection(p_court_id uuid)
  RETURNS TABLE (procedural_class text, subject_name text, highlighted_cases bigint, presential_cases bigint, total_cases bigint)
  LANGUAGE sql AS
  'SELECT pc.normalized_name, s.normalized_name,
   count(*) FILTER (WHERE jr.was_highlighted = true),
   count(*) FILTER (WHERE jr.final_environment = ''presencial''),
   count(*)
   FROM judx_case c
   LEFT JOIN judx_procedural_class pc ON pc.id = c.procedural_class_id
   LEFT JOIN judx_subject s ON s.id = c.main_subject_id
   LEFT JOIN judx_judgment_regime jr ON jr.case_id = c.id
   WHERE c.court_id = p_court_id
   GROUP BY pc.normalized_name, s.normalized_name
   ORDER BY count(*) FILTER (WHERE jr.final_environment = ''presencial'') DESC'
`);

await r("judx_detect_environment_shift_impact", `
  CREATE OR REPLACE FUNCTION judx_detect_environment_shift_impact(p_court_id uuid)
  RETURNS TABLE (case_id uuid, external_number text, judgment_path judx_judgment_path_enum, result judx_decision_result_enum, technique judx_decision_technique_enum, argumentative_density judx_density_enum)
  LANGUAGE sql AS
  'SELECT c.id, c.external_number, jr.judgment_path, d.result, d.technique, d.argumentative_density
   FROM judx_case c
   JOIN judx_judgment_regime jr ON jr.case_id = c.id
   JOIN judx_decision d ON d.case_id = c.id
   WHERE c.court_id = p_court_id
   AND jr.judgment_path IN (''virtual_para_presencial'', ''presencial_para_virtual'', ''hibrido'')
   ORDER BY c.decided_at NULLS LAST'
`);

await r("judx_has_active_principle", `
  CREATE OR REPLACE FUNCTION judx_has_active_principle(p_code text)
  RETURNS boolean LANGUAGE sql AS
  'SELECT EXISTS (SELECT 1 FROM judx_system_principle WHERE code = p_code AND is_active = true)'
`);

// ── 4. View that depends on judx_judge_position_in_case ──
console.log("\n=== VIEWS ===");

await r("judx_judge_behavior_snapshot", `
  CREATE OR REPLACE VIEW judx_judge_behavior_snapshot AS
  SELECT j.id as judge_id, j.name as judge_name, c.external_number,
    jp.role, jp.vote_type, jp.leading_vote, jp.majority_side,
    d.result, d.technique, d.session_environment, d.argumentative_density,
    cc.majority_stability
  FROM judx_judge_position_in_case jp
  JOIN judx_judge j ON j.id = jp.judge_id
  JOIN judx_case c ON c.id = jp.case_id
  LEFT JOIN judx_decision d ON d.id = jp.decision_id
  LEFT JOIN judx_collegial_context cc ON cc.case_id = jp.case_id AND (cc.decision_id = jp.decision_id OR cc.decision_id IS NULL)
`);

// ── 5. Updated_at triggers (individual statements instead of DO block) ──
console.log("\n=== UPDATED_AT TRIGGERS ===");

const triggerTables = [
  'judx_court','judx_ecology','judx_organ','judx_procedural_class','judx_case',
  'judx_judgment_regime','judx_judge','judx_decision','judx_situated_profile',
  'judx_environmental_profile','judx_decision_line','judx_decisional_dna',
  'judx_emergent_taxonomy','judx_unknown_pattern_registry','judx_prompt_template',
  'judx_system_principle'
];

for (const t of triggerTables) {
  await r(`trigger ${t}`,
    `CREATE OR REPLACE TRIGGER trg_${t}_updated_at BEFORE UPDATE ON ${t} FOR EACH ROW EXECUTE FUNCTION judx_set_updated_at()`);
}

// ── 6. System principles INSERT (escaped) ──
console.log("\n=== SYSTEM PRINCIPLES SEED ===");

const principles = [
  ['NO_DATA_WITHOUT_CONTEXT', 'Nenhum dado entra sem contexto',
   'Nenhum dado entra no sistema sem contexto institucional, processual ou relacional mínimo que permita sua interpretação.',
   'O dado jurídico bruto não é suficiente; todo registro deve estar vinculado a uma ecologia decisória.'],
  ['NO_ISOLATED_DECISION', 'Nenhuma decisão é tratada como texto isolado',
   'Nenhuma decisão deve ser tratada como texto isolado; toda decisão deve poder ser relacionada a caso, ambiente, órgão, julgador ou linha decisória.',
   'A decisão é manifestação de um sistema vivo e não documento autossuficiente.'],
  ['ENVIRONMENT_SHIFT_IS_RELEVANT', 'Mudança de ambiente é hipótese relevante',
   'Toda mudança de ambiente entre virtual, presencial ou híbrido constitui hipótese relevante de alteração de comportamento, técnica, linguagem ou resultado.',
   'A trajetória ambiental do caso integra o núcleo observável do Judx.'],
  ['ALLOW_PRETAXONOMIC_REGISTRATION', 'O ainda não nomeado deve ser registrável',
   'Padrões, sinais ou recorrências ainda não estabilizados conceitualmente devem poder ser registrados antes de sua consolidação taxonômica.',
   'O sistema deve capturar fenômenos emergentes antes de sua domesticação classificatória.'],
];

for (const [code, title, normative, rationale] of principles) {
  const client = new Client(CONN);
  try {
    await client.connect();
    await client.query(
      `INSERT INTO judx_system_principle (code, title, normative_text, rationale) VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING`,
      [code, title, normative, rationale]
    );
    console.log(`  + principle: ${code}`);
    ok++;
  } catch (e) {
    console.error(`  X principle ${code}: ${e.message.slice(0, 80)}`);
    errs++;
  } finally {
    try { await client.end(); } catch {}
  }
}

// ── 7. Governance comments ──
console.log("\n=== GOVERNANCE COMMENTS ===");

await r("comment judx_case", `COMMENT ON TABLE judx_case IS 'Regra estrutural: nenhum dado entra sem contexto.'`);
await r("comment judx_decision", `COMMENT ON TABLE judx_decision IS 'Regra estrutural: nenhuma decisão é tratada como texto isolado.'`);
await r("comment judx_judgment_regime", `COMMENT ON TABLE judx_judgment_regime IS 'Regra estrutural: mudança de ambiente é hipótese relevante.'`);
await r("comment judx_unknown_pattern_registry", `COMMENT ON TABLE judx_unknown_pattern_registry IS 'Regra estrutural: o que ainda não tem nome deve poder ser registrado.'`);
await r("comment judx_latent_signal", `COMMENT ON TABLE judx_latent_signal IS 'Sinais ainda não estabilizados conceitualmente.'`);

// ── 8. Validation triggers (rewritten without $$) ──
console.log("\n=== VALIDATION TRIGGERS ===");

await r("validate_case_context fn", `
  CREATE OR REPLACE FUNCTION judx_validate_case_context() RETURNS trigger LANGUAGE plpgsql AS
  'BEGIN
    IF NEW.court_id IS NULL THEN
      RAISE EXCEPTION ''JUDX_RULE_VIOLATION: court_id é obrigatório.'';
    END IF;
    IF NEW.procedural_class_id IS NULL AND NEW.main_subject_id IS NULL AND NEW.organ_id IS NULL AND COALESCE(NEW.summary, '''') = '''' AND COALESCE(NEW.metadata, ''{}''::jsonb) = ''{}''::jsonb THEN
      RAISE EXCEPTION ''JUDX_RULE_VIOLATION: forneça ao menos classe, assunto, órgão, resumo ou metadata.'';
    END IF;
    RETURN NEW;
  END;'
`);

await r("validate_case_context trigger",
  `CREATE OR REPLACE TRIGGER trg_judx_validate_case_context BEFORE INSERT OR UPDATE ON judx_case FOR EACH ROW EXECUTE FUNCTION judx_validate_case_context()`);

await r("validate_decision fn", `
  CREATE OR REPLACE FUNCTION judx_validate_decision_not_isolated() RETURNS trigger LANGUAGE plpgsql AS
  'BEGIN
    IF NEW.case_id IS NULL THEN
      RAISE EXCEPTION ''JUDX_RULE_VIOLATION: case_id é obrigatório.'';
    END IF;
    IF COALESCE(NEW.full_text, '''') = '''' AND COALESCE(NEW.excerpt, '''') = '''' AND COALESCE(NEW.metadata, ''{}''::jsonb) = ''{}''::jsonb THEN
      RAISE EXCEPTION ''JUDX_RULE_VIOLATION: decisão sem texto, excerto ou metadata.'';
    END IF;
    RETURN NEW;
  END;'
`);

await r("validate_decision trigger",
  `CREATE OR REPLACE TRIGGER trg_judx_validate_decision_not_isolated BEFORE INSERT OR UPDATE ON judx_decision FOR EACH ROW EXECUTE FUNCTION judx_validate_decision_not_isolated()`);

await r("validate_environment_shift fn", `
  CREATE OR REPLACE FUNCTION judx_validate_environment_shift() RETURNS trigger LANGUAGE plpgsql AS
  'BEGIN
    IF NEW.initial_environment IS DISTINCT FROM NEW.final_environment AND NEW.final_environment IS NOT NULL AND NEW.judgment_path = ''nao_identificado'' THEN
      RAISE EXCEPTION ''JUDX_RULE_VIOLATION: mudança de ambiente sem judgment_path identificado.'';
    END IF;
    IF NEW.was_highlighted = true AND NEW.highlight_count < 1 THEN
      RAISE EXCEPTION ''JUDX_RULE_VIOLATION: was_highlighted=true exige highlight_count >= 1.'';
    END IF;
    RETURN NEW;
  END;'
`);

await r("validate_environment_shift trigger",
  `CREATE OR REPLACE TRIGGER trg_judx_validate_environment_shift BEFORE INSERT OR UPDATE ON judx_judgment_regime FOR EACH ROW EXECUTE FUNCTION judx_validate_environment_shift()`);

await r("validate_unknown_pattern fn", `
  CREATE OR REPLACE FUNCTION judx_validate_unknown_pattern_registry() RETURNS trigger LANGUAGE plpgsql AS
  'BEGIN
    IF COALESCE(TRIM(NEW.pattern_label), '''') = '''' THEN
      RAISE EXCEPTION ''JUDX_RULE_VIOLATION: pattern_label provisório obrigatório.'';
    END IF;
    IF COALESCE(TRIM(NEW.description), '''') = '''' AND COALESCE(NEW.hypothesis, ''{}''::jsonb) = ''{}''::jsonb AND COALESCE(NEW.linked_cases, ''[]''::jsonb) = ''[]''::jsonb AND COALESCE(NEW.linked_events, ''[]''::jsonb) = ''[]''::jsonb THEN
      RAISE EXCEPTION ''JUDX_RULE_VIOLATION: registro pré-taxonômico exige descrição, hipótese, casos ou eventos.'';
    END IF;
    RETURN NEW;
  END;'
`);

await r("validate_unknown_pattern trigger",
  `CREATE OR REPLACE TRIGGER trg_judx_validate_unknown_pattern_registry BEFORE INSERT OR UPDATE ON judx_unknown_pattern_registry FOR EACH ROW EXECUTE FUNCTION judx_validate_unknown_pattern_registry()`);

// ── FINAL VALIDATION ──
console.log("\n=== FINAL VALIDATION ===");
const vc = new Client(CONN);
await vc.connect();
const q = async (sql) => (await vc.query(sql)).rows;

const tables = await q("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'judx_%' ORDER BY table_name");
console.log(`Tables: ${tables.length}`);

const views = await q("SELECT table_name FROM information_schema.views WHERE table_schema='public' AND table_name LIKE 'judx_%' ORDER BY table_name");
console.log(`Views: ${views.length}`);

const funcs = await q("SELECT DISTINCT routine_name FROM information_schema.routines WHERE routine_schema='public' AND routine_name LIKE 'judx_%' ORDER BY routine_name");
console.log(`Functions: ${funcs.length}`);
funcs.forEach(r => console.log(`  + ${r.routine_name}`));

const pr = await q("SELECT code FROM judx_system_principle ORDER BY code");
console.log(`Principles: ${pr.length}`);
pr.forEach(r => console.log(`  + ${r.code}`));

await vc.end();

console.log(`\n=== DONE: ${ok} OK, ${errs} errors ===`);
