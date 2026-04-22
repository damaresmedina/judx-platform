"""Pós-processamento: adiciona coluna 'confere_origem_decisao' ao judx_decision_ancorado.csv
comparando orgao_julgador_ancorado (via seed) com origem_decisao (linha decisória real do processo).

Regras de conferência:
- MONOCRÁTICA + qualquer TURMA/PRESIDENCIA/VICE → confere (relator pode decidir monocraticamente)
- 1ª TURMA + TURMA_1(_PRESID) → confere
- 2ª TURMA + TURMA_2(_PRESID) → confere
- TRIBUNAL PLENO/PLENÁRIO VIRTUAL + qualquer → confere (plenário = todos)
- 1ª TURMA + TURMA_2 → INCONSISTENTE (seed aponta turma errada ou relator errado)
- SEM_ANCORAGEM → não conferível
"""
import duckdb
from pathlib import Path

OUT_DIR = Path("C:/Users/medin/Desktop/backup_judx/resultados")
SRC = OUT_DIR / "2026-04-19_judx_decision_ancorado.csv"
OUT = OUT_DIR / "2026-04-19_judx_decision_com_conferencia.csv"
INCONSIST = OUT_DIR / "2026-04-19_inconsistencias_ancoragem.csv"
DB = "G:/staging_local/conferencia_tmp.duckdb"

con = duckdb.connect(DB)

print("[load] judx_decision_ancorado.csv (2.93M linhas)...", flush=True)
con.execute(f"""
CREATE OR REPLACE TABLE decisoes AS
SELECT * FROM read_csv_auto('{SRC}', header=true, sample_size=50000);
""")
n = con.execute("SELECT COUNT(*) FROM decisoes").fetchone()[0]
print(f"  {n:,} linhas", flush=True)

print("[confere] aplicando regras...", flush=True)
con.execute(f"""
CREATE OR REPLACE TABLE decisoes_conf AS
SELECT
  *,
  CASE
    -- sem ancoragem: não é possível conferir
    WHEN orgao_julgador_ancorado IS NULL THEN 'sem_ancoragem'

    -- MONOCRÁTICA: qualquer órgão derivado é compatível (relator de qualquer turma pode decidir sozinho)
    WHEN origem_decisao = 'MONOCRÁTICA'
      AND orgao_julgador_ancorado IN ('TURMA_1','TURMA_2','TURMA_1_PRESID','TURMA_2_PRESID','PRESIDENCIA','VICE_PRESIDENCIA','PLENARIO')
      THEN 'confere'

    -- 1ª TURMA: ancorado tem que ser TURMA_1 ou TURMA_1_PRESID
    WHEN origem_decisao LIKE '1%TURMA%' AND orgao_julgador_ancorado IN ('TURMA_1','TURMA_1_PRESID') THEN 'confere'
    WHEN origem_decisao LIKE '1%TURMA%' AND orgao_julgador_ancorado IN ('TURMA_2','TURMA_2_PRESID') THEN 'inconsistente_turma'

    -- 2ª TURMA: ancorado tem que ser TURMA_2 ou TURMA_2_PRESID
    WHEN origem_decisao LIKE '2%TURMA%' AND orgao_julgador_ancorado IN ('TURMA_2','TURMA_2_PRESID') THEN 'confere'
    WHEN origem_decisao LIKE '2%TURMA%' AND orgao_julgador_ancorado IN ('TURMA_1','TURMA_1_PRESID') THEN 'inconsistente_turma'

    -- TRIBUNAL PLENO ou PLENÁRIO VIRTUAL: todos ministros compõem, então qualquer ancoragem confere
    WHEN origem_decisao LIKE '%PLENO%' OR origem_decisao LIKE '%PLENÁRIO%' THEN 'confere'

    -- casos não mapeados
    ELSE 'nao_classificado'
  END AS confere_origem_decisao
FROM decisoes
""")

# Distribuição do resultado da conferência
print("\n=== conferencia ===", flush=True)
stats = con.execute("""
SELECT confere_origem_decisao, COUNT(*) AS n,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS pct
FROM decisoes_conf
GROUP BY 1 ORDER BY n DESC
""").fetchall()
for v, c, p in stats:
    print(f"  {v:30s} {c:>10,}  ({p:>5.2f}%)")

# Breakdown: dentre SEM_ANCORAGEM, qual origem_decisao apareceu?
print("\n=== SEM_ANCORAGEM — distribuicao por origem_decisao ===", flush=True)
stats2 = con.execute("""
SELECT origem_decisao, COUNT(*) AS n,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS pct
FROM decisoes_conf
WHERE confere_origem_decisao = 'sem_ancoragem'
GROUP BY 1 ORDER BY n DESC LIMIT 15
""").fetchall()
for v, c, p in stats2:
    print(f"  {v:50s} {c:>10,}  ({p:>5.2f}%)")

# Breakdown: quais relatores mais aparecem em SEM_ANCORAGEM?
print("\n=== SEM_ANCORAGEM — top 20 relatores ausentes do seed ===", flush=True)
stats3 = con.execute("""
SELECT relator_normalizado, COUNT(*) AS n
FROM decisoes_conf
WHERE confere_origem_decisao = 'sem_ancoragem'
GROUP BY 1 ORDER BY n DESC LIMIT 20
""").fetchall()
for r, c in stats3:
    print(f"  {r[:60]:60s} {c:>10,}")

# Exportar CSV final com coluna de conferência
print(f"\n[export] {OUT}", flush=True)
con.execute(f"COPY decisoes_conf TO '{OUT}' (HEADER, DELIMITER ',');")

# Exportar apenas inconsistências para investigação
print(f"[export] {INCONSIST}", flush=True)
con.execute(f"""
COPY (
  SELECT * FROM decisoes_conf
  WHERE confere_origem_decisao IN ('inconsistente_turma', 'nao_classificado')
  ORDER BY decision_date DESC
  LIMIT 50000
) TO '{INCONSIST}' (HEADER, DELIMITER ',');
""")

con.close()
import os
try: os.remove(DB)
except: pass
print("\n[fim]")
