"""Extrator estruturado da 'Observação do andamento' do STF.

Entrada:  judx_decision_com_conferencia.csv (com ancoragem C1+C2 via seed)
Saída:    judx_decision_enriquecido.csv (mesmas colunas + 10 novas)

Colunas novas extraídas da Observação:
  obs_votacao           → 'unanime' | 'maioria' | 'monocratica' | NULL
  obs_vencidos_nomes    → nomes dos vencidos, separados por '|' (ex: 'EDSON FACHIN')
  obs_vencidos_n        → quantidade (0 para unanimidade, 1+ para maioria)
  obs_placar_reconstr   → placar reconstruído (ex: '4x1' para 5-min turma com 1 vencido)
  obs_colegiado         → 'PRIMEIRA TURMA' | 'SEGUNDA TURMA' | 'PLENARIO' | 'PLENARIO_VIRT' | NULL
  obs_ambiente          → 'VIRTUAL' | 'PRESENCIAL' | NULL
  obs_dispositivo       → 'NEGOU PROVIMENTO' | 'DEU PROVIMENTO' | 'DEU PARCIAL' | 'REJEITOU' | 'ACOLHEU' | etc.
  obs_nos_termos_voto   → TRUE se "nos termos do voto do Relator"
  obs_relator_vencido   → TRUE se "vencido o Relator" / "nos termos do voto divergente" (relator foi vencido!)
  obs_data_sessao       → data da sessão (extraída do texto 'Sessão... de DD.MM.YYYY')

Padrões observados em AI/ARE/RE:
- Pós-2008 padrão Corte Aberta (UPPERCASE + caixa mista):
  "Decisão: A Turma, por unanimidade, negou provimento ao agravo regimental, nos termos do voto do Relator. Segunda Turma, Sessão Virtual de 9.8.2024 a 16.8.2024."
- Com maioria: "por maioria, ..., vencido o Ministro Edson Fachin"
- Vencidos múltiplos: "vencidos os Ministros André Mendonça e Nunes Marques"
- Plenário: "O Tribunal, por X, ... Plenário, Sessão Virtual de DD a DD"
- Pré-2008 CAIXA ALTA: "NA SESSÃO PLENÁRIA DE DD.MM.YYYY - Decisão: O Tribunal, por unanimidade, ..."
"""
import duckdb, re
from pathlib import Path

OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados")
SRC = OUT / "2026-04-19_judx_decision_com_conferencia.csv"
DST = OUT / "2026-04-19_judx_decision_enriquecido.csv"
DB = "G:/staging_local/extrator_tmp.duckdb"

con = duckdb.connect(DB)

print("[load] judx_decision_com_conferencia.csv (2,93M linhas)...", flush=True)
con.execute(f"""
CREATE OR REPLACE TABLE t AS
SELECT * FROM read_csv_auto('{SRC.as_posix()}', header=true, sample_size=50000);
""")
n = con.execute("SELECT COUNT(*) FROM t").fetchone()[0]
print(f"  {n:,} linhas", flush=True)

# ============================================================
# EXTRATOR SQL — tudo que regex/LIKE do DuckDB consegue fazer
# ============================================================
print("[extrair] aplicando regex estruturada...", flush=True)
con.execute(f"""
CREATE OR REPLACE TABLE t2 AS
SELECT
  t.*,

  -- votação
  CASE
    WHEN observacao_andamento IS NULL THEN NULL
    WHEN UPPER(observacao_andamento) LIKE '%POR UNANIMIDADE%'
      OR UPPER(observacao_andamento) LIKE '%POR VOTAÇÃO UNÂNIME%'
      OR UPPER(observacao_andamento) LIKE '%À UNANIMIDADE%'
      OR UPPER(observacao_andamento) LIKE '%DECISÃO UNÂNIME%'
      THEN 'unanime'
    WHEN UPPER(observacao_andamento) LIKE '%POR MAIORIA%'
      OR UPPER(observacao_andamento) LIKE '%POR VOTAÇÃO MAJORITÁRIA%'
      THEN 'maioria'
    WHEN origem_decisao = 'MONOCRÁTICA' THEN 'monocratica'
    ELSE NULL
  END AS obs_votacao,

  -- colegiado explicitado na obs (precedência sobre origem_decisao)
  CASE
    WHEN UPPER(observacao_andamento) LIKE '%PRIMEIRA TURMA%' THEN 'PRIMEIRA TURMA'
    WHEN UPPER(observacao_andamento) LIKE '%SEGUNDA TURMA%' THEN 'SEGUNDA TURMA'
    WHEN UPPER(observacao_andamento) LIKE '%PLENÁRIO VIRTUAL%'
      OR UPPER(observacao_andamento) LIKE '%PLENARIO VIRTUAL%' THEN 'PLENARIO_VIRT'
    WHEN UPPER(observacao_andamento) LIKE '%PLENÁRIO%'
      OR UPPER(observacao_andamento) LIKE '%O TRIBUNAL%'
      OR UPPER(observacao_andamento) LIKE '%SESSÃO PLENÁRIA%' THEN 'PLENARIO'
    ELSE NULL
  END AS obs_colegiado,

  -- ambiente explicitado na obs
  CASE
    WHEN UPPER(observacao_andamento) LIKE '%SESSÃO VIRTUAL%'
      OR UPPER(observacao_andamento) LIKE '%SESSAO VIRTUAL%' THEN 'VIRTUAL'
    WHEN UPPER(observacao_andamento) LIKE '%SESSÃO PRESENCIAL%'
      OR UPPER(observacao_andamento) LIKE '%SESSÃO ORDINÁRIA%'
      OR UPPER(observacao_andamento) LIKE '%SESSÃO PLENÁRIA%' THEN 'PRESENCIAL'
    ELSE NULL
  END AS obs_ambiente,

  -- dispositivo (o que foi decidido)
  CASE
    WHEN UPPER(observacao_andamento) LIKE '%DEU PARCIAL PROVIMENTO%'
      OR UPPER(observacao_andamento) LIKE '%DEU PROVIMENTO EM PARTE%'
      OR UPPER(observacao_andamento) LIKE '%PARCIAL PROVIMENTO%' THEN 'DEU_PARCIAL_PROVIMENTO'
    WHEN UPPER(observacao_andamento) LIKE '%NEGOU PROVIMENTO%'
      OR UPPER(observacao_andamento) LIKE '%NEGOU-LHE PROVIMENTO%' THEN 'NEGOU_PROVIMENTO'
    WHEN UPPER(observacao_andamento) LIKE '%DEU PROVIMENTO%' THEN 'DEU_PROVIMENTO'
    WHEN UPPER(observacao_andamento) LIKE '%REJEITOU OS EMBARGOS%' THEN 'REJEITOU_EMBARGOS'
    WHEN UPPER(observacao_andamento) LIKE '%ACOLHEU OS EMBARGOS%'
      OR UPPER(observacao_andamento) LIKE '%RECEBEU OS EMBARGOS%' THEN 'ACOLHEU_EMBARGOS'
    WHEN UPPER(observacao_andamento) LIKE '%CONHECEU E NEGOU%'
      OR UPPER(observacao_andamento) LIKE '%CONHECEU DO AGRAVO E NEGOU%' THEN 'CONHECEU_NEGOU'
    WHEN UPPER(observacao_andamento) LIKE '%NÃO CONHECEU%'
      OR UPPER(observacao_andamento) LIKE '%NAO CONHECEU%' THEN 'NAO_CONHECEU'
    WHEN UPPER(observacao_andamento) LIKE '%JULGOU PROCEDENTE%' THEN 'JULGOU_PROCEDENTE'
    WHEN UPPER(observacao_andamento) LIKE '%JULGOU IMPROCEDENTE%' THEN 'JULGOU_IMPROCEDENTE'
    WHEN UPPER(observacao_andamento) LIKE '%CONCEDEU A ORDEM%' THEN 'CONCEDEU_ORDEM'
    WHEN UPPER(observacao_andamento) LIKE '%DENEGOU A ORDEM%' THEN 'DENEGOU_ORDEM'
    WHEN UPPER(observacao_andamento) LIKE '%DEFERIU%' THEN 'DEFERIU'
    WHEN UPPER(observacao_andamento) LIKE '%INDEFERIU%' THEN 'INDEFERIU'
    ELSE NULL
  END AS obs_dispositivo,

  -- "nos termos do voto do Relator" (relator prevalece)
  (UPPER(observacao_andamento) LIKE '%NOS TERMOS DO VOTO DO RELATOR%'
   OR UPPER(observacao_andamento) LIKE '%NOS TERMOS DO VOTO DO(A) RELATOR%') AS obs_nos_termos_voto_relator,

  -- "nos termos do voto divergente" ou "vencido o Relator" (relator foi VENCIDO — o outlier da Damares)
  (UPPER(observacao_andamento) LIKE '%VENCIDO O RELATOR%'
   OR UPPER(observacao_andamento) LIKE '%VENCIDO O MINISTRO RELATOR%'
   OR UPPER(observacao_andamento) LIKE '%NOS TERMOS DO VOTO DIVERGENTE%'
   OR UPPER(observacao_andamento) LIKE '%NOS TERMOS DO VOTO-VISTA%') AS obs_relator_vencido,

  -- Nomes dos vencidos: extraídos via 2 padrões principais
  -- Padrão 1: "vencido o Ministro X" (singular)
  -- Padrão 2: "vencidos os Ministros X e Y" (dois)
  -- Padrão 3: "vencidos os Ministros X, Y e Z" (três+) — extração parcial
  regexp_extract(observacao_andamento,
    'vencido o[s]? [Mm]inistro[s]? ([A-ZÀ-Úa-zà-ú .]+?)[,.]', 1) AS obs_vencido_1,
  regexp_extract(observacao_andamento,
    'vencidos os [Mm]inistros [A-ZÀ-Úa-zà-ú .]+? e ([A-ZÀ-Úa-zà-ú .]+?)[,.]', 1) AS obs_vencido_2,

  -- Data da sessão: "Sessão Virtual de DD.MM.YYYY a DD.MM.YYYY" OU "Sessão de DD.MM.YYYY"
  regexp_extract(observacao_andamento,
    'Sess[ãa]o[^0-9]{{0,40}}?(\\d{{1,2}}[./]\\d{{1,2}}[./]\\d{{2,4}})', 1) AS obs_data_sessao_str

FROM t
""")

# Contar sinais extraídos
print("\n=== SINAIS EXTRAÍDOS (agregados) ===", flush=True)
for label, col, where in [
    ("obs_votacao=unanime", None, "obs_votacao='unanime'"),
    ("obs_votacao=maioria", None, "obs_votacao='maioria'"),
    ("obs_votacao=monocratica", None, "obs_votacao='monocratica'"),
    ("obs_votacao=NULL", None, "obs_votacao IS NULL"),
    ("obs_ambiente=VIRTUAL", None, "obs_ambiente='VIRTUAL'"),
    ("obs_ambiente=PRESENCIAL", None, "obs_ambiente='PRESENCIAL'"),
    ("obs_colegiado=PRIMEIRA TURMA", None, "obs_colegiado='PRIMEIRA TURMA'"),
    ("obs_colegiado=SEGUNDA TURMA", None, "obs_colegiado='SEGUNDA TURMA'"),
    ("obs_colegiado=PLENARIO", None, "obs_colegiado='PLENARIO'"),
    ("obs_colegiado=PLENARIO_VIRT", None, "obs_colegiado='PLENARIO_VIRT'"),
    ("obs_nos_termos_voto_relator", None, "obs_nos_termos_voto_relator=TRUE"),
    ("obs_relator_vencido", None, "obs_relator_vencido=TRUE"),
    ("obs_vencido_1 preenchido", None, "obs_vencido_1 IS NOT NULL AND obs_vencido_1 <> ''"),
    ("obs_data_sessao_str preenchido", None, "obs_data_sessao_str IS NOT NULL AND obs_data_sessao_str <> ''"),
]:
    n_ = con.execute(f"SELECT COUNT(*) FROM t2 WHERE {where}").fetchone()[0]
    print(f"  {label:<35s} {n_:>10,}  ({100*n_/n:>5.2f}%)", flush=True)

# Amostra dos relatores vencidos — os outliers que interessam
print("\n=== RELATOR VENCIDO — outlier da Damares (amostra) ===", flush=True)
for r in con.execute("""
  SELECT external_number, relator_normalizado, decision_date, obs_colegiado, obs_ambiente,
         LEFT(observacao_andamento, 180) obs
  FROM t2 WHERE obs_relator_vencido = TRUE
  ORDER BY decision_date DESC LIMIT 10
""").fetchall():
    print(f"  {r[0]:<15s} {(r[1] or '-')[:22]:<22s} {r[2]} {r[3]}/{r[4]}", flush=True)
    print(f"    \"{r[5]}...\"", flush=True)

# Amostra onde inadmissão foi SUPERADA pela Turma (padrão referendo vs ruptura)
print("\n=== INADMISSÃO SUPERADA pela Turma (colegiado deu provimento) — amostra ===", flush=True)
for r in con.execute("""
  SELECT external_number, relator_normalizado, decision_date, obs_colegiado, obs_ambiente, LEFT(observacao_andamento, 180)
  FROM t2
  WHERE obs_dispositivo = 'DEU_PROVIMENTO'
    AND obs_colegiado IN ('PRIMEIRA TURMA','SEGUNDA TURMA')
    AND andamento_decisao ILIKE '%AGRAVO REGIMENTAL%PROVIDO%'
  ORDER BY decision_date DESC LIMIT 10
""").fetchall():
    print(f"  {r[0]:<15s} {(r[1] or '-')[:22]:<22s} {r[2]} {r[3]}/{r[4]}", flush=True)
    print(f"    \"{r[5]}...\"", flush=True)

# Export
print(f"\n[export] {DST}...", flush=True)
con.execute(f"COPY t2 TO '{DST.as_posix()}' (HEADER, DELIMITER ',');")

con.close()
import os
try: os.remove(DB)
except: pass

print(f"\n[ok] {DST}")
print(f"[ok] tamanho: {DST.stat().st_size/1024/1024:.1f} MB")
