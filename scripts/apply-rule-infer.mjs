/**
 * Regra estrutural: inferir ambiente e posição do relator a partir do texto.
 * Cria: princípio, tabelas, view, regras de inferência.
 */
import pg from "pg";
const { Client } = pg;

const CONN = {
  host: "db.ejwyguskoiraredinqmb.supabase.co",
  port: 6543, database: "postgres", user: "postgres",
  password: "Zb9cHoRww7WxgT0C",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
};

let ok = 0, errs = 0;

async function run(label, sql, params) {
  const client = new Client(CONN);
  try {
    await client.connect();
    await client.query(sql, params || []);
    console.log(`  + ${label}`);
    ok++;
  } catch (e) {
    const msg = e.message.replace(/\n/g, " ").slice(0, 120);
    if (msg.includes("already exists") || msg.includes("duplicate")) {
      console.log(`  ~ ${label} (exists)`); ok++;
    } else {
      console.error(`  X ${label}: ${msg}`); errs++;
    }
  } finally {
    try { await client.end(); } catch {}
  }
}

// ── 1. Princípio ──
console.log("\n=== SYSTEM PRINCIPLE ===");
await run("INFER_FROM_TEXT_WHEN_MISSING",
  `INSERT INTO judx_system_principle (code, title, normative_text, rationale)
   VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING`,
  [
    "INFER_FROM_TEXT_WHEN_MISSING",
    "Inferir ambiente e posição a partir do texto quando ausentes",
    "Quando o ambiente de julgamento ou a posição do julgador não vierem explicitados em campos próprios, a máquina deverá inferi-los a partir do texto do acórdão, com prioridade para cabeçalho e fórmulas institucionais recorrentes. Essas inferências devem distinguir valor, fonte e confiança. A posição do relator constitui variável central: o sistema deve medir prevalência, vencimento e substituição por relator para acórdão, inclusive com comparação entre ambientes.",
    "O dado jurídico frequentemente não separa ambiente e posição em campos estruturados. O sistema precisa extrair essas dimensões do texto sem perder rastreabilidade da inferência.",
  ]
);

// ── 2. Regras de inferência ──
console.log("\n=== INFERENCE RULES ===");
await run("rule INFERENCIA_TEXTUAL_AMBIENTE",
  `INSERT INTO judx_inference_rule (code, name, description, active)
   VALUES ($1, $2, $3, true) ON CONFLICT (code) DO NOTHING`,
  [
    "INFERENCIA_TEXTUAL_AMBIENTE",
    "Inferência textual de ambiente e posição",
    "Extrai ambiente de julgamento (virtual/presencial/híbrido) e posição do julgador (relator prevalente, vencido, substituído) a partir do texto do acórdão quando campos estruturados estão ausentes. Prioriza cabeçalho e fórmulas institucionais.",
  ]
);

await run("rule RELATOR_PREVALENCIA",
  `INSERT INTO judx_inference_rule (code, name, description, active)
   VALUES ($1, $2, $3, true) ON CONFLICT (code) DO NOTHING`,
  [
    "RELATOR_PREVALENCIA",
    "Prevalência do relator",
    "Mede quantas vezes o relator prevalece, é vencido ou substituído por relator para acórdão, com comparação entre ambientes virtual e presencial. Variável central do sistema.",
  ]
);

await run("rule RELATOR_SUBSTITUICAO_AMBIENTAL",
  `INSERT INTO judx_inference_rule (code, name, description, active)
   VALUES ($1, $2, $3, true) ON CONFLICT (code) DO NOTHING`,
  [
    "RELATOR_SUBSTITUICAO_AMBIENTAL",
    "Substituição do relator sensível ao ambiente",
    "Detecta se a substituição do relator por relator para acórdão ocorre com frequência diferente entre ambientes virtual e presencial.",
  ]
);

// ── 3. Tabela de inferências textuais ──
console.log("\n=== TEXT INFERENCE TABLE ===");
await run("judx_text_inference",
  `CREATE TABLE IF NOT EXISTS judx_text_inference (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id uuid NOT NULL REFERENCES judx_case(id) ON DELETE CASCADE,
    decision_id uuid REFERENCES judx_decision(id) ON DELETE CASCADE,
    judge_id uuid REFERENCES judx_judge(id) ON DELETE SET NULL,
    inferred_field text NOT NULL,
    inferred_value text NOT NULL,
    source_fragment text,
    source_location text,
    pattern_matched text,
    confidence numeric(5,4) NOT NULL,
    status judx_inference_status_enum NOT NULL DEFAULT 'inferido',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`
);

await run("idx_text_inference_case",
  `CREATE INDEX IF NOT EXISTS idx_judx_text_inference_case ON judx_text_inference(case_id)`);
await run("idx_text_inference_decision",
  `CREATE INDEX IF NOT EXISTS idx_judx_text_inference_decision ON judx_text_inference(decision_id)`);
await run("idx_text_inference_field",
  `CREATE INDEX IF NOT EXISTS idx_judx_text_inference_field ON judx_text_inference(inferred_field)`);
await run("idx_text_inference_confidence",
  `CREATE INDEX IF NOT EXISTS idx_judx_text_inference_confidence ON judx_text_inference(confidence)`);

await run("comment judx_text_inference",
  `COMMENT ON TABLE judx_text_inference IS 'Inferências extraídas do texto do acórdão quando campos estruturados estão ausentes. Cada registro distingue valor, fonte, padrão e confiança.'`);

// ── 4. Tabela de prevalência agregada do relator ──
console.log("\n=== RELATOR PREVALENCE TABLE ===");
await run("judx_relator_prevalence",
  `CREATE TABLE IF NOT EXISTS judx_relator_prevalence (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    judge_id uuid NOT NULL REFERENCES judx_judge(id) ON DELETE CASCADE,
    court_id uuid NOT NULL REFERENCES judx_court(id) ON DELETE CASCADE,
    organ_id uuid REFERENCES judx_organ(id) ON DELETE SET NULL,
    environment judx_session_environment_enum,
    period_start date,
    period_end date,
    total_as_relator integer NOT NULL DEFAULT 0,
    relator_prevailed integer NOT NULL DEFAULT 0,
    relator_defeated integer NOT NULL DEFAULT 0,
    relator_substituted integer NOT NULL DEFAULT 0,
    prevalence_rate numeric(8,5),
    defeat_rate numeric(8,5),
    substitution_rate numeric(8,5),
    prevalence_rate_virtual numeric(8,5),
    prevalence_rate_presential numeric(8,5),
    defeat_rate_virtual numeric(8,5),
    defeat_rate_presential numeric(8,5),
    substitution_rate_virtual numeric(8,5),
    substitution_rate_presential numeric(8,5),
    environment_differential numeric(8,5),
    auto_description text,
    status judx_inference_status_enum NOT NULL DEFAULT 'rascunho',
    evidence_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`
);

await run("idx_relator_prev_judge",
  `CREATE INDEX IF NOT EXISTS idx_judx_relator_prev_judge ON judx_relator_prevalence(judge_id)`);
await run("idx_relator_prev_court",
  `CREATE INDEX IF NOT EXISTS idx_judx_relator_prev_court ON judx_relator_prevalence(court_id)`);
await run("idx_relator_prev_env",
  `CREATE INDEX IF NOT EXISTS idx_judx_relator_prev_env ON judx_relator_prevalence(environment)`);
await run("trigger relator_prevalence",
  `CREATE OR REPLACE TRIGGER trg_judx_relator_prevalence_updated_at BEFORE UPDATE ON judx_relator_prevalence FOR EACH ROW EXECUTE FUNCTION judx_set_updated_at()`);
await run("comment relator_prevalence",
  `COMMENT ON TABLE judx_relator_prevalence IS 'Variável central: mede prevalência, vencimento e substituição do relator, com comparação entre ambientes virtual e presencial.'`);

// ── 5. Tabela por decisão: posição do relator ──
console.log("\n=== RELATOR DECISION OUTCOME TABLE ===");
await run("judx_relator_decision_outcome",
  `CREATE TABLE IF NOT EXISTS judx_relator_decision_outcome (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id uuid NOT NULL REFERENCES judx_case(id) ON DELETE CASCADE,
    decision_id uuid REFERENCES judx_decision(id) ON DELETE CASCADE,
    relator_judge_id uuid NOT NULL REFERENCES judx_judge(id) ON DELETE CASCADE,
    substitute_judge_id uuid REFERENCES judx_judge(id) ON DELETE SET NULL,
    outcome text NOT NULL DEFAULT 'nao_identificado',
    environment judx_session_environment_enum NOT NULL DEFAULT 'nao_informado',
    inferred_from_text boolean NOT NULL DEFAULT false,
    text_inference_id uuid REFERENCES judx_text_inference(id) ON DELETE SET NULL,
    confidence numeric(5,4),
    source_fragment text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_relator_outcome CHECK (
      outcome IN ('prevaleceu', 'vencido', 'substituido_por_relator_acordao', 'nao_identificado')
    )
  )`
);

await run("idx_rdo_relator",
  `CREATE INDEX IF NOT EXISTS idx_judx_rdo_relator ON judx_relator_decision_outcome(relator_judge_id)`);
await run("idx_rdo_case",
  `CREATE INDEX IF NOT EXISTS idx_judx_rdo_case ON judx_relator_decision_outcome(case_id)`);
await run("idx_rdo_outcome",
  `CREATE INDEX IF NOT EXISTS idx_judx_rdo_outcome ON judx_relator_decision_outcome(outcome)`);
await run("idx_rdo_env",
  `CREATE INDEX IF NOT EXISTS idx_judx_rdo_env ON judx_relator_decision_outcome(environment)`);
await run("comment relator_decision_outcome",
  `COMMENT ON TABLE judx_relator_decision_outcome IS 'Posição do relator em cada decisão: prevaleceu, vencido ou substituído por relator para acórdão. Vincula à inferência textual quando extraído do texto.'`);

// ── 6. View: comparação do relator por ambiente ──
console.log("\n=== RELATOR ENVIRONMENT VIEW ===");
await run("judx_relator_environment_comparison",
  `CREATE OR REPLACE VIEW judx_relator_environment_comparison AS
   SELECT
     j.id AS judge_id, j.name AS judge_name,
     co.acronym AS court_acronym,
     rdo.environment,
     COUNT(*) AS total,
     COUNT(*) FILTER (WHERE rdo.outcome = 'prevaleceu') AS prevaleceu,
     COUNT(*) FILTER (WHERE rdo.outcome = 'vencido') AS vencido,
     COUNT(*) FILTER (WHERE rdo.outcome = 'substituido_por_relator_acordao') AS substituido,
     ROUND(COUNT(*) FILTER (WHERE rdo.outcome = 'prevaleceu')::numeric / NULLIF(COUNT(*), 0), 4) AS prevalence_rate,
     ROUND(COUNT(*) FILTER (WHERE rdo.outcome = 'vencido')::numeric / NULLIF(COUNT(*), 0), 4) AS defeat_rate,
     ROUND(COUNT(*) FILTER (WHERE rdo.outcome = 'substituido_por_relator_acordao')::numeric / NULLIF(COUNT(*), 0), 4) AS substitution_rate
   FROM judx_relator_decision_outcome rdo
   JOIN judx_judge j ON j.id = rdo.relator_judge_id
   JOIN judx_case c ON c.id = rdo.case_id
   JOIN judx_court co ON co.id = c.court_id
   GROUP BY j.id, j.name, co.acronym, rdo.environment`
);

// ── 7. Tabela de padrões textuais conhecidos ──
console.log("\n=== TEXT PATTERN CATALOG ===");
await run("judx_text_pattern_catalog",
  `CREATE TABLE IF NOT EXISTS judx_text_pattern_catalog (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_regex text NOT NULL,
    pattern_label text NOT NULL,
    inferred_field text NOT NULL,
    inferred_value text NOT NULL,
    priority integer NOT NULL DEFAULT 100,
    default_confidence numeric(5,4) NOT NULL DEFAULT 0.8,
    court_id uuid REFERENCES judx_court(id) ON DELETE CASCADE,
    active boolean NOT NULL DEFAULT true,
    examples text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(pattern_regex, inferred_field)
  )`
);

// Seed: padrões conhecidos
const patterns = [
  ["Plenário Virtual|PV",             "session_environment", "virtual",         0.92, "Plenário Virtual, PV"],
  ["Turma Virtual|TV",                "session_environment", "virtual",         0.90, "Turma Virtual, TV"],
  ["Sessão Virtual",                   "session_environment", "virtual",         0.90, "Sessão Virtual"],
  ["Plenário(?!\\s*Virtual)",          "session_environment", "presencial",      0.85, "Plenário (sem Virtual)"],
  ["Sessão Presencial",               "session_environment", "presencial",      0.92, "Sessão Presencial"],
  ["Relator para [Oo] [Aa]córdão",    "relator_outcome",    "substituido_por_relator_acordao", 0.95, "Relator para o Acórdão"],
  ["[Vv]encido o [Rr]elator",         "relator_outcome",    "vencido",         0.93, "vencido o Relator"],
  ["[Rr]elator designado",            "relator_outcome",    "substituido_por_relator_acordao", 0.90, "Relator designado"],
  ["[Vv]oto vencido.*[Rr]elator",     "relator_outcome",    "vencido",         0.88, "Voto vencido do Relator"],
  ["[Dd]estaque",                      "environment_event",  "destaque",        0.80, "Destaque para julgamento"],
];

for (const [regex, field, value, conf, examples] of patterns) {
  await run(`pattern: ${field}=${value}`,
    `INSERT INTO judx_text_pattern_catalog (pattern_regex, pattern_label, inferred_field, inferred_value, default_confidence, examples)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (pattern_regex, inferred_field) DO NOTHING`,
    [regex, `Auto: ${field}=${value}`, field, value, conf, examples]
  );
}

await run("comment text_pattern_catalog",
  `COMMENT ON TABLE judx_text_pattern_catalog IS 'Catálogo de fórmulas institucionais recorrentes para inferência textual. Prioriza cabeçalho do acórdão.'`);

// ── DONE ──
console.log(`\n========================================`);
console.log(`DONE: ${ok} OK, ${errs} errors`);
console.log(`========================================`);
