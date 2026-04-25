"""Cleanup idempotente de ruído em stj_composicao_temporal_v7.

Remove linhas-fantasma do parser:
- nome_raw com sufixos numéricos/barras (ex: "Salomão2 17/", "Bellize" sem ZZ)
- duplicação por (ministro_key, data_referencia, orgao_codigo) — mantém a com mais campos preenchidos
- linhas onde nome_raw é variação do mesmo ministro_key na mesma chave

Idempotente: roda N vezes, mesmo resultado.
Saídas: flat DuckDB local + Supabase + CSV canônico.
"""
import sys, csv, re, time, json
sys.stdout.reconfigure(encoding='utf-8')
import duckdb, requests
from pathlib import Path

t0 = time.time()
def log(m): print(f'[{time.time()-t0:>5.1f}s] {m}', flush=True)

DUCKDB = r'G:/staging_local/stj_flat_canonical.duckdb'
OUT_CSV = Path(r'C:/Users/medin/projetos/judx-platform/scripts/seeds-tribunais/stj-flat-canonical-25abr/artefatos/composicao_stj_canonical_v7_limpa.csv')

URL = "https://ejwyguskoiraredinqmb.supabase.co/rest/v1"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqd3lndXNrb2lyYXJlZGlucW1iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDAyMjk2NywiZXhwIjoyMDg5NTk4OTY3fQ.EpS4OHMuwWvcgqAB5BwnAj7FJCQgIodUZRC9xm0Z1XU"
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
     "Content-Type": "application/json", "Prefer": "return=minimal"}

con = duckdb.connect(DUCKDB)

log('1) Lendo v7 atual')
n_antes = con.execute("SELECT COUNT(*) FROM stj_composicao_temporal_v7").fetchone()[0]
log(f'  v7 antes: {n_antes:,} linhas')

log('2) Identificando ruído')

# Critério de "linha-fantasma":
# - nome_raw termina com algo que não seja letra (lixo do parser): "Salomão2 17/", "Marques 4."
# - nome_raw com dígitos no meio (variação do parser)
# - JÁ existe linha equivalente com nome_raw mais limpo (mesmo ministro_key + data_ref + orgao)
con.execute("""
CREATE TEMP TABLE _v7_score AS
SELECT
  rowid AS rid,
  *,
  -- Score: quanto MAIS limpo, MAIOR score (preferimos)
  CASE WHEN nome_raw ~ '[0-9]/?\\s*$' THEN 0 ELSE 100 END
  + CASE WHEN data_ingresso_orgao IS NOT NULL AND data_ingresso_orgao <> '' THEN 50 ELSE 0 END
  + CASE WHEN ordem IS NOT NULL AND CAST(ordem AS VARCHAR) <> '' THEN 30 ELSE 0 END
  + CASE WHEN observacao IS NOT NULL AND observacao <> '' THEN 10 ELSE 0 END
  + CASE WHEN tipo_registro = 'snapshot_historico' THEN 5
         WHEN tipo_registro = 'guia_membro' THEN 4
         WHEN tipo_registro = 'guia_presidencia' THEN 3
         WHEN tipo_registro = 'seed_historico' THEN 2 ELSE 1 END
  - LENGTH(REGEXP_REPLACE(nome_raw, '[A-Za-zÀ-ÿ\\s]', '', 'g')) * 5  -- penaliza chars não-alfa
  AS score
FROM stj_composicao_temporal_v7
""")

log('3) Dedup por (ministro_key, data_referencia, orgao_codigo) — prefere maior score')
con.execute("""
CREATE TEMP TABLE _v7_limpa AS
SELECT * EXCLUDE (rid, score)
FROM _v7_score
WHERE rid IN (
  SELECT rid FROM (
    SELECT rid, score,
      ROW_NUMBER() OVER (
        PARTITION BY ministro_key, data_referencia, orgao_codigo
        ORDER BY score DESC, rid ASC
      ) AS rn
    FROM _v7_score
  ) WHERE rn = 1
)
""")

n_dedup = con.execute("SELECT COUNT(*) FROM _v7_limpa").fetchone()[0]
log(f'  após dedup: {n_dedup:,} linhas (removidas {n_antes - n_dedup:,})')

log('4) Substituindo tabela canônica')
con.execute("DROP TABLE stj_composicao_temporal_v7")
con.execute("CREATE TABLE stj_composicao_temporal_v7 AS SELECT * FROM _v7_limpa")
con.execute("DROP TABLE _v7_score")
con.execute("DROP TABLE _v7_limpa")

# Validação dos casos críticos
log('5) Validação dos casos críticos')
for k in ['LUIS FELIPE SALOMAO','MARCO AURELIO BELLIZZE OLIVEIRA','MAURO CAMPBELL MARQUES','PAULO DE TARSO VIEIRA SANSEVERINO']:
    rows = con.execute(f"""
    SELECT data_referencia, orgao_codigo, nome_raw, data_ingresso_orgao
    FROM stj_composicao_temporal_v7
    WHERE ministro_key = ?
    ORDER BY data_referencia, orgao_codigo
    LIMIT 8
    """, [k]).fetchall()
    print(f'\n  {k}: {len(rows)} primeiras linhas (de muitas):')
    for r in rows: print(f'    {r}')

log('\n6) Exportando CSV + atualizando Supabase')
# Exportar CSV
OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
con.execute(f"COPY stj_composicao_temporal_v7 TO '{OUT_CSV.as_posix()}' (HEADER, DELIMITER ',', QUOTE '\"')")
log(f'  CSV: {OUT_CSV.name}')

# Carregar para upload
recs = con.execute("SELECT * FROM stj_composicao_temporal_v7").fetchdf().to_dict('records')

# Normalizar Nones e tipos JSON
def clean(v):
    if v is None: return None
    if isinstance(v, float):
        import math
        if math.isnan(v): return None
    s = str(v).strip()
    return None if s == '' or s.lower()=='nan' else s

clean_recs = [{k: clean(v) for k, v in r.items()} for r in recs]
log(f'  {len(clean_recs)} registros prontos')

# DELETE all + INSERT batch
r = requests.delete(f"{URL}/stj_composicao_temporal_v7?ministro_key=neq.__nope__", headers=H, timeout=60)
log(f'  DELETE Supabase: {r.status_code}')

batch = 1000
sent = 0
for i in range(0, len(clean_recs), batch):
    chunk = clean_recs[i:i+batch]
    r = requests.post(f"{URL}/stj_composicao_temporal_v7", headers=H, data=json.dumps(chunk), timeout=120)
    if r.status_code in (200,201,204):
        sent += len(chunk)
    else:
        log(f'  batch {i}: HTTP {r.status_code} {r.text[:200]}')

log(f'  Supabase: {sent}/{len(clean_recs)} enviados')

r = requests.get(f"{URL}/stj_composicao_temporal_v7?select=count", headers={**H, "Prefer": "count=exact"}, timeout=30)
n_remoto = r.headers.get('content-range', '0/0').split('/')[-1]
log(f'  Supabase agora: {n_remoto} linhas')

con.close()
log('OK — v7 limpa, idempotente')
