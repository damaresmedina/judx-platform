---
name: judx-query
description: "Query and analyze JudX and ICONS databases (Supabase PostgreSQL). Use this skill whenever the user asks to run SQL, check data, query the banco, verify counts, analyze decisions, check pipeline status, or asks anything about stf_decisoes, judx_case, judx_decision, stj_temas, stj_processos_semente, stj_contramostra, stf_partes, or ICONS objects/edges. Also trigger when user pastes SQL or asks 'quantos', 'como está', 'verifica', 'roda isso', or mentions banco/database/supabase in context of JudX or ICONS."
---

# JudX Query — Análise de Banco Jurídico

You have access to two PostgreSQL databases via Supabase. Connect using `node` with the `pg` module (already installed in `C:\projetos\icons\node_modules\pg`).

## Connection Strings

```
JudX:  postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres
ICONS: postgresql://postgres:RHuQvsf4shpsPRjP@db.hetuhkhhppxjliiaerlu.supabase.co:6543/postgres
```

JudX and ICONS are **completely separate** — never cross data between them.

## How to Execute Queries

Write a temporary `.js` file in `C:\projetos\icons\`, run it with `node`, then delete it:

```javascript
const { Client } = require('pg');
const c = new Client({connectionString: 'CONNECTION_STRING', ssl:{rejectUnauthorized:false}});
c.connect().then(async () => {
  const r = await c.query("YOUR SQL HERE");
  console.table(r.rows); // or custom formatting
  await c.end();
}).catch(e => { console.error(e.message); c.end(); });
```

Always clean up: `rm C:\projetos\icons\tmp_q.js` after running.

## Schema Reference — JudX Database

### Raw STF data (Camada 1)
- **stf_decisoes** (169,851 rows) — Raw from Corte Aberta. Key columns: `processo`, `classe`, `orgao_julgador`, `relator_decisao`, `data_decisao` (text DD/MM/YYYY), `descricao_andamento`, `observacao_andamento`, `tipo_decisao`, `incidente` (bigint), `decisoes_virtual` (boolean), `ramo_direito`
- **stf_partes** (~140K+ rows, growing) — Parties extracted from STF portal. Key: `incidente`, `processo`, `papel`, `nome`, `tipo` (oab/ente_publico/pessoa_fisica/pessoa_juridica)

### Normalized STF (Camada 2)
- **judx_case** (139,737 rows) — `external_number`, `court_id` (uuid FK), `organ_id`, `procedural_class_id`, `main_subject_id`, `decided_at`, `metadata` (jsonb with incidente, source_table, link_processo)
- **judx_decision** (224,887 rows) — `case_id`, `decision_date`, `kind` (enum: acordao/monocratica/outra), `result` (enum: procedente/improcedente/nao_conhecido/etc), `session_environment`, `metadata` (jsonb)
- **judx_court** (2 rows) — STF and STJ, with `acronym` and uuid `id`

### STJ data
- **stj_temas** (1,420 rows) — `numero` (unique), `situacao`, `orgao_julgador`, `ramo_direito`, `questao`, `tese_firmada`, `processos_afetados` (jsonb array), `link_stf_rg`, `relator`, `data_afetacao`, `data_julgamento`
- **stj_processos_semente** (2,509 rows) — `tema_numero`, `processo`, `classe`, `numero`, `uf_origem`, `tribunal_origem`, `relator`, `rrc` (boolean), `data_afetacao`
- **stj_contramostra** (3,902 rows) — `processo`, `classe`, `numero`, `relator`, `data_decisao`, `ano_afetacao`, `tipo`, `fonte` (scon/datajud)

## Schema Reference — ICONS Database

- **objects** (public schema) — `id` (uuid), `slug`, `type_slug` (registro_jurisprudencial/processo/artigo/inciso/paragrafo/alinea/etc), `payload` (jsonb)
- **edges** (public schema) — `edge_id`, `type_slug` (ancora_normativa/ancora_processual/relator_de/produzido_por), `source_id`, `target_id`, `payload` (jsonb)

## Important Gotchas

- `data_decisao` in stf_decisoes is **text** formatted DD/MM/YYYY, not a date. Parse with: `TO_DATE(data_decisao, 'DD/MM/YYYY')` or `SUBSTRING(data_decisao FROM '\d{4}$')::int` for year
- `court_id` in judx_case is a **uuid**, not text. Get it with: `SELECT id FROM judx_court WHERE acronym='STF'`
- ICONS uses `type_slug` not `edge_type`. No `label` column — use `slug` or `name`
- The join `judx_decision ↔ stf_decisoes` via `(metadata->>'incidente')::bigint` is **very slow**. Prefer querying stf_decisoes directly when possible
- `decisoes_virtual = true` covers 85% of corpus. `ambiente_julgamento` (Presencial/Virtual) only exists for 2026 data
- `observacao_andamento` has the full decision text (long). `descricao_andamento` has the short result category

## Output Formatting

- Use `console.table()` for small result sets
- For larger results, format as aligned columns with `.padEnd()` / `.padStart()`
- Always report totals, percentages, and context
- Clean up temp files after every query
