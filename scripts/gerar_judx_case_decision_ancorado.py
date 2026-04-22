"""Gera judx_case.csv + judx_decision.csv ancorados, a partir de stf_judx_norm.csv (3,76M decisões)
cruzando com composicao_ministerial.csv (seed com ancoragem temporal).

Ancoragem: para cada decisão (data_decisao, relator), deriva o órgão vigente naquela data
consultando o seed composicao_ministerial.csv — respeitando valid_from/valid_to.
"""
import duckdb
from pathlib import Path

SRC = "C:/Users/medin/Desktop/backup_judx/resultados/stf_judx_norm.csv"
SEED = "C:/Users/medin/projetos/judx-platform/scripts/seeds-tribunais/composicao_ministerial.csv"
OUT_DIR = Path("C:/Users/medin/Desktop/backup_judx/resultados")
DB = "G:/staging_local/stf_ancoragem_tmp.duckdb"

OUT_CASE = OUT_DIR / "2026-04-19_judx_case_ancorado.csv"
OUT_DECISION = OUT_DIR / "2026-04-19_judx_decision_ancorado.csv"

print("[duckdb] criando banco temp...", flush=True)
con = duckdb.connect(DB)

# 1) Ler stf_judx_norm.csv
print("[load] stf_judx_norm.csv (3,76M linhas)...", flush=True)
con.execute(f"""
CREATE OR REPLACE TABLE stf_raw AS
SELECT * FROM read_csv_auto('{SRC}', header=true, sample_size=50000);
""")
n_raw = con.execute("SELECT COUNT(*) FROM stf_raw").fetchone()[0]
print(f"  {n_raw:,} linhas carregadas", flush=True)

# 2) Ler composicao_ministerial.csv — pular linhas iniciadas com #
print("[load] composicao_ministerial.csv (seed)...", flush=True)
con.execute(f"""
CREATE OR REPLACE TABLE comp AS
SELECT * FROM read_csv_auto('{SEED}', header=true, sample_size=500, ignore_errors=true);
""")
# filtrar lixo (linhas que não tem tribunal_sigla STF/STJ)
con.execute("""
CREATE OR REPLACE TABLE comp_stf AS
SELECT tribunal_sigla, ministro_nome_canonico, codigo_orgao,
       TRY_CAST(valid_from AS DATE) AS valid_from,
       TRY_CAST(valid_to AS DATE) AS valid_to
FROM comp
WHERE tribunal_sigla = 'STF'
  AND ministro_nome_canonico IS NOT NULL
""")
n_comp = con.execute("SELECT COUNT(*) FROM comp_stf").fetchone()[0]
print(f"  {n_comp} linhas do seed STF com ancoragem", flush=True)

# 3) Normalizar nome do relator para join
#    stf_raw tem relator tipo "MIN. MAURÍCIO CORRÊA" — tirar "MIN." e deixar maiúsculas
con.execute("""
CREATE OR REPLACE TABLE decisao_normalizada AS
SELECT
  id_fato_decisao,
  processo,
  UPPER(TRIM(REGEXP_REPLACE(relator, '^MIN(\\.|ISTRO|ISTRA)\\s+', ''))) AS relator_canonico,
  relator AS relator_original,
  meio_processo,
  origem_decisao,
  ambiente_julgamento,
  TRY_CAST(data_autuacao AS DATE) AS data_autuacao,
  TRY_CAST(data_baixa AS DATE) AS data_baixa,
  indicador_colegiado,
  ano_decisao,
  TRY_CAST(data_decisao AS DATE) AS data_decisao,
  tipo_decisao,
  andamento_decisao,
  observacao_andamento,
  ramo_direito,
  assuntos,
  indicador_tramitacao,
  orgao_julgador AS orgao_julgador_origem,
  procedencia_processo,
  orgao_origem
FROM stf_raw
""")

# 4) Ancoragem: JOIN com comp_stf respeitando valid_from/valid_to
#    Para Presidência: se orgao_julgador_origem='PRESIDÊNCIA' e relator='MINISTRO PRESIDENTE',
#    usar o presidente vigente na data. Se não, pegar a turma do relator.
print("[ancoragem] derivando orgao_julgador_ancorado...", flush=True)
con.execute("""
CREATE OR REPLACE TABLE decisao_ancorada AS
WITH matches AS (
  SELECT
    d.id_fato_decisao,
    c.codigo_orgao,
    c.valid_from,
    c.valid_to,
    ROW_NUMBER() OVER (
      PARTITION BY d.id_fato_decisao
      ORDER BY
        CASE
          WHEN d.orgao_julgador_origem = 'PRESIDÊNCIA' AND c.codigo_orgao = 'PRESIDENCIA' THEN 1
          WHEN d.origem_decisao LIKE '%PLENÁRIO%' AND c.codigo_orgao = 'PLENARIO' THEN 2
          WHEN d.origem_decisao LIKE '%1ª TURMA%' AND c.codigo_orgao IN ('TURMA_1','TURMA_1_PRESID') THEN 3
          WHEN d.origem_decisao LIKE '%2ª TURMA%' AND c.codigo_orgao IN ('TURMA_2','TURMA_2_PRESID') THEN 4
          ELSE 5
        END,
        c.valid_from DESC
    ) AS rank
  FROM decisao_normalizada d
  INNER JOIN comp_stf c
    ON UPPER(TRIM(c.ministro_nome_canonico)) = d.relator_canonico
   AND d.data_decisao IS NOT NULL
   AND c.valid_from IS NOT NULL
   AND c.valid_from <= d.data_decisao
   AND (c.valid_to IS NULL OR c.valid_to >= d.data_decisao)
)
SELECT
  d.*,
  m.codigo_orgao AS orgao_julgador_ancorado,
  m.valid_from AS ancoragem_valid_from,
  m.valid_to AS ancoragem_valid_to
FROM decisao_normalizada d
LEFT JOIN matches m ON m.id_fato_decisao = d.id_fato_decisao AND m.rank = 1
""")

n_anc = con.execute("SELECT COUNT(*) FROM decisao_ancorada").fetchone()[0]
n_com_ancoragem = con.execute("SELECT COUNT(*) FROM decisao_ancorada WHERE orgao_julgador_ancorado IS NOT NULL").fetchone()[0]
print(f"  {n_anc:,} linhas ancoradas (de {n_raw:,})", flush=True)
print(f"  {n_com_ancoragem:,} com orgao_julgador_ancorado preenchido ({100*n_com_ancoragem/n_anc:.1f}%)", flush=True)

# 5) Gerar judx_decision (1 linha por decisão)
print("[export] judx_decision...", flush=True)
con.execute(f"""
COPY (
  SELECT
    id_fato_decisao AS id,
    processo AS external_number,
    'STF' AS court_sigla,
    data_decisao AS decision_date,
    CASE
      WHEN origem_decisao = 'MONOCRÁTICA' THEN 'monocratica'
      WHEN origem_decisao LIKE '%TURMA%' THEN 'colegiada'
      WHEN origem_decisao LIKE '%PLENÁRIO%' THEN 'colegiada'
      WHEN origem_decisao LIKE '%TRIBUNAL PLENO%' THEN 'colegiada'
      WHEN tipo_decisao ILIKE 'Despacho%' THEN 'despacho'
      ELSE 'outra'
    END AS kind,
    CASE
      WHEN andamento_decisao ILIKE '%NEGADO SEGUIMENTO%' OR andamento_decisao ILIKE '%NÃO CONHEC%' THEN 'nao_conhecido'
      WHEN andamento_decisao ILIKE '%PROVIDO%' AND andamento_decisao ILIKE '%PARCIAL%' THEN 'parcialmente_procedente'
      WHEN andamento_decisao ILIKE '%PROVID%' OR andamento_decisao ILIKE '%PROCEDENTE%' THEN 'procedente'
      WHEN andamento_decisao ILIKE '%IMPROVI%' OR andamento_decisao ILIKE '%IMPROCEDENT%' OR andamento_decisao ILIKE '%DESPROVI%' THEN 'improcedente'
      WHEN andamento_decisao ILIKE '%PREJUDIC%' THEN 'prejudicado'
      WHEN andamento_decisao ILIKE '%EXTINTO%' OR andamento_decisao ILIKE '%EXTINÇÃO%' THEN 'extinto_sem_resolucao'
      WHEN andamento_decisao ILIKE '%DEFERI%' THEN 'deferido'
      WHEN andamento_decisao ILIKE '%INDEFERI%' THEN 'indeferido'
      ELSE 'outro'
    END AS result,
    relator_original AS relator,
    relator_canonico AS relator_normalizado,
    orgao_julgador_origem,
    orgao_julgador_ancorado,
    ancoragem_valid_from,
    ancoragem_valid_to,
    origem_decisao,
    ambiente_julgamento AS effective_environment,
    indicador_colegiado,
    tipo_decisao,
    andamento_decisao,
    observacao_andamento,
    ramo_direito,
    assuntos
  FROM decisao_ancorada
) TO '{OUT_DECISION}' (HEADER, DELIMITER ',');
""")
print(f"  {OUT_DECISION}", flush=True)

# 6) Gerar judx_case (1 linha por processo — dedupe)
print("[export] judx_case...", flush=True)
con.execute(f"""
COPY (
  SELECT
    processo AS external_number,
    'STF' AS court_sigla,
    MIN(data_autuacao) AS filed_at,
    MAX(data_baixa) AS decided_at,
    MIN(data_decisao) AS first_decision_date,
    MAX(data_decisao) AS last_decision_date,
    COUNT(*) AS total_decisions,
    MAX(indicador_tramitacao) AS em_tramitacao,
    MAX(procedencia_processo) AS uf_origem,
    MAX(orgao_origem) AS orgao_origem,
    MAX(ramo_direito) AS ramo_direito_principal,
    MAX(assuntos) AS assuntos,
    STRING_AGG(DISTINCT relator_canonico, ' | ') AS relatores_do_caso,
    STRING_AGG(DISTINCT orgao_julgador_ancorado, ' | ') AS orgaos_ancorados
  FROM decisao_ancorada
  WHERE processo IS NOT NULL
  GROUP BY processo
) TO '{OUT_CASE}' (HEADER, DELIMITER ',');
""")
n_case = con.execute("SELECT COUNT(DISTINCT processo) FROM decisao_ancorada").fetchone()[0]
print(f"  {OUT_CASE}", flush=True)
print(f"  {n_case:,} processos unicos (judx_case)", flush=True)

# 7) Estatísticas finais
print("\n=== estatisticas de ancoragem ===", flush=True)
stats = con.execute("""
SELECT
  COALESCE(orgao_julgador_ancorado, '(SEM_ANCORAGEM)') AS orgao,
  COUNT(*) AS n,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS pct
FROM decisao_ancorada
GROUP BY 1
ORDER BY n DESC
""").fetchall()
for orgao, n, pct in stats:
    print(f"  {orgao:30s} {n:>10,}  ({pct:>5.2f}%)")

con.close()

# Limpar banco temp
import os
try: os.remove(DB)
except: pass

print("\n[fim] arquivos gerados:")
print(f"  {OUT_CASE} ({OUT_CASE.stat().st_size/1024/1024:.1f} MB)")
print(f"  {OUT_DECISION} ({OUT_DECISION.stat().st_size/1024/1024:.1f} MB)")
