-- ═══════════════════════════════════════════════════════════════════════════
-- DNA DECISÓRIO · Views complementares para perfil decisório por ministro
-- Base: stf_master (2.9M) · stf_ministros (171, 161 com foto)
--
-- Objetivo (PROJUS 2016, Chamada Universal):
--   - Indicador de Coerência Decisória por ministro
--   - Cards visuais (foto + métricas + DNA)
--   - Mapeamento Jurisprudencial por ministro × tema × tempo
--   - Acervo bibliográfico integrado
--
-- Arquitetura: 6 materialized views + 1 view-pai (JSONB consolidado)
-- Refresh: CONCURRENTLY (não bloqueia leitura)
-- Cobertura histórica: 171 ministros (1892-2026)
--
-- NÃO APLICAR sem confirmação explícita da coordenadora.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 0 · PRÉ-REQUISITO: normalização do nome-relator
--    O campo stf_master.relator é livre. Precisa bater com stf_ministros.slug
-- ───────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_stf_master_relator AS
SELECT
  m.*,
  mn.id              AS ministro_id,
  mn.slug            AS ministro_slug,
  mn.nome            AS ministro_nome_canonico
FROM stf_master m
LEFT JOIN stf_ministros mn
  ON regexp_replace(lower(unaccent(m.relator)), '[^a-z0-9]+', '_', 'g')
     = regexp_replace(lower(unaccent(mn.nome)),     '[^a-z0-9]+', '_', 'g')
WITH DATA;

CREATE INDEX IF NOT EXISTS ix_mvsfm_relator_slug ON mv_stf_master_relator(ministro_slug);
CREATE INDEX IF NOT EXISTS ix_mvsfm_ano          ON mv_stf_master_relator(ano_decisao);
CREATE INDEX IF NOT EXISTS ix_mvsfm_classe       ON mv_stf_master_relator(classe);
CREATE INDEX IF NOT EXISTS ix_mvsfm_ramo         ON mv_stf_master_relator(ramo_direito);


-- ───────────────────────────────────────────────────────────────────────────
-- 1 · PERFIL BASE: 1 linha por ministro com dados consolidados
-- ───────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ministro_perfil_base AS
SELECT
  mn.id,
  mn.slug,
  mn.nome,
  mn.genero,
  mn.nascimento_data,
  mn.nascimento_local,
  mn.posse_stf,
  mn.saida_data,
  mn.saida_tipo,
  mn.carreira,
  mn.faculdade,
  mn.presidente_indicou,
  mn.idade_posse,
  mn.atual,
  mn.foi_presidente,
  mn.posse_presidencia,
  mn.foto_slug,
  mn.ordem_antiguidade,
  -- Cobertura decisória
  (SELECT COUNT(*)     FROM mv_stf_master_relator r WHERE r.ministro_slug = mn.slug)               AS total_decisoes,
  (SELECT MIN(data_decisao) FROM mv_stf_master_relator r WHERE r.ministro_slug = mn.slug)          AS primeira_decisao,
  (SELECT MAX(data_decisao) FROM mv_stf_master_relator r WHERE r.ministro_slug = mn.slug)          AS ultima_decisao,
  (SELECT COUNT(DISTINCT ano_decisao) FROM mv_stf_master_relator r WHERE r.ministro_slug = mn.slug) AS anos_ativos
FROM stf_ministros mn
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mvmpb_slug ON mv_ministro_perfil_base(slug);


-- ───────────────────────────────────────────────────────────────────────────
-- 2 · PRODUÇÃO ANUAL: série temporal de decisões por ministro × ano
-- ───────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ministro_producao_ano AS
SELECT
  ministro_slug,
  ano_decisao,
  COUNT(*)                                                    AS decisoes,
  COUNT(*) FILTER (WHERE tipo_decisao ILIKE '%monocr%')        AS monocraticas,
  COUNT(*) FILTER (WHERE tipo_decisao ILIKE '%colegiad%')      AS colegiadas,
  COUNT(DISTINCT classe)                                       AS classes_distintas,
  COUNT(DISTINCT ramo_direito)                                 AS ramos_distintos
FROM mv_stf_master_relator
WHERE ministro_slug IS NOT NULL AND ano_decisao IS NOT NULL
GROUP BY 1, 2
WITH DATA;

CREATE INDEX IF NOT EXISTS ix_mvmpa_slug_ano ON mv_ministro_producao_ano(ministro_slug, ano_decisao);


-- ───────────────────────────────────────────────────────────────────────────
-- 3 · PERFIL TEMÁTICO: decisões por ministro × ramo_direito (heatmap)
-- ───────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ministro_tema AS
SELECT
  ministro_slug,
  ramo_direito,
  COUNT(*)                                            AS decisoes,
  ROUND(100.0 * COUNT(*) /
        SUM(COUNT(*)) OVER (PARTITION BY ministro_slug), 2) AS pct_do_ministro,
  MIN(data_decisao) AS primeira,
  MAX(data_decisao) AS ultima
FROM mv_stf_master_relator
WHERE ministro_slug IS NOT NULL AND ramo_direito IS NOT NULL
GROUP BY 1, 2
WITH DATA;

CREATE INDEX IF NOT EXISTS ix_mvmt_slug ON mv_ministro_tema(ministro_slug);
CREATE INDEX IF NOT EXISTS ix_mvmt_ramo ON mv_ministro_tema(ramo_direito);


-- ───────────────────────────────────────────────────────────────────────────
-- 4 · PERFIL POR CLASSE: taxa de provimento por ministro × classe processual
--    (ADI, RE, ARE, Rcl, HC, MS, ACO, ADPF, ...)
-- ───────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ministro_classe_outcome AS
SELECT
  ministro_slug,
  classe,
  COUNT(*)                                                                AS total,
  COUNT(*) FILTER (WHERE lower(unaccent(andamento)) LIKE '%provid%' AND lower(unaccent(andamento)) NOT LIKE '%nao%') AS providos,
  COUNT(*) FILTER (WHERE lower(unaccent(andamento)) LIKE '%nao provid%')  AS nao_providos,
  COUNT(*) FILTER (WHERE lower(unaccent(andamento)) LIKE '%parcial%')     AS parciais,
  COUNT(*) FILTER (WHERE lower(unaccent(andamento)) LIKE '%nao conhec%')  AS nao_conhecidos,
  COUNT(*) FILTER (WHERE lower(unaccent(andamento)) LIKE '%prejud%')      AS prejudicados,
  ROUND(100.0 *
    COUNT(*) FILTER (WHERE lower(unaccent(andamento)) LIKE '%provid%' AND lower(unaccent(andamento)) NOT LIKE '%nao%')
    / NULLIF(COUNT(*) FILTER (WHERE lower(unaccent(andamento)) LIKE '%provid%' OR lower(unaccent(andamento)) LIKE '%nao provid%'), 0), 2
  ) AS taxa_provimento
FROM mv_stf_master_relator
WHERE ministro_slug IS NOT NULL AND classe IS NOT NULL
GROUP BY 1, 2
WITH DATA;

CREATE INDEX IF NOT EXISTS ix_mvmco_slug_classe ON mv_ministro_classe_outcome(ministro_slug, classe);


-- ───────────────────────────────────────────────────────────────────────────
-- 5 · PERFIL COLEGIADO: órgão julgador predominante por ministro
--    (Plenário, Plenário Virtual, 1ª Turma, 2ª Turma, Presidência)
-- ───────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ministro_colegiado AS
SELECT
  ministro_slug,
  orgao_julgador,
  COUNT(*)                                           AS decisoes,
  ROUND(100.0 * COUNT(*) /
        SUM(COUNT(*)) OVER (PARTITION BY ministro_slug), 2) AS pct
FROM mv_stf_master_relator
WHERE ministro_slug IS NOT NULL AND orgao_julgador IS NOT NULL
GROUP BY 1, 2
WITH DATA;

CREATE INDEX IF NOT EXISTS ix_mvmcol_slug ON mv_ministro_colegiado(ministro_slug);


-- ───────────────────────────────────────────────────────────────────────────
-- 6 · DNA CONSOLIDADO: JSONB por ministro (alimenta card + API do site)
--    Junta perfil base + top temas + top classes + colegiado + produção anual
-- ───────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ministro_dna AS
SELECT
  p.slug,
  p.nome,
  p.foto_slug,
  p.atual,
  p.foi_presidente,
  p.posse_stf,
  p.saida_data,
  p.carreira,
  p.faculdade,
  p.presidente_indicou,
  p.total_decisoes,
  p.primeira_decisao,
  p.ultima_decisao,
  p.anos_ativos,
  -- Top 5 temas (ramos de direito)
  (SELECT jsonb_agg(jsonb_build_object('ramo', ramo_direito, 'n', decisoes, 'pct', pct_do_ministro) ORDER BY decisoes DESC)
     FROM (SELECT ramo_direito, decisoes, pct_do_ministro FROM mv_ministro_tema
            WHERE ministro_slug = p.slug ORDER BY decisoes DESC LIMIT 5) t5) AS top_temas,
  -- Top 5 classes processuais
  (SELECT jsonb_agg(jsonb_build_object('classe', classe, 'n', total, 'taxa_prov', taxa_provimento) ORDER BY total DESC)
     FROM (SELECT classe, total, taxa_provimento FROM mv_ministro_classe_outcome
            WHERE ministro_slug = p.slug ORDER BY total DESC LIMIT 5) c5) AS top_classes,
  -- Distribuição por colegiado
  (SELECT jsonb_agg(jsonb_build_object('orgao', orgao_julgador, 'pct', pct) ORDER BY pct DESC)
     FROM mv_ministro_colegiado WHERE ministro_slug = p.slug) AS colegiado,
  -- Série anual compactada
  (SELECT jsonb_agg(jsonb_build_object('ano', ano_decisao, 'n', decisoes) ORDER BY ano_decisao)
     FROM mv_ministro_producao_ano WHERE ministro_slug = p.slug) AS producao_anual
FROM mv_ministro_perfil_base p
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mvmd_slug ON mv_ministro_dna(slug);


-- ───────────────────────────────────────────────────────────────────────────
-- 7 · ACERVO BIBLIOGRÁFICO (schema para popular depois)
--    Livros, papers, citações acadêmicas, biografias, entrevistas
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ministro_bibliografia (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ministro_slug text NOT NULL REFERENCES stf_ministros(slug),
  tipo          text NOT NULL CHECK (tipo IN ('livro_autoria','livro_sobre','paper','biografia','entrevista','tese','discurso_posse','artigo_jornal','capitulo')),
  titulo        text NOT NULL,
  autor         text,
  periodico     text,
  editora       text,
  ano           integer,
  local         text,
  url           text,
  doi           text,
  isbn          text,
  idioma        text DEFAULT 'pt',
  resumo        text,
  palavras_chave text[],
  fonte_fonte   text,                    -- onde achamos (Google Scholar, SciELO, etc.)
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_minbib_slug ON ministro_bibliografia(ministro_slug);
CREATE INDEX IF NOT EXISTS ix_minbib_tipo ON ministro_bibliografia(tipo);
CREATE INDEX IF NOT EXISTS ix_minbib_ano  ON ministro_bibliografia(ano);


-- ───────────────────────────────────────────────────────────────────────────
-- REFRESH · ordem obrigatória (cada uma depende da anterior)
-- ───────────────────────────────────────────────────────────────────────────

-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_stf_master_relator;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ministro_perfil_base;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ministro_producao_ano;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ministro_tema;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ministro_classe_outcome;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ministro_colegiado;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ministro_dna;


-- ═══════════════════════════════════════════════════════════════════════════
-- USO PRÁTICO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Card de um ministro (endpoint do site):
--   SELECT * FROM mv_ministro_dna WHERE slug = 'gilmar_mendes';
--
-- Grid com todos os 11 atuais:
--   SELECT slug, nome, foto_slug, total_decisoes, top_temas->0 AS tema_principal
--   FROM mv_ministro_dna WHERE atual = true ORDER BY posse_stf;
--
-- Heatmap tema × ministro:
--   SELECT ministro_slug, ramo_direito, decisoes
--   FROM mv_ministro_tema
--   WHERE ministro_slug IN (SELECT slug FROM stf_ministros WHERE atual);
--
-- Acervo de um ministro:
--   SELECT tipo, titulo, autor, ano FROM ministro_bibliografia
--   WHERE ministro_slug = 'gilmar_mendes' ORDER BY ano DESC;
-- ═══════════════════════════════════════════════════════════════════════════
