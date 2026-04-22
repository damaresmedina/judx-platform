"""
CORPUS PREDICTION MARKET — JUDX-STF.

Objetivo: produzir 3 tabelas de taxa histórica que alimentam um prediction market.
  T1 — P(passa pela Presidência)
  T2 — P(passa pelo Relator)
  T3 — P(provimento) — desdobrada em T3a (mérito puro), T3b (admissão+provimento), T3_qualquer

Fonte: 27 arquivos raw em C:/stf/stf_decisoes_fatias (sem seed, sem biográfico).

Ações (11, mutuamente exclusivas):
  INADMITE                 — filtro mantido (negado seguimento, não conhecido, agravo não provido...)
  ADMITE_PURO              — admitiu sem julgar mérito (AI provido + conversão/subida)
  ADMITE_PROVEU            — admitiu + mérito provido no mesmo ato
  ADMITE_PROVEU_PARCIAL    — admitiu + mérito provido parcial
  ADMITE_DEVOLVEU_RG       — admitiu + devolveu por RG
  ADMITE_INADMITIU_RE      — admitiu AI, inadmitiu RE (filtro disfarçado)
  MERITO_PROVIDO           — mérito puro, provido
  MERITO_PROVIDO_PARCIAL   — mérito puro, parcial
  MERITO_IMPROVIDO         — mérito puro, negativo
  DEVOLVE_RG               — devolução sistêmica (sem ato de admissão)
  EXTINGUE                 — prejudicado/homologação/extinto
  OUTRO                    — residual

Saídas em Desktop/backup_judx/resultados/PREDICTION_MARKET_2026-04-19/:
  pulsos/ano_YYYY.csv, pulsos/CONSOLIDADO.csv
  processos.csv                          — 1 linha por processo (2,22M linhas)
  T1_passa_presidencia.csv
  T2_passa_relator.csv
  T3a_merito_puro.csv
  T3b_admissao_provimento.csv
  T3_qualquer_provimento.csv
  DICIONARIO.md, SUMARIO.md
"""
import duckdb, os
from pathlib import Path
from datetime import datetime

RAW = Path("C:/stf/stf_decisoes_fatias")
SEED = "C:/Users/medin/projetos/judx-platform/scripts/seeds-tribunais/composicao_ministerial.csv"
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados/PREDICTION_MARKET_2026-04-19")
OUT.mkdir(parents=True, exist_ok=True)
(OUT/"pulsos").mkdir(exist_ok=True)

DB = "C:/Users/medin/Desktop/backup_judx/tmp_prediction.duckdb"
if os.path.exists(DB): os.remove(DB)
con = duckdb.connect(DB)
def log(m): print(f"[{datetime.now():%H:%M:%S}] {m}", flush=True)

# ============================================================
# 1. Carga raw
# ============================================================
log("carrega raw (27 arquivos)...")
con.execute(f"CREATE TABLE raw AS SELECT * FROM read_csv_auto('{RAW.as_posix()}/decisoes_*.csv', header=true, sample_size=100000, ignore_errors=true, union_by_name=true);")
try: con.execute(f"INSERT INTO raw BY NAME SELECT * FROM read_xlsx('{RAW.as_posix()}/decisoes_2026.xlsx');")
except Exception as e: log(f"aviso xlsx: {e}")
n_raw = con.execute("SELECT COUNT(*) FROM raw").fetchone()[0]
log(f"  {n_raw:,} pulsos")

# ============================================================
# 1b. Seed de presidentes e vice-presidentes (para resolver relator genérico)
# ============================================================
log("carrega seed Presidência + Vice-Presidência...")
con.execute(f"""
CREATE TABLE seed_pv AS
SELECT codigo_orgao,
  strip_accents(UPPER(TRIM(ministro_nome_canonico))) AS nome_resolvido,
  TRY_CAST(valid_from AS DATE) AS valid_from,
  TRY_CAST(valid_to AS DATE) AS valid_to
FROM read_csv_auto('{SEED}', header=true, sample_size=500, ignore_errors=true)
WHERE tribunal_sigla='STF' AND codigo_orgao IN ('PRESIDENCIA','VICE_PRESIDENCIA')
  AND ministro_nome_canonico IS NOT NULL AND valid_from IS NOT NULL;
""")
n_pv = con.execute("SELECT COUNT(*) FROM seed_pv").fetchone()[0]
log(f"  {n_pv} linhas de Presid + Vice no seed")

# ============================================================
# 2. Normalização (já resolvendo PRESIDENTE / VICE-PRESIDENTE genéricos via seed)
# ============================================================
log("normaliza pulsos (resolvendo Presid/Vice genérico pela data)...")
con.execute("""
CREATE TABLE pulsos_raw AS
SELECT
  idFatoDecisao,
  "Processo" AS processo,
  regexp_extract("Processo", '^(\\S+)\\s+(.+)$', 1) AS classe,
  regexp_extract("Processo", '^(\\S+)\\s+(.+)$', 2) AS numero,
  "Relator atual" AS relator,
  strip_accents(UPPER(TRIM(REGEXP_REPLACE("Relator atual",'^MIN(\\.|ISTRO|ISTRA)\\s+','')))) AS relator_canonico_bruto,
  "Meio Processo" AS meio_processo,
  "Origem decisão" AS origem_decisao,
  "Ambiente julgamento" AS ambiente_julgamento,
  TRY_CAST("Data de autuação" AS DATE) AS data_autuacao,
  TRY_CAST("Data baixa" AS DATE) AS data_baixa,
  "Indicador colegiado" AS indicador_colegiado,
  TRY_CAST("Ano da decisão" AS INT) AS ano_decisao,
  TRY_CAST("Data da decisão" AS DATE) AS data_decisao,
  "Tipo decisão" AS tipo_decisao,
  "Andamento decisão" AS andamento_decisao,
  "Observação do andamento" AS observacao_andamento,
  "Ramo direito" AS ramo_direito,
  "Assuntos do processo" AS assuntos,
  "Indicador de tramitação" AS indicador_tramitacao,
  "Órgão julgador" AS orgao_julgador_raw,
  "Descrição Procedência Processo" AS procedencia,
  "Descrição Órgão Origem" AS orgao_origem,
  CASE
    WHEN UPPER("Andamento decisão") LIKE 'DECISÃO DA PRESIDÊNCIA%'
      OR UPPER("Andamento decisão") LIKE 'DESPACHO DA PRESIDÊNCIA%'
      THEN 'PRESIDÊNCIA'
    WHEN "Órgão julgador"='MONOCRÁTICA' AND (
      UPPER("Relator atual") LIKE '%MINISTRO PRESIDENTE%'
      OR UPPER("Relator atual") LIKE 'PRESIDENTE%'
      OR UPPER("Relator atual") = 'PRESIDENTE'
    ) THEN 'PRESIDÊNCIA'
    ELSE "Órgão julgador"
  END AS orgao_corrigido,
  CASE WHEN "Origem decisão" = 'MONOCRÁTICA' THEN FALSE
       WHEN "Origem decisão" IS NULL THEN NULL
       ELSE TRUE END AS is_colegiado
FROM raw;
""")

# Resolve relator_canonico genérico via LEFT JOIN no seed (por data).
# Classifica se bruto é genérico: Presid ou Vice.
log("resolve Presid/Vice genéricos pela data (LEFT JOIN seed)...")
con.execute("""
CREATE TABLE pulsos AS
SELECT
  p.*,
  CASE
    WHEN p.relator_canonico_bruto IN ('PRESIDENTE','MINISTRO PRESIDENTE','PRES','MIN PRESIDENTE') THEN 'PRESIDENCIA'
    WHEN p.relator_canonico_bruto IN ('VICE-PRESIDENTE','MINISTRO VICE-PRESIDENTE','VICE PRESIDENTE') THEN 'VICE_PRESIDENCIA'
    ELSE NULL
  END AS relator_tipo_generico,
  COALESCE(s.nome_resolvido, p.relator_canonico_bruto) AS relator_canonico,
  (s.nome_resolvido IS NOT NULL) AS relator_foi_resolvido
FROM pulsos_raw p
LEFT JOIN seed_pv s ON
  CASE
    WHEN p.relator_canonico_bruto IN ('PRESIDENTE','MINISTRO PRESIDENTE','PRES','MIN PRESIDENTE') THEN 'PRESIDENCIA'
    WHEN p.relator_canonico_bruto IN ('VICE-PRESIDENTE','MINISTRO VICE-PRESIDENTE','VICE PRESIDENTE') THEN 'VICE_PRESIDENCIA'
    ELSE NULL
  END = s.codigo_orgao
  AND p.data_decisao IS NOT NULL
  AND s.valid_from <= p.data_decisao
  AND (s.valid_to IS NULL OR s.valid_to >= p.data_decisao);
""")
n_res = con.execute("SELECT COUNT(*) FROM pulsos WHERE relator_foi_resolvido").fetchone()[0]
log(f"  {n_res:,} pulsos com relator genérico resolvido pelo seed")

# ============================================================
# 3. Ordem do pulso + vida do processo
# ============================================================
log("calcula ordem e vida...")
con.execute("""
CREATE TABLE pulsos2 AS
SELECT *,
  COUNT(*) OVER (PARTITION BY processo) AS n_decisoes_no_processo,
  ROW_NUMBER() OVER (PARTITION BY processo ORDER BY data_decisao NULLS LAST, idFatoDecisao) AS ordem_desta_decisao,
  CASE WHEN COUNT(*) OVER (PARTITION BY processo) <= 3 THEN 'curta' ELSE 'longa' END AS tipo_vida
FROM pulsos;
""")

# ============================================================
# 4. Ação do pulso (11 valores) — ordem cirúrgica importa
# ============================================================
log("classifica ação (11 ações mutuamente exclusivas)...")
con.execute("""
CREATE TABLE pulsos3 AS
SELECT *,
  CASE
    WHEN andamento_decisao IS NULL THEN 'OUTRO'

    -- [PRIORIDADE 1] Atos duplos explícitos — DEVEM vir antes das regras simples
    WHEN UPPER(andamento_decisao) LIKE 'AGRAVO PROVIDO E DESDE LOGO NEGADO SEGUIMENTO%'
      THEN 'ADMITE_INADMITIU_RE'
    WHEN UPPER(andamento_decisao) LIKE 'AGRAVO PROVIDO E DETERMINADA A DEVOLUÇÃO%'
      THEN 'ADMITE_DEVOLVEU_RG'
    WHEN UPPER(andamento_decisao) LIKE 'AGRAVO PROVIDO E DESDE LOGO PROVIDO PARCIALMENTE%'
      THEN 'ADMITE_PROVEU_PARCIAL'
    WHEN UPPER(andamento_decisao) LIKE 'AGRAVO PROVIDO E DESDE LOGO PROVIDO%'
      THEN 'ADMITE_PROVEU'

    -- [PRIORIDADE 2] Admissão pura (sem julgar mérito)
    WHEN UPPER(andamento_decisao) LIKE 'AI PROVIDO E DETERMINADA A CONVERSÃO EM RE%'
      OR UPPER(andamento_decisao) LIKE 'AI PROVIDO E DETERMINADA A SUBIDA%'
      OR UPPER(andamento_decisao) LIKE 'AGRAVO PROVIDO E RE PENDENTE DE JULGAMENTO%'
      OR UPPER(andamento_decisao) LIKE 'AGRAVO CONVERTIDO EM RE%'
      THEN 'ADMITE_PURO'
    WHEN UPPER(andamento_decisao) LIKE 'DECISÃO DO(A) RELATOR(A) - CONHECER DO AGRAVO E DAR PROVIMENTO%'
      OR UPPER(andamento_decisao) LIKE 'DECISÃO DO(A) RELATOR(A) - CONHECER DO AGRAVO E DAR PARCIAL%'
      THEN 'ADMITE_PURO'
    -- Agravo regimental provido em colegiado = reverte inadmissão, o processo volta pra análise
    WHEN UPPER(andamento_decisao) = 'AGRAVO REGIMENTAL PROVIDO'
      OR UPPER(andamento_decisao) LIKE 'AGRAVO REGIMENTAL PROVIDO EM PARTE%'
      THEN 'ADMITE_PURO'

    -- [PRIORIDADE 3] Filtros de inadmissão (palavras compostas antes de simples)
    WHEN UPPER(andamento_decisao) LIKE '%AGRAVO REGIMENTAL NÃO PROVIDO%'
      OR UPPER(andamento_decisao) LIKE '%AGRAVO REGIMENTAL NÃO CONHECIDO%'
      OR UPPER(andamento_decisao) LIKE '%EMBARGOS RECEBIDOS COMO AGRAVO%NÃO PROVIDO%'
      THEN 'INADMITE'
    WHEN UPPER(andamento_decisao) LIKE '%NEGADO SEGUIMENTO%'
      OR UPPER(andamento_decisao) LIKE '%NÃO CONHECID%'
      OR UPPER(andamento_decisao) LIKE '%NAO CONHECID%'
      OR UPPER(andamento_decisao) LIKE '%NÃO CONHEÇO%'
      OR UPPER(andamento_decisao) LIKE '%INADMIT%'
      OR UPPER(andamento_decisao) LIKE '%SEGUIMENTO NEGADO%'
      OR UPPER(andamento_decisao) = 'AGRAVO NÃO PROVIDO'
      OR UPPER(andamento_decisao) LIKE 'AGRAVO NÃO PROVIDO %'
      THEN 'INADMITE'

    -- [PRIORIDADE 4] Devolução sistêmica (sem admissão)
    WHEN UPPER(andamento_decisao) LIKE 'DETERMINADA A DEVOLUÇÃO%'
      OR UPPER(andamento_decisao) LIKE 'RECONSIDERO E DEVOLVO%'
      THEN 'DEVOLVE_RG'

    -- [PRIORIDADE 5] Lateral (morte não-meritória)
    WHEN UPPER(andamento_decisao) LIKE '%PREJUDICAD%'
      OR UPPER(andamento_decisao) LIKE '%HOMOLOG%'
      OR UPPER(andamento_decisao) LIKE '%EXTINT%'
      OR UPPER(andamento_decisao) LIKE '%ARQUIVAD%'
      OR UPPER(andamento_decisao) LIKE '%DESISTÊNCIA%'
      OR UPPER(andamento_decisao) LIKE '%DECLINADA A COMPETÊNCIA%'
      OR UPPER(andamento_decisao) LIKE '%EXTINÇÃO DA PUNIBILIDADE%'
      THEN 'EXTINGUE'

    -- [PRIORIDADE 6] Mérito parcial ANTES de mérito total (ordem importa)
    WHEN UPPER(andamento_decisao) LIKE '%PROVIDO EM PARTE%'
      OR UPPER(andamento_decisao) LIKE '%PROCEDENTE EM PARTE%'
      OR UPPER(andamento_decisao) LIKE '%PROVIDO PARCIALMENTE%'
      OR UPPER(andamento_decisao) LIKE '%PARCIAL PROVIMENTO%'
      OR UPPER(andamento_decisao) LIKE '%CONCEDIDA EM PARTE A ORDEM%'
      OR UPPER(andamento_decisao) LIKE '%CONCEDIDA EM PARTE A SEGURANÇA%'
      THEN 'MERITO_PROVIDO_PARCIAL'

    -- [PRIORIDADE 7] Mérito negativo ANTES de mérito positivo (substring trap)
    WHEN UPPER(andamento_decisao) LIKE '%NÃO PROVIDO%'
      OR UPPER(andamento_decisao) LIKE '%NAO PROVIDO%'
      OR UPPER(andamento_decisao) LIKE '%NEGADO PROVIMENTO%'
      OR UPPER(andamento_decisao) LIKE '%NEGO PROVIMENTO%'
      OR UPPER(andamento_decisao) LIKE '%IMPROCEDENTE%'
      OR UPPER(andamento_decisao) LIKE '%IMPROVIDO%'
      OR UPPER(andamento_decisao) LIKE '%REJEITAD%'
      OR UPPER(andamento_decisao) LIKE '%DENEGADA A ORDEM%'
      OR UPPER(andamento_decisao) LIKE '%DENEGADA A SEGURANÇA%'
      OR UPPER(andamento_decisao) LIKE '%DENEGADA A SUSPENSÃO%'
      OR UPPER(andamento_decisao) LIKE 'INDEFERIDO%'
      OR UPPER(andamento_decisao) LIKE 'LIMINAR INDEFERIDA%'
      THEN 'MERITO_IMPROVIDO'

    -- [PRIORIDADE 8] Mérito positivo (pelo menos algum sinal de provimento)
    WHEN UPPER(andamento_decisao) LIKE '%PROVIDO%'
      OR UPPER(andamento_decisao) LIKE '%PROCEDENTE%'
      OR UPPER(andamento_decisao) LIKE '%CONCEDIDA A ORDEM%'
      OR UPPER(andamento_decisao) LIKE '%CONCEDIDA A SEGURANÇA%'
      OR UPPER(andamento_decisao) LIKE '%CONCEDIDA A SUSPENSÃO%'
      OR UPPER(andamento_decisao) LIKE 'DEFERIDO%'
      OR UPPER(andamento_decisao) LIKE 'LIMINAR DEFERIDA%'
      OR UPPER(andamento_decisao) LIKE '%EMBARGOS RECEBIDOS%'
      THEN 'MERITO_PROVIDO'

    ELSE 'OUTRO'
  END AS acao
FROM pulsos2;
""")

# ============================================================
# 5. Agregação por processo — flags pra alimentar as tabelas
# ============================================================
log("agrega por processo (flags de trajetória)...")
con.execute("""
CREATE TABLE processos AS
SELECT
  processo,
  ANY_VALUE(classe) AS classe,
  ANY_VALUE(ramo_direito) AS ramo_direito,
  -- primeiro assunto da lista separada por '|'
  ANY_VALUE(CASE WHEN assuntos IS NOT NULL
                 THEN TRIM(SPLIT_PART(assuntos, '|', 1)) ELSE NULL END) AS assunto_primario,
  ANY_VALUE(procedencia) AS uf_origem,
  ANY_VALUE(orgao_origem) AS tribunal_origem,
  ANY_VALUE(meio_processo) AS meio_processo,
  MIN(data_autuacao) AS data_autuacao,
  MIN(data_decisao) AS data_primeira_decisao,
  MAX(data_decisao) AS data_ultima_decisao,
  EXTRACT(YEAR FROM MIN(data_decisao))::INT AS ano_primeira_decisao,
  MAX(n_decisoes_no_processo) AS n_pulsos,
  ANY_VALUE(tipo_vida) AS tipo_vida,

  -- Relator do primeiro pulso monocrático (âncora Damares)
  MIN(CASE WHEN ordem_desta_decisao=1 AND NOT is_colegiado THEN relator_canonico END) AS relator_p1_mono,
  MIN(CASE WHEN ordem_desta_decisao=1 AND NOT is_colegiado THEN orgao_corrigido END) AS orgao_p1,
  MIN(CASE WHEN ordem_desta_decisao=2 AND NOT is_colegiado THEN relator_canonico END) AS relator_p2_mono,
  MIN(CASE WHEN ordem_desta_decisao=2 AND NOT is_colegiado THEN orgao_corrigido END) AS orgao_p2,

  -- T1: passou Presidência? (nenhum pulso-Presid-mono inadmitiu)
  NOT BOOL_OR(orgao_corrigido='PRESIDÊNCIA' AND NOT is_colegiado AND acao='INADMITE') AS passou_presid,
  BOOL_OR(orgao_corrigido='PRESIDÊNCIA' AND NOT is_colegiado) AS teve_pulso_presid,

  -- T2: passou Relator? (nenhum pulso-Relator-mono inadmitiu)
  NOT BOOL_OR(orgao_corrigido='MONOCRÁTICA' AND NOT is_colegiado AND acao='INADMITE') AS passou_relator,
  BOOL_OR(orgao_corrigido='MONOCRÁTICA' AND NOT is_colegiado) AS teve_pulso_relator,

  -- T3a: teve mérito puro provido (não é o ato duplo)
  BOOL_OR(acao IN ('MERITO_PROVIDO','MERITO_PROVIDO_PARCIAL')) AS teve_merito_puro_provido,

  -- T3b: teve admissão+provimento (ato duplo raro)
  BOOL_OR(acao IN ('ADMITE_PROVEU','ADMITE_PROVEU_PARCIAL')) AS teve_admissao_provimento,

  -- T3_qualquer: T3a OU T3b
  BOOL_OR(acao IN ('MERITO_PROVIDO','MERITO_PROVIDO_PARCIAL','ADMITE_PROVEU','ADMITE_PROVEU_PARCIAL')) AS teve_qualquer_provimento,

  -- Flag extra: provimento aconteceu no pulso 1?
  BOOL_OR(ordem_desta_decisao=1 AND acao IN ('MERITO_PROVIDO','MERITO_PROVIDO_PARCIAL','ADMITE_PROVEU','ADMITE_PROVEU_PARCIAL')) AS provimento_no_pulso_1,

  -- Qual o ÓRGÃO e AMBIENTE do provimento (se houve)?
  MIN(CASE WHEN acao IN ('MERITO_PROVIDO','MERITO_PROVIDO_PARCIAL','ADMITE_PROVEU','ADMITE_PROVEU_PARCIAL')
           THEN orgao_corrigido END) AS orgao_do_provimento,
  MIN(CASE WHEN acao IN ('MERITO_PROVIDO','MERITO_PROVIDO_PARCIAL','ADMITE_PROVEU','ADMITE_PROVEU_PARCIAL')
           THEN ambiente_julgamento END) AS ambiente_do_provimento,

  -- Outras flags úteis
  BOOL_OR(acao='ADMITE_INADMITIU_RE') AS teve_admite_inadmitiu_re,
  BOOL_OR(acao='ADMITE_DEVOLVEU_RG') AS teve_admite_devolveu_rg,
  BOOL_OR(acao='ADMITE_PURO') AS teve_admite_puro,
  BOOL_OR(acao='DEVOLVE_RG') AS teve_devolucao_rg,
  BOOL_OR(acao='EXTINGUE') AS teve_extinto_lateral

FROM pulsos3
GROUP BY processo;
""")

n_proc = con.execute("SELECT COUNT(*) FROM processos").fetchone()[0]
log(f"  processos únicos: {n_proc:,}")

# ============================================================
# 6. Export pulsos (ano a ano + consolidado)
# ============================================================
log("exporta pulsos...")
anos = [r[0] for r in con.execute("SELECT DISTINCT ano_decisao FROM pulsos3 WHERE ano_decisao IS NOT NULL ORDER BY 1").fetchall()]
for y in anos:
    out_y = OUT/"pulsos"/f"ano_{y}.csv"
    con.execute(f"COPY (SELECT * FROM pulsos3 WHERE ano_decisao={y} ORDER BY data_decisao, idFatoDecisao) TO '{out_y.as_posix()}' (HEADER, DELIMITER ',');")

con.execute(f"COPY (SELECT * FROM pulsos3 ORDER BY ano_decisao, data_decisao, idFatoDecisao) TO '{(OUT/'pulsos'/'CONSOLIDADO.csv').as_posix()}' (HEADER, DELIMITER ',');")
log(f"  pulsos: {len(anos)} anuais + CONSOLIDADO")

# Export processos
log("exporta processos.csv...")
con.execute(f"COPY (SELECT * FROM processos ORDER BY processo) TO '{(OUT/'processos.csv').as_posix()}' (HEADER, DELIMITER ',');")

# ============================================================
# 7. Tabelas de taxa pré-computadas
# ============================================================
log("gera T1 — P(passa Presidência) por (relator_p1, classe, ano, ramo, assunto, uf, tribunal)...")
con.execute(f"""
COPY (
  SELECT
    COALESCE(relator_p1_mono, '(sem_pulso_mono_1)') AS presid_na_data,
    classe, ano_primeira_decisao AS ano, ramo_direito, assunto_primario, uf_origem, tribunal_origem,
    COUNT(*) AS n_total,
    SUM(CASE WHEN passou_presid THEN 1 ELSE 0 END) AS n_passaram,
    ROUND(100.0 * SUM(CASE WHEN passou_presid THEN 1 ELSE 0 END) / COUNT(*), 2) AS taxa_passa_pct
  FROM processos
  WHERE teve_pulso_presid = TRUE  -- só processos que passaram pela Presidência
  GROUP BY 1,2,3,4,5,6,7
  HAVING COUNT(*) >= 10  -- mínimo de amostra
  ORDER BY n_total DESC
) TO '{(OUT/'T1_passa_presidencia.csv').as_posix()}' (HEADER, DELIMITER ',');
""")

log("gera T2 — P(passa Relator)...")
con.execute(f"""
COPY (
  SELECT
    COALESCE(relator_p1_mono, relator_p2_mono, '(sem_relator_mono)') AS relator,
    classe, ramo_direito, assunto_primario, uf_origem,
    COUNT(*) AS n_total,
    SUM(CASE WHEN passou_relator THEN 1 ELSE 0 END) AS n_passaram,
    ROUND(100.0 * SUM(CASE WHEN passou_relator THEN 1 ELSE 0 END) / COUNT(*), 2) AS taxa_passa_pct
  FROM processos
  WHERE teve_pulso_relator = TRUE
  GROUP BY 1,2,3,4,5
  HAVING COUNT(*) >= 10
  ORDER BY n_total DESC
) TO '{(OUT/'T2_passa_relator.csv').as_posix()}' (HEADER, DELIMITER ',');
""")

log("gera T3a — P(mérito puro provido)...")
con.execute(f"""
COPY (
  SELECT
    COALESCE(relator_p1_mono, relator_p2_mono, '(desconhecido)') AS relator,
    classe, COALESCE(orgao_do_provimento, '-') AS orgao, COALESCE(ambiente_do_provimento, '-') AS ambiente,
    ramo_direito, assunto_primario,
    COUNT(*) AS n_total,
    SUM(CASE WHEN teve_merito_puro_provido THEN 1 ELSE 0 END) AS n_provido,
    ROUND(100.0 * SUM(CASE WHEN teve_merito_puro_provido THEN 1 ELSE 0 END) / COUNT(*), 2) AS taxa_provimento_pct
  FROM processos
  GROUP BY 1,2,3,4,5,6
  HAVING COUNT(*) >= 10
  ORDER BY n_total DESC
) TO '{(OUT/'T3a_merito_puro.csv').as_posix()}' (HEADER, DELIMITER ',');
""")

log("gera T3b — P(admissão+provimento, ato duplo)...")
con.execute(f"""
COPY (
  SELECT
    COALESCE(relator_p1_mono, relator_p2_mono, '(desconhecido)') AS relator,
    classe, ramo_direito, assunto_primario,
    COUNT(*) AS n_total,
    SUM(CASE WHEN teve_admissao_provimento THEN 1 ELSE 0 END) AS n_admit_provido,
    ROUND(100.0 * SUM(CASE WHEN teve_admissao_provimento THEN 1 ELSE 0 END) / COUNT(*), 2) AS taxa_admit_provido_pct
  FROM processos
  GROUP BY 1,2,3,4
  HAVING COUNT(*) >= 10
  ORDER BY n_total DESC
) TO '{(OUT/'T3b_admissao_provimento.csv').as_posix()}' (HEADER, DELIMITER ',');
""")

log("gera T3_qualquer — P(qualquer provimento)...")
con.execute(f"""
COPY (
  SELECT
    COALESCE(relator_p1_mono, relator_p2_mono, '(desconhecido)') AS relator,
    classe, ramo_direito, assunto_primario,
    COUNT(*) AS n_total,
    SUM(CASE WHEN teve_qualquer_provimento THEN 1 ELSE 0 END) AS n_provimento,
    SUM(CASE WHEN provimento_no_pulso_1 THEN 1 ELSE 0 END) AS n_provimento_p1,
    ROUND(100.0 * SUM(CASE WHEN teve_qualquer_provimento THEN 1 ELSE 0 END) / COUNT(*), 2) AS taxa_qq_provimento_pct,
    ROUND(100.0 * SUM(CASE WHEN provimento_no_pulso_1 THEN 1 ELSE 0 END) / COUNT(*), 4) AS taxa_provimento_p1_pct
  FROM processos
  GROUP BY 1,2,3,4
  HAVING COUNT(*) >= 10
  ORDER BY n_total DESC
) TO '{(OUT/'T3_qualquer_provimento.csv').as_posix()}' (HEADER, DELIMITER ',');
""")

# ============================================================
# 8. Dicionário + sumário
# ============================================================
log("escreve dicionário + sumário...")
dic = """# Dicionário — PREDICTION MARKET JUDX-STF

## Produtos
- `pulsos/ano_YYYY.csv` e `pulsos/CONSOLIDADO.csv` — matéria-prima: 1 linha por pulso, com `acao` classificada
- `processos.csv` — 1 linha por processo (2,22M), com flags de trajetória + features
- `T1_passa_presidencia.csv` — taxa histórica de passar pela Presidência
- `T2_passa_relator.csv` — taxa histórica de passar pelo Relator
- `T3a_merito_puro.csv` — taxa de mérito puro provido
- `T3b_admissao_provimento.csv` — taxa do ato duplo (admitir+prover)
- `T3_qualquer_provimento.csv` — taxa combinada (T3a + T3b)

## Ações (11 mutuamente exclusivas)
| Ação | Significado |
|---|---|
| INADMITE | filtro mantido (negado seguimento, não conhecido, agravo não provido, AgRg não provido) |
| ADMITE_PURO | admitiu sem julgar mérito (AI provido + conversão/subida; AgRg provido) |
| ADMITE_PROVEU | admitiu + proveu mérito no mesmo ato (raro — "agravo provido e desde logo provido o RE") |
| ADMITE_PROVEU_PARCIAL | idem parcial |
| ADMITE_DEVOLVEU_RG | admitiu + devolveu por RG (543-B) |
| ADMITE_INADMITIU_RE | admitiu AI + inadmitiu RE (filtro disfarçado) |
| MERITO_PROVIDO | mérito puro provido (sem ato de admissão embutido) |
| MERITO_PROVIDO_PARCIAL | mérito puro parcial |
| MERITO_IMPROVIDO | mérito puro negativo |
| DEVOLVE_RG | devolução sistêmica sem admissão |
| EXTINGUE | prejudicado/homologação/extinto/declinada competência |
| OUTRO | residual |

## Colunas do processos.csv
- Identificação: processo, classe (AI/ARE/RE/...), ramo_direito, assunto_primario, uf_origem, tribunal_origem, meio_processo
- Datas: data_autuacao, data_primeira_decisao, data_ultima_decisao, ano_primeira_decisao
- Pulsos: n_pulsos, tipo_vida (curta/longa)
- Relator ancorado: relator_p1_mono, orgao_p1, relator_p2_mono, orgao_p2
- Flags (para as tabelas): passou_presid, teve_pulso_presid, passou_relator, teve_pulso_relator, teve_merito_puro_provido, teve_admissao_provimento, teve_qualquer_provimento, provimento_no_pulso_1
- Contexto do provimento: orgao_do_provimento, ambiente_do_provimento
- Outras: teve_admite_inadmitiu_re, teve_admite_devolveu_rg, teve_admite_puro, teve_devolucao_rg, teve_extinto_lateral

## Uso no prediction market
Dado um processo novo com features (relator_previsto, classe, ramo, assunto, uf, tribunal_origem):
- `p_presid = T1.lookup(...)`: probabilidade de passar Presidência
- `p_relator = T2.lookup(...)`: probabilidade de passar Relator (condicional pode ser feita filtrando T2 só em passou_presid=TRUE)
- `p_provimento = T3_qualquer.lookup(...)`: probabilidade de provimento final

Mínimo de amostra por célula da tabela: `n_total >= 10`.
"""
(OUT/"DICIONARIO.md").write_text(dic, encoding='utf-8')

# Sumário
sums = [f"# Sumário — {datetime.now():%Y-%m-%d %H:%M}\n",
        f"Total pulsos: **{n_raw:,}**  ·  Total processos únicos: **{n_proc:,}**\n",
        "\n## Ações"]
for r in con.execute("SELECT acao, COUNT(*) FROM pulsos3 GROUP BY 1 ORDER BY 2 DESC").fetchall():
    sums.append(f"- {r[0]}: {r[1]:,} ({100*r[1]/n_raw:.2f}%)")

sums.append("\n## Flags agregadas por processo")
r = con.execute("""SELECT
  SUM(CASE WHEN passou_presid THEN 1 ELSE 0 END) passou_presid,
  SUM(CASE WHEN teve_pulso_presid AND NOT passou_presid THEN 1 ELSE 0 END) morreu_presid,
  SUM(CASE WHEN passou_relator THEN 1 ELSE 0 END) passou_relator,
  SUM(CASE WHEN teve_pulso_relator AND NOT passou_relator THEN 1 ELSE 0 END) morreu_relator,
  SUM(CASE WHEN teve_merito_puro_provido THEN 1 ELSE 0 END) merito_puro_prov,
  SUM(CASE WHEN teve_admissao_provimento THEN 1 ELSE 0 END) ato_duplo,
  SUM(CASE WHEN teve_qualquer_provimento THEN 1 ELSE 0 END) qualquer_prov,
  SUM(CASE WHEN provimento_no_pulso_1 THEN 1 ELSE 0 END) prov_p1,
  SUM(CASE WHEN teve_admite_inadmitiu_re THEN 1 ELSE 0 END) admite_inadm_re,
  SUM(CASE WHEN teve_admite_devolveu_rg THEN 1 ELSE 0 END) admite_devolveu
FROM processos""").fetchone()
keys = ['passou_presid','morreu_presid','passou_relator','morreu_relator','merito_puro_prov','ato_duplo','qualquer_prov','prov_p1','admite_inadm_re','admite_devolveu']
for k,v in zip(keys, r):
    sums.append(f"- {k}: {v:,} ({100*v/n_proc:.2f}% dos processos)")

(OUT/"SUMARIO.md").write_text("\n".join(sums), encoding='utf-8')

con.close()
if os.path.exists(DB): os.remove(DB)
log("✓ FIM")
print(f"\nSaídas em: {OUT}")
