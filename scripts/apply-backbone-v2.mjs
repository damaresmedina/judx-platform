/**
 * Aplica a migração do backbone v2 no Supabase do JudX.
 * Tenta conexão via pooler (JWT auth) e depois via conexão direta.
 */
import { readFileSync } from "fs";
import { Client } from "pg";

const SQL_PATH = new URL(
  "../supabase/migrations/20260326120000_judx_structural_backbone_v2.sql",
  import.meta.url
).pathname.replace(/^\/([A-Z]:)/, "$1"); // Fix Windows paths

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!SERVICE_KEY || !SUPABASE_URL) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}

// Extract project ref from URL
const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
console.log(`Project ref: ${ref}`);

const sql = readFileSync(SQL_PATH, "utf-8");
console.log(`SQL loaded: ${sql.length} chars`);

// Connection strategies to try
const strategies = [
  {
    name: "Pooler (transaction mode, JWT auth)",
    config: {
      host: `aws-0-sa-east-1.pooler.supabase.com`,
      port: 6543,
      database: "postgres",
      user: `postgres.${ref}`,
      password: SERVICE_KEY,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    },
  },
  {
    name: "Pooler (session mode, JWT auth)",
    config: {
      host: `aws-0-sa-east-1.pooler.supabase.com`,
      port: 5432,
      database: "postgres",
      user: `postgres.${ref}`,
      password: SERVICE_KEY,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    },
  },
  {
    name: "Direct database connection (JWT as password)",
    config: {
      host: `db.${ref}.supabase.co`,
      port: 5432,
      database: "postgres",
      user: "postgres",
      password: SERVICE_KEY,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    },
  },
];

let connected = false;

for (const strategy of strategies) {
  console.log(`\nTrying: ${strategy.name}...`);
  const client = new Client(strategy.config);

  try {
    await client.connect();
    console.log("Connected!");

    // Test connection
    const test = await client.query("SELECT current_database(), current_user, version()");
    console.log(`Database: ${test.rows[0].current_database}`);
    console.log(`User: ${test.rows[0].current_user}`);

    // Execute migration
    console.log("\nExecuting backbone v2 migration...");
    await client.query(sql);
    console.log("Migration executed successfully!");

    // Validate: count judx tables
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'judx_%'
      ORDER BY table_name
    `);
    console.log(`\nJudx tables created: ${tables.rows.length}`);
    for (const row of tables.rows) {
      console.log(`  ✓ ${row.table_name}`);
    }

    // Validate: count enums
    const enums = await client.query(`
      SELECT typname FROM pg_type
      WHERE typname LIKE 'judx_%'
      ORDER BY typname
    `);
    console.log(`\nJudx enums created: ${enums.rows.length}`);

    // Validate: seed data
    const courts = await client.query(`SELECT acronym, name FROM judx_court ORDER BY acronym`);
    console.log(`\nSeed courts: ${courts.rows.length}`);
    for (const row of courts.rows) {
      console.log(`  ✓ ${row.acronym} — ${row.name}`);
    }

    // Validate: views
    const views = await client.query(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public' AND table_name LIKE 'judx_%'
      ORDER BY table_name
    `);
    console.log(`\nJudx views created: ${views.rows.length}`);
    for (const row of views.rows) {
      console.log(`  ✓ ${row.table_name}`);
    }

    // Validate: functions
    const funcs = await client.query(`
      SELECT routine_name FROM information_schema.routines
      WHERE routine_schema = 'public' AND routine_name LIKE 'judx_%'
      ORDER BY routine_name
    `);
    console.log(`\nJudx functions created: ${funcs.rows.length}`);
    for (const row of funcs.rows) {
      console.log(`  ✓ ${row.routine_name}`);
    }

    // Validate: inference rules
    const rules = await client.query(`SELECT code FROM judx_inference_rule ORDER BY code`);
    console.log(`\nInference rules seeded: ${rules.rows.length}`);

    // Validate: prompt templates
    const templates = await client.query(`SELECT code FROM judx_prompt_template ORDER BY code`);
    console.log(`\nPrompt templates seeded: ${templates.rows.length}`);

    await client.end();
    connected = true;
    break;
  } catch (err) {
    console.error(`Failed: ${err.message}`);
    try { await client.end(); } catch {}
  }
}

if (!connected) {
  console.error("\nAll connection strategies failed.");
  console.error("You may need to provide the database password.");
  process.exit(1);
}

console.log("\n========================================");
console.log("BACKBONE V2 APPLIED AND VALIDATED ✓");
console.log("========================================");
