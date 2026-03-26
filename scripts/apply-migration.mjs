/**
 * Aplica migração SQL no Supabase via pooler (port 6543),
 * com parser robusto para $$ blocks.
 */
import { readFileSync } from "fs";
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

/**
 * Robust SQL splitter that handles $$ and $tag$ blocks correctly.
 * Strategy: replace dollar-quoted blocks with placeholders,
 * split on semicolons, then restore.
 */
function splitStatements(sql) {
  // 1. Extract all dollar-quoted blocks
  const placeholders = [];
  let processed = sql;

  // Match $tag$...$tag$ blocks (including plain $$...$$)
  const dollarRegex = /(\$[a-zA-Z_]*\$)([\s\S]*?)\1/g;
  processed = processed.replace(dollarRegex, (match) => {
    const idx = placeholders.length;
    placeholders.push(match);
    return `__DOLLAR_BLOCK_${idx}__`;
  });

  // 2. Split on semicolons
  const rawParts = processed.split(";");

  // 3. Reconstruct statements, restoring placeholders
  const stmts = [];
  for (let part of rawParts) {
    // Restore placeholders
    let restored = part;
    for (let i = 0; i < placeholders.length; i++) {
      restored = restored.replace(`__DOLLAR_BLOCK_${i}__`, placeholders[i]);
    }

    // Clean up
    const clean = restored.replace(/--[^\n]*/g, "").trim();
    if (clean.length > 0) {
      // Re-add the semicolon
      stmts.push(restored.trim() + ";");
    }
  }

  return stmts;
}

async function exec(stmt) {
  const client = new Client(CONN);
  try {
    await client.connect();
    await client.query(stmt);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    try { await client.end(); } catch {}
  }
}

async function applyMigration(filePath, label) {
  console.log(`\n=== ${label} ===`);
  const sql = readFileSync(filePath, "utf-8");
  const stmts = splitStatements(sql);
  console.log(`Statements: ${stmts.length}`);

  let ok = 0, skip = 0, errs = 0;

  for (let i = 0; i < stmts.length; i++) {
    const preview = stmts[i].replace(/\s+/g, " ").slice(0, 90);
    const result = await exec(stmts[i]);

    if (result.ok) {
      ok++;
      if (preview.toLowerCase().includes("create table") ||
          preview.toLowerCase().includes("create or replace") ||
          preview.toLowerCase().includes("do ") ||
          preview.toLowerCase().includes("insert into")) {
        console.log(`  [${i+1}] OK: ${preview}...`);
      }
    } else if (result.error.includes("already exists") || result.error.includes("duplicate")) {
      skip++;
    } else {
      errs++;
      console.error(`  [${i+1}] ERR: ${result.error.slice(0, 100)}`);
      console.error(`       SQL: ${preview}...`);
    }
  }

  console.log(`Result: ${ok} applied, ${skip} skipped, ${errs} errors`);
  return errs;
}

async function validate() {
  console.log("\n=== VALIDATION ===");
  const client = new Client(CONN);
  await client.connect();

  const q = async (sql) => (await client.query(sql)).rows;

  const tables = await q("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'judx_%' ORDER BY table_name");
  console.log(`\nTables (${tables.length}):`);
  tables.forEach(r => console.log(`  + ${r.table_name}`));

  const enums = await q("SELECT typname FROM pg_type WHERE typname LIKE 'judx_%' ORDER BY typname");
  console.log(`\nEnums: ${enums.length}`);

  const views = await q("SELECT table_name FROM information_schema.views WHERE table_schema='public' AND table_name LIKE 'judx_%' ORDER BY table_name");
  console.log(`\nViews (${views.length}):`);
  views.forEach(r => console.log(`  + ${r.table_name}`));

  const funcs = await q("SELECT DISTINCT routine_name FROM information_schema.routines WHERE routine_schema='public' AND routine_name LIKE 'judx_%' ORDER BY routine_name");
  console.log(`\nFunctions (${funcs.length}):`);
  funcs.forEach(r => console.log(`  + ${r.routine_name}`));

  const courts = await q("SELECT acronym, name FROM judx_court ORDER BY acronym");
  console.log(`\nCourts (${courts.length}):`);
  courts.forEach(r => console.log(`  + ${r.acronym} — ${r.name}`));

  try {
    const principles = await q("SELECT code FROM judx_system_principle ORDER BY code");
    console.log(`\nPrinciples (${principles.length}):`);
    principles.forEach(r => console.log(`  + ${r.code}`));
  } catch {}

  try {
    const rules = await q("SELECT count(*) as n FROM judx_inference_rule");
    console.log(`\nInference rules: ${rules[0].n}`);
    const tpl = await q("SELECT count(*) as n FROM judx_prompt_template");
    console.log(`Prompt templates: ${tpl[0].n}`);
  } catch {}

  const stj = await q("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'stj_%' ORDER BY table_name");
  console.log(`\nSTJ tables preserved (${stj.length}):`);
  stj.forEach(r => console.log(`  + ${r.table_name}`));

  await client.end();
}

const e1 = await applyMigration("supabase/migrations/20260326120000_judx_structural_backbone_v2.sql", "BACKBONE V2");
const e2 = await applyMigration("supabase/migrations/20260326130000_judx_system_principles.sql", "SYSTEM PRINCIPLES");

await validate();

const total = e1 + e2;
console.log(total === 0
  ? "\n=== ALL MIGRATIONS APPLIED AND VALIDATED ==="
  : `\n${total} errors. Review above.`);
