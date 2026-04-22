"""Agrega o corpus completo em combinações únicas (tipo_decisao, andamento_decisao) com contagem.
Separa ainda por is_colegiado (origem_decisao != MONOCRÁTICA) pois o mesmo andamento tem
semântica diferente quando é monocrático vs colegiado.

Saída: 2026-04-19_mapeamento_categoria_RAW.csv — para ser categorizado explicitamente.
"""
import duckdb
from pathlib import Path
RAW = "C:/stf/stf_decisoes_fatias"
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados/2026-04-19_mapeamento_categoria_RAW.csv")

con = duckdb.connect(':memory:')
con.execute(f"""
CREATE TABLE r AS SELECT * FROM read_csv_auto('{RAW}/decisoes_*.csv',
  header=true, sample_size=100000, ignore_errors=true, union_by_name=true);
""")
try:
    con.execute(f"INSERT INTO r BY NAME SELECT * FROM read_xlsx('{RAW}/decisoes_2026.xlsx');")
except: pass

n = con.execute("SELECT COUNT(*) FROM r").fetchone()[0]
print(f"corpus: {n:,} decisões", flush=True)

# Agregar
con.execute(f"""
COPY (
  SELECT
    "Tipo decisão" AS tipo,
    "Andamento decisão" AS andamento,
    CASE WHEN "Origem decisão" = 'MONOCRÁTICA' THEN FALSE
         WHEN "Origem decisão" IS NULL THEN NULL
         ELSE TRUE END AS is_colegiado,
    COUNT(*) AS n,
    ROUND(100.0 * COUNT(*) / {n}, 4) AS pct,
    ROUND(SUM(100.0 * COUNT(*) / {n}) OVER (ORDER BY COUNT(*) DESC), 2) AS pct_acum
  FROM r
  GROUP BY 1, 2, 3
  ORDER BY n DESC
) TO '{OUT.as_posix()}' (HEADER, DELIMITER ',');
""")

n_rows = con.execute(f"SELECT COUNT(*) FROM read_csv_auto('{OUT.as_posix()}')").fetchone()[0]
print(f"combinações únicas: {n_rows:,}", flush=True)

# Mostra as top 50 na tela para Damares ver
print("\n=== TOP 50 combinações (acumulam N% do volume) ===", flush=True)
for r in con.execute(f"""SELECT tipo, andamento, is_colegiado, n, pct, pct_acum
FROM read_csv_auto('{OUT.as_posix()}') ORDER BY n DESC LIMIT 50""").fetchall():
    tipo = (r[0] or '-')[:28]
    and_ = (r[1] or '-')[:55]
    col = {True: 'COL', False: 'MON', None: '-'}[r[2]]
    print(f"  {r[3]:>7,}  {r[4]:>6.2f}%  acum={r[5]:>6.2f}%  [{col}] {tipo:<28s} | {and_}", flush=True)

print(f"\n[ok] {OUT}")
