"""
CORPUS FINAL JUDX-STF — modelo POSICIONAL (pulso = filtro).

Categoria vem da POSIÇÃO do pulso na vida do processo (ordem × is_colegiado × orgão),
não do texto do andamento. O andamento define apenas a AÇÃO do pulso.

POSIÇÃO (8 categorias):
  FILTRO_PRESIDENCIA_1     — ordem=1, monocrática, orgão=PRESIDÊNCIA
  FILTRO_RELATOR_1         — ordem=1, monocrática, orgão=relator nomeado
  FILTRO_2                 — ordem=2, monocrática (reconsideração, AgRg mono raro)
  COLEGIADO_PRECOCE        — ordem≤2, colegiado (RG rápido, AgRg rápido)
  COLEGIADO_APRECIACAO     — ordem≥3, colegiado (Turma/Pleno julga de verdade)
  POS_TRIAGEM_MONO         — ordem≥3, monocrática (EDcl mono, despacho pós-admissão)
  PULSO_UNICO_MONO         — n_decisoes=1, monocrática (processo morto em 1 pulso)
  OUTRO                    — fallback

AÇÃO (7 ações):
  INADMITE       — negado seguimento, não conhecido, agravo não provido (filtro mantido)
  ADMITE         — agravo provido, conversão AI em RE (filtro revertido)
  MERITO_PROVIDO — provido, procedente, concedida, deferido (mérito pós-triagem)
  MERITO_IMPROVIDO — não provido (≠ agravo), improcedente, denegada (mérito negativo)
  DEVOLVE_RG     — determinada a devolução (sistêmica)
  EXTINGUE       — prejudicado, homologação, extinto
  OUTRO          — interlocutória, relator genérico, segredo etc.

SAÍDAS (em Desktop/backup_judx/resultados/CORPUS_FINAL_2026-04-19/):
  ano_YYYY.csv        — um por ano (26 arquivos + 2026)
  CONSOLIDADO.csv     — tudo junto
  DICIONARIO.md       — dicionário das ~45 colunas
"""
import duckdb, json, re, os
from pathlib import Path
from datetime import datetime

RAW = Path("C:/stf/stf_decisoes_fatias")
SEED = "C:/Users/medin/projetos/judx-platform/scripts/seeds-tribunais/composicao_ministerial.csv"
BIO = "C:/Users/medin/Desktop/backup_judx/resultados/stf_todos_ministros_consolidado.json"
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados/CORPUS_FINAL_2026-04-19")
OUT.mkdir(parents=True, exist_ok=True)

DB = "C:/Users/medin/Desktop/backup_judx/tmp_corpus_posicional.duckdb"
if os.path.exists(DB): os.remove(DB)
con = duckdb.connect(DB)
def log(m): print(f"[{datetime.now():%H:%M:%S}] {m}", flush=True)

# ============================================================
# 1. Raw + seed + biográfico
# ============================================================
log("carrega raw stf_decisoes_fatias...")
con.execute(f"CREATE TABLE raw AS SELECT * FROM read_csv_auto('{RAW.as_posix()}/decisoes_*.csv', header=true, sample_size=100000, ignore_errors=true, union_by_name=true);")
try: con.execute(f"INSERT INTO raw BY NAME SELECT * FROM read_xlsx('{RAW.as_posix()}/decisoes_2026.xlsx');")
except Exception as e: log(f"aviso xlsx: {e}")
n_raw = con.execute("SELECT COUNT(*) FROM raw").fetchone()[0]
log(f"  {n_raw:,} decisões")

log("carrega seed STF...")
con.execute(f"""
CREATE TABLE seed AS
SELECT tribunal_sigla, ministro_nome_canonico,
  strip_accents(UPPER(TRIM(ministro_nome_canonico))) AS nome_strip,
  codigo_orgao,
  TRY_CAST(valid_from AS DATE) AS valid_from,
  TRY_CAST(valid_to AS DATE) AS valid_to
FROM read_csv_auto('{SEED}', header=true, sample_size=500, ignore_errors=true)
WHERE tribunal_sigla='STF' AND ministro_nome_canonico IS NOT NULL;
""")

log("carrega biográfico 171 ministros...")
with open(BIO, 'r', encoding='utf-8') as f: bio = json.load(f)
def dmY(s):
    if not s: return None
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})', str(s).strip())
    return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}" if m else None
con.execute("CREATE TABLE bio (nome VARCHAR, data_posse DATE, data_saida DATE, nome_strip VARCHAR);")
for m in bio:
    nome = m.get('nome_completo') or m.get('nome')
    posse = dmY(m.get('posse_stf'))
    saida = dmY(m.get('aposentadoria')) or dmY(m.get('falecimento'))
    if nome and posse:
        con.execute("INSERT INTO bio VALUES (?, TRY_CAST(? AS DATE), TRY_CAST(? AS DATE), strip_accents(UPPER(TRIM(?))))",
                    [nome, posse, saida, nome])

# ============================================================
# 2. Normalização
# ============================================================
log("normaliza: classe, numero, relator_canonico, orgao_corrigido, is_colegiado...")
con.execute("""
CREATE TABLE norm AS
SELECT
  idFatoDecisao,
  "Processo" AS processo,
  regexp_extract("Processo", '^(\\S+)\\s+(.+)$', 1) AS classe,
  regexp_extract("Processo", '^(\\S+)\\s+(.+)$', 2) AS numero,
  "Relator atual" AS relator,
  strip_accents(UPPER(TRIM(REGEXP_REPLACE("Relator atual",'^MIN(\\.|ISTRO|ISTRA)\\s+','')))) AS relator_canonico,
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

# ============================================================
# 3. Ancoragem 3 camadas
# ============================================================
log("ancora: C1 cargo, C2 nome (strip_accents), C3 posse→aposentadoria...")
con.execute("""
CREATE TABLE m_cargo AS
SELECT n.idFatoDecisao, s.ministro_nome_canonico, s.codigo_orgao, s.valid_from, s.valid_to, 'cargo' AS fonte
FROM norm n JOIN seed s ON
  n.data_decisao IS NOT NULL AND s.valid_from IS NOT NULL
  AND s.valid_from <= n.data_decisao
  AND (s.valid_to IS NULL OR s.valid_to >= n.data_decisao)
  AND (
      (n.orgao_corrigido='PRESIDÊNCIA' AND s.codigo_orgao='PRESIDENCIA')
   OR (n.orgao_corrigido IN ('TRIBUNAL PLENO','PLENÁRIO VIRTUAL - RG','TRIBUNAL PLENO - SESSÃO VIRTUAL')
       AND s.codigo_orgao='PRESIDENCIA')
   OR (n.relator_canonico IN ('PRESIDENTE','MINISTRO PRESIDENTE','PRES','MIN PRESIDENTE')
       AND s.codigo_orgao='PRESIDENCIA')
   OR (n.relator_canonico IN ('VICE-PRESIDENTE','MINISTRO VICE-PRESIDENTE','VICE PRESIDENTE')
       AND s.codigo_orgao='VICE_PRESIDENCIA')
   OR (n.orgao_corrigido='1ª TURMA' AND s.codigo_orgao IN ('TURMA_1','TURMA_1_PRESID')
       AND s.nome_strip=n.relator_canonico)
   OR (n.orgao_corrigido='2ª TURMA' AND s.codigo_orgao IN ('TURMA_2','TURMA_2_PRESID')
       AND s.nome_strip=n.relator_canonico)
  );

CREATE TABLE m_nome AS
SELECT n.idFatoDecisao, s.ministro_nome_canonico, s.codigo_orgao, s.valid_from, s.valid_to, 'nome' AS fonte
FROM norm n JOIN seed s ON
  s.nome_strip=n.relator_canonico
  AND n.data_decisao IS NOT NULL AND s.valid_from IS NOT NULL
  AND s.valid_from <= n.data_decisao
  AND (s.valid_to IS NULL OR s.valid_to >= n.data_decisao);

CREATE TABLE m_posse AS
SELECT n.idFatoDecisao, b.nome AS ministro_nome_canonico,
       'STF_GERAL' AS codigo_orgao, b.data_posse AS valid_from, b.data_saida AS valid_to,
       'posse_range' AS fonte
FROM norm n JOIN bio b ON
  b.nome_strip=n.relator_canonico
  AND n.data_decisao IS NOT NULL AND b.data_posse IS NOT NULL
  AND b.data_posse<=n.data_decisao
  AND (b.data_saida IS NULL OR b.data_saida>=n.data_decisao);

CREATE TABLE m_all AS
SELECT *, ROW_NUMBER() OVER (PARTITION BY idFatoDecisao
  ORDER BY CASE fonte WHEN 'cargo' THEN 1 WHEN 'nome' THEN 2 ELSE 3 END,
           CASE codigo_orgao
             WHEN 'PRESIDENCIA' THEN 1 WHEN 'VICE_PRESIDENCIA' THEN 2
             WHEN 'TURMA_1_PRESID' THEN 3 WHEN 'TURMA_2_PRESID' THEN 3
             WHEN 'TURMA_1' THEN 4 WHEN 'TURMA_2' THEN 4
             WHEN 'STF_GERAL' THEN 9 ELSE 8 END, valid_from DESC) AS rank
FROM (SELECT * FROM m_cargo UNION ALL SELECT * FROM m_nome UNION ALL SELECT * FROM m_posse);
""")

# ============================================================
# 4. Decisão + ancoragem + extratores obs + ordem/vida + posição + ação
# ============================================================
log("calcula posição, ação, vida, próximo pulso...")
con.execute("""
CREATE TABLE d0 AS
SELECT n.*,
  m.ministro_nome_canonico AS ministro_identificado,
  m.codigo_orgao AS orgao_ancorado,
  m.fonte AS ancoragem_fonte,
  m.valid_from AS ancoragem_valid_from,
  m.valid_to AS ancoragem_valid_to,
  b.data_posse, b.data_saida AS data_aposentadoria,
  -- extratores mínimos da Observação
  CASE
    WHEN UPPER(observacao_andamento) LIKE '%POR UNANIMIDADE%' THEN 'unanime'
    WHEN UPPER(observacao_andamento) LIKE '%POR MAIORIA%' THEN 'maioria'
    WHEN NOT is_colegiado THEN 'monocratica' ELSE NULL END AS obs_votacao,
  (UPPER(observacao_andamento) LIKE '%VENCIDO O RELATOR%'
   OR UPPER(observacao_andamento) LIKE '%NOS TERMOS DO VOTO DIVERGENTE%') AS obs_relator_vencido
FROM norm n
LEFT JOIN m_all m ON m.idFatoDecisao=n.idFatoDecisao AND m.rank=1
LEFT JOIN bio b ON b.nome_strip=n.relator_canonico;
""")

con.execute("""
CREATE TABLE d1 AS
SELECT *,
  COUNT(*) OVER (PARTITION BY processo) AS n_decisoes_no_processo,
  ROW_NUMBER() OVER (PARTITION BY processo ORDER BY data_decisao NULLS LAST, idFatoDecisao) AS ordem_desta_decisao,
  CASE WHEN COUNT(*) OVER (PARTITION BY processo) <= 3 THEN 'curta' ELSE 'longa' END AS tipo_vida,

  -- Colunas derivadas das colunas do raw ainda não aproveitadas
  CASE WHEN data_autuacao IS NOT NULL AND data_decisao IS NOT NULL
       THEN DATE_DIFF('day', data_autuacao, data_decisao) ELSE NULL END AS dias_autuacao_ate_decisao,
  CASE WHEN data_decisao IS NOT NULL AND data_baixa IS NOT NULL
       THEN DATE_DIFF('day', data_decisao, data_baixa) ELSE NULL END AS dias_decisao_ate_baixa,
  (UPPER(indicador_tramitacao) LIKE 'EM TRAMITA%' OR UPPER(indicador_tramitacao) LIKE 'SIM%') AS em_tramitacao_flag,
  (UPPER(indicador_colegiado) LIKE 'SIM%' OR UPPER(indicador_colegiado) LIKE 'S%') AS indicador_colegiado_flag,
  CASE WHEN UPPER(meio_processo) LIKE '%FÍSICO%' OR UPPER(meio_processo) LIKE '%FISICO%' THEN 'FISICO'
       WHEN UPPER(meio_processo) LIKE '%ELETRÔNICO%' OR UPPER(meio_processo) LIKE '%ELETRONICO%' THEN 'ELETRONICO'
       ELSE NULL END AS meio_normalizado,
  UPPER(TRIM(procedencia)) AS uf_origem,
  UPPER(TRIM(orgao_origem)) AS tribunal_origem
FROM d0;
""")

# Posição (categoria_posicional) — derivada APENAS de (ordem, is_colegiado, orgao_corrigido).
# Pulso único é subcaso de ordem=1 — não precisa categoria própria.
# Subcategorização por órgão no filtro: Presidência vs Relator nomeado.
con.execute("""
CREATE TABLE d2 AS
SELECT *,
  CASE
    WHEN ordem_desta_decisao = 1 AND NOT is_colegiado AND orgao_corrigido='PRESIDÊNCIA'
      THEN 'FILTRO_PRESIDENCIA_1'
    WHEN ordem_desta_decisao = 1 AND NOT is_colegiado
      THEN 'FILTRO_RELATOR_1'
    WHEN ordem_desta_decisao = 1 AND is_colegiado
      THEN 'COLEGIADO_1'
    WHEN ordem_desta_decisao = 2 AND NOT is_colegiado AND orgao_corrigido='PRESIDÊNCIA'
      THEN 'FILTRO_PRESIDENCIA_2'
    WHEN ordem_desta_decisao = 2 AND NOT is_colegiado
      THEN 'FILTRO_RELATOR_2'
    WHEN ordem_desta_decisao = 2 AND is_colegiado
      THEN 'COLEGIADO_2'
    WHEN ordem_desta_decisao >= 3 AND is_colegiado
      THEN 'COLEGIADO_APRECIACAO'
    WHEN ordem_desta_decisao >= 3 AND NOT is_colegiado
      THEN 'POS_TRIAGEM_MONO'
    ELSE 'OUTRO'
  END AS categoria_posicional,

  -- Ação do pulso — deriva do andamento
  -- Ordem importa: INADMITE antes de MERITO (agravo não provido, não conhecido, negado seguimento)
  CASE
    WHEN andamento_decisao IS NULL THEN 'OUTRO'

    -- INADMITE (negativas de admissão ou filtros mantidos)
    WHEN UPPER(andamento_decisao) LIKE '%NEGADO SEGUIMENTO%'
      OR UPPER(andamento_decisao) LIKE '%NÃO CONHECID%'
      OR UPPER(andamento_decisao) LIKE '%NAO CONHECID%'
      OR UPPER(andamento_decisao) LIKE '%NÃO CONHEÇO%'
      OR UPPER(andamento_decisao) LIKE '%INADMIT%'
      OR UPPER(andamento_decisao) LIKE '%SEGUIMENTO NEGADO%'
      OR UPPER(andamento_decisao) = 'AGRAVO NÃO PROVIDO'
      OR UPPER(andamento_decisao) LIKE 'AGRAVO NÃO PROVIDO %'
      THEN 'INADMITE'

    -- ADMITE (filtro revertido / AI convertido)
    WHEN UPPER(andamento_decisao) LIKE 'AGRAVO PROVIDO E DESDE LOGO NEGADO SEGUIMENTO%'
      THEN 'INADMITE'  -- duplo ato: ADMITIU AI mas INADMITIU RE — resultado final = INADMITE
    WHEN UPPER(andamento_decisao) LIKE 'AGRAVO PROVIDO E DETERMINADA A DEVOLUÇÃO%'
      THEN 'DEVOLVE_RG'  -- admitiu e devolveu RG
    WHEN UPPER(andamento_decisao) LIKE 'AGRAVO PROVIDO E DESDE LOGO PROVIDO%'
      THEN 'MERITO_PROVIDO'  -- admitiu e já deu provimento ao RE
    WHEN UPPER(andamento_decisao) LIKE 'AI PROVIDO E DETERMINADA A CONVERSÃO EM RE%'
      OR UPPER(andamento_decisao) LIKE 'AI PROVIDO E DETERMINADA A SUBIDA%'
      OR UPPER(andamento_decisao) LIKE 'AGRAVO PROVIDO E RE PENDENTE%'
      OR UPPER(andamento_decisao) LIKE 'AGRAVO CONVERTIDO EM RE%'
      OR UPPER(andamento_decisao) LIKE '%CONHECER DO AGRAVO E DAR PROVIMENTO%'
      OR UPPER(andamento_decisao) LIKE '%CONHECER DO AGRAVO E DAR PARCIAL%'
      THEN 'ADMITE'
    WHEN UPPER(andamento_decisao) = 'AGRAVO REGIMENTAL PROVIDO'
      OR UPPER(andamento_decisao) LIKE 'AGRAVO REGIMENTAL PROVIDO EM PARTE%'
      THEN 'ADMITE'  -- colegiado reverteu inadmissão monocrática

    -- DEVOLVE_RG (sistêmica, não é filtro do relator)
    WHEN UPPER(andamento_decisao) LIKE 'DETERMINADA A DEVOLUÇÃO%'
      OR UPPER(andamento_decisao) LIKE 'RECONSIDERO E DEVOLVO%'
      THEN 'DEVOLVE_RG'

    -- EXTINGUE (lateral — nem filtro nem mérito)
    WHEN UPPER(andamento_decisao) LIKE '%PREJUDICAD%'
      OR UPPER(andamento_decisao) LIKE '%HOMOLOG%'
      OR UPPER(andamento_decisao) LIKE '%EXTINT%'
      OR UPPER(andamento_decisao) LIKE '%ARQUIVAD%'
      OR UPPER(andamento_decisao) LIKE '%DESISTÊNCIA%'
      OR UPPER(andamento_decisao) LIKE '%DECLINADA A COMPETÊNCIA%'
      OR UPPER(andamento_decisao) LIKE '%EXTINÇÃO DA PUNIBILIDADE%'
      THEN 'EXTINGUE'

    -- MERITO_PROVIDO
    WHEN UPPER(andamento_decisao) LIKE '%PROVIDO EM PARTE%'
      OR UPPER(andamento_decisao) LIKE '%PARCIAL PROVIMENTO%'
      OR UPPER(andamento_decisao) LIKE '%PROVIDO PARCIALMENTE%'
      OR UPPER(andamento_decisao) LIKE '%PROCEDENTE EM PARTE%'
      THEN 'MERITO_PROVIDO_PARCIAL'
    WHEN UPPER(andamento_decisao) LIKE '%AGRAVO REGIMENTAL NÃO PROVIDO%'
      OR UPPER(andamento_decisao) LIKE '%AGRAVO REGIMENTAL NÃO CONHECIDO%'
      OR UPPER(andamento_decisao) LIKE '%EMBARGOS RECEBIDOS COMO AGRAVO%NÃO PROVIDO%'
      THEN 'INADMITE'  -- colegiado referendou inadmissão monocrática anterior
    WHEN UPPER(andamento_decisao) LIKE '%PROVIDO%'
      OR UPPER(andamento_decisao) LIKE '%PROCEDENTE%'
      OR UPPER(andamento_decisao) LIKE '%CONCEDIDA A ORDEM%'
      OR UPPER(andamento_decisao) LIKE '%CONCEDIDA A SEGURANÇA%'
      OR UPPER(andamento_decisao) LIKE '%CONCEDIDA A SUSPENSÃO%'
      OR UPPER(andamento_decisao) LIKE 'DEFERIDO%'
      OR UPPER(andamento_decisao) LIKE 'LIMINAR DEFERIDA%'
      OR UPPER(andamento_decisao) LIKE '%EMBARGOS RECEBIDOS%'
      THEN 'MERITO_PROVIDO'

    -- MERITO_IMPROVIDO
    WHEN UPPER(andamento_decisao) LIKE '%NÃO PROVIDO%'
      OR UPPER(andamento_decisao) LIKE '%NAO PROVIDO%'
      OR UPPER(andamento_decisao) LIKE '%NEGADO PROVIMENTO%'
      OR UPPER(andamento_decisao) LIKE '%NEGO PROVIMENTO%'
      OR UPPER(andamento_decisao) LIKE '%IMPROCEDENTE%'
      OR UPPER(andamento_decisao) LIKE '%REJEITAD%'
      OR UPPER(andamento_decisao) LIKE '%DENEGADA A ORDEM%'
      OR UPPER(andamento_decisao) LIKE '%DENEGADA A SEGURANÇA%'
      OR UPPER(andamento_decisao) LIKE '%DENEGADA A SUSPENSÃO%'
      OR UPPER(andamento_decisao) LIKE 'INDEFERIDO%'
      OR UPPER(andamento_decisao) LIKE 'LIMINAR INDEFERIDA%'
      THEN 'MERITO_IMPROVIDO'

    ELSE 'OUTRO'
  END AS acao_do_pulso
FROM d1;
""")

# Próximo pulso (para Q2/Q3) via LEAD
log("calcula próximo pulso (Q2/Q3)...")
con.execute("""
CREATE TABLE d3 AS
SELECT *,
  LEAD(orgao_corrigido) OVER w AS prox_orgao,
  LEAD(categoria_posicional) OVER w AS prox_categoria_posicional,
  LEAD(acao_do_pulso) OVER w AS prox_acao,
  LEAD(is_colegiado) OVER w AS prox_is_colegiado,
  LEAD(ambiente_julgamento) OVER w AS prox_ambiente,
  LEAD(relator_canonico) OVER w AS prox_relator,
  LEAD(data_decisao) OVER w AS prox_data
FROM d2
WINDOW w AS (PARTITION BY processo ORDER BY data_decisao NULLS LAST, idFatoDecisao);
""")

# Flags por processo (Q4/Q5)
log("calcula flags por processo (Q4/Q5)...")
con.execute("""
CREATE TABLE p_flags AS
SELECT processo,
  BOOL_OR(categoria_posicional='COLEGIADO_APRECIACAO') AS P_teve_colegiado_apreciacao,
  BOOL_OR(categoria_posicional='COLEGIADO_APRECIACAO' AND acao_do_pulso='MERITO_PROVIDO') AS P_teve_colegiado_merito_provido,
  BOOL_OR(categoria_posicional='COLEGIADO_APRECIACAO' AND acao_do_pulso='MERITO_IMPROVIDO') AS P_teve_colegiado_merito_improvido,
  BOOL_OR(acao_do_pulso='MERITO_PROVIDO') AS P_teve_merito_provido,
  BOOL_OR(acao_do_pulso='MERITO_IMPROVIDO') AS P_teve_merito_improvido,
  BOOL_OR(acao_do_pulso='ADMITE') AS P_teve_admissao_filtro,
  BOOL_OR(categoria_posicional='FILTRO_PRESIDENCIA_1' AND acao_do_pulso='INADMITE') AS P_presid_inadmitiu,
  BOOL_OR(categoria_posicional='FILTRO_RELATOR_1' AND acao_do_pulso='INADMITE') AS P_relator_inadmitiu,
  BOOL_OR(acao_do_pulso='DEVOLVE_RG') AS P_teve_rg_devolucao,
  BOOL_OR(obs_relator_vencido) AS P_relator_foi_vencido
FROM d3
GROUP BY processo;
""")

# Final
log("monta final com ~45 colunas...")
con.execute("""
CREATE TABLE final AS
SELECT
  -- [20] raw preservado
  d.idFatoDecisao, d.processo, d.relator, d.meio_processo, d.origem_decisao, d.ambiente_julgamento,
  d.data_autuacao, d.data_baixa, d.indicador_colegiado, d.ano_decisao, d.data_decisao,
  d.tipo_decisao, d.andamento_decisao, d.observacao_andamento, d.ramo_direito, d.assuntos,
  d.indicador_tramitacao, d.orgao_julgador_raw, d.procedencia, d.orgao_origem,
  -- [5] derivadas básicas
  d.classe, d.numero, d.orgao_corrigido, d.relator_canonico, d.is_colegiado,
  -- [7] ancoragem
  d.ministro_identificado, d.orgao_ancorado, d.ancoragem_fonte,
  d.ancoragem_valid_from, d.ancoragem_valid_to, d.data_posse, d.data_aposentadoria,
  -- [2] observação extrator
  d.obs_votacao, d.obs_relator_vencido,
  -- [7] derivadas das colunas do raw (antes ignoradas)
  d.dias_autuacao_ate_decisao, d.dias_decisao_ate_baixa,
  d.em_tramitacao_flag, d.indicador_colegiado_flag,
  d.meio_normalizado, d.uf_origem, d.tribunal_origem,
  -- [3] pulso / vida
  d.n_decisoes_no_processo, d.tipo_vida, d.ordem_desta_decisao,
  -- [2] categoria posicional + ação (o coração do modelo)
  d.categoria_posicional, d.acao_do_pulso,
  -- [7] próximo pulso (Q2/Q3)
  d.prox_orgao, d.prox_categoria_posicional, d.prox_acao, d.prox_is_colegiado,
  d.prox_ambiente, d.prox_relator, d.prox_data,
  -- [10] flags por processo (Q4/Q5)
  p.P_teve_colegiado_apreciacao, p.P_teve_colegiado_merito_provido, p.P_teve_colegiado_merito_improvido,
  p.P_teve_merito_provido, p.P_teve_merito_improvido, p.P_teve_admissao_filtro,
  p.P_presid_inadmitiu, p.P_relator_inadmitiu, p.P_teve_rg_devolucao, p.P_relator_foi_vencido
FROM d3 d LEFT JOIN p_flags p ON p.processo=d.processo;
""")

n_f = con.execute("SELECT COUNT(*) FROM final").fetchone()[0]
log(f"  final: {n_f:,}")

# ============================================================
# 5. Export ano a ano + consolidado
# ============================================================
log("exporta CSVs...")
anos = [r[0] for r in con.execute("SELECT DISTINCT ano_decisao FROM final WHERE ano_decisao IS NOT NULL ORDER BY 1").fetchall()]
for y in anos:
    con.execute(f"COPY (SELECT * FROM final WHERE ano_decisao={y} ORDER BY data_decisao, idFatoDecisao) TO '{(OUT/f'ano_{y}.csv').as_posix()}' (HEADER, DELIMITER ',');")
    n = con.execute(f"SELECT COUNT(*) FROM final WHERE ano_decisao={y}").fetchone()[0]
    log(f"  ano_{y}.csv — {n:,}")

con.execute(f"COPY (SELECT * FROM final ORDER BY ano_decisao, data_decisao, idFatoDecisao) TO '{(OUT/'CONSOLIDADO.csv').as_posix()}' (HEADER, DELIMITER ',');")
log(f"  CONSOLIDADO.csv — {n_f:,}")

# ============================================================
# 6. Dicionário + sumário
# ============================================================
dic = """# Dicionário — CORPUS FINAL JUDX-STF (modelo posicional)

Cada linha = 1 pulso decisório. Categoria vem da **posição** do pulso na vida do processo.

## Categorias posicionais
| Valor | Regra |
|---|---|
| `FILTRO_PRESIDENCIA_1` | ordem=1, monocrática, orgão=PRESIDÊNCIA |
| `FILTRO_RELATOR_1` | ordem=1, monocrática, relator nomeado |
| `FILTRO_2` | ordem=2, monocrática (reconsideração / AgRg mono raro) |
| `COLEGIADO_PRECOCE` | ordem≤2 e colegiado (RG rápido, AgRg rápido) |
| `COLEGIADO_APRECIACAO` | ordem≥3 e colegiado (Turma/Pleno julga) |
| `POS_TRIAGEM_MONO` | ordem≥3 e monocrática (EDcl mono, despacho pós-admissão) |
| `PULSO_UNICO_MONO` | processo com 1 única decisão monocrática (morto em 1 pulso) |

## Ações do pulso
| Valor | Semântica |
|---|---|
| `INADMITE` | filtro mantido — negado seguimento, não conhecido, agravo não provido, AgRg não provido |
| `ADMITE` | filtro revertido — agravo provido, conversão AI→RE, AgRg provido |
| `MERITO_PROVIDO` / `MERITO_PROVIDO_PARCIAL` | pós-triagem: provido / procedente / HC concedido |
| `MERITO_IMPROVIDO` | pós-triagem: não provido / improcedente / HC denegado / indeferido |
| `DEVOLVE_RG` | devolução sistêmica — determinada a devolução (RG/543-B/representativo) |
| `EXTINGUE` | morte lateral — prejudicado / homologação / extinto / declinada competência |
| `OUTRO` | marginais — interlocutória, relator genérico, segredo |

## Como usar para as 7 perguntas
- **Q1** (vida curta/longa): `tipo_vida` × `classe` × `ano_decisao`
- **Q2** (Presidência inadmite → agravo, qual órgão julga): `ordem=1 AND categoria_posicional='FILTRO_PRESIDENCIA_1' AND acao_do_pulso='INADMITE'` → `prox_orgao` + `prox_categoria_posicional` + `prox_acao` + `prox_ambiente`
- **Q3** (Presidência distribui → Relator inadmite → Turma): filtra processos onde ordem=1 é ADMITE e ordem=2 é `FILTRO_RELATOR_1 AND INADMITE` — o pulso de ordem 3 mostra o que a Turma fez (ver prox_* do pulso ordem=2)
- **Q4** (ultrapassou filtros): `P_teve_colegiado_apreciacao=TRUE`
- **Q5** (provido no mérito): `P_teve_colegiado_merito_provido=TRUE`
- **Q6** (ministros): GROUP BY `ministro_identificado × categoria_posicional × acao_do_pulso`
- **Q7** (temas): usar `assuntos` cruzado com qualquer flag
"""
(OUT/"DICIONARIO.md").write_text(dic, encoding='utf-8')

# Sumário rápido
sums = []
sums.append(f"# Sumário — {datetime.now():%Y-%m-%d %H:%M}\n\nTotal: **{n_f:,}** pulsos\n")
sums.append("\n## Categoria posicional")
for r in con.execute("SELECT categoria_posicional, COUNT(*) FROM final GROUP BY 1 ORDER BY 2 DESC").fetchall():
    sums.append(f"- {r[0]}: {r[1]:,} ({100*r[1]/n_f:.2f}%)")
sums.append("\n## Ação do pulso")
for r in con.execute("SELECT acao_do_pulso, COUNT(*) FROM final GROUP BY 1 ORDER BY 2 DESC").fetchall():
    sums.append(f"- {r[0]}: {r[1]:,} ({100*r[1]/n_f:.2f}%)")
sums.append("\n## Cruzamento posição × ação (top 20)")
for r in con.execute("SELECT categoria_posicional, acao_do_pulso, COUNT(*) FROM final GROUP BY 1,2 ORDER BY 3 DESC LIMIT 20").fetchall():
    sums.append(f"- {r[0]} + {r[1]}: {r[2]:,}")
sums.append("\n## Flags agregadas por processo (contagem de processos únicos)")
r = con.execute("""SELECT
  SUM(CASE WHEN P_teve_colegiado_apreciacao THEN 1 ELSE 0 END) AS atrav,
  SUM(CASE WHEN P_teve_colegiado_merito_provido THEN 1 ELSE 0 END) AS provido_col,
  SUM(CASE WHEN P_teve_merito_provido THEN 1 ELSE 0 END) AS provido_qq,
  SUM(CASE WHEN P_presid_inadmitiu THEN 1 ELSE 0 END) AS presid_inad,
  SUM(CASE WHEN P_relator_inadmitiu THEN 1 ELSE 0 END) AS relator_inad,
  SUM(CASE WHEN P_relator_foi_vencido THEN 1 ELSE 0 END) AS rel_venc,
  COUNT(*) AS tot
FROM (SELECT DISTINCT processo, P_teve_colegiado_apreciacao, P_teve_colegiado_merito_provido,
      P_teve_merito_provido, P_presid_inadmitiu, P_relator_inadmitiu, P_relator_foi_vencido FROM final)""").fetchone()
sums.append(f"- atravessou colegiado: {r[0]:,}")
sums.append(f"- colegiado julgou mérito provido: {r[1]:,}")
sums.append(f"- mérito provido (qualquer camada): {r[2]:,}")
sums.append(f"- Presidência inadmitiu no 1º pulso: {r[3]:,}")
sums.append(f"- Relator inadmitiu no 1º pulso: {r[4]:,}")
sums.append(f"- relator foi vencido (outlier): {r[5]:,}")
sums.append(f"- **total processos únicos: {r[6]:,}**")
(OUT/"SUMARIO.md").write_text("\n".join(sums), encoding='utf-8')

con.close()
if os.path.exists(DB): os.remove(DB)
log("✓ FIM")
print(f"\nSaídas em: {OUT}")
