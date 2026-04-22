"""Responde as 7 perguntas empíricas da Damares (19/abr/2026) sobre AI/ARE/RE no STF.

Fonte canônica: C:\\stf\\stf_decisoes_fatias\\ (26 CSVs 2000-2025 + 1 XLSX 2026 = 2,93M decisões)
Regras aplicadas (DECISOES_CANONICAS.md): #27 corpus≥2000, #28 PRESIDÊNCIA derivada, #29 preservar todas colunas.

PERGUNTAS:
Q1. Distribuição vida curta (1-3 decisões) vs vida longa (+3) em AI, ARE, RE, por ano.
Q2. Presidência INADMITE → agravo → qual órgão julga e como decide.
Q3. Presidência DISTRIBUI → relator INADMITE → como a Turma decide. Por ambiente_julgamento.
Q4. O que faz o processo ULTRAPASSAR os filtros (Presid + Relator)? Perfil dos sobreviventes.
Q5. O que faz ser PROVIDO/PROCEDENTE (mérito)? Perfil dos providos.
Q6. Comportamento dos ministros nesses cortes.
Q7. Agrupar por ASSUNTO (além de ramo) — filtros por conteúdo.
"""
import duckdb
from pathlib import Path

ROOT = Path("C:/stf/stf_decisoes_fatias")
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados")
DATA = "2026-04-19"

con = duckdb.connect(':memory:')
print("[load] stf_decisoes_fatias/ (26 CSVs + 1 XLSX)...", flush=True)

# Carga unificada: CSVs anuais + XLSX 2026
con.execute(f"""
CREATE TABLE raw AS
SELECT * FROM read_csv_auto('{ROOT.as_posix()}/decisoes_*.csv', header=true, sample_size=100000, ignore_errors=true, union_by_name=true);
""")
n_csv = con.execute("SELECT COUNT(*) FROM raw").fetchone()[0]

try:
    con.execute(f"""
    INSERT INTO raw BY NAME
    SELECT * FROM read_xlsx('{ROOT.as_posix()}/decisoes_2026.xlsx');
    """)
except Exception as e:
    print(f"  [aviso] xlsx 2026: {e}", flush=True)

n = con.execute("SELECT COUNT(*) FROM raw").fetchone()[0]
print(f"  total: {n:,} decisões ({n_csv:,} dos CSVs)", flush=True)

# --- DERIVAÇÕES ---
print("[derivar] classe, numero, orgao_corrigido, resultado...", flush=True)
con.execute("""
CREATE TABLE d AS
SELECT
  raw.*,
  -- Split classe/numero (regex: não-espaço + espaço + resto)
  regexp_extract("Processo", '^(\\S+)\\s+(.+)$', 1) AS classe,
  regexp_extract("Processo", '^(\\S+)\\s+(.+)$', 2) AS numero,
  -- Desagrupa PRESIDÊNCIA de MONOCRÁTICA (regra canônica #28)
  CASE
    WHEN "Órgão julgador" = 'MONOCRÁTICA' AND (
           UPPER("Relator atual") LIKE '%MINISTRO PRESIDENTE%'
        OR UPPER("Relator atual") LIKE 'PRESIDENTE%'
        OR UPPER("Andamento decisão") LIKE 'DECISÃO DA PRESIDÊNCIA%'
        OR UPPER("Andamento decisão") LIKE 'DESPACHO DA PRESIDÊNCIA%'
    ) THEN 'PRESIDÊNCIA'
    ELSE "Órgão julgador"
  END AS orgao_corrigido,
  -- Classificação de resultado (sobre dados reais de 2024, ordem crítica: improvido ANTES de provido)
  CASE
    WHEN "Andamento decisão" IS NULL THEN 'outro'
    WHEN UPPER("Andamento decisão") LIKE '%NEGADO SEGUIMENTO%'
      OR UPPER("Andamento decisão") LIKE '%NÃO CONHECID%'
      OR UPPER("Andamento decisão") LIKE '%NAO CONHECID%'
      OR UPPER("Andamento decisão") LIKE '%NÃO CONHEÇO%'
      OR UPPER("Andamento decisão") LIKE '%INADMIT%'
      OR UPPER("Andamento decisão") LIKE '%SEGUIMENTO NEGADO%'
      THEN 'inadmite'
    WHEN UPPER("Andamento decisão") LIKE '%NÃO PROVIDO%'
      OR UPPER("Andamento decisão") LIKE '%NAO PROVIDO%'
      OR UPPER("Andamento decisão") LIKE '%NEGADO PROVIMENTO%'
      OR UPPER("Andamento decisão") LIKE '%NEGO PROVIMENTO%'
      OR UPPER("Andamento decisão") LIKE '%IMPROVI%'
      OR UPPER("Andamento decisão") LIKE '%DESPROVI%'
      OR UPPER("Andamento decisão") LIKE '%REJEITAD%'
      OR UPPER("Andamento decisão") LIKE '%IMPROCEDENTE%'
      THEN 'improvido'
    WHEN UPPER("Andamento decisão") LIKE '%PROCEDENTE%'
      OR UPPER("Andamento decisão") LIKE '%PROVIDO%'
      OR UPPER("Andamento decisão") LIKE '%EMBARGOS RECEBIDOS%'
      OR UPPER("Andamento decisão") LIKE '%DEU PROVIMENTO%'
      OR UPPER("Andamento decisão") LIKE '%CONCEDIDA A ORDEM%'
      OR UPPER("Andamento decisão") LIKE '%DEFERIDO%'
      THEN 'provido'
    WHEN UPPER("Andamento decisão") LIKE '%DEVOLUÇÃO%'
      OR UPPER("Andamento decisão") LIKE '%DEVOLVO%'
      OR UPPER("Andamento decisão") LIKE '%RECONSIDERO%'
      THEN 'rg_devolucao'
    WHEN UPPER("Andamento decisão") LIKE '%PREJUDICAD%'
      THEN 'prejudicado'
    WHEN UPPER("Andamento decisão") LIKE '%HOMOLOG%'
      OR UPPER("Andamento decisão") LIKE '%EXTINTO%'
      OR UPPER("Andamento decisão") LIKE '%DESISTÊNCIA%'
      THEN 'extinto'
    ELSE 'outro'
  END AS resultado
FROM raw
""")

print("[check] distribuição resultado:", flush=True)
for r, n_, pct in con.execute("SELECT resultado, COUNT(*) n, ROUND(100.0*COUNT(*)/(SELECT COUNT(*) FROM d),2) pct FROM d GROUP BY 1 ORDER BY n DESC").fetchall():
    print(f"  {r:<14s} {n_:>10,}  {pct:>5.2f}%", flush=True)

# --- FILTRO: corpus operacional (≥2000) e classes AI/ARE/RE ---
print("\n[filtro] AI/ARE/RE desde 2000...", flush=True)
con.execute("""
CREATE TABLE f AS
SELECT * FROM d
WHERE "Ano da decisão" IS NOT NULL AND CAST("Ano da decisão" AS INT) >= 2000
  AND UPPER(classe) IN ('AI','ARE','RE')
""")
n_f = con.execute("SELECT COUNT(*) FROM f").fetchone()[0]
print(f"  decisões em AI/ARE/RE ≥2000: {n_f:,}", flush=True)

# --- VIDA DO PROCESSO (agrupado por Processo = classe+numero) ---
print("\n[vida] contando decisões por processo...", flush=True)
con.execute("""
CREATE TABLE vida AS
SELECT "Processo" AS processo,
       MIN(classe) AS classe,
       COUNT(*) AS n_dec,
       CASE WHEN COUNT(*) <= 3 THEN 'curta' ELSE 'longa' END AS tipo_vida,
       MIN(CAST("Ano da decisão" AS INT)) AS ano_primeira,
       MAX(CAST("Ano da decisão" AS INT)) AS ano_ultima
FROM f GROUP BY 1
""")

# ============================================================
# Q1. Distribuição vida curta vs longa por classe × ano
# ============================================================
print("\n" + "="*70, flush=True)
print("Q1. Vida CURTA (1-3 dec.) vs LONGA (+3) por classe × ano_primeira", flush=True)
print("="*70, flush=True)
out_q1 = OUT / f"{DATA}_Q1_vida_curta_longa_por_classe_ano.csv"
con.execute(f"""
COPY (
  SELECT classe, ano_primeira,
    SUM(CASE WHEN tipo_vida='curta' THEN 1 ELSE 0 END) AS curta,
    SUM(CASE WHEN tipo_vida='longa' THEN 1 ELSE 0 END) AS longa,
    COUNT(*) AS total,
    ROUND(100.0*SUM(CASE WHEN tipo_vida='curta' THEN 1 ELSE 0 END)/COUNT(*),2) AS pct_curta
  FROM vida GROUP BY 1,2 ORDER BY 1,2
) TO '{out_q1.as_posix()}' (HEADER, DELIMITER ',');
""")
print(f"  [ok] {out_q1}", flush=True)
for r in con.execute("SELECT classe, SUM(CASE WHEN tipo_vida='curta' THEN 1 ELSE 0 END) curta, SUM(CASE WHEN tipo_vida='longa' THEN 1 ELSE 0 END) longa, COUNT(*) total FROM vida GROUP BY 1 ORDER BY 1").fetchall():
    cl, c, l, t = r
    print(f"  {cl:<4s}  curta:{c:>8,}  longa:{l:>8,}  total:{t:>8,}  ({100*c/t:.1f}% curta)", flush=True)

# ============================================================
# Q2. Presidência INADMITE → agravo → qual órgão julga e como
# Precisamos da sequência: 1ª dec=PRESIDÊNCIA+inadmite, 2ª dec=?
# ============================================================
print("\n" + "="*70, flush=True)
print("Q2. Presidência INADMITE → próxima decisão (órgão + resultado)", flush=True)
print("="*70, flush=True)

# Numerar decisões por processo em ordem cronológica
con.execute("""
CREATE TABLE seq AS
SELECT f.*,
  ROW_NUMBER() OVER (PARTITION BY "Processo" ORDER BY "Data da decisão", "idFatoDecisao") AS ordem
FROM f
""")

out_q2 = OUT / f"{DATA}_Q2_presid_inadmite_proxima.csv"
con.execute(f"""
COPY (
  WITH par AS (
    SELECT a."Processo" AS processo, a.classe, a."Ano da decisão" AS ano,
           a.orgao_corrigido AS orgao_1, a.resultado AS resultado_1,
           b.orgao_corrigido AS orgao_2, b.resultado AS resultado_2,
           b."Ambiente julgamento" AS ambiente_2, b."Relator atual" AS relator_2
    FROM seq a JOIN seq b ON a."Processo"=b."Processo" AND b.ordem = a.ordem+1
    WHERE a.ordem=1 AND a.orgao_corrigido='PRESIDÊNCIA' AND a.resultado='inadmite'
  )
  SELECT classe, ano, orgao_2, resultado_2, ambiente_2, COUNT(*) n
  FROM par GROUP BY 1,2,3,4,5 ORDER BY 1,2,6 DESC
) TO '{out_q2.as_posix()}' (HEADER, DELIMITER ',');
""")
print(f"  [ok] {out_q2}", flush=True)

print("\n  Resumo agregado (órgão × resultado × ambiente):", flush=True)
for r in con.execute("""
  WITH par AS (
    SELECT a.classe, b.orgao_corrigido AS oj, b.resultado AS res, b."Ambiente julgamento" AS amb
    FROM seq a JOIN seq b ON a."Processo"=b."Processo" AND b.ordem=a.ordem+1
    WHERE a.ordem=1 AND a.orgao_corrigido='PRESIDÊNCIA' AND a.resultado='inadmite'
  )
  SELECT classe, oj, res, amb, COUNT(*) n
  FROM par GROUP BY 1,2,3,4 ORDER BY n DESC LIMIT 30
""").fetchall():
    print(f"  {r[0]:<4s} {(r[1] or '-'):<22s} {(r[2] or '-'):<14s} {(r[3] or '-'):<12s} {r[4]:>8,}", flush=True)

# ============================================================
# Q3. Presidência DISTRIBUI → Relator INADMITE → Turma decide como
# 1ª=PRESID_admite; 2ª=MONOCRÁTICA+inadmite; 3ª=TURMA+?
# ============================================================
print("\n" + "="*70, flush=True)
print("Q3. Presid DISTRIBUI → Relator INADMITE → Turma decide (por ambiente)", flush=True)
print("="*70, flush=True)

out_q3 = OUT / f"{DATA}_Q3_relator_inadmite_turma_ambiente.csv"
con.execute(f"""
COPY (
  WITH trio AS (
    SELECT a.classe, c."Ano da decisão" AS ano,
           b.resultado AS res_relator,
           c.orgao_corrigido AS oj_3, c.resultado AS res_3, c."Ambiente julgamento" AS ambiente
    FROM seq a JOIN seq b ON a."Processo"=b."Processo" AND b.ordem=a.ordem+1
              JOIN seq c ON b."Processo"=c."Processo" AND c.ordem=b.ordem+1
    WHERE a.ordem=1 AND a.orgao_corrigido='PRESIDÊNCIA' AND a.resultado NOT IN ('inadmite')
      AND b.orgao_corrigido='MONOCRÁTICA' AND b.resultado='inadmite'
  )
  SELECT classe, ano, oj_3, res_3, ambiente, COUNT(*) n
  FROM trio GROUP BY 1,2,3,4,5 ORDER BY 1,2,6 DESC
) TO '{out_q3.as_posix()}' (HEADER, DELIMITER ',');
""")
print(f"  [ok] {out_q3}", flush=True)

print("\n  Resumo (órgão_3 × resultado_3 × ambiente):", flush=True)
for r in con.execute("""
  WITH trio AS (
    SELECT a.classe, c.orgao_corrigido AS oj_3, c.resultado AS res_3, c."Ambiente julgamento" AS amb
    FROM seq a JOIN seq b ON a."Processo"=b."Processo" AND b.ordem=a.ordem+1
              JOIN seq c ON b."Processo"=c."Processo" AND c.ordem=b.ordem+1
    WHERE a.ordem=1 AND a.orgao_corrigido='PRESIDÊNCIA' AND a.resultado NOT IN ('inadmite')
      AND b.orgao_corrigido='MONOCRÁTICA' AND b.resultado='inadmite'
  )
  SELECT classe, oj_3, res_3, amb, COUNT(*) n
  FROM trio GROUP BY 1,2,3,4 ORDER BY n DESC LIMIT 30
""").fetchall():
    print(f"  {r[0]:<4s} {(r[1] or '-'):<22s} {(r[2] or '-'):<14s} {(r[3] or '-'):<12s} {r[4]:>8,}", flush=True)

# ============================================================
# Q4. Sobreviventes: passaram Presid (não-inadmite) + Relator (não-inadmite) — quem são?
# ============================================================
print("\n" + "="*70, flush=True)
print("Q4. Sobreviventes dos 2 filtros: perfil (ministros, ramo, assuntos)", flush=True)
print("="*70, flush=True)

con.execute("""
CREATE TABLE sobreviventes AS
SELECT DISTINCT a."Processo" AS processo
FROM seq a JOIN seq b ON a."Processo"=b."Processo" AND b.ordem=a.ordem+1
WHERE a.ordem=1 AND a.orgao_corrigido='PRESIDÊNCIA' AND a.resultado NOT IN ('inadmite')
  AND b.orgao_corrigido='MONOCRÁTICA' AND b.resultado NOT IN ('inadmite')
""")
n_sobrev = con.execute("SELECT COUNT(*) FROM sobreviventes").fetchone()[0]
print(f"  processos sobreviventes: {n_sobrev:,}", flush=True)

out_q4_min = OUT / f"{DATA}_Q4_sobreviventes_ministros.csv"
con.execute(f"""
COPY (
  SELECT UPPER(TRIM(f."Relator atual")) AS ministro, COUNT(DISTINCT f."Processo") n_proc
  FROM f JOIN sobreviventes s ON f."Processo"=s.processo
  WHERE f."Relator atual" IS NOT NULL
  GROUP BY 1 ORDER BY n_proc DESC LIMIT 50
) TO '{out_q4_min.as_posix()}' (HEADER, DELIMITER ',');
""")
out_q4_ramo = OUT / f"{DATA}_Q4_sobreviventes_ramo.csv"
con.execute(f"""
COPY (
  SELECT "Ramo direito" AS ramo, COUNT(DISTINCT f."Processo") n_proc
  FROM f JOIN sobreviventes s ON f."Processo"=s.processo
  GROUP BY 1 ORDER BY n_proc DESC
) TO '{out_q4_ramo.as_posix()}' (HEADER, DELIMITER ',');
""")
out_q4_ass = OUT / f"{DATA}_Q4_sobreviventes_assuntos.csv"
con.execute(f"""
COPY (
  SELECT "Assuntos do processo" AS assunto, COUNT(DISTINCT f."Processo") n_proc
  FROM f JOIN sobreviventes s ON f."Processo"=s.processo
  WHERE "Assuntos do processo" IS NOT NULL
  GROUP BY 1 ORDER BY n_proc DESC LIMIT 100
) TO '{out_q4_ass.as_posix()}' (HEADER, DELIMITER ',');
""")
print(f"  [ok] {out_q4_min.name}, {out_q4_ramo.name}, {out_q4_ass.name}", flush=True)

# ============================================================
# Q5. Perfil dos providos/procedentes
# ============================================================
print("\n" + "="*70, flush=True)
print("Q5. Providos/procedentes: perfil", flush=True)
print("="*70, flush=True)

out_q5 = OUT / f"{DATA}_Q5_providos_perfil.csv"
con.execute(f"""
COPY (
  SELECT classe, orgao_corrigido, "Ambiente julgamento" AS ambiente,
         "Ramo direito" AS ramo, COUNT(*) n
  FROM f WHERE resultado='provido'
  GROUP BY 1,2,3,4 ORDER BY n DESC LIMIT 200
) TO '{out_q5.as_posix()}' (HEADER, DELIMITER ',');
""")
print(f"  [ok] {out_q5}", flush=True)

n_provido = con.execute("SELECT COUNT(*) FROM f WHERE resultado='provido'").fetchone()[0]
print(f"  total providos/procedentes em AI/ARE/RE: {n_provido:,} ({100*n_provido/n_f:.3f}% de todas as decisões)", flush=True)

# ============================================================
# Q6. Comportamento dos ministros nos 3 pontos-chave
# ============================================================
print("\n" + "="*70, flush=True)
print("Q6. Perfil por ministro (taxa inadmite / improvido / provido em AI/ARE/RE)", flush=True)
print("="*70, flush=True)

out_q6 = OUT / f"{DATA}_Q6_ministros_perfil.csv"
con.execute(f"""
COPY (
  SELECT UPPER(TRIM("Relator atual")) AS ministro,
    COUNT(*) AS total,
    SUM(CASE WHEN resultado='inadmite' THEN 1 ELSE 0 END) AS n_inadmite,
    SUM(CASE WHEN resultado='improvido' THEN 1 ELSE 0 END) AS n_improvido,
    SUM(CASE WHEN resultado='provido' THEN 1 ELSE 0 END) AS n_provido,
    ROUND(100.0*SUM(CASE WHEN resultado='inadmite' THEN 1 ELSE 0 END)/COUNT(*),2) AS pct_inadmite,
    ROUND(100.0*SUM(CASE WHEN resultado='improvido' THEN 1 ELSE 0 END)/COUNT(*),2) AS pct_improvido,
    ROUND(100.0*SUM(CASE WHEN resultado='provido' THEN 1 ELSE 0 END)/COUNT(*),2) AS pct_provido
  FROM f WHERE "Relator atual" IS NOT NULL
  GROUP BY 1 HAVING COUNT(*) >= 1000
  ORDER BY total DESC
) TO '{out_q6.as_posix()}' (HEADER, DELIMITER ',');
""")
print(f"  [ok] {out_q6}", flush=True)

# ============================================================
# Q7. Assuntos (temas finos além de ramo) — ranking e taxa de sucesso
# ============================================================
print("\n" + "="*70, flush=True)
print("Q7. Assuntos — ranking por volume e taxa de provimento", flush=True)
print("="*70, flush=True)

out_q7 = OUT / f"{DATA}_Q7_assuntos_provimento.csv"
con.execute(f"""
COPY (
  SELECT "Assuntos do processo" AS assunto,
    COUNT(*) AS total,
    SUM(CASE WHEN resultado='inadmite' THEN 1 ELSE 0 END) AS n_inadmite,
    SUM(CASE WHEN resultado='provido' THEN 1 ELSE 0 END) AS n_provido,
    ROUND(100.0*SUM(CASE WHEN resultado='inadmite' THEN 1 ELSE 0 END)/COUNT(*),2) AS pct_inadmite,
    ROUND(100.0*SUM(CASE WHEN resultado='provido' THEN 1 ELSE 0 END)/COUNT(*),2) AS pct_provido
  FROM f WHERE "Assuntos do processo" IS NOT NULL
  GROUP BY 1 HAVING COUNT(*) >= 200
  ORDER BY total DESC LIMIT 300
) TO '{out_q7.as_posix()}' (HEADER, DELIMITER ',');
""")
print(f"  [ok] {out_q7}", flush=True)

con.close()
print("\n[fim] 7 CSVs gerados em", OUT, flush=True)
