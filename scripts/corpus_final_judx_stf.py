"""
CORPUS FINAL JUDX-STF — script único que gera o arquivo analítico com ~49 colunas
por decisão, respondendo às 7 perguntas empíricas da Damares (19/abr/2026).

Fontes (NADA é fabricado; tudo vem de fonte rastreável):
  1. RAW decisões: C:/stf/stf_decisoes_fatias/  (26 CSVs + 1 XLSX, ~2,93M decisões)
  2. SEED composição: scripts/seeds-tribunais/composicao_ministerial.csv  (STF)
  3. BIOGRÁFICO:  resultados/stf_todos_ministros_consolidado.json  (171 ministros)

Saídas (todas em Desktop/backup_judx/resultados/CORPUS_FINAL_2026-04-19/):
  - CONSOLIDADO.csv        → arquivo único com todas as decisões (abrir em DuckDB ou Python)
  - ano_2000.csv .. ano_2026.csv  → um arquivo por ano (cabem no Excel ou texto)
  - DICIONARIO_COLUNAS.md  → descrição de cada uma das ~49 colunas
  - SUMARIO.md             → estatísticas de ancoragem, sinais, vida etc.

Ordem de execução (com os ajustes discutidos com Damares hoje 19/abr):
  1. Carregar raw + seed + biográfico
  2. Pré-ancoragem C0: detecta 'DECISÃO DA PRESIDÊNCIA%' no andamento → força PRESIDÊNCIA
  3. Pré-ancoragem C0-RG: detecta 'Determinada a devolução%' → kind=rg_automatica, orgao=PLENARIO_RG_AUTO
  4. Ancoragem C1 (cargo) — quando órgão raw = PRESIDÊNCIA / PLENÁRIO / etc, busca quem ocupava
  5. Ancoragem C2 (nome + strip_accents) — via seed composicao_ministerial
  6. Ancoragem C3 (janela posse→aposentadoria) — via biográfico 171 ministros (último fallback)
  7. Extrator da Observação (10 colunas: votacao, colegiado, ambiente, dispositivo, vencidos, data sessão...)
  8. Vida do processo (n_decisoes, tipo_vida, ordem)
  9. Trajetória: flags processo_atravessou_presid / processo_atravessou_relator
 10. Classificações kind/result
 11. Export por ano + consolidado + dicionário

Regras observadas:
  - #27 corpus operacional ≥2000; decisões anteriores ficam marcadas 'rastro_historico'
  - #28 PRESIDÊNCIA derivada de sinais internos quando raw agrupa em MONOCRÁTICA
  - #29 preservar TODAS as 20 colunas do raw + derivadas
  - Relator é âncora principal (Damares); relator_vencido + inadmissão_superada_por_turma_virtual
    = outliers de interesse (hipótese: turma virtual é referendo)
"""
import duckdb, json, re
from pathlib import Path
from datetime import datetime

# ============================================================
# 0. Configuração
# ============================================================
RAW_DIR = Path("C:/stf/stf_decisoes_fatias")
SEED = "C:/Users/medin/projetos/judx-platform/scripts/seeds-tribunais/composicao_ministerial.csv"
BIOGRAFICO = "C:/Users/medin/Desktop/backup_judx/resultados/stf_todos_ministros_consolidado.json"

OUT_BASE = Path("C:/Users/medin/Desktop/backup_judx/resultados/CORPUS_FINAL_2026-04-19")
OUT_BASE.mkdir(parents=True, exist_ok=True)

DB = "G:/staging_local/corpus_final_tmp.duckdb"
import os
if os.path.exists(DB): os.remove(DB)
con = duckdb.connect(DB)

def log(msg): print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)

# ============================================================
# 1. Carga do raw (26 CSVs + XLSX 2026) e do seed
# ============================================================
log("carregando raw decisões STF...")
con.execute(f"""
CREATE TABLE raw AS
SELECT * FROM read_csv_auto('{RAW_DIR.as_posix()}/decisoes_*.csv',
  header=true, sample_size=100000, ignore_errors=true, union_by_name=true);
""")
n_csv = con.execute("SELECT COUNT(*) FROM raw").fetchone()[0]
try:
    con.execute(f"INSERT INTO raw BY NAME SELECT * FROM read_xlsx('{RAW_DIR.as_posix()}/decisoes_2026.xlsx');")
except Exception as e:
    log(f"aviso xlsx 2026: {e}")
n_raw = con.execute("SELECT COUNT(*) FROM raw").fetchone()[0]
log(f"  {n_raw:,} decisões ({n_csv:,} dos CSVs + {n_raw-n_csv:,} do xlsx 2026)")

log("carregando seed composição ministerial...")
con.execute(f"""
CREATE TABLE seed AS
SELECT
  tribunal_sigla, ministro_nome_canonico,
  strip_accents(UPPER(TRIM(ministro_nome_canonico))) AS nome_stripped,
  codigo_orgao,
  TRY_CAST(valid_from AS DATE) AS valid_from,
  TRY_CAST(valid_to AS DATE) AS valid_to
FROM read_csv_auto('{SEED}', header=true, sample_size=500, ignore_errors=true)
WHERE tribunal_sigla='STF' AND ministro_nome_canonico IS NOT NULL;
""")
n_seed = con.execute("SELECT COUNT(*) FROM seed").fetchone()[0]
log(f"  {n_seed} linhas do seed STF (com ancoragem temporal)")

# ============================================================
# 2. Biográfico: converte JSON em tabela (posse_stf + aposentadoria/falecimento)
# ============================================================
log("carregando biográfico 171 ministros (posse + aposentadoria)...")
with open(BIOGRAFICO, 'r', encoding='utf-8') as f:
    bio = json.load(f)

def parse_dmY(s):
    """Formato 22/2/2024 ou 30/1/1946 → '2024-02-22'"""
    if not s: return None
    s = str(s).strip()
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})', s)
    if not m: return None
    d, mo, y = m.groups()
    return f"{y}-{int(mo):02d}-{int(d):02d}"

bio_rows = []
for m in bio:
    nome = m.get('nome_completo') or m.get('nome')
    posse = parse_dmY(m.get('posse_stf'))
    # data de saída: aposentadoria > falecimento
    saida = parse_dmY(m.get('aposentadoria')) or parse_dmY(m.get('falecimento'))
    if nome and posse:
        bio_rows.append((nome, posse, saida))

con.execute("""CREATE TABLE bio AS
SELECT CAST(NULL AS VARCHAR) AS nome, CAST(NULL AS DATE) AS data_posse, CAST(NULL AS DATE) AS data_saida WHERE 0;""")
for nome, posse, saida in bio_rows:
    con.execute("INSERT INTO bio VALUES (?, TRY_CAST(? AS DATE), TRY_CAST(? AS DATE))", [nome, posse, saida])

con.execute("""
ALTER TABLE bio ADD COLUMN nome_stripped VARCHAR;
UPDATE bio SET nome_stripped = strip_accents(UPPER(TRIM(nome)));
""")
n_bio = con.execute("SELECT COUNT(*) FROM bio").fetchone()[0]
log(f"  {n_bio} ministros biográficos (com posse)")

# ============================================================
# 3. Normalização do raw: split classe/numero, strip_accents no relator, ORGAO CORRIGIDO
#    Incluindo C0 (andamento='DECISÃO DA PRESIDÊNCIA%') e C0-RG (devolução automática)
# ============================================================
log("normalizando raw: split classe/numero, relator_canonico, orgao_corrigido, kind_pre...")
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

  -- ORGAO CORRIGIDO (regra #28 + sinais do andamento = C0)
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

  -- KIND pré (sinais estruturais já evidentes no raw)
  CASE
    WHEN "Andamento decisão" ILIKE 'Determinada a devolução%'
      OR "Andamento decisão" ILIKE 'Determinada a devolução pelo regime%'
      OR "Andamento decisão" ILIKE 'Sobrestado%STJ%'
      OR "Andamento decisão" ILIKE 'SOBRESTADO ATÉ DECISÃO DO STJ%'
      THEN 'rg_automatica_ou_sobrestamento'
    WHEN "Órgão julgador" = 'MONOCRÁTICA' THEN 'monocratica'
    WHEN "Órgão julgador" IN ('1ª TURMA','2ª TURMA','TRIBUNAL PLENO','PLENÁRIO VIRTUAL - RG') THEN 'colegiada'
    WHEN "Tipo decisão" ILIKE 'Despacho%' THEN 'despacho'
    ELSE 'outra'
  END AS kind_pre
FROM raw;
""")
log(f"  norm pronta: {con.execute('SELECT COUNT(*) FROM norm').fetchone()[0]:,} linhas")

# ============================================================
# 4. ANCORAGEM — 3 camadas (cargo, nome, posse_range)
# ============================================================
log("ancorando: C1 (cargo), C2 (nome+acento), C3 (posse→aposentadoria)...")
con.execute("""
CREATE TABLE match_cargo AS
SELECT n.idFatoDecisao, s.ministro_nome_canonico, s.codigo_orgao, s.valid_from, s.valid_to, 'cargo' AS fonte_match
FROM norm n JOIN seed s ON
  n.data_decisao IS NOT NULL AND s.valid_from IS NOT NULL
  AND s.valid_from <= n.data_decisao
  AND (s.valid_to IS NULL OR s.valid_to >= n.data_decisao)
  AND (
      (n.orgao_corrigido = 'PRESIDÊNCIA' AND s.codigo_orgao = 'PRESIDENCIA')
   OR (n.orgao_corrigido IN ('TRIBUNAL PLENO','PLENÁRIO VIRTUAL - RG','TRIBUNAL PLENO - SESSÃO VIRTUAL')
       AND s.codigo_orgao = 'PRESIDENCIA')
   OR (n.relator_canonico IN ('PRESIDENTE','MINISTRO PRESIDENTE','PRES','MIN PRESIDENTE')
       AND s.codigo_orgao = 'PRESIDENCIA')
   OR (n.relator_canonico IN ('VICE-PRESIDENTE','MINISTRO VICE-PRESIDENTE','VICE PRESIDENTE')
       AND s.codigo_orgao = 'VICE_PRESIDENCIA')
   OR (n.orgao_corrigido = '1ª TURMA' AND s.codigo_orgao IN ('TURMA_1','TURMA_1_PRESID')
       AND s.nome_stripped = n.relator_canonico)
   OR (n.orgao_corrigido = '2ª TURMA' AND s.codigo_orgao IN ('TURMA_2','TURMA_2_PRESID')
       AND s.nome_stripped = n.relator_canonico)
  );
""")
log(f"  match_cargo: {con.execute('SELECT COUNT(DISTINCT idFatoDecisao) FROM match_cargo').fetchone()[0]:,} decisões")

con.execute("""
CREATE TABLE match_nome AS
SELECT n.idFatoDecisao, s.ministro_nome_canonico, s.codigo_orgao, s.valid_from, s.valid_to, 'nome' AS fonte_match
FROM norm n JOIN seed s ON
  s.nome_stripped = n.relator_canonico
  AND n.data_decisao IS NOT NULL AND s.valid_from IS NOT NULL
  AND s.valid_from <= n.data_decisao
  AND (s.valid_to IS NULL OR s.valid_to >= n.data_decisao);
""")
log(f"  match_nome: {con.execute('SELECT COUNT(DISTINCT idFatoDecisao) FROM match_nome').fetchone()[0]:,} decisões")

# C3 — janela posse→aposentadoria via biográfico (último fallback, quando não bate por cargo nem nome)
con.execute("""
CREATE TABLE match_posse AS
SELECT n.idFatoDecisao, b.nome AS ministro_nome_canonico,
       'STF_GERAL' AS codigo_orgao, b.data_posse AS valid_from, b.data_saida AS valid_to,
       'posse_range' AS fonte_match
FROM norm n JOIN bio b ON
  b.nome_stripped = n.relator_canonico
  AND n.data_decisao IS NOT NULL AND b.data_posse IS NOT NULL
  AND b.data_posse <= n.data_decisao
  AND (b.data_saida IS NULL OR b.data_saida >= n.data_decisao);
""")
log(f"  match_posse: {con.execute('SELECT COUNT(DISTINCT idFatoDecisao) FROM match_posse').fetchone()[0]:,} decisões")

# Unificação com prioridade cargo > nome > posse
con.execute("""
CREATE TABLE matches_all AS
SELECT *, ROW_NUMBER() OVER (
  PARTITION BY idFatoDecisao
  ORDER BY CASE fonte_match WHEN 'cargo' THEN 1 WHEN 'nome' THEN 2 ELSE 3 END,
           CASE codigo_orgao
             WHEN 'PRESIDENCIA' THEN 1 WHEN 'VICE_PRESIDENCIA' THEN 2
             WHEN 'TURMA_1_PRESID' THEN 3 WHEN 'TURMA_2_PRESID' THEN 3
             WHEN 'TURMA_1' THEN 4 WHEN 'TURMA_2' THEN 4
             WHEN 'PLENARIO' THEN 5 WHEN 'STF_GERAL' THEN 9
             ELSE 8 END,
           valid_from DESC
) AS rank
FROM (SELECT * FROM match_cargo UNION ALL SELECT * FROM match_nome UNION ALL SELECT * FROM match_posse);
""")

# Tabela intermediária: decisão + ancoragem (1 linha por decisão)
log("consolidando decisão + ancoragem...")
con.execute("""
CREATE TABLE dec_anc AS
SELECT n.*,
  m.ministro_nome_canonico AS ministro_identificado,
  m.codigo_orgao AS orgao_ancorado,
  m.fonte_match AS ancoragem_fonte,
  m.valid_from AS ancoragem_valid_from,
  m.valid_to AS ancoragem_valid_to,
  b.data_posse AS data_posse,
  b.data_saida AS data_aposentadoria
FROM norm n
LEFT JOIN matches_all m ON m.idFatoDecisao=n.idFatoDecisao AND m.rank=1
LEFT JOIN bio b ON b.nome_stripped = n.relator_canonico;
""")
log(f"  dec_anc: {con.execute('SELECT COUNT(*) FROM dec_anc').fetchone()[0]:,} linhas")

# Para decisões RG_AUTOMATICA, força órgão ancorado
con.execute("""
UPDATE dec_anc SET orgao_ancorado='PLENARIO_RG_AUTO', ancoragem_fonte='rg_automatica'
WHERE kind_pre='rg_automatica_ou_sobrestamento' AND orgao_ancorado IS NULL;
""")

# ============================================================
# 5. EXTRATOR da Observação do andamento
# ============================================================
log("extrator da Observação: votação, colegiado, ambiente, dispositivo, vencidos, data sessão...")
con.execute("""
CREATE TABLE dec_ext AS
SELECT *,
  CASE
    WHEN observacao_andamento IS NULL THEN NULL
    WHEN UPPER(observacao_andamento) LIKE '%POR UNANIMIDADE%'
      OR UPPER(observacao_andamento) LIKE '%POR VOTAÇÃO UNÂNIME%'
      OR UPPER(observacao_andamento) LIKE '%À UNANIMIDADE%'
      OR UPPER(observacao_andamento) LIKE '%DECISÃO UNÂNIME%'
      THEN 'unanime'
    WHEN UPPER(observacao_andamento) LIKE '%POR MAIORIA%'
      OR UPPER(observacao_andamento) LIKE '%VOTAÇÃO MAJORITÁRIA%'
      THEN 'maioria'
    WHEN origem_decisao = 'MONOCRÁTICA' THEN 'monocratica'
    ELSE NULL
  END AS obs_votacao,

  CASE
    WHEN UPPER(observacao_andamento) LIKE '%PRIMEIRA TURMA%' THEN 'PRIMEIRA_TURMA'
    WHEN UPPER(observacao_andamento) LIKE '%SEGUNDA TURMA%' THEN 'SEGUNDA_TURMA'
    WHEN UPPER(observacao_andamento) LIKE '%PLENÁRIO VIRTUAL%'
      OR UPPER(observacao_andamento) LIKE '%PLENARIO VIRTUAL%' THEN 'PLENARIO_VIRT'
    WHEN UPPER(observacao_andamento) LIKE '%PLENÁRIO%'
      OR UPPER(observacao_andamento) LIKE '%O TRIBUNAL%'
      OR UPPER(observacao_andamento) LIKE '%SESSÃO PLENÁRIA%' THEN 'PLENARIO'
    ELSE NULL
  END AS obs_colegiado,

  CASE
    WHEN UPPER(observacao_andamento) LIKE '%SESSÃO VIRTUAL%'
      OR UPPER(observacao_andamento) LIKE '%SESSAO VIRTUAL%' THEN 'VIRTUAL'
    WHEN UPPER(observacao_andamento) LIKE '%SESSÃO PRESENCIAL%'
      OR UPPER(observacao_andamento) LIKE '%SESSÃO ORDINÁRIA%' THEN 'PRESENCIAL'
    ELSE NULL
  END AS obs_ambiente,

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
    WHEN UPPER(observacao_andamento) LIKE '%NÃO CONHECEU%'
      OR UPPER(observacao_andamento) LIKE '%NAO CONHECEU%' THEN 'NAO_CONHECEU'
    WHEN UPPER(observacao_andamento) LIKE '%JULGOU PROCEDENTE%' THEN 'JULGOU_PROCEDENTE'
    WHEN UPPER(observacao_andamento) LIKE '%JULGOU IMPROCEDENTE%' THEN 'JULGOU_IMPROCEDENTE'
    WHEN UPPER(observacao_andamento) LIKE '%CONCEDEU A ORDEM%' THEN 'CONCEDEU_ORDEM'
    WHEN UPPER(observacao_andamento) LIKE '%DENEGOU A ORDEM%' THEN 'DENEGOU_ORDEM'
    ELSE NULL
  END AS obs_dispositivo,

  (UPPER(observacao_andamento) LIKE '%NOS TERMOS DO VOTO DO RELATOR%'
   OR UPPER(observacao_andamento) LIKE '%NOS TERMOS DO VOTO DO(A) RELATOR%') AS obs_nos_termos_voto_relator,

  -- OUTLIER: relator vencido (hipótese Damares — turma virtual refuta relator raramente)
  (UPPER(observacao_andamento) LIKE '%VENCIDO O RELATOR%'
   OR UPPER(observacao_andamento) LIKE '%VENCIDO O MINISTRO RELATOR%'
   OR UPPER(observacao_andamento) LIKE '%NOS TERMOS DO VOTO DIVERGENTE%') AS obs_relator_vencido,

  regexp_extract(observacao_andamento,
    'vencido o[s]? [Mm]inistro[s]? ([A-ZÀ-Úa-zà-ú .]+?)[,.]', 1) AS obs_vencido_1,
  regexp_extract(observacao_andamento,
    'vencidos os [Mm]inistros [A-ZÀ-Úa-zà-ú .]+? e ([A-ZÀ-Úa-zà-ú .]+?)[,.]', 1) AS obs_vencido_2,
  regexp_extract(observacao_andamento,
    'Sess[ãa]o[^0-9]{0,40}?(\\d{1,2}[./]\\d{1,2}[./]\\d{2,4})', 1) AS obs_data_sessao_str

FROM dec_anc;
""")

# Placar reconstruído: turmas têm 5 membros, Plenário 11. Vencidos ≥ 1 sinaliza maioria.
con.execute("""
ALTER TABLE dec_ext ADD COLUMN obs_placar_reconstruido VARCHAR;
UPDATE dec_ext SET obs_placar_reconstruido =
  CASE
    WHEN obs_votacao='unanime' AND obs_colegiado IN ('PRIMEIRA_TURMA','SEGUNDA_TURMA') THEN '5x0'
    WHEN obs_votacao='unanime' AND obs_colegiado IN ('PLENARIO','PLENARIO_VIRT') THEN '11x0'
    WHEN obs_votacao='maioria' AND obs_colegiado IN ('PRIMEIRA_TURMA','SEGUNDA_TURMA')
      AND obs_vencido_1 IS NOT NULL AND obs_vencido_1 <> ''
      AND (obs_vencido_2 IS NULL OR obs_vencido_2='') THEN '4x1'
    WHEN obs_votacao='maioria' AND obs_colegiado IN ('PRIMEIRA_TURMA','SEGUNDA_TURMA')
      AND obs_vencido_2 IS NOT NULL AND obs_vencido_2 <> '' THEN '3x2'
    WHEN obs_votacao='maioria' AND obs_colegiado IN ('PLENARIO','PLENARIO_VIRT')
      AND obs_vencido_1 IS NOT NULL AND obs_vencido_1<>''
      AND (obs_vencido_2 IS NULL OR obs_vencido_2='') THEN '10x1'
    WHEN obs_votacao='maioria' AND obs_colegiado IN ('PLENARIO','PLENARIO_VIRT')
      AND obs_vencido_2 IS NOT NULL AND obs_vencido_2<>'' THEN '9x2+'
    ELSE NULL
  END;
""")

# ============================================================
# 6. Classificação result (resultado normalizado da decisão)
# ============================================================
log("classificando result (inadmite/improvido/provido/rg_devolucao/extinto)...")
con.execute("""
ALTER TABLE dec_ext ADD COLUMN result VARCHAR;
UPDATE dec_ext SET result =
  CASE
    WHEN andamento_decisao IS NULL THEN 'outro'
    WHEN UPPER(andamento_decisao) LIKE '%NEGADO SEGUIMENTO%'
      OR UPPER(andamento_decisao) LIKE '%NÃO CONHECID%' OR UPPER(andamento_decisao) LIKE '%NAO CONHECID%'
      OR UPPER(andamento_decisao) LIKE '%NÃO CONHEÇO%' OR UPPER(andamento_decisao) LIKE '%INADMIT%'
      OR UPPER(andamento_decisao) LIKE '%SEGUIMENTO NEGADO%' THEN 'inadmite'
    WHEN UPPER(andamento_decisao) LIKE '%NÃO PROVIDO%' OR UPPER(andamento_decisao) LIKE '%NAO PROVIDO%'
      OR UPPER(andamento_decisao) LIKE '%NEGADO PROVIMENTO%' OR UPPER(andamento_decisao) LIKE '%NEGO PROVIMENTO%'
      OR UPPER(andamento_decisao) LIKE '%IMPROVI%' OR UPPER(andamento_decisao) LIKE '%DESPROVI%'
      OR UPPER(andamento_decisao) LIKE '%REJEITAD%' OR UPPER(andamento_decisao) LIKE '%IMPROCEDENTE%' THEN 'improvido'
    WHEN UPPER(andamento_decisao) LIKE '%PROCEDENTE%' OR UPPER(andamento_decisao) LIKE '%PROVIDO%'
      OR UPPER(andamento_decisao) LIKE '%EMBARGOS RECEBIDOS%' OR UPPER(andamento_decisao) LIKE '%DEU PROVIMENTO%'
      OR UPPER(andamento_decisao) LIKE '%CONCEDIDA A ORDEM%' OR UPPER(andamento_decisao) LIKE '%DEFERIDO%' THEN 'provido'
    WHEN UPPER(andamento_decisao) LIKE '%DEVOLUÇÃO%' OR UPPER(andamento_decisao) LIKE '%DEVOLVO%'
      OR UPPER(andamento_decisao) LIKE '%RECONSIDERO%' THEN 'rg_devolucao'
    WHEN UPPER(andamento_decisao) LIKE '%PREJUDICAD%' THEN 'prejudicado'
    WHEN UPPER(andamento_decisao) LIKE '%HOMOLOG%' OR UPPER(andamento_decisao) LIKE '%EXTINTO%'
      OR UPPER(andamento_decisao) LIKE '%DESISTÊNCIA%' THEN 'extinto'
    ELSE 'outro'
  END;
""")

# ============================================================
# 7. VIDA DO PROCESSO — n_decisoes, ordem_desta_decisao, tipo_vida
# ============================================================
log("computando vida do processo (n_decisoes, ordem, tipo_vida)...")
con.execute("""
CREATE TABLE dec_vida AS
SELECT *,
  COUNT(*) OVER (PARTITION BY processo) AS n_decisoes_no_processo,
  ROW_NUMBER() OVER (PARTITION BY processo ORDER BY data_decisao NULLS LAST, idFatoDecisao) AS ordem_desta_decisao,
  CASE WHEN COUNT(*) OVER (PARTITION BY processo) <= 3 THEN 'curta' ELSE 'longa' END AS tipo_vida
FROM dec_ext;
""")

# ============================================================
# 8. TRAJETÓRIA — atravessou_presidencia, atravessou_relator (flags constantes por processo)
# processo_atravessou_presid = EXISTS decisão PRESIDÊNCIA no processo com result<>'inadmite'
# processo_atravessou_relator = EXISTS decisão monocrática (não-Presidência) com result<>'inadmite'
# ============================================================
log("computando trajetória (atravessou_presid, atravessou_relator)...")
con.execute("""
CREATE TABLE proc_flags AS
SELECT processo,
  BOOL_OR(orgao_corrigido = 'PRESIDÊNCIA' AND result <> 'inadmite') AS processo_atravessou_presid,
  BOOL_OR(orgao_corrigido = 'MONOCRÁTICA' AND result <> 'inadmite') AS processo_atravessou_relator,
  BOOL_OR(orgao_corrigido = 'PRESIDÊNCIA' AND result = 'inadmite') AS processo_teve_presid_inadmitindo,
  BOOL_OR(orgao_corrigido = 'MONOCRÁTICA' AND result = 'inadmite') AS processo_teve_relator_inadmitindo,
  BOOL_OR(orgao_corrigido IN ('1ª TURMA','2ª TURMA','TRIBUNAL PLENO','PLENÁRIO VIRTUAL - RG')
          AND result = 'provido') AS processo_teve_colegiado_provido
FROM dec_vida
GROUP BY processo;
""")

# ============================================================
# 9. SELEÇÃO FINAL — ~49 colunas
# ============================================================
log("gerando visão final com ~49 colunas...")
con.execute("""
CREATE TABLE final AS
SELECT
  -- [20] raw preservado
  v.idFatoDecisao, v.processo, v.relator, v.meio_processo, v.origem_decisao, v.ambiente_julgamento,
  v.data_autuacao, v.data_baixa, v.indicador_colegiado, v.ano_decisao, v.data_decisao,
  v.tipo_decisao, v.andamento_decisao, v.observacao_andamento, v.ramo_direito, v.assuntos,
  v.indicador_tramitacao, v.orgao_julgador_raw, v.procedencia, v.orgao_origem,
  -- [5] derivadas básicas
  v.classe, v.numero, v.orgao_corrigido, v.relator_canonico, v.kind_pre,
  -- [7] ancoragem
  v.ministro_identificado, v.orgao_ancorado, v.ancoragem_fonte, v.ancoragem_valid_from, v.ancoragem_valid_to,
  v.data_posse, v.data_aposentadoria,
  -- [10] extrator da Observação
  v.obs_votacao, v.obs_colegiado, v.obs_ambiente, v.obs_dispositivo,
  v.obs_nos_termos_voto_relator, v.obs_relator_vencido,
  v.obs_vencido_1, v.obs_vencido_2, v.obs_data_sessao_str, v.obs_placar_reconstruido,
  -- [4] classificação
  v.result,
  p.processo_atravessou_presid,
  p.processo_atravessou_relator,
  p.processo_teve_colegiado_provido,
  -- [3] vida
  v.n_decisoes_no_processo, v.tipo_vida, v.ordem_desta_decisao
FROM dec_vida v
LEFT JOIN proc_flags p ON p.processo = v.processo;
""")

n_final = con.execute("SELECT COUNT(*) FROM final").fetchone()[0]
log(f"  final: {n_final:,} decisões")

# ============================================================
# 10. EXPORT — CSV por ano + consolidado + dicionário
# ============================================================
log("exportando CSV por ano + consolidado...")
anos = [r[0] for r in con.execute(
    "SELECT DISTINCT ano_decisao FROM final WHERE ano_decisao IS NOT NULL ORDER BY 1").fetchall()]

for y in anos:
    out_y = OUT_BASE / f"ano_{y}.csv"
    con.execute(f"COPY (SELECT * FROM final WHERE ano_decisao={y} ORDER BY data_decisao, idFatoDecisao) TO '{out_y.as_posix()}' (HEADER, DELIMITER ',');")
    n_y = con.execute(f"SELECT COUNT(*) FROM final WHERE ano_decisao={y}").fetchone()[0]
    log(f"  ano_{y}.csv — {n_y:,} linhas")

out_cons = OUT_BASE / "CONSOLIDADO.csv"
con.execute(f"COPY (SELECT * FROM final ORDER BY ano_decisao, data_decisao, idFatoDecisao) TO '{out_cons.as_posix()}' (HEADER, DELIMITER ',');")
log(f"  CONSOLIDADO.csv — {n_final:,} linhas")

# ============================================================
# 11. DICIONÁRIO + SUMÁRIO
# ============================================================
log("gerando dicionário e sumário...")
dic = """# Dicionário de Colunas — CORPUS_FINAL_2026-04-19

Cada linha do CSV = 1 DECISÃO (pulso) do STF. Preserva todas as 20 colunas do raw `C:\\stf\\stf_decisoes_fatias\\` + derivadas.

## [20] Raw preservado (nada descartado — regra canônica #29)
| Coluna | Origem | Nota |
|---|---|---|
| idFatoDecisao | raw | identificador único da decisão |
| processo | raw | classe + número concatenados (ex: 'ARE 1234567') |
| relator | raw | nome do relator exatamente como veio |
| meio_processo | raw | Físico / Eletrônico |
| origem_decisao | raw | linha decisória declarada no raw |
| ambiente_julgamento | raw | Presencial / Virtual |
| data_autuacao | raw | data de entrada do processo no STF |
| data_baixa | raw | data de baixa (arquivamento) |
| indicador_colegiado | raw | Sim / Não |
| ano_decisao | raw | ano da decisão |
| data_decisao | raw | data exata da decisão |
| tipo_decisao | raw | Decisão Final / Recurso Interno / Interlocutória / Liminar / RG |
| andamento_decisao | raw | resultado curto (Negado seguimento, Provido, etc) |
| observacao_andamento | raw | texto longo com colegiado, votação, vencidos, data da sessão |
| ramo_direito | raw | ramo do direito |
| assuntos | raw | TPU Assuntos do CNJ |
| indicador_tramitacao | raw | em tramitação / baixado |
| orgao_julgador_raw | raw | órgão como veio (PRESIDÊNCIA agrupada em MONOCRÁTICA) |
| procedencia | raw | UF de origem do processo |
| orgao_origem | raw | tribunal/órgão de origem |

## [5] Derivadas básicas
| Coluna | Regra |
|---|---|
| classe | regex primeira palavra de `processo` (AI / ARE / RE / ADI / …) |
| numero | resto depois da classe |
| orgao_corrigido | PRESIDÊNCIA desagrupada de MONOCRÁTICA via 3 sinais: (a) andamento LIKE 'DECISÃO DA PRESIDÊNCIA%', (b) relator = MINISTRO PRESIDENTE, (c) orgao_julgador_raw = MONOCRÁTICA com esses sinais |
| relator_canonico | strip_accents(UPPER(TRIM(relator sem 'MIN.'/'MINISTRO'/'MINISTRA'))) |
| kind_pre | rg_automatica_ou_sobrestamento / monocratica / colegiada / despacho / outra (pré-classificação estrutural) |

## [7] Ancoragem — chave multidimensional em 3 camadas (decisão canônica #28)
| Coluna | Regra |
|---|---|
| ministro_identificado | ministro canônico do seed que decidiu |
| orgao_ancorado | PRESIDENCIA / TURMA_1 / TURMA_1_PRESID / TURMA_2 / TURMA_2_PRESID / VICE_PRESIDENCIA / PLENARIO_RG_AUTO / STF_GERAL |
| ancoragem_fonte | cargo (C1) / nome (C2) / posse_range (C3) / rg_automatica |
| ancoragem_valid_from | início do mandato no órgão (do seed ou posse) |
| ancoragem_valid_to | fim do mandato (null = vigente) |
| data_posse | data de posse no STF (biográfico 171 ministros) |
| data_aposentadoria | aposentadoria ou falecimento (biográfico) |

## [10] Extrator da Observação do andamento
| Coluna | Regra |
|---|---|
| obs_votacao | 'unanime' / 'maioria' / 'monocratica' / NULL |
| obs_colegiado | PRIMEIRA_TURMA / SEGUNDA_TURMA / PLENARIO / PLENARIO_VIRT / NULL |
| obs_ambiente | VIRTUAL / PRESENCIAL / NULL |
| obs_dispositivo | NEGOU_PROVIMENTO / DEU_PARCIAL_PROVIMENTO / DEU_PROVIMENTO / REJEITOU_EMBARGOS / ACOLHEU_EMBARGOS / NAO_CONHECEU / JULGOU_PROCEDENTE / JULGOU_IMPROCEDENTE / CONCEDEU_ORDEM / DENEGOU_ORDEM / NULL |
| obs_nos_termos_voto_relator | TRUE se texto contém "nos termos do voto do Relator" |
| obs_relator_vencido | TRUE se "vencido o Relator" / "voto divergente" → OUTLIER de interesse (Damares) |
| obs_vencido_1 | primeiro nome vencido extraído por regex |
| obs_vencido_2 | segundo nome vencido (se houver dois) |
| obs_data_sessao_str | data da sessão extraída por regex (DD.MM.YYYY) |
| obs_placar_reconstruido | 5x0 / 4x1 / 3x2 / 11x0 / 10x1 / 9x2+ (reconstruído pelo nº de vencidos e tamanho do colegiado) |

## [4] Classificação estrutural
| Coluna | Regra |
|---|---|
| result | inadmite / improvido / provido / rg_devolucao / prejudicado / extinto / outro |
| processo_atravessou_presid | TRUE se o processo teve ao menos 1 decisão da Presidência que NÃO foi inadmissão |
| processo_atravessou_relator | TRUE se o processo teve ao menos 1 decisão do relator (não-Presidência) que NÃO foi inadmissão |
| processo_teve_colegiado_provido | TRUE se o processo teve decisão colegiada com result='provido' |

## [3] Vida do processo
| Coluna | Regra |
|---|---|
| n_decisoes_no_processo | total de decisões do mesmo `processo` |
| tipo_vida | 'curta' (≤3) / 'longa' (>3) |
| ordem_desta_decisao | posição desta decisão na sequência temporal do processo (1, 2, 3, …) |

---

## Como usar para responder as 7 perguntas

1. **Vida curta vs longa por AI/ARE/RE e por ano** → GROUP BY classe, ano_decisao, tipo_vida
2. **Presidência inadmite → próxima decisão** → filtra ordem=1 AND orgao_corrigido='PRESIDÊNCIA' AND result='inadmite'; junta com ordem=2 mesmo processo
3. **Relator inadmite → Turma** → filtra ordem=2 AND orgao_corrigido='MONOCRÁTICA' AND result='inadmite'; junta ordem=3 + obs_colegiado + obs_ambiente
4. **Quem ultrapassa filtros** → WHERE processo_atravessou_presid=TRUE AND processo_atravessou_relator=TRUE
5. **Providos (mérito)** → WHERE result='provido' AND orgao_corrigido IN TURMAS/PLENO
6. **Comportamento ministros** → GROUP BY ministro_identificado; % inadmite / provido / improvido
7. **Temas para além do ramo** → GROUP BY assuntos; cruzar com processo_atravessou_*
8. **Outliers (Damares)** → WHERE obs_relator_vencido=TRUE → investigar se Turma Virtual apenas referenda
"""
(OUT_BASE / "DICIONARIO_COLUNAS.md").write_text(dic, encoding='utf-8')

# Sumário
sum_txt = []
sum_txt.append(f"# Sumário — CORPUS_FINAL gerado em {datetime.now():%Y-%m-%d %H:%M}\n")
sum_txt.append(f"Total de decisões: **{n_final:,}**\n")

sum_txt.append("\n## Ancoragem (orgao_ancorado)")
for oj, n in con.execute("SELECT COALESCE(orgao_ancorado,'(sem_ancoragem)'), COUNT(*) FROM final GROUP BY 1 ORDER BY 2 DESC").fetchall():
    sum_txt.append(f"- {oj}: {n:,} ({100*n/n_final:.2f}%)")

sum_txt.append("\n## Fonte de ancoragem")
for fm, n in con.execute("SELECT COALESCE(ancoragem_fonte,'(sem)'), COUNT(*) FROM final GROUP BY 1 ORDER BY 2 DESC").fetchall():
    sum_txt.append(f"- {fm}: {n:,} ({100*n/n_final:.2f}%)")

sum_txt.append("\n## Tipo de vida (todos os processos)")
for t, n in con.execute("SELECT tipo_vida, COUNT(*) FROM final GROUP BY 1 ORDER BY 2 DESC").fetchall():
    sum_txt.append(f"- {t}: {n:,}")

sum_txt.append("\n## Processos que atravessaram os dois filtros")
r = con.execute("""SELECT
  SUM(CASE WHEN processo_atravessou_presid AND processo_atravessou_relator THEN 1 ELSE 0 END) AS atravessou_2,
  SUM(CASE WHEN processo_atravessou_presid AND NOT processo_atravessou_relator THEN 1 ELSE 0 END) AS so_presid,
  SUM(CASE WHEN NOT processo_atravessou_presid AND processo_atravessou_relator THEN 1 ELSE 0 END) AS so_relator,
  SUM(CASE WHEN NOT processo_atravessou_presid AND NOT processo_atravessou_relator THEN 1 ELSE 0 END) AS morto_triagem,
  COUNT(*) AS tot
FROM (SELECT DISTINCT processo, processo_atravessou_presid, processo_atravessou_relator FROM final)""").fetchone()
sum_txt.append(f"- Atravessou ambos: {r[0]:,}")
sum_txt.append(f"- Só Presidência admitiu, Relator não: {r[1]:,}")
sum_txt.append(f"- Só Relator admitiu: {r[2]:,}")
sum_txt.append(f"- Morto na triagem: {r[3]:,}")
sum_txt.append(f"- **Total de processos únicos: {r[4]:,}**")

sum_txt.append("\n## Sinais da Observação")
for label, where in [
    ("Unânime","obs_votacao='unanime'"),
    ("Maioria","obs_votacao='maioria'"),
    ("Relator vencido (outlier)","obs_relator_vencido=TRUE"),
    ("Turma Virtual","obs_colegiado IN ('PRIMEIRA_TURMA','SEGUNDA_TURMA') AND obs_ambiente='VIRTUAL'"),
]:
    n = con.execute(f"SELECT COUNT(*) FROM final WHERE {where}").fetchone()[0]
    sum_txt.append(f"- {label}: {n:,}")

(OUT_BASE / "SUMARIO.md").write_text("\n".join(sum_txt), encoding='utf-8')

con.close()
if os.path.exists(DB): os.remove(DB)

log("✓ FIM")
print(f"\nArquivos gerados em: {OUT_BASE}")
print(f"  - CONSOLIDADO.csv  ({n_final:,} linhas)")
print(f"  - ano_YYYY.csv     ({len(anos)} arquivos)")
print(f"  - DICIONARIO_COLUNAS.md")
print(f"  - SUMARIO.md")
