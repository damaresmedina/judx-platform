"""Refina flag_consistente_orgao + cria tabelas finais de produto.
- multi_orgao_legitimo: ministro é da TURMA mas está julgando na CE/Presid (caso real)
- Tabelas finais para Supabase: stj_taxa_anual_v2, stj_matriz_ministro_macro_v2, etc
"""
import sys, time
sys.stdout.reconfigure(encoding='utf-8')
import duckdb

t0 = time.time()
def log(m): print(f'[{time.time()-t0:>5.1f}s] {m}', flush=True)

DST = r'G:/staging_local/stj_flat_canonical.duckdb'
con = duckdb.connect(DST)

# === ETAPA 1: refinar flag_consistente_orgao ===
log('1) Refinando flag_consistente_orgao')

# Adicionar coluna nova: tipo_consistencia
try:
    con.execute("ALTER TABLE stj_processos ADD COLUMN tipo_consistencia VARCHAR")
except Exception as e:
    log(f'  coluna já existe ou erro: {e}')

con.execute("""
UPDATE stj_processos
SET tipo_consistencia = CASE
  WHEN orgao_esperado IS NULL THEN 'sem_canonico'
  WHEN orgao_esperado IN ('TURMA_1','TURMA_2','TURMA_3','TURMA_4','TURMA_5','TURMA_6')
       AND turma_secao = SUBSTRING(orgao_esperado, 7, 1) || 'a Turma' THEN 'turma_consistente'
  WHEN orgao_esperado LIKE 'TURMA_%_PRESID'
       AND turma_secao = SUBSTRING(orgao_esperado, 7, 1) || 'a Turma' THEN 'presidente_julga_na_turma'
  WHEN orgao_esperado IN ('TURMA_1','TURMA_2','TURMA_3','TURMA_4','TURMA_5','TURMA_6')
       AND categoria_orgao = 'corte_especial' THEN 'membro_turma_julga_CE'
  WHEN orgao_esperado = 'CORTE_ESPECIAL' AND turma_secao LIKE '%Turma' THEN 'membro_CE_julga_turma_origem'
  WHEN orgao_esperado = 'CORTE_ESPECIAL' AND categoria_orgao = 'corte_especial' THEN 'CE_consistente'
  WHEN orgao_esperado = 'PRESIDENCIA' AND categoria_orgao = 'presidencia_STJ' THEN 'presidencia_consistente'
  WHEN orgao_esperado = 'VICE_PRESIDENCIA' AND categoria_orgao = 'vice_presidencia_STJ' THEN 'vice_consistente'
  WHEN orgao_esperado = 'CORREGEDORIA_CNJ' AND categoria_orgao = 'corregedoria' THEN 'corregedoria_consistente'
  ELSE 'turma_diferente'
END
""")

# flag_consistente_orgao agora aceita os casos legítimos
con.execute("""
UPDATE stj_processos
SET flag_consistente_orgao = (tipo_consistencia IN (
  'turma_consistente',
  'presidente_julga_na_turma',
  'membro_turma_julga_CE',
  'membro_CE_julga_turma_origem',
  'CE_consistente',
  'presidencia_consistente',
  'vice_consistente',
  'corregedoria_consistente'
))
""")

stats = con.execute("""
SELECT tipo_consistencia, COUNT(*) AS docs
FROM stj_processos
WHERE orgao_esperado IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC
""").fetchdf()
print(stats.to_string(index=False))

n = con.execute("""
SELECT
  COUNT(*) AS com_orgao,
  SUM(CASE WHEN flag_consistente_orgao THEN 1 ELSE 0 END) AS consistentes
FROM stj_processos WHERE orgao_esperado IS NOT NULL
""").fetchone()
log(f'  consistentes pós-refino: {n[1]:,}/{n[0]:,} = {100*n[1]/n[0]:.2f}%')

# === ETAPA 2: tabelas finais de produto ===
log('\n2) Recriando tabelas finais de produto (versão canônica)')

# 2a. stj_matriz_ministro_macro (recalcular usando ministro_key + orgao_esperado)
con.execute("DROP TABLE IF EXISTS stj_matriz_ministro_macro")
con.execute("""
CREATE TABLE stj_matriz_ministro_macro AS
SELECT
  ministro_key,
  orgao_esperado,
  turma_secao,
  secao,
  macro_principal,
  resultado_final_agg,
  resultado_final_cat_v10,
  COUNT(*) AS docs
FROM stj_processos
WHERE ministro_key IS NOT NULL
GROUP BY 1,2,3,4,5,6,7
""")
n = con.execute('SELECT COUNT(*) FROM stj_matriz_ministro_macro').fetchone()[0]
log(f'  stj_matriz_ministro_macro: {n:,}')

# 2b. stj_ministros_metricas (criar do zero baseado em ministro_key + orgao_esperado)
con.execute("DROP TABLE IF EXISTS stj_ministros_metricas")
con.execute("""
CREATE TABLE stj_ministros_metricas AS
SELECT
  ministro_key,
  orgao_esperado,
  turma_secao,
  secao,
  COUNT(*) AS docs_total,
  MIN(ano_julgamento) AS ano_primeiro,
  MAX(ano_julgamento) AS ano_ultimo,
  SUM(CASE WHEN eh_resultado_julgamento_final IS TRUE THEN 1 ELSE 0 END) AS julgamentos,
  -- usando dicionário v10
  SUM(CASE WHEN resultado_tipo_v10 = 'RESULTADO_JULGAMENTO' THEN 1 ELSE 0 END) AS resultado_merito,
  SUM(CASE WHEN resultado_final_cat_v10 LIKE '%PROVIMENTO%' AND resultado_final_cat_v10 NOT LIKE '%NAO%' AND resultado_final_cat_v10 NOT LIKE 'NEG%' THEN 1 ELSE 0 END) AS provimento,
  SUM(CASE WHEN resultado_final_cat_v10 LIKE '%NAO_CONHEC%' THEN 1 ELSE 0 END) AS nao_conhecido,
  SUM(CASE WHEN resultado_final_cat_v10 LIKE '%PRESCRIC%' OR resultado_final_cat_v10 LIKE '%DECADENC%' THEN 1 ELSE 0 END) AS prescricao,
  AVG(duracao_total_dias) AS dur_media_dias
FROM stj_processos
LEFT JOIN (SELECT codigo, eh_resultado_julgamento AS eh_resultado_julgamento_final
           FROM stj_dicionario_movimentos) d
  ON d.codigo = stj_processos.resultado_final_cod
WHERE ministro_key IS NOT NULL
GROUP BY 1,2,3,4
""")
n = con.execute('SELECT COUNT(*) FROM stj_ministros_metricas').fetchone()[0]
log(f'  stj_ministros_metricas: {n:,}')

# 2c. stj_taxa_anual (já recriada pelo build, refazer com canônico)
con.execute("DROP TABLE IF EXISTS stj_taxa_anual")
con.execute("""
CREATE TABLE stj_taxa_anual AS
SELECT
  ano_julgamento AS ano,
  orgao_esperado,
  turma_secao,
  secao,
  resultado_final_cat_v10,
  COUNT(*) AS docs
FROM stj_processos
WHERE ano_julgamento IS NOT NULL
GROUP BY 1,2,3,4,5
""")
n = con.execute('SELECT COUNT(*) FROM stj_taxa_anual').fetchone()[0]
log(f'  stj_taxa_anual: {n:,}')

# 2d. stj_tribunal_origem_resultado (refazer com cat v10)
con.execute("DROP TABLE IF EXISTS stj_tribunal_origem_resultado")
con.execute("""
CREATE TABLE stj_tribunal_origem_resultado AS
SELECT
  tribunal_origem, ramo_origem, uf_origem, regiao_origem,
  secao, orgao_esperado,
  resultado_final_cat_v10,
  COUNT(*) AS docs
FROM stj_processos
WHERE tribunal_origem IS NOT NULL
GROUP BY 1,2,3,4,5,6,7
""")
n = con.execute('SELECT COUNT(*) FROM stj_tribunal_origem_resultado').fetchone()[0]
log(f'  stj_tribunal_origem_resultado: {n:,}')

# === ETAPA 3: Validação final ===
log('\n3) Validação final')
print(con.execute("""
SELECT
  COUNT(*) AS total_procs,
  COUNT(orgao_esperado) AS com_orgao,
  SUM(CASE WHEN flag_consistente_orgao THEN 1 ELSE 0 END) AS consistentes,
  ROUND(100.0 * SUM(CASE WHEN flag_consistente_orgao THEN 1 ELSE 0 END) / NULLIF(COUNT(orgao_esperado),0), 2) AS pct
FROM stj_processos
""").fetchdf())

print('\n=== Tabelas finais ===')
for r in con.execute("SHOW TABLES").fetchall():
    n = con.execute(f"SELECT COUNT(*) FROM {r[0]}").fetchone()[0]
    print(f'  {r[0]:35} {n:>12,}')

con.close()
log('OK refinamento + tabelas finais')
