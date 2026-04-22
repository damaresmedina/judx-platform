"""Análise empírica exploratória de trilhas processuais STF (2,93M decisões).

PRESERVA TODAS AS 20 COLUNAS ORIGINAIS + 2 derivadas do split + 2 derivadas de ancoragem.
Nada descartado. Validação explícita no final.
"""
import duckdb, time, html
from pathlib import Path

PASTA = 'C:/stf/stf_decisoes_fatias/'
OUT_HTML = Path('C:/Users/medin/Desktop/backup_judx/resultados/DASHBOARD_TRILHAS_VIDA.html')

con = duckdb.connect(':memory:')
con.execute('INSTALL excel; LOAD excel;')

print('[load]...', flush=True)
t0 = time.time()
con.execute(f"""CREATE TABLE raw AS
SELECT * FROM read_csv_auto('{PASTA}decisoes_*.csv', header=true, sample_size=100000, union_by_name=true, ignore_errors=true)
""")
try: con.execute(f"INSERT INTO raw BY NAME SELECT * FROM read_xlsx('{PASTA}decisoes_2026.xlsx')")
except: pass
n_raw = con.execute('SELECT COUNT(*) FROM raw').fetchone()[0]
print(f'  {n_raw:,} decisões em {time.time()-t0:.1f}s', flush=True)

# ============ CONFERÊNCIA DE COLUNAS: as 20 originais ============
col_originais = [c[0] for c in con.execute('DESCRIBE raw').fetchall()]
print(f'\n=== CONFERÊNCIA DE COLUNAS no raw: {len(col_originais)} ===', flush=True)
for i, c in enumerate(col_originais, 1):
    print(f'  {i:>2}. {c}', flush=True)
assert len(col_originais) == 20, f'Raw não tem 20 colunas! Tem {len(col_originais)}'

# ============ Tabela de trabalho: PRESERVA TUDO + derivadas ============
print('\n[normalizar] preservando todas as 20 originais + derivadas...', flush=True)
con.execute("""
CREATE TABLE d AS
SELECT
  -- === 20 colunas originais (ZERO descarte) ===
  "idFatoDecisao",
  "Processo",
  "Relator atual",
  "Meio Processo",
  "Origem decisão",
  "Ambiente julgamento",
  "Data de autuação",
  "Data baixa",
  "Indicador colegiado",
  "Ano da decisão",
  "Data da decisão",
  "Tipo decisão",
  "Andamento decisão",
  "Observação do andamento",
  "Ramo direito",
  "Assuntos do processo",
  "Indicador de tramitação",
  "Órgão julgador",
  "Descrição Procedência Processo",
  "Descrição Órgão Origem",
  -- === split do Processo (2 novas) ===
  TRIM(REGEXP_EXTRACT("Processo", '^(\\S+)\\s+(.+)$', 1)) AS classe,
  TRIM(REGEXP_EXTRACT("Processo", '^(\\S+)\\s+(.+)$', 2)) AS numero,
  -- === datas em ISO (3 novas, NÃO substituem) ===
  TRY_CAST("Data da decisão" AS DATE) AS data_decisao_iso,
  TRY_CAST("Data de autuação" AS DATE) AS data_autuacao_iso,
  TRY_CAST("Data baixa" AS DATE) AS data_baixa_iso,
  -- === orgao_corrigido (derivado, preserva original) ===
  CASE
    WHEN UPPER("Relator atual") LIKE '%VICE-PRESIDENTE%' THEN 'VICE-PRESIDÊNCIA'
    WHEN UPPER("Relator atual") IN ('MINISTRO PRESIDENTE','MINISTRA PRESIDENTE','PRESIDENTE','MIN. PRESIDENTE','MIN PRESIDENTE') THEN 'PRESIDÊNCIA'
    WHEN UPPER("Andamento decisão") LIKE 'DECISÃO DA PRESIDÊNCIA%'
      OR UPPER("Andamento decisão") LIKE 'DECISÃO DO PRESIDENTE%'
      OR UPPER("Andamento decisão") LIKE 'DESPACHO DA PRESIDÊNCIA%'
      OR UPPER("Andamento decisão") LIKE 'DESPACHO DO PRESIDENTE%'
      OR UPPER("Andamento decisão") LIKE 'LIMINAR JULGADA PELO PRESIDENTE%' THEN 'PRESIDÊNCIA'
    WHEN UPPER("Relator atual") LIKE '%PRESIDENTE DA COMISSÃO%' THEN '(VALIDAR:COMISSAO)'
    ELSE "Órgão julgador"
  END AS orgao_corrigido,
  -- === resultado classificado (cruza Tipo decisão + Andamento) ===
  CASE
    -- Intermediários/administrativos (não-finais)
    WHEN "Tipo decisão" = 'Decisão Sobrestamento' THEN 'sobrestado'
    WHEN "Tipo decisão" = 'Decisão Interlocutória' THEN 'interlocutoria'
    WHEN "Tipo decisão" = 'Decisão Liminar' AND UPPER("Andamento decisão") LIKE '%DEFERI%' THEN 'liminar_deferida'
    WHEN "Tipo decisão" = 'Decisão Liminar' AND UPPER("Andamento decisão") LIKE '%INDEFERI%' THEN 'liminar_indeferida'
    WHEN "Tipo decisão" = 'Decisão Liminar' THEN 'liminar_outro'
    -- Finais e recurso interno: aplica classificação de resultado
    WHEN UPPER("Andamento decisão") LIKE '%NEGADO SEGUIMENTO%' OR UPPER("Andamento decisão") LIKE '%NÃO CONHEC%' OR UPPER("Andamento decisão") LIKE '%INADMIT%' THEN 'inadmissao'
    WHEN UPPER("Andamento decisão") LIKE '%PREJUDIC%' THEN 'prejudicado'
    WHEN UPPER("Andamento decisão") LIKE '%DESIST%' OR UPPER("Andamento decisão") LIKE '%HOMOLOGADA A DESIST%' THEN 'desistencia'
    WHEN UPPER("Andamento decisão") LIKE '%EXTIN%' THEN 'extinto'
    -- CRÍTICO: improvido/negado ANTES de provido (para não capturar "NÃO PROVIDO" como provido)
    WHEN UPPER("Andamento decisão") LIKE '%NÃO PROVIDO%'
      OR UPPER("Andamento decisão") LIKE '%NAO PROVIDO%'
      OR UPPER("Andamento decisão") LIKE '%NEGADO PROVIMENTO%'
      OR UPPER("Andamento decisão") LIKE '%IMPROVI%'
      OR UPPER("Andamento decisão") LIKE '%IMPROCEDENT%'
      OR UPPER("Andamento decisão") LIKE '%DESPROVI%' THEN 'improvido'
    WHEN UPPER("Andamento decisão") LIKE '%NÃO PROCEDENT%'
      OR UPPER("Andamento decisão") LIKE '%NAO PROCEDENT%' THEN 'improvido'
    WHEN UPPER("Andamento decisão") LIKE '%INDEFERIDO%' THEN 'indeferido'
    WHEN UPPER("Andamento decisão") LIKE '%PROVIDO EM PARTE%'
      OR UPPER("Andamento decisão") LIKE '%PROCEDENT%PARCIAL%'
      OR UPPER("Andamento decisão") LIKE '%PARCIALMENTE PROVIDO%'
      OR UPPER("Andamento decisão") LIKE '%PARCIALMENTE PROCEDENT%' THEN 'provido_parcial'
    WHEN UPPER("Andamento decisão") LIKE '%PROVIDO%'
      OR UPPER("Andamento decisão") LIKE '%PROCEDENT%'
      OR UPPER("Andamento decisão") LIKE '%CONCEDIDO%'
      OR UPPER("Andamento decisão") LIKE '%HOMOL%SENTEN%' THEN 'provido'
    WHEN UPPER("Andamento decisão") LIKE '%DEFERIDO%' THEN 'deferido'
    WHEN UPPER("Andamento decisão") LIKE '%ARQUIV%' THEN 'arquivado'
    ELSE 'outro_validar'
  END AS resultado_classificado
FROM raw
""")

# ============ Validar que nenhuma coluna foi perdida ============
col_d = [c[0] for c in con.execute('DESCRIBE d').fetchall()]
print(f'\n=== TABELA DE TRABALHO: {len(col_d)} colunas ===', flush=True)
print(f'  20 originais + 2 split + 3 ISO + 2 ancoragem = {20 + 2 + 3 + 2} esperado', flush=True)
for i, c in enumerate(col_d, 1):
    origem = 'ORIGINAL' if c in col_originais else 'DERIVADA'
    print(f'  {i:>2}. [{origem}] {c}', flush=True)
assert len(col_d) == 27, f'Esperado 27, obtido {len(col_d)}'
assert all(c in col_d for c in col_originais), 'ALGUMA ORIGINAL FOI PERDIDA!'
print(f'\n  ✓ todas as 20 originais preservadas + 7 derivadas adicionadas = 27 colunas', flush=True)

# ============ 1. VIDA DOS PROCESSOS ============
print('\n=== 1. VIDA DOS PROCESSOS ===', flush=True)
con.execute("""
CREATE TABLE proc AS
SELECT "Processo" AS processo, classe, numero,
       COUNT(*) AS n_decisoes,
       MIN(data_decisao_iso) AS primeira,
       MAX(data_decisao_iso) AS ultima,
       MIN("Ano da decisão") AS primeiro_ano,
       MAX("Ano da decisão") AS ultimo_ano,
       STRING_AGG(DISTINCT orgao_corrigido, ' | ') AS orgaos_atravessados,
       STRING_AGG(DISTINCT resultado_classificado, ' | ') AS resultados_atravessados,
       MAX("Ramo direito") AS ramo,
       MAX("Assuntos do processo") AS assuntos,
       MAX("Descrição Procedência Processo") AS uf_origem
FROM d WHERE "Processo" IS NOT NULL
GROUP BY "Processo", classe, numero
""")
total_proc = con.execute('SELECT COUNT(*) FROM proc').fetchone()[0]
print(f'  processos únicos: {total_proc:,}', flush=True)

for r in con.execute("""
SELECT
  CASE
    WHEN n_decisoes = 1 THEN 'A. 1 decisão'
    WHEN n_decisoes = 2 THEN 'B. 2 decisões'
    WHEN n_decisoes = 3 THEN 'C. 3 decisões'
    WHEN n_decisoes BETWEEN 4 AND 10 THEN 'D. 4-10 (média)'
    WHEN n_decisoes BETWEEN 11 AND 50 THEN 'E. 11-50 (longa)'
    ELSE 'F. 51+ (patológica)'
  END AS faixa,
  COUNT(*) n_proc,
  ROUND(100.0*COUNT(*)/(SELECT COUNT(*) FROM proc),2) pct_proc,
  SUM(n_decisoes) tot_dec
FROM proc GROUP BY 1 ORDER BY 1
""").fetchall():
    print(f'  {r[0]:<25} {r[1]:>10,} proc  ({r[2]:>5.2f}%)  → {r[3]:>12,} decisões', flush=True)

# ============ 2. Trilhas em AI/ARE/RE (vida curta) ============
print('\n=== 2. DISTRIBUIÇÃO DE VIDA por classe recursal AI/ARE/RE ===', flush=True)
for cls in ('AI', 'ARE', 'RE'):
    total_cls = con.execute(f"SELECT COUNT(*) FROM proc WHERE classe='{cls}'").fetchone()[0]
    print(f'\n  --- {cls} (total {total_cls:,} processos) ---', flush=True)
    for r in con.execute(f"""
    SELECT CASE WHEN n_decisoes<=3 THEN 'curta(1-3)'
                WHEN n_decisoes<=10 THEN 'média(4-10)'
                ELSE 'longa(>10)' END AS vida,
           COUNT(*) n, ROUND(100.0*COUNT(*)/{total_cls},2) pct
    FROM proc WHERE classe='{cls}' GROUP BY 1 ORDER BY 1
    """).fetchall():
        print(f'    {r[0]:<15} {r[1]:>9,}  ({r[2]:>5.2f}%)', flush=True)

# ============ 3. PRESIDÊNCIA INADMITE → próxima decisão ============
print('\n=== 3. Presidência inadmite → próximo órgão/resultado (vida curta, AI/ARE/RE) ===', flush=True)
for r in con.execute("""
WITH pres_inad AS (
  SELECT "Processo" AS processo, data_decisao_iso AS dt
  FROM d WHERE orgao_corrigido='PRESIDÊNCIA' AND resultado_classificado='inadmissao'
    AND classe IN ('AI','ARE','RE')
),
prox AS (
  SELECT pi.processo,
         d.orgao_corrigido AS prox_orgao,
         d."Tipo decisão" AS prox_tipo,
         d.resultado_classificado AS prox_resultado,
         d."Ambiente julgamento" AS ambiente,
         ROW_NUMBER() OVER (PARTITION BY pi.processo ORDER BY d.data_decisao_iso) ord
  FROM pres_inad pi
  JOIN d ON d."Processo"=pi.processo AND d.data_decisao_iso > pi.dt
)
SELECT prox_orgao, prox_tipo, prox_resultado, ambiente, COUNT(*) n
FROM prox WHERE ord=1
GROUP BY 1,2,3,4 ORDER BY n DESC LIMIT 20
""").fetchall():
    print(f'  {r[0]:<22} │ {(r[1] or "")[:25]:<25} │ {r[2]:<17} │ {(r[3] or ""):<12} │ {r[4]:>8,}', flush=True)

# ============ 4. MONOCRÁTICA-relator inadmite → Turma se comporta como? ============
print('\n=== 4. Relator monocrática inadmite → Turma decide como? (AI/ARE/RE) ===', flush=True)
for r in con.execute("""
WITH mon_inad AS (
  SELECT "Processo" AS processo, data_decisao_iso AS dt
  FROM d
  WHERE orgao_corrigido='MONOCRÁTICA'
    AND resultado_classificado IN ('inadmissao','improvido','indeferido')
    AND classe IN ('AI','ARE','RE')
),
prox_turma AS (
  SELECT mi.processo, d.orgao_corrigido AS prox_orgao, d."Tipo decisão" AS prox_tipo,
         d.resultado_classificado AS prox_resultado, d."Ambiente julgamento" AS ambiente,
         ROW_NUMBER() OVER (PARTITION BY mi.processo ORDER BY d.data_decisao_iso) ord
  FROM mon_inad mi
  JOIN d ON d."Processo"=mi.processo AND d.data_decisao_iso > mi.dt
    AND d.orgao_corrigido IN ('1ª TURMA','2ª TURMA','TRIBUNAL PLENO','PLENÁRIO VIRTUAL - RG')
)
SELECT prox_orgao, prox_tipo, prox_resultado, ambiente, COUNT(*) n
FROM prox_turma WHERE ord=1
GROUP BY 1,2,3,4 ORDER BY n DESC LIMIT 20
""").fetchall():
    print(f'  {r[0]:<22} │ {(r[1] or "")[:25]:<25} │ {r[2]:<17} │ {(r[3] or ""):<12} │ {r[4]:>8,}', flush=True)

# ============ 5. ULTRAPASSARAM filtros — tiveram MÉRITO PROVIDO em colegiado ============
print('\n=== 5. Processos que ULTRAPASSARAM filtros (PROVIDO em Turma/Pleno) ===', flush=True)
con.execute("""
CREATE TABLE ultrapassam AS
SELECT DISTINCT "Processo" AS processo
FROM d
WHERE orgao_corrigido IN ('1ª TURMA','2ª TURMA','TRIBUNAL PLENO','PLENÁRIO VIRTUAL - RG')
  AND "Tipo decisão" IN ('Decisão Final','Decisão em recurso interno','Decisão Rep. Geral')
  AND resultado_classificado IN ('provido','provido_parcial')
""")
n_ult = con.execute('SELECT COUNT(*) FROM ultrapassam').fetchone()[0]
print(f'  Total: {n_ult:,} processos ({100*n_ult/total_proc:.2f}% do universo)', flush=True)

for r in con.execute("""
SELECT p.classe, COUNT(*) n,
       ROUND(100.0*COUNT(*)/(SELECT COUNT(*) FROM proc p2 WHERE p2.classe=p.classe),2) pct
FROM proc p JOIN ultrapassam u ON u.processo=p.processo
WHERE p.classe IN ('AI','ARE','RE','HC','ADI','ADPF','Rcl','MS','RHC','RMS','MI','AP','ADO')
GROUP BY p.classe ORDER BY n DESC
""").fetchall():
    print(f'  {r[0]:<8} {r[1]:>10,}  ({r[2]:>5.2f}% da classe)', flush=True)

# Por ambiente
print('\n  por ambiente_julgamento (colegiado apenas):', flush=True)
for r in con.execute("""
SELECT d."Ambiente julgamento" AS amb, d.orgao_corrigido AS org, d.resultado_classificado AS res, COUNT(*) n
FROM d
WHERE orgao_corrigido IN ('1ª TURMA','2ª TURMA','TRIBUNAL PLENO','PLENÁRIO VIRTUAL - RG')
  AND "Tipo decisão" IN ('Decisão Final','Decisão em recurso interno','Decisão Rep. Geral')
GROUP BY 1,2,3 ORDER BY n DESC LIMIT 20
""").fetchall():
    print(f'    [{(r[0] or ""):<12}] {r[1]:<22} {r[2]:<18} {r[3]:>10,}', flush=True)

# ============ 6. Assuntos top dos processos que ULTRAPASSARAM ============
print('\n=== 6. Top assuntos dos processos que ultrapassaram (providos) ===', flush=True)
for r in con.execute("""
SELECT assunto_principal, COUNT(*) n FROM (
  SELECT TRIM(SPLIT_PART(d."Assuntos do processo", '|', 1)) AS assunto_principal
  FROM d JOIN ultrapassam u ON u.processo = d."Processo"
)
GROUP BY 1 ORDER BY n DESC LIMIT 20
""").fetchall():
    print(f'  {(r[0] or "")[:70]:<70} {r[1]:>6,}', flush=True)

# ============ Amostras por classe × ambiente ============
print('\n=== 7. AMOSTRAS — trilhas de vida curta (2-3 decisões) em AI/ARE/RE, últimos 5 anos ===', flush=True)
for cls in ('AI','ARE','RE'):
    print(f'\n  --- {cls} ---', flush=True)
    for r in con.execute(f"""
    SELECT d."Processo", d.data_decisao_iso, d.orgao_corrigido, d."Tipo decisão" AS tipo,
           d.resultado_classificado, d."Ambiente julgamento" AS amb,
           LEFT(d."Andamento decisão", 55) AS andamento_preview
    FROM d
    WHERE d."Processo" IN (
      SELECT "Processo" FROM proc WHERE classe='{cls}' AND n_decisoes BETWEEN 2 AND 3 AND ultimo_ano >= 2020 LIMIT 3
    )
    ORDER BY d."Processo", d.data_decisao_iso
    """).fetchall():
        print(f'    {r[0]:<15} {str(r[1])[:10]:<10} {r[2]:<20} {(r[3] or "")[:20]:<20} {r[4]:<15} [{(r[5] or "")[:8]:<8}] {(r[6] or "")[:55]}', flush=True)

con.close()
print('\n[OK] análise concluída — nada salvo em disco (só dashboard HTML se ativado).')
