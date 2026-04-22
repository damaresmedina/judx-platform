"""Investiga por que as decisões com relator='PRESIDENTE' ficaram desancoradas."""
import duckdb

con = duckdb.connect(':memory:')

print("[load] seed...", flush=True)
con.execute("""CREATE TABLE comp AS SELECT * FROM read_csv_auto(
  'C:/Users/medin/projetos/judx-platform/scripts/seeds-tribunais/composicao_ministerial.csv',
  header=true, sample_size=500, ignore_errors=true)""")

print("\n=== seed STF PRESIDENCIA (todas linhas) ===")
for r in con.execute("SELECT ministro_nome_canonico, valid_from, valid_to FROM comp WHERE tribunal_sigla='STF' AND codigo_orgao='PRESIDENCIA' ORDER BY valid_from").fetchall():
    nome = r[0] or '-'
    vf = r[1] or '-'
    vt = r[2] or '(vigente)'
    print(f"  {nome:<35s} {vf}  ->  {vt}")

print("\n[load] conferencia.csv (só colunas-chave)...", flush=True)
con.execute("""CREATE TABLE t AS SELECT
  external_number, relator_normalizado, decision_date,
  orgao_julgador_origem, orgao_julgador_ancorado, confere_origem_decisao
FROM read_csv_auto('C:/Users/medin/Desktop/backup_judx/resultados/2026-04-19_judx_decision_com_conferencia.csv',
  header=true, sample_size=50000)""")

total = con.execute("SELECT COUNT(*) FROM t").fetchone()[0]
print(f"Total: {total:,}")

print("\n=== Decisões com relator='PRESIDENTE' ===")
for r in con.execute("""SELECT orgao_julgador_ancorado, COUNT(*) n
FROM t WHERE relator_normalizado='PRESIDENTE' GROUP BY 1 ORDER BY n DESC""").fetchall():
    oj = r[0] or '(sem_anc)'
    print(f"  {oj:<22s} {r[1]:>10,}")

print("\n=== Decisões com relator='PRESIDENTE' por ano (sem_anc vs ancorado) ===")
for r in con.execute("""SELECT EXTRACT(YEAR FROM decision_date)::INT y,
  SUM(CASE WHEN orgao_julgador_ancorado IS NULL THEN 1 ELSE 0 END) sem_anc,
  SUM(CASE WHEN orgao_julgador_ancorado IS NOT NULL THEN 1 ELSE 0 END) anc,
  COUNT(*) tot
FROM t WHERE relator_normalizado='PRESIDENTE' GROUP BY 1 ORDER BY 1""").fetchall():
    print(f"  {r[0]}: sem_anc={r[1]:>8,}  ancorado={r[2]:>8,}  total={r[3]:>8,}")

# Pega a menor decision_date de PRESIDENTE desancorado para ver se está coberto pelo seed
print("\n=== Período coberto pelo seed PRESIDENCIA ===")
r = con.execute("SELECT MIN(TRY_CAST(valid_from AS DATE)), MAX(TRY_CAST(valid_to AS DATE)) FROM comp WHERE tribunal_sigla='STF' AND codigo_orgao='PRESIDENCIA'").fetchone()
print(f"  {r[0]}  ->  {r[1]}")

print("\n=== Amostra de datas de PRESIDENTE desancorado ===")
r = con.execute("""SELECT MIN(decision_date), MAX(decision_date), COUNT(*)
FROM t WHERE relator_normalizado='PRESIDENTE' AND orgao_julgador_ancorado IS NULL""").fetchone()
print(f"  min={r[0]}  max={r[1]}  total={r[2]:,}")

print("\n=== Datas específicas problemáticas (10 amostras) ===")
for r in con.execute("""SELECT external_number, relator_normalizado, decision_date, orgao_julgador_origem
FROM t WHERE relator_normalizado='PRESIDENTE' AND orgao_julgador_ancorado IS NULL
ORDER BY decision_date DESC LIMIT 10""").fetchall():
    print(f"  {r}")
