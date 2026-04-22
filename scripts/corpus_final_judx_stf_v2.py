"""
CORPUS FINAL JUDX-STF — v2 (2026-04-19 à noite) — correção dos 5 bugs observados na v1.

Bugs corrigidos vs v1 (corpus_final_judx_stf.py de 19:24):

 [1] ENCODING — Excel abria o CSV como Latin-1 e mostrava `ELETRÃ”NICO` em vez de
     ELETRÔNICO. Fix: output CSV escrito com BOM UTF-8 (EF BB BF no início).
     Arquivos no disco continuam UTF-8; o BOM apenas sinaliza pro Excel.

 [2] ASPAS/MULTILINHA — DuckDB read_csv_auto com ignore_errors=true engolia erros
     silenciosamente quando `Observação do andamento` tinha aspas + \\n internos.
     Fix: read_csv explícito com quote='"', escape='"', strict_mode=false,
     null_padding=true, sem ignore_errors. COPY com FORCE_QUOTE=* garante escape
     robusto na saída (todo campo fica entre aspas).

 [3] RAMO = ASSUNTOS — raw do Corte Aberta repete o campo hierárquico nas duas
     colunas 15 (Ramo direito) e 16 (Assuntos do processo). A v1 só renomeava sem
     derivar nada. Fix: preserva ambas (raw intacto — regra da Damares: "não
     deixar nada para trás") + deriva 6 colunas observáveis por SPLIT em ` | `:
       assunto_nivel_1 | assunto_nivel_2 | assunto_nivel_3 | assunto_nivel_4
       assunto_folha (último pedaço) | n_niveis_assunto | ramo_eq_assunto (bool)

 [4] WHITESPACE/PADDING — cada linha do raw termina com ~60 espaços e `\\n`
     interno nos textos longos vaza pra cauda bruta. Fix: TRIM aplicado em
     campos curtos derivados (tipo, andamento, origem, meio, ambiente) via
     colunas *_trim. Observacao_andamento preservada intacta.

 [5] AMBIENTE EM MONOCRÁTICA — raw marca `Presencial` em decisões MONOCRÁTICAS,
     que não são sessões mas despachos de gabinete. Fix: coluna derivada
     `ambiente_julgamento_coerente` = NULL quando origem=MONOCRÁTICA, caso
     contrário preserva o valor raw.

Saídas: `Desktop/backup_judx/resultados/CORPUS_FINAL_2026-04-19_v2/`
  - CONSOLIDADO.csv  + ano_YYYY.csv  (com BOM UTF-8)
  - DICIONARIO_COLUNAS.md (atualizado com as novas colunas)
  - SUMARIO.md           + SUMARIO_DIFF_v1_v2.md (comparação das métricas)
  - _LOG.txt             (log de rodagem, checagens de integridade)
"""
import duckdb, json, re, os, csv, io
from pathlib import Path
from datetime import datetime

# ============================================================
# 0. Configuração
# ============================================================
RAW_DIR = Path("C:/stf/stf_decisoes_fatias")
SEED = "C:/Users/medin/projetos/judx-platform/scripts/seeds-tribunais/composicao_ministerial.csv"
BIOGRAFICO = "C:/Users/medin/Desktop/backup_judx/resultados/stf_todos_ministros_consolidado.json"

OUT_BASE = Path("C:/Users/medin/Desktop/backup_judx/resultados/CORPUS_FINAL_2026-04-19_v2")
OUT_BASE.mkdir(parents=True, exist_ok=True)

LOG_PATH = OUT_BASE / "_LOG.txt"
LOG_LINES = []

DB = "G:/staging_local/corpus_final_v2_tmp.duckdb"
if os.path.exists(DB): os.remove(DB)
con = duckdb.connect(DB)

def log(msg):
    s = f"[{datetime.now():%H:%M:%S}] {msg}"
    print(s, flush=True)
    LOG_LINES.append(s)

def dump_log():
    LOG_PATH.write_text("\n".join(LOG_LINES), encoding='utf-8')

BOM = "\ufeff"

# ============================================================
# 1. Carga do raw — read_csv explícito, aspas tratadas, SEM ignore_errors
# ============================================================
log("carregando raw STF (26 CSVs + 1 XLSX 2026) com parser robusto...")
con.execute(f"""
CREATE TABLE raw AS
SELECT * FROM read_csv('{RAW_DIR.as_posix()}/decisoes_*.csv',
  header=true, delim=',', quote='"', escape='"',
  strict_mode=false, null_padding=true, sample_size=-1,
  parallel=false,
  union_by_name=true, all_varchar=true);
""")
n_csv = con.execute("SELECT COUNT(*) FROM raw").fetchone()[0]
log(f"  CSVs 2000-2025: {n_csv:,} linhas")

try:
    con.execute(f"INSERT INTO raw BY NAME SELECT * FROM read_xlsx('{RAW_DIR.as_posix()}/decisoes_2026.xlsx', all_varchar=true);")
except Exception as e:
    log(f"  aviso xlsx 2026: {e}")
n_raw = con.execute("SELECT COUNT(*) FROM raw").fetchone()[0]
log(f"  total raw com xlsx: {n_raw:,} linhas ({n_raw-n_csv:,} do xlsx)")

# CHECAGEM INTEGRIDADE — idFatoDecisao NULL/duplicado
n_null = con.execute("SELECT COUNT(*) FROM raw WHERE idFatoDecisao IS NULL").fetchone()[0]
n_dup = con.execute("SELECT COUNT(*) FROM (SELECT idFatoDecisao FROM raw GROUP BY 1 HAVING COUNT(*)>1)").fetchone()[0]
log(f"  integridade: idFatoDecisao NULL={n_null:,} | duplicados={n_dup:,}")

# ============================================================
# 2. Seed + Biográfico (idêntico à v1)
# ============================================================
log("carregando seed composição ministerial...")
con.execute(f"""
CREATE TABLE seed AS
SELECT
  tribunal_sigla, ministro_nome_canonico,
  strip_accents(UPPER(TRIM(ministro_nome_canonico))) AS nome_stripped,
  codigo_orgao,
  TRY_CAST(valid_from AS DATE) AS valid_from,
  TRY_CAST(valid_to AS DATE) AS valid_to
FROM read_csv_auto('{SEED}', header=true, sample_size=500)
WHERE tribunal_sigla='STF' AND ministro_nome_canonico IS NOT NULL;
""")
log(f"  seed: {con.execute('SELECT COUNT(*) FROM seed').fetchone()[0]:,} linhas")

log("carregando biográfico 171 ministros...")
with open(BIOGRAFICO, 'r', encoding='utf-8') as f:
    bio = json.load(f)
def parse_dmY(s):
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
    saida = parse_dmY(m.get('aposentadoria')) or parse_dmY(m.get('falecimento'))
    if nome and posse:
        bio_rows.append((nome, posse, saida))
con.execute("""CREATE TABLE bio AS
SELECT CAST(NULL AS VARCHAR) AS nome, CAST(NULL AS DATE) AS data_posse, CAST(NULL AS DATE) AS data_saida WHERE 0;""")
for nome, posse, saida in bio_rows:
    con.execute("INSERT INTO bio VALUES (?, TRY_CAST(? AS DATE), TRY_CAST(? AS DATE))", [nome, posse, saida])
con.execute("ALTER TABLE bio ADD COLUMN nome_stripped VARCHAR;")
con.execute("UPDATE bio SET nome_stripped = strip_accents(UPPER(TRIM(nome)));")
log(f"  bio: {con.execute('SELECT COUNT(*) FROM bio').fetchone()[0]:,} ministros")

# ============================================================
# 3. NORMALIZAÇÃO — preserva os 20 raw + deriva novas SEM sobrescrever
# ============================================================
log("normalizando raw: preserva 20 + deriva 6 assunto + 5 trim + ambiente_coerente + 5 básicas...")
con.execute("""
CREATE TABLE norm AS
SELECT
  -- [20] RAW PRESERVADO INTACTO (regra: não deixar nada para trás)
  idFatoDecisao,
  "Processo" AS processo,
  "Relator atual" AS relator,
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

  -- [5] DERIVADAS TRIM (limpam padding do raw sem perder o original)
  TRIM("Meio Processo") AS meio_processo_trim,
  TRIM("Origem decisão") AS origem_decisao_trim,
  TRIM("Ambiente julgamento") AS ambiente_julgamento_trim,
  TRIM("Tipo decisão") AS tipo_decisao_trim,
  TRIM("Andamento decisão") AS andamento_decisao_trim,

  -- [6] DERIVADAS ASSUNTO (SPLIT do campo hierárquico `RAMO | SUB | ... | FOLHA`)
  TRIM(str_split("Assuntos do processo", ' | ')[1]) AS assunto_nivel_1,
  TRIM(str_split("Assuntos do processo", ' | ')[2]) AS assunto_nivel_2,
  TRIM(str_split("Assuntos do processo", ' | ')[3]) AS assunto_nivel_3,
  TRIM(str_split("Assuntos do processo", ' | ')[4]) AS assunto_nivel_4,
  TRIM(str_split("Assuntos do processo", ' | ')[len(str_split("Assuntos do processo", ' | '))]) AS assunto_folha,
  len(str_split("Assuntos do processo", ' | ')) AS n_niveis_assunto,
  ("Ramo direito" = "Assuntos do processo") AS ramo_eq_assunto,

  -- [1] AMBIENTE COERENTE (NULL quando monocrática — despacho de gabinete não tem ambiente)
  CASE WHEN UPPER(TRIM("Origem decisão")) = 'MONOCRÁTICA' THEN NULL
       ELSE TRIM("Ambiente julgamento") END AS ambiente_julgamento_coerente,

  -- [5] DERIVADAS BÁSICAS (mantidas da v1)
  regexp_extract("Processo", '^(\\S+)\\s+(.+)$', 1) AS classe,
  regexp_extract("Processo", '^(\\S+)\\s+(.+)$', 2) AS numero,
  strip_accents(UPPER(TRIM(REGEXP_REPLACE("Relator atual",'^MIN(\\.|ISTRO|ISTRA)\\s+','')))) AS relator_canonico,

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
log(f"  norm: {con.execute('SELECT COUNT(*) FROM norm').fetchone()[0]:,} linhas")

# CHECAGEM ASSUNTO — quantos têm ramo != assunto (divergência da fonte)
n_diverg = con.execute("SELECT COUNT(*) FROM norm WHERE ramo_eq_assunto = FALSE").fetchone()[0]
log(f"  divergência ramo≠assunto: {n_diverg:,} linhas ({100*n_diverg/n_raw:.2f}% — são os casos onde a fonte separa)")

# CHECAGEM NIVEIS ASSUNTO — histograma
for lv, n in con.execute("SELECT n_niveis_assunto, COUNT(*) FROM norm WHERE assuntos IS NOT NULL GROUP BY 1 ORDER BY 1").fetchall():
    log(f"  n_niveis_assunto={lv}: {n:,}")

# CHECAGEM AMBIENTE — quantas monocráticas tinham ambiente preenchido (bug 5)
n_bug5 = con.execute("SELECT COUNT(*) FROM norm WHERE origem_decisao_trim='MONOCRÁTICA' AND ambiente_julgamento IS NOT NULL AND TRIM(ambiente_julgamento)<>''").fetchone()[0]
log(f"  bug 5 (ambiente em monocrática): {n_bug5:,} linhas — NULL na coluna derivada `ambiente_julgamento_coerente`")

# ============================================================
# 4. ANCORAGEM C1/C2/C3 — idêntica à v1
# ============================================================
log("ancorando C1 (cargo) + C2 (nome) + C3 (posse)...")
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
con.execute("""
CREATE TABLE match_nome AS
SELECT n.idFatoDecisao, s.ministro_nome_canonico, s.codigo_orgao, s.valid_from, s.valid_to, 'nome' AS fonte_match
FROM norm n JOIN seed s ON
  s.nome_stripped = n.relator_canonico
  AND n.data_decisao IS NOT NULL AND s.valid_from IS NOT NULL
  AND s.valid_from <= n.data_decisao
  AND (s.valid_to IS NULL OR s.valid_to >= n.data_decisao);
""")
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
con.execute("""
UPDATE dec_anc SET orgao_ancorado='PLENARIO_RG_AUTO', ancoragem_fonte='rg_automatica'
WHERE kind_pre='rg_automatica_ou_sobrestamento' AND orgao_ancorado IS NULL;
""")
log(f"  dec_anc: {con.execute('SELECT COUNT(*) FROM dec_anc').fetchone()[0]:,}")

# ============================================================
# 5. EXTRATOR da Observação — idêntico à v1
# ============================================================
log("extrator da observação (10 colunas)...")
con.execute("""
CREATE TABLE dec_ext AS
SELECT *,
  CASE
    WHEN observacao_andamento IS NULL THEN NULL
    WHEN UPPER(observacao_andamento) LIKE '%POR UNANIMIDADE%'
      OR UPPER(observacao_andamento) LIKE '%POR VOTAÇÃO UNÂNIME%'
      OR UPPER(observacao_andamento) LIKE '%À UNANIMIDADE%'
      OR UPPER(observacao_andamento) LIKE '%DECISÃO UNÂNIME%' THEN 'unanime'
    WHEN UPPER(observacao_andamento) LIKE '%POR MAIORIA%'
      OR UPPER(observacao_andamento) LIKE '%VOTAÇÃO MAJORITÁRIA%' THEN 'maioria'
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
# 6. RESULT + VIDA + TRAJETÓRIA — idêntico à v1
# ============================================================
log("classificando result, vida, trajetória...")
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
con.execute("""
CREATE TABLE dec_vida AS
SELECT *,
  COUNT(*) OVER (PARTITION BY processo) AS n_decisoes_no_processo,
  ROW_NUMBER() OVER (PARTITION BY processo ORDER BY data_decisao NULLS LAST, idFatoDecisao) AS ordem_desta_decisao,
  CASE WHEN COUNT(*) OVER (PARTITION BY processo) <= 3 THEN 'curta' ELSE 'longa' END AS tipo_vida
FROM dec_ext;
""")
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
# 7. SELEÇÃO FINAL — 49 antigas + 12 novas = 61 colunas
# ============================================================
log("gerando visão final com 61 colunas (49 v1 + 12 novas)...")
con.execute("""
CREATE TABLE final AS
SELECT
  -- [20] raw preservado intacto
  v.idFatoDecisao, v.processo, v.relator, v.meio_processo, v.origem_decisao, v.ambiente_julgamento,
  v.data_autuacao, v.data_baixa, v.indicador_colegiado, v.ano_decisao, v.data_decisao,
  v.tipo_decisao, v.andamento_decisao, v.observacao_andamento, v.ramo_direito, v.assuntos,
  v.indicador_tramitacao, v.orgao_julgador_raw, v.procedencia, v.orgao_origem,
  -- [5] derivadas TRIM (novas v2 — fix bug 4)
  v.meio_processo_trim, v.origem_decisao_trim, v.ambiente_julgamento_trim,
  v.tipo_decisao_trim, v.andamento_decisao_trim,
  -- [6] derivadas ASSUNTO (novas v2 — fix bug 3)
  v.assunto_nivel_1, v.assunto_nivel_2, v.assunto_nivel_3, v.assunto_nivel_4,
  v.assunto_folha, v.n_niveis_assunto, v.ramo_eq_assunto,
  -- [1] derivada AMBIENTE_COERENTE (nova v2 — fix bug 5)
  v.ambiente_julgamento_coerente,
  -- [5] derivadas básicas (v1)
  v.classe, v.numero, v.orgao_corrigido, v.relator_canonico, v.kind_pre,
  -- [7] ancoragem
  v.ministro_identificado, v.orgao_ancorado, v.ancoragem_fonte, v.ancoragem_valid_from, v.ancoragem_valid_to,
  v.data_posse, v.data_aposentadoria,
  -- [10] extrator obs
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
n_cols = len(con.execute("SELECT * FROM final LIMIT 0").description)
log(f"  final: {n_final:,} decisões × {n_cols} colunas")

# ============================================================
# 8. EXPORT — CSV por ano + consolidado, COM BOM UTF-8 + FORCE_QUOTE
# ============================================================
log("exportando CSVs com BOM UTF-8 + FORCE_QUOTE (fix bugs 1 e 2)...")
anos = [r[0] for r in con.execute(
    "SELECT DISTINCT ano_decisao FROM final WHERE ano_decisao IS NOT NULL ORDER BY 1").fetchall()]

def copy_with_bom(sql_select, out_path: Path):
    """DuckDB escreve CSV com FORCE_QUOTE ALL; depois prepend BOM UTF-8 (EF BB BF)."""
    tmp = out_path.with_suffix(out_path.suffix + ".tmp")
    con.execute(f"COPY ({sql_select}) TO '{tmp.as_posix()}' (HEADER, DELIMITER ',', QUOTE '\"', ESCAPE '\"', FORCE_QUOTE *);")
    with open(tmp, 'rb') as src, open(out_path, 'wb') as dst:
        dst.write(b'\xef\xbb\xbf')
        while chunk := src.read(8*1024*1024):
            dst.write(chunk)
    tmp.unlink()

for y in anos:
    out_y = OUT_BASE / f"ano_{y}.csv"
    copy_with_bom(f"SELECT * FROM final WHERE ano_decisao={y} ORDER BY data_decisao, idFatoDecisao", out_y)
    n_y = con.execute(f"SELECT COUNT(*) FROM final WHERE ano_decisao={y}").fetchone()[0]
    log(f"  ano_{y}.csv — {n_y:,} linhas")

out_cons = OUT_BASE / "CONSOLIDADO.csv"
copy_with_bom("SELECT * FROM final ORDER BY ano_decisao, data_decisao, idFatoDecisao", out_cons)
log(f"  CONSOLIDADO.csv — {n_final:,} linhas")

# ============================================================
# 9. CHECAGEM DE INTEGRIDADE pós-export
# ============================================================
log("checagem pós-export (releitura + contagem)...")
for y in anos:
    p = OUT_BASE / f"ano_{y}.csv"
    n_disk = con.execute(f"SELECT COUNT(*) FROM read_csv('{p.as_posix()}', header=true, quote='\"', escape='\"', strict_mode=false)").fetchone()[0]
    n_mem = con.execute(f"SELECT COUNT(*) FROM final WHERE ano_decisao={y}").fetchone()[0]
    status = "ok" if n_disk == n_mem else f"DIVERGE ({n_mem} em mem, {n_disk} em disco)"
    log(f"  {p.name}: {status}")

p = OUT_BASE / "CONSOLIDADO.csv"
n_disk = con.execute(f"SELECT COUNT(*) FROM read_csv('{p.as_posix()}', header=true, quote='\"', escape='\"', strict_mode=false)").fetchone()[0]
log(f"  CONSOLIDADO.csv releitura: {n_disk:,} linhas ({'ok' if n_disk==n_final else 'DIVERGE'})")

# ============================================================
# 10. DICIONÁRIO + SUMÁRIO
# ============================================================
log("gerando dicionário, sumário e diff v1↔v2...")
dic = """# Dicionário de Colunas — CORPUS_FINAL_2026-04-19 v2

Cada linha = 1 DECISÃO (pulso) do STF. Total **61 colunas** (49 v1 + 12 novas v2).
v1→v2: corrigidos 5 bugs de encoding, CSV multilinha, campo de assuntos colado, padding e ambiente em monocrática.

## [20] Raw preservado intacto (regra: não deixar nada para trás)
idFatoDecisao, processo, relator, meio_processo, origem_decisao, ambiente_julgamento, data_autuacao, data_baixa, indicador_colegiado, ano_decisao, data_decisao, tipo_decisao, andamento_decisao, observacao_andamento, ramo_direito, assuntos, indicador_tramitacao, orgao_julgador_raw, procedencia, orgao_origem

## [5] Derivadas TRIM (fix bug 4 — remove padding sem alterar o raw)
meio_processo_trim, origem_decisao_trim, ambiente_julgamento_trim, tipo_decisao_trim, andamento_decisao_trim

## [6+1] Derivadas ASSUNTO (fix bug 3 — raw cola ramo=assunto; aqui desdobra em níveis)
| Coluna | Regra |
|---|---|
| assunto_nivel_1 | SPLIT(' | ')[1] — ramo do direito |
| assunto_nivel_2 | SPLIT(' | ')[2] — subárea |
| assunto_nivel_3 | SPLIT(' | ')[3] |
| assunto_nivel_4 | SPLIT(' | ')[4] |
| assunto_folha | último elemento do split — assunto mais específico |
| n_niveis_assunto | quantos níveis existem (para agrupar por profundidade) |
| ramo_eq_assunto | TRUE quando raw ramo_direito == raw assuntos (esperado na maioria — a fonte duplica) |

## [1] Ambiente coerente (fix bug 5)
| Coluna | Regra |
|---|---|
| ambiente_julgamento_coerente | NULL quando origem=MONOCRÁTICA (despacho de gabinete, não é sessão); TRIM(ambiente_julgamento) caso contrário |

## [5] Derivadas básicas (v1)
classe, numero, orgao_corrigido, relator_canonico, kind_pre

## [7] Ancoragem — chave multidimensional em 3 camadas
ministro_identificado, orgao_ancorado, ancoragem_fonte, ancoragem_valid_from, ancoragem_valid_to, data_posse, data_aposentadoria

## [10] Extrator da Observação do andamento
obs_votacao, obs_colegiado, obs_ambiente, obs_dispositivo, obs_nos_termos_voto_relator, obs_relator_vencido, obs_vencido_1, obs_vencido_2, obs_data_sessao_str, obs_placar_reconstruido

## [4] Classificação estrutural
result, processo_atravessou_presid, processo_atravessou_relator, processo_teve_colegiado_provido

## [3] Vida do processo
n_decisoes_no_processo, tipo_vida, ordem_desta_decisao
"""
(OUT_BASE / "DICIONARIO_COLUNAS.md").write_text(dic, encoding='utf-8')

sum_txt = [f"# Sumário — CORPUS_FINAL_v2 gerado em {datetime.now():%Y-%m-%d %H:%M}\n",
           f"Total de decisões: **{n_final:,}**  |  Colunas: **{n_cols}**\n"]

sum_txt.append("\n## Ancoragem (orgao_ancorado)")
for oj, n in con.execute("SELECT COALESCE(orgao_ancorado,'(sem_ancoragem)'), COUNT(*) FROM final GROUP BY 1 ORDER BY 2 DESC").fetchall():
    sum_txt.append(f"- {oj}: {n:,} ({100*n/n_final:.2f}%)")

sum_txt.append("\n## Fonte de ancoragem")
for fm, n in con.execute("SELECT COALESCE(ancoragem_fonte,'(sem)'), COUNT(*) FROM final GROUP BY 1 ORDER BY 2 DESC").fetchall():
    sum_txt.append(f"- {fm}: {n:,} ({100*n/n_final:.2f}%)")

sum_txt.append("\n## Níveis de assunto (fix bug 3)")
for lv, n in con.execute("SELECT n_niveis_assunto, COUNT(*) FROM final WHERE assuntos IS NOT NULL GROUP BY 1 ORDER BY 1").fetchall():
    sum_txt.append(f"- {lv} níveis: {n:,}")

n_diverg = con.execute("SELECT COUNT(*) FROM final WHERE ramo_eq_assunto = FALSE").fetchone()[0]
sum_txt.append(f"\n## Divergência ramo_direito vs assuntos (raw)")
sum_txt.append(f"- linhas onde ramo ≠ assunto: {n_diverg:,} ({100*n_diverg/n_final:.2f}%)")

sum_txt.append("\n## Ambiente coerente (fix bug 5)")
for a, n in con.execute("SELECT COALESCE(ambiente_julgamento_coerente,'(null — monocrática)'), COUNT(*) FROM final GROUP BY 1 ORDER BY 2 DESC").fetchall():
    sum_txt.append(f"- {a}: {n:,}")

sum_txt.append("\n## Tipo de vida")
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
sum_txt.append(f"- Só Presidência: {r[1]:,}")
sum_txt.append(f"- Só Relator: {r[2]:,}")
sum_txt.append(f"- Morto na triagem: {r[3]:,}")
sum_txt.append(f"- **Total processos únicos: {r[4]:,}**")

(OUT_BASE / "SUMARIO.md").write_text("\n".join(sum_txt), encoding='utf-8')

# DIFF v1 v2
diff = [f"# Diff v1 → v2 — CORPUS_FINAL_2026-04-19\n",
        "## Bugs corrigidos\n",
        "| # | Bug | Sintoma | Fix |",
        "|---|---|---|---|",
        "| 1 | Encoding | Excel lia como Latin-1 (ELETRÃ\u201dNICO em vez de ELETRÔNICO) | BOM UTF-8 no início de cada CSV |",
        "| 2 | CSV multilinha | Aspas + \\n em observacao_andamento quebravam linhas; ignore_errors=true escondia | read_csv explícito sem ignore_errors + FORCE_QUOTE * na saída |",
        "| 3 | Ramo = Assuntos | v1 só renomeava; raw publica o mesmo valor hierárquico nas duas colunas | Preserva raw + deriva 6 colunas (nivel_1..4 + folha + ramo_eq_assunto) |",
        "| 4 | Trailing whitespace | Padding ~60 espaços no fim de linhas | TRIM em 5 campos curtos (coluna *_trim) |",
        "| 5 | Ambiente em monocrática | Raw marca 'Presencial' em despachos de gabinete | Coluna derivada ambiente_julgamento_coerente = NULL quando monocrática |",
        "\n## Métrica comparativa\n",
        f"- v1 total decisões: 2,934,675",
        f"- v2 total decisões: {n_final:,}  {'✓' if n_final == 2934675 else '⚠ divergente'}",
        f"- v1 colunas: 49",
        f"- v2 colunas: {n_cols}",
        f"- v2 divergência ramo≠assunto: {n_diverg:,} ({100*n_diverg/n_final:.2f}%)",
        f"- v2 bug 5 (ambiente em monocrática anulado): ver SUMARIO.md"]
(OUT_BASE / "SUMARIO_DIFF_v1_v2.md").write_text("\n".join(diff), encoding='utf-8')

con.close()
if os.path.exists(DB): os.remove(DB)

log("✓ FIM v2")
dump_log()
print(f"\nArquivos em: {OUT_BASE}")
print(f"  - CONSOLIDADO.csv  ({n_final:,} linhas × {n_cols} colunas, BOM UTF-8)")
print(f"  - ano_YYYY.csv    ({len(anos)} arquivos)")
print(f"  - DICIONARIO_COLUNAS.md + SUMARIO.md + SUMARIO_DIFF_v1_v2.md + _LOG.txt")
