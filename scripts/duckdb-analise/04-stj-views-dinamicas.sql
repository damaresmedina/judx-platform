-- 04-stj-views-dinamicas.sql
-- Arquitetura dinâmica sobre o raw Datajud STJ (3,39M docs em G:/datajud_raw/nivel_1_anteparos/STJ/).
-- Roda em arquivo DuckDB próprio (G:/staging_local/stj_views.duckdb) para não colidir com o
-- stj_consolidado.duckdb em curso pelo PID Python do classificador.
--
-- Executar no CLI DuckDB:
--   C:/Users/medin/tools/duckdb/duckdb.exe G:/staging_local/stj_views.duckdb < 04-stj-views-dinamicas.sql
--
-- Convenção: v_* para views (recomputam sob demanda), m_* para materializações opcionais.

-- ==================================================================
-- 0) BASE RAW — lê todos os part-*.ndjson.gz direto
-- ==================================================================
-- Opção A (leve): view que faz stream dos 3.380 arquivos a cada query.
-- Opção B (rápida): CREATE TABLE ... AS SELECT para materializar uma vez.
-- Começa como VIEW; promove a TABLE quando estabilizar o parser.

CREATE OR REPLACE VIEW v_stj_raw AS
SELECT
    _source
FROM read_json(
    'G:/datajud_raw/nivel_1_anteparos/STJ/part-*.ndjson.gz',
    format = 'newline_delimited',
    compression = 'gzip',
    union_by_name = true,
    ignore_errors = false                 -- NUNCA ignore_errors cego (memória feedback_principio_preservacao_absoluta)
)
WHERE _source IS NOT NULL;

-- ==================================================================
-- 1) stj_classe_mapa — tabela canônica classe → processo_curto
-- ==================================================================
-- Populada a partir do CSV 2026-04-19_stj_classes_canonico.csv gerado pela varredura.
-- Curadoria manual após inspeção; preserva código e nome originais.

CREATE TABLE IF NOT EXISTS stj_classe_mapa (
    codigo          INTEGER,
    nome            TEXT PRIMARY KEY,
    processo_curto  TEXT,                 -- AREsp, REsp, AgInt em REsp, HC, MS, Rcl, CC, Pet, RvCr, ...
    posicao_trilha  TEXT,                 -- filha_direta_acordao | brota_inadmissao | no_interno | refratao_no | string_autonoma | administrativa | corretiva | cautelar
    interpenetra_ramos BOOLEAN DEFAULT FALSE,  -- TRUE para classes que atravessam ramos (CC, Rcl, Pet.Uniformiz., SLS) — exceções ao feixe paralelo
    comentario      TEXT
);

-- Seeding mínimo (expandir após varredura extensiva identificar universo completo):
INSERT OR REPLACE INTO stj_classe_mapa VALUES
    (11881, 'Agravo em Recurso Especial',                       'AREsp',         'brota_inadmissao',     FALSE, 'REsp inadmitido na origem'),
    (1032,  'Recurso Especial',                                  'REsp',          'filha_direta_acordao', FALSE, 'filho de acórdão TJ/TRF — preserva ramo'),
    (1720,  'Habeas Corpus',                                     'HC',            'string_autonoma',      FALSE, 'autuado direto no STJ'),
    (1722,  'Recurso Ordinário em Habeas Corpus',                'ROHC',          'filha_direta_acordao', FALSE, 'filho de acórdão denegatório TJ/TRF'),
    (1721,  'Recurso Ordinário em Mandado de Segurança',         'ROMS',          'filha_direta_acordao', FALSE, 'filho de acórdão denegatório TJ/TRF'),
    (1029,  'Mandado de Segurança',                              'MS',            'string_autonoma',      FALSE, 'autuado direto no STJ'),
    (1054,  'Conflito de Competência',                           'CC',            'administrativa',       TRUE,  'INTERPENETRA: decide entre juízos de ramos diferentes'),
    (1030,  'Reclamação',                                        'Rcl',           'corretiva',            TRUE,  'INTERPENETRA: pode atacar decisão em qualquer ramo descumprindo tese'),
    (11956, 'Embargos de Divergência em Agravo em Recurso Especial', 'EDvAREsp',  'refratao_no',          FALSE, 'dissídio jurisprudencial interno STJ'),
    (1137,  'Embargos de Divergência em Recurso Especial',       'EDvREsp',       'refratao_no',          FALSE, 'dissídio jurisprudencial interno STJ'),
    (1669,  'Ação Rescisória',                                   'AR',            'rescisoria',           FALSE, 'sobre trânsito em julgado'),
    (1036,  'Suspensão de Liminar e de Sentença',                'SLS',           'cautelar',             TRUE,  'INTERPENETRA: suspende decisão de qualquer ramo por impacto público'),
    (1057,  'Petição',                                           'Pet',           'variada',              TRUE,  'INTERPENETRA (frequentemente): classe guarda-chuva'),
    (11791, 'Pedido de Uniformização de Interpretação de Lei Criminal', 'PU',    'uniformizacao',        TRUE,  'INTERPENETRA: unifica jurisprudência entre turmas'),
    (1047,  'Carta Rogatória',                                   'CR',            'string_autonoma',      FALSE, 'cooperação jurídica internacional'),
    (1026,  'Sentença Estrangeira',                              'SEC',           'string_autonoma',      FALSE, 'homologação decisão estrangeira')
;

-- ==================================================================
-- 2) stj_tr_mapa — canonicalização de J.TR (digitos 14-16 do CNJ)
-- ==================================================================
CREATE TABLE IF NOT EXISTS stj_tr_mapa (
    j_tr            TEXT PRIMARY KEY,     -- 3 caracteres
    j               TEXT,                 -- 1 char
    tr              TEXT,                 -- 2 chars
    segmento        TEXT,                 -- Superiores | Federal | Trabalho | Eleitoral | Estadual | Militar Estadual
    sigla_origem    TEXT,                 -- STJ | TRF4 | TJSP | TJRS | TJMG | ...
    nome_extenso    TEXT
);

-- Seed com base no decreto CNJ (completar com o CSV da varredura):
INSERT OR REPLACE INTO stj_tr_mapa VALUES
    ('300','3','00','Superiores',         'STJ',      'Superior Tribunal de Justiça (próprio)'),
    ('401','4','01','Federal',            'TRF1',     'Tribunal Regional Federal da 1ª Região'),
    ('402','4','02','Federal',            'TRF2',     'Tribunal Regional Federal da 2ª Região'),
    ('403','4','03','Federal',            'TRF3',     'Tribunal Regional Federal da 3ª Região'),
    ('404','4','04','Federal',            'TRF4',     'Tribunal Regional Federal da 4ª Região'),
    ('405','4','05','Federal',            'TRF5',     'Tribunal Regional Federal da 5ª Região'),
    ('406','4','06','Federal',            'TRF6',     'Tribunal Regional Federal da 6ª Região'),
    ('802','8','02','Estadual',           'TJAC',     'Tribunal de Justiça do Acre'),
    ('803','8','03','Estadual',           'TJAL',     'Tribunal de Justiça de Alagoas'),
    ('804','8','04','Estadual',           'TJAP',     'Tribunal de Justiça do Amapá'),
    ('805','8','05','Estadual',           'TJAM',     'Tribunal de Justiça do Amazonas'),
    ('806','8','06','Estadual',           'TJBA',     'Tribunal de Justiça da Bahia'),
    ('807','8','07','Estadual',           'TJCE',     'Tribunal de Justiça do Ceará'),
    ('808','8','08','Estadual',           'TJDFT',    'Tribunal de Justiça do Distrito Federal e Territórios'),
    ('809','8','09','Estadual',           'TJES',     'Tribunal de Justiça do Espírito Santo'),
    ('810','8','10','Estadual',           'TJGO',     'Tribunal de Justiça de Goiás'),
    ('811','8','11','Estadual',           'TJMA',     'Tribunal de Justiça do Maranhão'),
    ('812','8','12','Estadual',           'TJMT',     'Tribunal de Justiça de Mato Grosso'),
    ('813','8','13','Estadual',           'TJMS',     'Tribunal de Justiça de Mato Grosso do Sul'),
    ('814','8','14','Estadual',           'TJMG',     'Tribunal de Justiça de Minas Gerais'),
    ('815','8','15','Estadual',           'TJPA',     'Tribunal de Justiça do Pará'),
    ('816','8','16','Estadual',           'TJPB',     'Tribunal de Justiça da Paraíba'),
    ('817','8','17','Estadual',           'TJPR',     'Tribunal de Justiça do Paraná'),
    ('818','8','18','Estadual',           'TJPE',     'Tribunal de Justiça de Pernambuco'),
    ('819','8','19','Estadual',           'TJPI',     'Tribunal de Justiça do Piauí'),
    ('820','8','20','Estadual',           'TJRJ',     'Tribunal de Justiça do Rio de Janeiro'),
    ('821','8','21','Estadual',           'TJRN',     'Tribunal de Justiça do Rio Grande do Norte'),
    ('822','8','22','Estadual',           'TJRS',     'Tribunal de Justiça do Rio Grande do Sul'),
    ('823','8','23','Estadual',           'TJRO',     'Tribunal de Justiça de Rondônia'),
    ('824','8','24','Estadual',           'TJRR',     'Tribunal de Justiça de Roraima'),
    ('825','8','25','Estadual',           'TJSC',     'Tribunal de Justiça de Santa Catarina'),
    ('826','8','26','Estadual',           'TJSP',     'Tribunal de Justiça de São Paulo'),
    ('827','8','27','Estadual',           'TJSE',     'Tribunal de Justiça de Sergipe'),
    ('828','8','28','Estadual',           'TJTO',     'Tribunal de Justiça do Tocantins')
;

-- ==================================================================
-- 3) v_stj_string — projeção canônica 1 linha por numeroProcesso
-- ==================================================================
-- Equivalente ao stj_string da arquitetura proposta.
-- Deriva: processo_curto, autuacao (dual parser), tribunal_origem, relator, oj_bucket, total_movimentos.

CREATE OR REPLACE VIEW v_stj_string AS
WITH base AS (
    SELECT
        _source                                     AS s,
        _source.numeroProcesso                      AS np
    FROM v_stj_raw
),
normalizada AS (
    SELECT
        np                                          AS numero_cnj_limpo,
        CASE
            WHEN length(np) = 20 AND regexp_matches(np, '^\d+$')
            THEN regexp_replace(np, '^(\d{7})(\d{2})(\d{4})(\d{1})(\d{2})(\d{4})$',
                                    '\1-\2.\3.\4.\5.\6')
            ELSE np
        END                                         AS numero_cnj_formatado,
        s.classe.codigo                             AS classe_codigo,
        s.classe.nome                               AS classe_nome,
        -- dataAjuizamento dual parser (14d numérico OU ISO-8601)
        COALESCE(
            try_strptime(s.dataAjuizamento, '%Y%m%d%H%M%S'),
            try_strptime(s.dataAjuizamento, '%Y-%m-%dT%H:%M:%S.%g'),
            try_strptime(s.dataAjuizamento, '%Y-%m-%dT%H:%M:%S')
        )                                           AS autuacao,
        s.dataAjuizamento                           AS autuacao_raw,
        -- TR (tribunal de origem embutido no CNJ)
        CASE
            WHEN length(np) = 20 AND regexp_matches(np, '^\d+$')
            THEN substr(np, 14, 3)
        END                                         AS j_tr,
        s.orgaoJulgador.nome                        AS orgao_julgador_nome,
        s.orgaoJulgador.codigo                      AS orgao_julgador_codigo,
        -- bucket do orgaoJulgador
        CASE
            WHEN upper(s.orgaoJulgador.nome) LIKE 'GABINETE%'          THEN 'GABINETE'
            WHEN upper(s.orgaoJulgador.nome) LIKE 'PRESID%'            THEN 'PRESIDENCIA'
            WHEN upper(s.orgaoJulgador.nome) LIKE 'VICE-PRESID%'
              OR upper(s.orgaoJulgador.nome) LIKE 'VICE PRESID%'       THEN 'VICE-PRESIDENCIA'
            WHEN upper(s.orgaoJulgador.nome) LIKE '%SECAO%'
              OR upper(s.orgaoJulgador.nome) LIKE '%SEÇÃO%'            THEN 'SECAO'
            WHEN upper(s.orgaoJulgador.nome) LIKE '%TURMA%'            THEN 'TURMA'
            WHEN upper(s.orgaoJulgador.nome) LIKE '%NUCLEO%'
              OR upper(s.orgaoJulgador.nome) LIKE '%NÚCLEO%'           THEN 'NUCLEO'
            WHEN upper(s.orgaoJulgador.nome) LIKE 'SUPERIOR TRIBUNAL%' THEN 'STJ_GENERICO'
            WHEN upper(s.orgaoJulgador.nome) LIKE '%DESEMB%'           THEN 'DESEMBARGADOR'
            ELSE 'OUTRO'
        END                                         AS orgao_julgador_bucket,
        -- relator extraído do padrão GABINETE DA/DO MINISTRA/O X
        regexp_extract(upper(s.orgaoJulgador.nome),
                       'GABINETE (?:DA|DO) MINISTR[AO] (.+?)$', 1)
                                                    AS relator_do_gabinete,
        s.grau                                      AS grau,
        s.nivelSigilo                               AS nivel_sigilo,
        s.tribunal                                  AS tribunal,
        s.sistema.codigo                            AS sistema_codigo,
        s.sistema.nome                              AS sistema_nome,
        s.formato.codigo                            AS formato_codigo,
        s.formato.nome                              AS formato_nome,
        TRY_CAST(s.dataHoraUltimaAtualizacao AS TIMESTAMP) AS ultima_atualizacao,
        length(s.movimentos)                        AS total_movimentos
    FROM base
)
SELECT
    n.*,
    c.processo_curto,
    c.posicao_trilha,
    c.interpenetra_ramos,
    tr.sigla_origem                                 AS tribunal_origem_sigla,
    tr.segmento                                     AS origem_segmento,
    tr.nome_extenso                                 AS origem_nome_extenso,
    -- Marcação estrutural: anomalia se J.TR do numeroProcesso não corresponde
    -- ao ramo esperado pela classe (ex.: REsp com TR=300 = originou no próprio STJ?)
    CASE
        WHEN c.posicao_trilha = 'filha_direta_acordao'
         AND substr(n.j_tr,1,1) NOT IN ('4','8')    -- REsp/AREsp deveriam vir de J=4 (TRF) ou J=8 (TJ)
        THEN TRUE ELSE FALSE
    END                                             AS anomalia_origem_classe
FROM normalizada n
LEFT JOIN stj_classe_mapa c ON c.nome = n.classe_nome
LEFT JOIN stj_tr_mapa tr    ON tr.j_tr = n.j_tr;

-- ==================================================================
-- 3b) v_stj_interpenetracoes — apenas strings que atravessam ramos
-- ==================================================================
-- Isola as classes marcadas como interpenetra_ramos + strings com anomalia_origem_classe
-- para análise qualitativa. Feixe paralelo é regra; aqui estão as exceções.

CREATE OR REPLACE VIEW v_stj_interpenetracoes AS
SELECT
    numero_cnj_limpo,
    classe_codigo,
    classe_nome,
    processo_curto,
    posicao_trilha,
    tribunal_origem_sigla,
    origem_segmento,
    j_tr,
    autuacao,
    orgao_julgador_bucket,
    total_movimentos,
    CASE
        WHEN interpenetra_ramos = TRUE THEN 'classe_cross_ramo'
        WHEN anomalia_origem_classe = TRUE THEN 'origem_anomala'
        ELSE 'outra'
    END AS tipo_interpenetracao
FROM v_stj_string
WHERE interpenetra_ramos = TRUE
   OR anomalia_origem_classe = TRUE;

-- ==================================================================
-- 4) v_stj_pulsos — unnest movimentos[] com flag decisório
-- ==================================================================
-- Uma linha por movimento. Permite sequência temporal da biografia.
-- Pulsos decisórios são um subconjunto detectável por regex sobre o nome.

CREATE OR REPLACE VIEW v_stj_pulsos AS
SELECT
    r._source.numeroProcesso                AS numero_cnj,
    m.codigo                                AS mov_codigo,
    m.nome                                  AS mov_nome,
    TRY_CAST(m.dataHora AS TIMESTAMP)       AS mov_quando,
    m.orgaoJulgador.codigo                  AS mov_orgao_codigo,
    m.orgaoJulgador.nome                    AS mov_orgao_nome,
    -- bucket por heurística (será refinado pelo classificador TPU-CNJ)
    CASE
        WHEN m.nome ILIKE '%trânsito em julgado%'                              THEN 'transito'
        WHEN m.nome ILIKE '%não conhec%'
          OR m.nome ILIKE '%inadmis%' OR m.nome ILIKE '%intempest%'
          OR m.nome ILIKE '%deserto%'                                          THEN 'nao_conhecimento'
        WHEN m.nome ILIKE '%prejudic%' OR m.nome ILIKE '%perda de objeto%'    THEN 'prejudicado'
        WHEN m.nome ILIKE '%desist%' OR m.nome ILIKE '%renúnc%'
          OR m.nome ILIKE '%abandono%'                                         THEN 'desistencia'
        WHEN m.nome ILIKE 'homologa%'                                          THEN 'homologacao'
        WHEN m.nome ILIKE 'extin%'                                             THEN 'extinto_sem_merito'
        WHEN m.nome ILIKE '%provimento em parte%'
          OR m.nome ILIKE '%parcialmente provid%'
          OR m.nome ILIKE '%provid%parcial%'                                   THEN 'merito_provido_parcial'
        WHEN m.nome ILIKE '%não-provim%' OR m.nome ILIKE '%nao-provim%'
          OR m.nome ILIKE '%desprovi%' OR m.nome ILIKE '%improvi%'
          OR m.nome ILIKE '%improced%' OR m.nome ILIKE '%negar provimento%'
          OR m.nome ILIKE '%denega%'                                           THEN 'merito_desprovido'
        WHEN m.nome ILIKE 'provimento%' OR m.nome ILIKE '%procedent%'
          OR m.nome ILIKE '%acolh%' OR m.nome ILIKE '%deferi%'                 THEN 'merito_provido'
        ELSE NULL
    END                                     AS pulso_categoria
FROM v_stj_raw r,
     UNNEST(r._source.movimentos) AS t(m);

-- Pulsos decisórios apenas
CREATE OR REPLACE VIEW v_stj_pulsos_decisorios AS
SELECT * FROM v_stj_pulsos WHERE pulso_categoria IS NOT NULL;

-- ==================================================================
-- 5) v_stj_origem_proporcao — TJ → STJ (quanto cada TJ/TRF alimenta o STJ)
-- ==================================================================
CREATE OR REPLACE VIEW v_stj_origem_proporcao AS
SELECT
    COALESCE(tribunal_origem_sigla, '(desconhecido)')   AS origem,
    origem_segmento,
    COUNT(*)                                            AS processos_no_stj,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2)  AS pct
FROM v_stj_string
GROUP BY tribunal_origem_sigla, origem_segmento
ORDER BY processos_no_stj DESC;

-- ==================================================================
-- 6) v_stj_trilha_ancestral — inferência da string ancestral pela classe
-- ==================================================================
-- MVP: liga cada string a seu ancestral inferido pela classe.
-- Para casos em que o CNJ descende de outro CNJ STJ (AgInt, EDcl em REsp/AREsp),
-- aproximação por (classe, numero_cnj) — o número é o mesmo, muda a classe da string
-- que contém o nó. Quando houver dado ancestral explícito (portal), substituir.

CREATE OR REPLACE VIEW v_stj_trilha_ancestral AS
SELECT
    numero_cnj_limpo                                    AS numero_cnj_descendente,
    processo_curto,
    posicao_trilha,
    -- ancestral_tipo inferido
    CASE posicao_trilha
        WHEN 'brota_inadmissao'    THEN 'REsp inadmitido na origem (mesmo numero_cnj)'
        WHEN 'filha_direta_acordao' THEN 'Acórdão N2 (TJ/TRF) — mesmo numero_cnj'
        WHEN 'no_interno'           THEN 'Decisão monocrática no próprio processo'
        WHEN 'refratao_no'          THEN 'Decisão do próprio processo'
        WHEN 'string_autonoma'      THEN '(raiz — nasceu no STJ)'
        ELSE '(a classificar)'
    END                                                 AS ancestral_tipo,
    tribunal_origem_sigla
FROM v_stj_string;

-- ==================================================================
-- 7) v_stj_sumario — contagens rápidas para dashboards
-- ==================================================================
CREATE OR REPLACE VIEW v_stj_sumario AS
SELECT
    (SELECT COUNT(*) FROM v_stj_string)                          AS total_strings,
    (SELECT COUNT(*) FROM v_stj_pulsos)                          AS total_movimentos,
    (SELECT COUNT(*) FROM v_stj_pulsos_decisorios)               AS total_pulsos_decisorios,
    (SELECT COUNT(DISTINCT classe_nome) FROM v_stj_string)       AS classes_distintas,
    (SELECT COUNT(DISTINCT tribunal_origem_sigla) FROM v_stj_string
       WHERE tribunal_origem_sigla IS NOT NULL)                  AS tribunais_origem_distintos;

-- ==================================================================
-- Queries de validação (não destrutivas) — comentadas
-- ==================================================================
-- SELECT * FROM v_stj_sumario;
-- SELECT processo_curto, COUNT(*) FROM v_stj_string GROUP BY 1 ORDER BY 2 DESC;
-- SELECT * FROM v_stj_origem_proporcao LIMIT 30;
-- SELECT pulso_categoria, COUNT(*) FROM v_stj_pulsos_decisorios GROUP BY 1 ORDER BY 2 DESC;
-- SELECT orgao_julgador_bucket, COUNT(*) FROM v_stj_string GROUP BY 1 ORDER BY 2 DESC;
