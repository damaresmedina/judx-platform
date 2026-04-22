"""Deriva janelas de mandato por Turma empiricamente, a partir das decisões do raw.

Para cada ministro (nome canônico) × órgão julgador:
  MIN(data_decisao) = início empírico do mandato naquele órgão
  MAX(data_decisao) = fim empírico
  COUNT(*) = volume de decisões
  Filtro: N >= 10 (ignora órgão esporádico)

Resultado: CSV com janelas derivadas que serão mescladas ao seed existente.

Saída: Desktop/backup_judx/resultados/janelas_empiricas_derivadas.csv
"""
import duckdb
from pathlib import Path
from datetime import datetime

RAW = Path("C:/stf/stf_decisoes_fatias")
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados/janelas_empiricas_derivadas.csv")

con = duckdb.connect(':memory:')
def log(m): print(f"[{datetime.now():%H:%M:%S}] {m}", flush=True)

log("carrega raw...")
con.execute(f"CREATE TABLE raw AS SELECT * FROM read_csv_auto('{RAW.as_posix()}/decisoes_*.csv', header=true, sample_size=100000, ignore_errors=true, union_by_name=true);")
try: con.execute(f"INSERT INTO raw BY NAME SELECT * FROM read_xlsx('{RAW.as_posix()}/decisoes_2026.xlsx');")
except: pass
log(f"  {con.execute('SELECT COUNT(*) FROM raw').fetchone()[0]:,} pulsos")

log("agrega por ministro × órgão...")
con.execute(f"""
COPY (
  SELECT
    strip_accents(UPPER(TRIM(REGEXP_REPLACE("Relator atual",'^MIN(\\.|ISTRO|ISTRA)\\s+','')))) AS nome_canonico,
    "Órgão julgador" AS orgao_raw,
    CASE
      WHEN "Órgão julgador" = '1ª TURMA' THEN 'TURMA_1'
      WHEN "Órgão julgador" = '2ª TURMA' THEN 'TURMA_2'
      WHEN "Órgão julgador" = 'TRIBUNAL PLENO' THEN 'PLENARIO'
      WHEN "Órgão julgador" = 'PLENÁRIO VIRTUAL - RG' THEN 'PLENARIO_VIRTUAL_RG'
      WHEN "Órgão julgador" = 'TRIBUNAL PLENO - SESSÃO VIRTUAL' THEN 'PLENARIO_VIRTUAL'
      WHEN "Órgão julgador" = 'MONOCRÁTICA' THEN 'MONOCRATICA'
      ELSE "Órgão julgador"
    END AS codigo_orgao,
    MIN(TRY_CAST("Data da decisão" AS DATE)) AS valid_from_empirico,
    MAX(TRY_CAST("Data da decisão" AS DATE)) AS valid_to_empirico,
    COUNT(*) AS n_decisoes
  FROM raw
  WHERE "Relator atual" IS NOT NULL
    AND "Relator atual" <> '*NI*'
    AND UPPER("Relator atual") NOT LIKE '%MINISTRO PRESIDENTE%'
    AND UPPER("Relator atual") <> 'PRESIDENTE'
    AND UPPER("Relator atual") NOT LIKE 'PRESIDENTE%'
    AND "Órgão julgador" IS NOT NULL
  GROUP BY 1, 2, 3
  HAVING COUNT(*) >= 10
  ORDER BY nome_canonico, valid_from_empirico
) TO '{OUT.as_posix()}' (HEADER, DELIMITER ',');
""")

n = con.execute(f"SELECT COUNT(*) FROM read_csv_auto('{OUT.as_posix()}')").fetchone()[0]
n_ministros = con.execute(f"SELECT COUNT(DISTINCT nome_canonico) FROM read_csv_auto('{OUT.as_posix()}')").fetchone()[0]
log(f"  {n:,} janelas empíricas para {n_ministros:,} ministros únicos")

# Mostra distribuição por órgão
print("\nCobertura por órgão:")
for r in con.execute(f"""SELECT codigo_orgao, COUNT(DISTINCT nome_canonico) AS ministros, SUM(n_decisoes) AS pulsos
FROM read_csv_auto('{OUT.as_posix()}') GROUP BY 1 ORDER BY pulsos DESC""").fetchall():
    print(f"  {r[0]:<22s} {r[1]:>4d} ministros · {r[2]:>10,} pulsos")

# Amostra
print("\nAmostra (10 primeiras linhas):")
for r in con.execute(f"SELECT * FROM read_csv_auto('{OUT.as_posix()}') LIMIT 10").fetchall():
    print(f"  {r[0]:<35s} {r[2]:<22s} {r[3]} → {r[4]}  (n={r[5]:,})")

log("✓ FIM")
print(f"\n[ok] {OUT}")
