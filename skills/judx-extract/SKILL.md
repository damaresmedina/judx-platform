---
name: judx-extract
description: "Extract and ingest data from STF and STJ sources into JudX database. Use this skill when the user asks to extract, scrape, fetch, baixar, extrair, ingerir data from STF portal, STJ portal, CKAN, Datajud CNJ, Corte Aberta, or any judicial data source. Also trigger when user mentions pipeline, extração, partes, temas repetitivos, processos-semente, contramostra, or wants to populate/fill database tables."
---

# JudX Extract — Pipeline de Extração de Dados Judiciais

## Available Data Sources

| Source | Endpoint | Status | Rate Limit |
|---|---|---|---|
| STF Corte Aberta | Excel files in `C:\projetos\judx\STF\` | Loaded (169K) | N/A |
| STF Portal (partes) | `portal.stf.jus.br/processos/abaPartes.asp?incidente=N` | Working | 3 concurrent, 400ms delay, pause 60s/500req |
| STJ Repetitivos | `processo.stj.jus.br/repetitivos/temas_repetitivos/pesquisa.jsp` | Working | Needs JSESSIONID cookie, 2s between pages |
| STJ CKAN | `dadosabertos.web.stj.jus.br/api/3/action/` | Working (2022+) | 1.5-3s between files |
| Datajud CNJ | `api-publica.datajud.cnj.jus.br/api_publica_stj/_search` | Working (all years) | ApiKey auth, 800ms delay |
| STJ SCON | `scon.stj.jus.br` | **BLOCKED (403 Cloudflare)** | N/A |
| STJ Portal pesquisa | `processo.stj.jus.br/processo/pesquisa/` | **BLOCKED (403 Cloudflare)** | N/A |

## Existing Scripts (C:\Users\medin\projetos\judx-platform\scripts\)

- `run-stf-pipeline-fast.mjs` — Normalizes stf_decisoes → judx_case + judx_decision
- `fetch-stf-partes-safe.mjs` — Extracts parties from STF portal (conservative rate limit)
- `fetch-stj-temas.mjs` — Extracts all 1,420 repetitive themes from STJ
- `fetch-stj-rede-minima.mjs` — Extracts seed process metadata from tema pages
- `stj-contramostra-pipeline.mjs` — Extracts control sample from CKAN (2022+)
- `stj-contramostra-datajud.mjs` — Extracts control sample from Datajud API (2008-2021)

## Rate Limit Patterns

### Conservative (STF Portal — was IP-banned before)
```javascript
const CONFIG = {
  concurrency: 3,
  delayMs: 400,
  pauseEvery: 500,
  pauseDuration: 60000,  // 1min pause
  retryOn429: 300000,    // 5min wait on 429
  userAgents: [/* rotate 3 UAs */]
};
```

### Moderate (STJ Repetitivos — session-based)
```javascript
// Get JSESSIONID first via novaConsulta=true
// Then paginate with l=100&i=N using cookie
// 2s between pages, 30s pause every 5 pages
```

### Datajud API
```javascript
const DATAJUD_URL = 'https://api-publica.datajud.cnj.jus.br/api_publica_stj/_search';
const DATAJUD_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
// POST with Authorization: ApiKey header
// Sort by dataAjuizamento (date format: "20240621000000")
// search_after pagination (no _id sort — disabled)
// 800ms between requests
```

## Key Patterns

### Always add keepalive for long-running scripts
```javascript
const keepalive = setInterval(() => { client.query('SELECT 1').catch(() => {}); }, 30000);
// ... at end:
clearInterval(keepalive);
```

### Always log to file for background processes
```bash
node --max-old-space-size=4096 scripts/my-script.mjs > logs/my-script.log 2>&1 &
echo "PID: $!"
```

### Disable sleep during long extractions
```bash
powercfg.exe //change standby-timeout-ac 0
powercfg.exe //change standby-timeout-dc 0
```

### Check for duplicate processes before launching
```bash
wmic process where "name='node.exe'" get processid,commandline 2>/dev/null | grep my-script
```

## Database Targets

All extraction goes to JudX database (ejwyguskoiraredinqmb). NEVER insert STJ/STF data into ICONS database (hetuhkhhppxjliiaerlu). The ICONS database is only for constitutional anchoring (objects + edges).

## STJ CKAN Structure

Dataset: `integras-de-decisoes-terminativas-e-acordaos-do-diario-da-justica`
- 923 metadata JSON files (metadados*.json), Feb 2022 to present
- Early 2022 format: `ministro`, `dataDistribuicao`, timestamps in milliseconds
- Late 2024+ format: `NM_MINISTRO`, `dataDistribuição`, ISO date strings
- Always decode dates: `"20240621000000"` → `"2024-06-21"`
- ~5,000-6,000 decisions per day, 75% AREsp

## Datajud STJ Classes (confirmed via probe)

| Class | Code | Count |
|---|---|---|
| AREsp | 11881 | 1,837,744 |
| REsp | 1032 | 593,040 |
| HC | 1720 | 614,774 |
| RHC | 1722 | 116,396 |
