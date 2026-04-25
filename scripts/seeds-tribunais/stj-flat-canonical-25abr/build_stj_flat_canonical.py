"""build_stj_flat_canonical.py — pipeline ÚNICO e DEFINITIVO.

Lê o flat atual (já tem 113 cols parsed do raw com fix_mojibake aplicado) +
canônico v7 + aliases + dicionário v10 + TPU CNJ → produz NOVO duckdb completo.

Saída: G:/staging_local/stj_flat_canonical.duckdb (não sobrescreve o atual).

Tabelas finais (13):
  cnj_classes_arvore             ← copiada
  cnj_assuntos_arvore            ← copiada
  stj_alias_ministros            ← novo
  stj_dicionario_movimentos      ← novo (v10)
  stj_composicao_temporal_v7     ← novo (v7 limpa+seed_judx)
  stj_pulsos                     ← regerada com categoria_semantica
  stj_processos                  ← regerada com 113 cols + 8 canônicas + 8 presidências
  stj_composicao_gaps            ← derivada
  stj_eventos_ministros          ← derivada (POSSE/TRANSITO/APOSENTADORIA)
  stj_matriz_ministro_macro      ← derivada
  stj_ministros_metricas         ← derivada
  stj_taxa_anual                 ← derivada
  stj_tribunal_origem_resultado  ← derivada
"""
import sys, time, shutil
sys.stdout.reconfigure(encoding='utf-8')
import duckdb, pandas as pd
from pathlib import Path
from datetime import datetime

t0 = time.time()
def log(msg):
    elapsed = time.time() - t0
    print(f'[{elapsed:>6.1f}s] {msg}', flush=True)

DIR = Path(r'C:/Users/medin/Desktop/backup_judx/flat_stj_20260424/exports')
SRC = r'G:/staging_local/stj_flat.duckdb'
DST = r'G:/staging_local/stj_flat_canonical.duckdb'

V7 = DIR / 'composicao_stj_canonical_v7.csv'
ALIAS = DIR / 'stj_alias_ministros.csv'
DICT = DIR / 'dicionario_stj_canonico_v10.csv'

log(f'BUILD STJ FLAT CANONICAL — start {datetime.now().isoformat()}')
log(f'  source flat : {SRC}')
log(f'  destino     : {DST}')

# Remove destino se já existe (idempotente)
if Path(DST).exists():
    log('  removendo destino anterior...')
    Path(DST).unlink()

# === Etapa 1: conectar destino e ATTACH source ===
log('1) Conectando bancos (dst + ATTACH src)')
dst = duckdb.connect(DST)
dst.execute(f"ATTACH '{SRC}' AS src (READ_ONLY)")
src_tables = [r[0] for r in dst.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='src'").fetchall()]
log(f'   src tabelas: {src_tables}')

# === Etapa 2: copiar TPU CNJ (intactas) ===
log('2) Copiando TPU CNJ (cnj_classes_arvore, cnj_assuntos_arvore)')
for t in ['cnj_classes_arvore','cnj_assuntos_arvore']:
    dst.execute(f'CREATE TABLE {t} AS SELECT * FROM src.{t}')
    n = dst.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
    log(f'   {t}: {n:,} linhas')

# === Etapa 3: importar CSVs canônicos (v7, alias, dicionário) ===
log('3) Importando CSVs canônicos')

# 3a. stj_dicionario_movimentos
log('   3a) stj_dicionario_movimentos')
dst.execute(f"""
CREATE TABLE stj_dicionario_movimentos AS
SELECT * FROM read_csv_auto('{DICT.as_posix()}', header=true)
""")
n = dst.execute('SELECT COUNT(*) FROM stj_dicionario_movimentos').fetchone()[0]
log(f'      {n:,} códigos')

# 3b. stj_alias_ministros
log('   3b) stj_alias_ministros')
dst.execute(f"""
CREATE TABLE stj_alias_ministros AS
SELECT * FROM read_csv_auto('{ALIAS.as_posix()}', header=true)
""")
n = dst.execute('SELECT COUNT(*) FROM stj_alias_ministros').fetchone()[0]
log(f'      {n:,} aliases')

# 3c. stj_composicao_temporal_v7
log('   3c) stj_composicao_temporal_v7')
dst.execute(f"""
CREATE TABLE stj_composicao_temporal_v7 AS
SELECT * FROM read_csv_auto('{V7.as_posix()}', header=true,
                             types={{'data_referencia':'VARCHAR','data_ingresso_orgao':'VARCHAR'}})
""")
n = dst.execute('SELECT COUNT(*) FROM stj_composicao_temporal_v7').fetchone()[0]
log(f'      {n:,} linhas')

# === Etapa 4: stj_pulsos enriquecida com categoria_semantica ===
log('4) stj_pulsos (enriquecida com dicionário v10)')
dst.execute("""
CREATE TABLE stj_pulsos AS
SELECT
  p.datajud_id, p.seq, p.data_hora, p.codigo_tpu, p.nome_cnj,
  p.categoria_judx, p.eh_resultado,
  p.complemento_desc, p.complemento_nome, p.complemento_valor, p.complemento_codigo,
  d.categoria_semantica,
  d.tipo AS tipo_movimento,
  d.fonte_dicionario,
  d.eh_resultado_julgamento,
  d.eh_resultado_administrativo
FROM src.stj_pulsos p
LEFT JOIN stj_dicionario_movimentos d
  ON d.codigo = p.codigo_tpu
""")
n = dst.execute('SELECT COUNT(*) FROM stj_pulsos').fetchone()[0]
log(f'   stj_pulsos: {n:,} linhas')

# Cobertura do dicionário
cov = dst.execute("""
SELECT
  COUNT(*) AS total,
  COUNT(categoria_semantica) AS cobertos,
  100.0 * COUNT(categoria_semantica) / COUNT(*) AS pct
FROM stj_pulsos
""").fetchone()
log(f'   cobertura dicionário: {cov[1]:,}/{cov[0]:,} = {cov[2]:.2f}%')

# === Etapa 5: stj_processos enriquecida ===
log('5) stj_processos (113 cols + 8 canônicas + 8 presidências)')

# 5a. Primeiro: copiar todas as 113 cols originais + ministro_key (via alias)
dst.execute("""
CREATE TABLE stj_processos AS
SELECT
  p.*,
  COALESCE(a.ministro_key, UPPER(p.ministro_canonical)) AS ministro_key
FROM src.stj_processos p
LEFT JOIN stj_alias_ministros a
  ON a.nome_raw = p.ministro_canonical
""")
n = dst.execute('SELECT COUNT(*) FROM stj_processos').fetchone()[0]
log(f'   stj_processos: {n:,} linhas (113 cols + ministro_key)')

# 5b. Adicionar colunas canônicas via UPDATE (orgao_esperado, flag_consistente, etc)
log('   adicionando 16 cols canônicas')
dst.execute("""
ALTER TABLE stj_processos ADD COLUMN orgao_esperado VARCHAR;
ALTER TABLE stj_processos ADD COLUMN tipo_registro_canonico VARCHAR;
ALTER TABLE stj_processos ADD COLUMN flag_consistente_orgao BOOLEAN;
ALTER TABLE stj_processos ADD COLUMN flag_pre_2015 BOOLEAN;
ALTER TABLE stj_processos ADD COLUMN motivo_inconsistencia VARCHAR;
""")

# 5c. Construir tabela auxiliar de composição expandida (intervalos)
# Para cada (ministro_key, orgao_codigo), pegar todos os snapshots e ordenar por data
log('   construindo intervalos canônicos por ministro')

dst.execute("""
CREATE TEMP TABLE _comp_pdf_long AS
SELECT
  ministro_key,
  orgao_codigo,
  TRY_CAST(data_referencia AS DATE) AS dt_snap,
  TRY_CAST(data_ingresso_orgao AS DATE) AS dt_ingresso
FROM stj_composicao_temporal_v7
WHERE ministro_key IS NOT NULL AND ministro_key <> ''
  AND TRY_CAST(data_referencia AS DATE) IS NOT NULL
""")

# Para cada (ministro, orgao): primeira/última aparição
dst.execute("""
CREATE TEMP TABLE _comp_intervalos AS
SELECT
  ministro_key,
  orgao_codigo,
  MIN(COALESCE(dt_ingresso, dt_snap)) AS valid_from,
  MAX(dt_snap) AS dt_ultimo_snap
FROM _comp_pdf_long
GROUP BY 1, 2
""")

# valid_to: data_referencia do snapshot SEGUINTE em que ministro NÃO está nesse órgão
# (aproximação via LEAD: snapshot seguinte global)
dst.execute("""
CREATE TEMP TABLE _comp_canonical AS
WITH all_snaps AS (
  SELECT DISTINCT TRY_CAST(data_referencia AS DATE) AS dt_snap
  FROM stj_composicao_temporal_v7
  WHERE TRY_CAST(data_referencia AS DATE) IS NOT NULL
),
intervalos AS (
  SELECT
    i.ministro_key,
    i.orgao_codigo,
    i.valid_from,
    -- próxima data de snapshot global após o último em que ministro aparece
    (SELECT MIN(s.dt_snap) FROM all_snaps s WHERE s.dt_snap > i.dt_ultimo_snap) AS dt_proximo_snap_apos
  FROM _comp_intervalos i
)
SELECT
  ministro_key, orgao_codigo, valid_from,
  COALESCE(dt_proximo_snap_apos, DATE '9999-12-31') AS valid_to
FROM intervalos
""")

n_int = dst.execute('SELECT COUNT(*) FROM _comp_canonical').fetchone()[0]
log(f'   intervalos canônicos: {n_int}')

# 5d. UPDATE stj_processos com orgao_esperado
log('   UPDATE orgao_esperado')
dst.execute("""
UPDATE stj_processos
SET orgao_esperado = sub.orgao_codigo,
    flag_consistente_orgao = (sub.orgao_codigo = stj_processos.orgao_codigo
                              OR LOWER(sub.orgao_codigo) = LOWER(stj_processos.turma_secao)
                              OR LOWER(sub.orgao_codigo) LIKE '%' || LOWER(stj_processos.turma_secao) || '%')
FROM (
  SELECT p.datajud_id, c.orgao_codigo
  FROM stj_processos p
  JOIN _comp_canonical c
    ON c.ministro_key = p.ministro_key
   AND p.data_primeiro_resultado::DATE BETWEEN c.valid_from AND c.valid_to
) sub
WHERE stj_processos.datajud_id = sub.datajud_id
""")

# 5e. UPDATE pre_2015 e motivo
dst.execute("""
UPDATE stj_processos
SET flag_pre_2015 = (data_primeiro_resultado::DATE < DATE '2015-09-05')
WHERE data_primeiro_resultado IS NOT NULL
""")

dst.execute("""
UPDATE stj_processos
SET motivo_inconsistencia = CASE
  WHEN orgao_esperado IS NULL AND flag_pre_2015 = TRUE THEN 'periodo_anterior_ao_primeiro_snapshot_2015-09'
  WHEN orgao_esperado IS NULL THEN 'ministro_sem_canonico_para_data'
  WHEN flag_consistente_orgao = FALSE THEN 'orgao_observado_diff_canonico'
  ELSE NULL
END
""")

# 5f. Resultado canônico — atualizar resultado_final_* via dicionário
# (Já temos os campos do flat src, mas re-aplicamos o dicionário sobre o pulso resultado-mais-tardio)
log('   UPDATE resultado_final_* via dicionário v10')
dst.execute("""
CREATE TEMP TABLE _resultado_canonico AS
SELECT
  p.datajud_id,
  pul.codigo_tpu AS resultado_final_cod_v10,
  pul.nome_cnj AS resultado_final_nome_v10,
  pul.categoria_semantica AS resultado_final_cat_v10,
  pul.tipo_movimento AS resultado_tipo_v10
FROM stj_processos p
LEFT JOIN LATERAL (
  SELECT * FROM stj_pulsos pp
  WHERE pp.datajud_id = p.datajud_id
    AND pp.eh_resultado_julgamento = TRUE
  ORDER BY pp.data_hora DESC
  LIMIT 1
) pul ON TRUE
""")
dst.execute("ALTER TABLE stj_processos ADD COLUMN resultado_final_cat_v10 VARCHAR")
dst.execute("ALTER TABLE stj_processos ADD COLUMN resultado_tipo_v10 VARCHAR")
dst.execute("""
UPDATE stj_processos
SET resultado_final_cat_v10 = r.resultado_final_cat_v10,
    resultado_tipo_v10 = r.resultado_tipo_v10
FROM _resultado_canonico r
WHERE stj_processos.datajud_id = r.datajud_id
""")

# === Etapa 6: tabelas derivadas ===
log('6) Tabelas derivadas (gaps, métricas, taxa, etc)')

dst.execute("""
CREATE TABLE stj_composicao_gaps AS
SELECT
  ministro_key,
  COUNT(*) AS docs_sem_canonico,
  MIN(ano_julgamento) AS ano_min,
  MAX(ano_julgamento) AS ano_max,
  motivo_inconsistencia
FROM stj_processos
WHERE orgao_esperado IS NULL AND ministro_canonical IS NOT NULL
GROUP BY 1, 5
ORDER BY 2 DESC
""")
n = dst.execute('SELECT COUNT(*) FROM stj_composicao_gaps').fetchone()[0]
log(f'   stj_composicao_gaps: {n}')

dst.execute("""
CREATE TABLE stj_matriz_ministro_macro AS
SELECT
  ministro_key,
  turma_secao,
  secao,
  macro_principal,
  resultado_final_agg,
  COUNT(*) AS docs
FROM stj_processos
WHERE ministro_key IS NOT NULL
GROUP BY 1,2,3,4,5
""")
log(f'   stj_matriz_ministro_macro: {dst.execute("SELECT COUNT(*) FROM stj_matriz_ministro_macro").fetchone()[0]}')

dst.execute("""
CREATE TABLE stj_taxa_anual AS
SELECT
  ano_julgamento AS ano,
  secao,
  turma_secao,
  resultado_final_agg,
  COUNT(*) AS docs
FROM stj_processos
WHERE ano_julgamento IS NOT NULL
GROUP BY 1,2,3,4
""")
log(f'   stj_taxa_anual: {dst.execute("SELECT COUNT(*) FROM stj_taxa_anual").fetchone()[0]}')

dst.execute("""
CREATE TABLE stj_tribunal_origem_resultado AS
SELECT
  tribunal_origem, ramo_origem, uf_origem, regiao_origem,
  secao, resultado_final_agg, COUNT(*) AS docs
FROM stj_processos
WHERE tribunal_origem IS NOT NULL
GROUP BY 1,2,3,4,5,6
""")
log(f'   stj_tribunal_origem_resultado: {dst.execute("SELECT COUNT(*) FROM stj_tribunal_origem_resultado").fetchone()[0]}')

# === Etapa 7: Validação final ===
log('7) Validação final')
print()
print('=== ESTRUTURA FINAL ===')
for t in [r[0] for r in dst.execute('SHOW TABLES').fetchall()]:
    n = dst.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
    print(f'  {t}: {n:,}')

print()
print('=== Cobertura ministro_key em stj_processos ===')
print(dst.execute("""
SELECT
  COUNT(*) AS total,
  COUNT(ministro_key) AS com_key,
  COUNT(orgao_esperado) AS com_orgao_canonico,
  SUM(CASE WHEN flag_consistente_orgao THEN 1 ELSE 0 END) AS consistentes,
  SUM(CASE WHEN flag_pre_2015 THEN 1 ELSE 0 END) AS pre_2015
FROM stj_processos
""").fetchdf())

dst.close()
log(f'BUILD CONCLUÍDO em {(time.time()-t0)/60:.1f} min')
log(f'Saída: {DST}')
