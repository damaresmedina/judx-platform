-- ============================================================
-- MODELO ONTOLÓGICO COMPLETO — ICONS/PROJUS
-- Banco: judx-platform (ejwyguskoiraredinqmb) — Supabase sa-east-1
-- Gerado em: 30/mar/2026
-- Autora: Damares Medina
--
-- PRINCÍPIOS ONTOLÓGICOS (gravados em judx_system_principle ONTO-001):
--
-- NÓ     = processo identificado pelo INCIDENTE (imutável desde o protocolo)
--          Classe e número são atributos CORRENTES — podem mudar
--          ARE vira RE quando admitido: mesmo incidente, nova classe
--
-- STRING = sequência ordenada de EVENTOS na vida do nó
--          Todo nó começa com DISTRIBUICAO (âncora institucional)
--          Eventos: distribuição, decisão, destaque, mudança de classe...
--
-- ARESTA = vínculo entre nós (incidente_pai → incidente_filho)
--          AgInt é nó filho do ARE (não evento na string do ARE)
--          EDcl é nó filho do acórdão que o originou
--
-- FLUXOS DE ENTRADA:
--   RE_DIRETO      → tribunal origem admitiu, RE chegou inteiro ao STF
--   ARE_NEGADO     → ARE inadmitido pela Presidência = NÃO-DECISÃO primária
--                    O RE fica represado na origem para sempre
--   ARE_ADMITIDO   → ARE admitido, nó se transforma (ARE→RE), string continua
--   ORIGINARIA     → ADI, ADPF, HC, MS, ACO, AP, Inq...
--
-- PRESIDÊNCIA — 3 poderes distintos como objetos:
--   1. DISTRIBUIÇÃO: ancora TODOS os processos (100% passa aqui)
--   2. FILTRO ARE: decide admissão/inadmissão (≈85% negados = NÃO-DECISÃO)
--   3. PAUTA PP: controla o que entra no Plenário Presencial
--      (presidentes de Turma controlam pauta das Turmas Presenciais)
--
-- DESTAQUE: qualquer ministro puxa do PV para presencial
--           necessário mas não suficiente — presidente do órgão inclui na pauta
--
-- AMBIENTE — não é logística, é natureza da colegialidade:
--   MONOCRATICA:          1 ministro decide
--   COLEGIADA_FORMAL_PV:  formalmente colegiado, materialmente monocrático
--                         (assíncrono, sem diálogo, maioria segue relator)
--   COLEGIADA_REAL_PP:    genuinamente colegiado
--                         (síncrono, debate real, sustentação oral)
--
-- NÃO-DECISÃO (conceito central — Medina, 2026):
--   79% das decisões do STF são não-decisões
--   Decisões sobre admissibilidade que jamais tocam o mérito
--   Tomadas monocraticamente pela Presidência, em ambiente virtual
--   Por cargo bienal rotativo, fora do colegiado
--   O cidadão nunca obteve pronunciamento sobre seu direito
--   Isso é design institucional, não ineficiência
-- ============================================================


-- ============================================================
-- PARTE 1: ENUMERAÇÕES (tipos controlados)
-- ============================================================

-- Tipos de evento na string de um nó
CREATE TYPE tipo_evento_string AS ENUM (
  -- Ancoragem institucional
  'DISTRIBUICAO',                  -- Presidência distribui ao relator (todos os nós)
  'REDISTRIBUICAO',                -- mudança de relator posterior
  'MUDANCA_ORGAO',                 -- redistribuição de órgão (Turma→Plenário etc.)
  'MUDANCA_CLASSE',                -- ARE→RE quando admitido (transformação do nó)

  -- Admissibilidade
  'DECISAO_ADMISSIBILIDADE_ARE',   -- Presidência: nega ou admite ARE
  'DECISAO_ADMISSIBILIDADE_AI',    -- Presidência: nega ou admite AI (CPC/1973)

  -- Repercussão geral
  'DECISAO_RG_RECONHECIDA',        -- RG reconhecida (Plenário Virtual)
  'DECISAO_RG_NEGADA',             -- RG negada (extinção do processo)
  'AUSENCIA_RG_FORMAL',            -- RE julgado sem RG formal registrada = campo de estudo

  -- Controle de pauta e destaque
  'DESTAQUE_MINISTRO',             -- qualquer ministro puxa do PV para presencial
  'INCLUSAO_PAUTA_PP',             -- presidente do órgão inclui na pauta presencial
  'SOBRESTAMENTO_RG',              -- sobrestado aguardando paradigma de RG
  'DESOBRESTAMENTO_RG',            -- liberado após julgamento do paradigma

  -- Decisões de mérito
  'DECISAO_MONOCRATICA',           -- relator ou presidente, qualquer órgão
  'DECISAO_TURMA_PV',              -- acórdão Turma Virtual
  'DECISAO_TURMA_PP',              -- acórdão Turma Presencial
  'DECISAO_PLENARIO_PV',           -- acórdão Plenário Virtual
  'DECISAO_PLENARIO_PP',           -- acórdão Plenário Presencial

  -- Encerramento
  'BAIXA'                          -- processo baixado ao tribunal de origem
);

-- Resultado de decisão
CREATE TYPE resultado_decisao AS ENUM (
  'ADMITIDO',
  'NEGADO_SEGUIMENTO',
  'NAO_CONHECIDO',
  'PROVIDO',
  'DESPROVIDO',
  'PARCIALMENTE_PROVIDO',
  'PREJUDICADO',
  'RG_RECONHECIDA',
  'RG_NEGADA',
  'CONVERTIDO',     -- ARE convertido em RE
  'SOBRESTADO',
  'HOMOLOGADO',
  'PENDENTE'
);

-- Fluxo de entrada do processo no STF
CREATE TYPE fluxo_entrada_stf AS ENUM (
  'RE_DIRETO',        -- tribunal origem admitiu, RE chegou inteiro
  'ARE_NEGADO',       -- ARE negado pela Presidência = NÃO-DECISÃO primária
  'ARE_ADMITIDO_RE',  -- ARE admitido, virou RE, mérito possível
  'ARE_PENDENTE',     -- ARE em tramitação, desfecho não definido
  'AI_NEGADO',        -- AI negado CPC/1973 (equivalente histórico do ARE_NEGADO)
  'AI_ADMITIDO_RE',   -- AI admitido, virou RE (CPC/1973)
  'ORIGINARIA'        -- ADI, ADPF, HC, MS, ACO, AP, Inq, Ext...
);

-- Natureza da colegialidade — dimensão analítica central
CREATE TYPE natureza_colegialidade AS ENUM (
  'MONOCRATICA',
  -- 1 ministro decide
  -- Ex: Presidência nega ARE; relator decide monocraticamente

  'COLEGIADA_FORMAL_PV',
  -- Formalmente colegiada (11 ou 5 ministros votam)
  -- Materialmente monocrática (votos assíncronos, sem diálogo,
  -- sem deliberação, maioria segue o relator)
  -- Ex: Turma Virtual, Plenário Virtual

  'COLEGIADA_REAL_PP'
  -- Genuinamente colegiada
  -- Debate síncrono, sustentação oral possível,
  -- votação em tempo real, deliberação real
  -- Ex: Turma Presencial, Plenário Presencial
);


-- ============================================================
-- PARTE 2: TABELAS DE REFERÊNCIA
-- ============================================================

-- ------------------------------------------------------------
-- 2.1 tribunal
-- Representa a instituição (STF, STJ, TST, TSE, STM)
-- ------------------------------------------------------------
CREATE TABLE tribunal (
  id        text PRIMARY KEY,   -- 'STF', 'STJ', 'TST', 'TSE', 'STM'
  nome      text NOT NULL,
  sigla     text NOT NULL,
  tipo      text NOT NULL,      -- 'SUPERIOR' | 'ESTADUAL' | 'FEDERAL'
  ativo     boolean DEFAULT true,
  criado_em timestamptz DEFAULT now()
);

INSERT INTO tribunal (id, nome, sigla, tipo) VALUES
  ('STF', 'Supremo Tribunal Federal',       'STF', 'SUPERIOR'),
  ('STJ', 'Superior Tribunal de Justiça',   'STJ', 'SUPERIOR'),
  ('TST', 'Tribunal Superior do Trabalho',  'TST', 'SUPERIOR'),
  ('TSE', 'Tribunal Superior Eleitoral',    'TSE', 'SUPERIOR'),
  ('STM', 'Superior Tribunal Militar',      'STM', 'SUPERIOR');


-- ------------------------------------------------------------
-- 2.2 orgao_julgador
-- Órgãos de cada tribunal com composição histórica
-- STF: PR, VP, 1T, 2T, PL, MC
-- STJ: PR, VP, CE, 1S-3S, 1T-6T, MC
-- ------------------------------------------------------------
CREATE TABLE orgao_julgador (
  id              serial PRIMARY KEY,
  tribunal_id     text NOT NULL REFERENCES tribunal(id),
  sigla           text NOT NULL,
  nome_completo   text NOT NULL,
  tipo_orgao      text NOT NULL,
  -- 'PRESIDENCIA' | 'VICE_PRESIDENCIA' | 'TURMA' | 'SECAO'
  -- 'PLENARIO' | 'CORTE_ESPECIAL' | 'MONOCRATICA'
  composicao_max  int,          -- nº de ministros no órgão
  ativo           boolean DEFAULT true,
  data_criacao    date,
  data_extincao   date,
  observacao      text,
  UNIQUE (tribunal_id, sigla)
);

-- STF
INSERT INTO orgao_julgador (tribunal_id, sigla, nome_completo, tipo_orgao, composicao_max) VALUES
  ('STF', 'PR', 'Presidência do STF',       'PRESIDENCIA',       1),
  ('STF', 'VP', 'Vice-Presidência do STF',  'VICE_PRESIDENCIA',  1),
  ('STF', '1T', 'Primeira Turma',           'TURMA',             5),
  ('STF', '2T', 'Segunda Turma',            'TURMA',             5),
  ('STF', 'PL', 'Plenário',                 'PLENARIO',         11),
  ('STF', 'MC', 'Decisão Monocrática',      'MONOCRATICA',       1);

-- STJ
INSERT INTO orgao_julgador (tribunal_id, sigla, nome_completo, tipo_orgao, composicao_max) VALUES
  ('STJ', 'PR', 'Presidência do STJ',       'PRESIDENCIA',       1),
  ('STJ', 'VP', 'Vice-Presidência do STJ',  'VICE_PRESIDENCIA',  1),
  ('STJ', 'CE', 'Corte Especial',           'CORTE_ESPECIAL',   15),
  ('STJ', '1S', 'Primeira Seção',           'SECAO',             9),
  ('STJ', '2S', 'Segunda Seção',            'SECAO',             9),
  ('STJ', '3S', 'Terceira Seção',           'SECAO',             9),
  ('STJ', '1T', 'Primeira Turma',           'TURMA',             5),
  ('STJ', '2T', 'Segunda Turma',            'TURMA',             5),
  ('STJ', '3T', 'Terceira Turma',           'TURMA',             5),
  ('STJ', '4T', 'Quarta Turma',             'TURMA',             5),
  ('STJ', '5T', 'Quinta Turma',             'TURMA',             5),
  ('STJ', '6T', 'Sexta Turma',              'TURMA',             5),
  ('STJ', 'MC', 'Decisão Monocrática',      'MONOCRATICA',       1);


-- ------------------------------------------------------------
-- 2.3 ministro_tribunal
-- Ministros por tribunal com datas de posse e saída
-- ------------------------------------------------------------
CREATE TABLE ministro_tribunal (
  id              serial PRIMARY KEY,
  tribunal_id     text NOT NULL REFERENCES tribunal(id),
  nome_canonical  text NOT NULL,
  nome_completo   text,
  data_posse      date,
  data_saida      date,
  motivo_saida    text,   -- 'APOSENTADORIA' | 'FALECIMENTO' | 'EXONERACAO'
  indicado_por    text,
  UNIQUE (tribunal_id, nome_canonical, data_posse)
);

-- STF ministros ativos
INSERT INTO ministro_tribunal (tribunal_id, nome_canonical, data_posse, indicado_por) VALUES
  ('STF', 'Luís Roberto Barroso', '2013-06-26', 'Dilma Rousseff'),
  ('STF', 'Edson Fachin',         '2015-06-16', 'Dilma Rousseff'),
  ('STF', 'Alexandre de Moraes',  '2017-03-22', 'Michel Temer'),
  ('STF', 'Gilmar Mendes',        '2002-06-20', 'Fernando Henrique Cardoso'),
  ('STF', 'Cármen Lúcia',         '2006-06-21', 'Lula'),
  ('STF', 'Dias Toffoli',         '2009-10-23', 'Lula'),
  ('STF', 'Luiz Fux',             '2011-03-03', 'Dilma Rousseff'),
  ('STF', 'Nunes Marques',        '2020-11-05', 'Jair Bolsonaro'),
  ('STF', 'André Mendonça',       '2021-12-16', 'Jair Bolsonaro'),
  ('STF', 'Cristiano Zanin',      '2023-06-22', 'Lula'),
  ('STF', 'Flávio Dino',          '2024-01-22', 'Lula');


-- ------------------------------------------------------------
-- 2.4 composicao_temporal
-- Quem exercia qual cargo em qual período
-- Universal: STF + STJ com mesma estrutura
-- Fonte primária: Presidentes_stf.docx (auditado = true)
-- ------------------------------------------------------------
CREATE TABLE composicao_temporal (
  id          serial PRIMARY KEY,
  tribunal_id text NOT NULL REFERENCES tribunal(id),
  ministro    text NOT NULL,      -- nome_canonical
  cargo       text NOT NULL,
  -- STF: 'Ministro' | 'Presidente STF' | 'Vice-Presidente STF'
  --      'Presidente 1ª Turma' | 'Presidente 2ª Turma'
  -- STJ: 'Ministro' | 'Presidente STJ' | ... (mesmo padrão)
  orgao_id    int REFERENCES orgao_julgador(id),
  data_inicio date NOT NULL,
  data_fim    date,               -- NULL = cargo atual
  auditado    boolean DEFAULT false,
  fonte_doc   text,
  observacao  text,
  criado_em   timestamptz DEFAULT now()
);

CREATE INDEX idx_composicao_tribunal_cargo
  ON composicao_temporal (tribunal_id, cargo, data_inicio, data_fim);
CREATE INDEX idx_composicao_ministro
  ON composicao_temporal (ministro, data_inicio, data_fim);

-- PRESIDÊNCIA DO STF — fonte verificada: Presidentes_stf.docx
INSERT INTO composicao_temporal (tribunal_id, ministro, cargo, data_inicio, data_fim, auditado, fonte_doc) VALUES
  ('STF', 'Néri da Silveira',     'Presidente STF', '1989-10-01', '1991-04-02', true, 'Presidentes_stf.docx'),
  ('STF', 'Sydney Sanches',       'Presidente STF', '1991-04-03', '1993-04-07', true, 'Presidentes_stf.docx'),
  ('STF', 'Octavio Gallotti',     'Presidente STF', '1993-04-08', '1995-04-04', true, 'Presidentes_stf.docx'),
  ('STF', 'Sepúlveda Pertence',   'Presidente STF', '1995-04-05', '1997-04-22', true, 'Presidentes_stf.docx'),
  ('STF', 'Celso de Mello',       'Presidente STF', '1997-04-23', '1999-04-14', true, 'Presidentes_stf.docx'),
  ('STF', 'Carlos Velloso',       'Presidente STF', '1999-04-15', '2001-05-23', true, 'Presidentes_stf.docx'),
  ('STF', 'Marco Aurélio',        'Presidente STF', '2001-05-24', '2003-05-14', true, 'Presidentes_stf.docx'),
  ('STF', 'Maurício Corrêa',      'Presidente STF', '2003-05-15', '2004-04-21', true, 'Presidentes_stf.docx'),
  ('STF', 'Nelson Jobim',         'Presidente STF', '2004-04-22', '2006-03-29', true, 'Presidentes_stf.docx'),
  ('STF', 'Ellen Gracie',         'Presidente STF', '2006-04-20', '2008-04-22', true, 'Presidentes_stf.docx'),
  ('STF', 'Gilmar Mendes',        'Presidente STF', '2008-04-23', '2010-04-22', true, 'Presidentes_stf.docx'),
  ('STF', 'Cezar Peluso',         'Presidente STF', '2010-04-23', '2012-04-11', true, 'Presidentes_stf.docx'),
  ('STF', 'Ayres Britto',         'Presidente STF', '2012-04-12', '2012-11-16', true, 'Presidentes_stf.docx'),
  ('STF', 'Joaquim Barbosa',      'Presidente STF', '2012-11-22', '2014-07-31', true, 'Presidentes_stf.docx'),
  ('STF', 'Ricardo Lewandowski',  'Presidente STF', '2014-09-10', '2016-10-11', true, 'Presidentes_stf.docx'),
  ('STF', 'Cármen Lúcia',         'Presidente STF', '2016-10-12', '2018-10-12', true, 'Presidentes_stf.docx'),
  ('STF', 'Dias Toffoli',         'Presidente STF', '2018-10-12', '2020-10-22', true, 'Presidentes_stf.docx'),
  ('STF', 'Luiz Fux',             'Presidente STF', '2020-10-22', '2022-10-12', true, 'Presidentes_stf.docx'),
  ('STF', 'Rosa Weber',           'Presidente STF', '2022-10-12', '2023-09-27', true, 'Presidentes_stf.docx'),
  ('STF', 'Luís Roberto Barroso', 'Presidente STF', '2023-09-28', '2025-10-22', true, 'Presidentes_stf.docx'),
  ('STF', 'Edson Fachin',         'Presidente STF', '2025-10-23', NULL,         true, 'Presidentes_stf.docx');

-- VICE-PRESIDÊNCIA DO STF — auditado=false, verificar contra fonte primária
INSERT INTO composicao_temporal (tribunal_id, ministro, cargo, data_inicio, data_fim, auditado) VALUES
  ('STF', 'Cezar Peluso',         'Vice-Presidente STF', '2008-04-23', '2010-04-22', false),
  ('STF', 'Ayres Britto',         'Vice-Presidente STF', '2010-04-23', '2012-04-11', false),
  ('STF', 'Joaquim Barbosa',      'Vice-Presidente STF', '2012-04-12', '2012-11-21', false),
  ('STF', 'Ricardo Lewandowski',  'Vice-Presidente STF', '2012-11-22', '2014-09-09', false),
  ('STF', 'Cármen Lúcia',         'Vice-Presidente STF', '2014-09-10', '2016-10-11', false),
  ('STF', 'Dias Toffoli',         'Vice-Presidente STF', '2016-10-12', '2018-10-11', false),
  ('STF', 'Luiz Fux',             'Vice-Presidente STF', '2018-10-12', '2020-10-21', false),
  ('STF', 'Rosa Weber',           'Vice-Presidente STF', '2020-10-22', '2022-10-11', false),
  ('STF', 'Luís Roberto Barroso', 'Vice-Presidente STF', '2022-10-12', '2023-09-27', false),
  ('STF', 'Edson Fachin',         'Vice-Presidente STF', '2023-09-28', '2025-10-22', false),
  ('STF', 'Alexandre de Moraes',  'Vice-Presidente STF', '2025-10-23', NULL,         false);

-- PRESIDÊNCIA 1ª TURMA — bienal, auditado=false (inferido, verificar)
-- Fonte: Presidentes_stf_turmas.docx confirma composição atual
INSERT INTO composicao_temporal (tribunal_id, ministro, cargo, data_inicio, data_fim, auditado, fonte_doc) VALUES
  ('STF', 'Celso de Mello',         'Presidente 1ª Turma', '2000-02-01', '2002-02-01', false, NULL),
  ('STF', 'Marco Aurélio',          'Presidente 1ª Turma', '2002-02-01', '2004-02-01', false, NULL),
  ('STF', 'Sepúlveda Pertence',     'Presidente 1ª Turma', '2004-02-01', '2006-02-01', false, NULL),
  ('STF', 'Celso de Mello',         'Presidente 1ª Turma', '2006-02-01', '2008-02-01', false, NULL),
  ('STF', 'Marco Aurélio',          'Presidente 1ª Turma', '2008-02-01', '2010-02-01', false, NULL),
  ('STF', 'Cármen Lúcia',           'Presidente 1ª Turma', '2010-02-01', '2012-02-01', false, NULL),
  ('STF', 'Luiz Fux',               'Presidente 1ª Turma', '2012-02-01', '2014-02-01', false, NULL),
  ('STF', 'Marco Aurélio',          'Presidente 1ª Turma', '2014-02-01', '2016-02-01', false, NULL),
  ('STF', 'Celso de Mello',         'Presidente 1ª Turma', '2016-02-01', '2018-02-01', false, NULL),
  ('STF', 'Alexandre de Moraes',    'Presidente 1ª Turma', '2018-02-01', '2020-02-01', false, NULL),
  ('STF', 'Rosa Weber',             'Presidente 1ª Turma', '2020-02-01', '2022-02-01', false, NULL),
  ('STF', 'Luís Roberto Barroso',   'Presidente 1ª Turma', '2022-02-01', '2024-02-01', false, NULL),
  ('STF', 'Cristiano Zanin',        'Presidente 1ª Turma', '2024-02-01', '2026-01-31', true,  'Presidentes_stf_turmas.docx'),
  ('STF', 'Flávio Dino',            'Presidente 1ª Turma', '2026-02-01', NULL,         true,  'Presidentes_stf_turmas.docx');

-- PRESIDÊNCIA 2ª TURMA — bienal, auditado=false (inferido, verificar)
INSERT INTO composicao_temporal (tribunal_id, ministro, cargo, data_inicio, data_fim, auditado, fonte_doc) VALUES
  ('STF', 'Nelson Jobim',          'Presidente 2ª Turma', '2000-02-01', '2002-02-01', false, NULL),
  ('STF', 'Maurício Corrêa',       'Presidente 2ª Turma', '2002-02-01', '2004-02-01', false, NULL),
  ('STF', 'Gilmar Mendes',         'Presidente 2ª Turma', '2004-02-01', '2006-02-01', false, NULL),
  ('STF', 'Gilmar Mendes',         'Presidente 2ª Turma', '2006-02-01', '2008-02-01', false, NULL),
  ('STF', 'Celso de Mello',        'Presidente 2ª Turma', '2008-02-01', '2010-02-01', false, NULL),
  ('STF', 'Ayres Britto',          'Presidente 2ª Turma', '2010-02-01', '2012-02-01', false, NULL),
  ('STF', 'Joaquim Barbosa',       'Presidente 2ª Turma', '2012-02-01', '2014-02-01', false, NULL),
  ('STF', 'Ricardo Lewandowski',   'Presidente 2ª Turma', '2014-02-01', '2016-02-01', false, NULL),
  ('STF', 'Dias Toffoli',          'Presidente 2ª Turma', '2016-02-01', '2018-02-01', false, NULL),
  ('STF', 'Edson Fachin',          'Presidente 2ª Turma', '2018-02-01', '2020-02-01', false, NULL),
  ('STF', 'Dias Toffoli',          'Presidente 2ª Turma', '2020-02-01', '2022-02-01', false, NULL),
  ('STF', 'Luiz Fux',              'Presidente 2ª Turma', '2022-02-01', '2024-02-01', false, NULL),
  ('STF', 'Nunes Marques',         'Presidente 2ª Turma', '2024-02-01', '2026-01-31', true,  'Presidentes_stf_turmas.docx'),
  ('STF', 'Gilmar Mendes',         'Presidente 2ª Turma', '2026-02-01', NULL,         true,  'Presidentes_stf_turmas.docx');

-- MINISTROS como membros — STF CF/88
INSERT INTO composicao_temporal (tribunal_id, ministro, cargo, data_inicio, data_fim, auditado) VALUES
  -- Ativos
  ('STF', 'Luís Roberto Barroso', 'Ministro', '2013-06-26', NULL,         true),
  ('STF', 'Edson Fachin',         'Ministro', '2015-06-16', NULL,         true),
  ('STF', 'Alexandre de Moraes',  'Ministro', '2017-03-22', NULL,         true),
  ('STF', 'Gilmar Mendes',        'Ministro', '2002-06-20', NULL,         true),
  ('STF', 'Cármen Lúcia',         'Ministro', '2006-06-21', NULL,         true),
  ('STF', 'Dias Toffoli',         'Ministro', '2009-10-23', NULL,         true),
  ('STF', 'Nunes Marques',        'Ministro', '2020-11-05', NULL,         true),
  ('STF', 'André Mendonça',       'Ministro', '2021-12-16', NULL,         true),
  ('STF', 'Cristiano Zanin',      'Ministro', '2023-06-22', NULL,         true),
  ('STF', 'Flávio Dino',          'Ministro', '2024-01-22', NULL,         true),
  -- Luiz Fux: era 1ªT, migrou para 2ªT em 2024
  ('STF', 'Luiz Fux',             'Ministro', '2011-03-03', '2024-09-30', true),
  ('STF', 'Luiz Fux',             'Ministro', '2024-10-01', NULL,         false),
  -- Aposentados/Falecidos
  ('STF', 'Celso de Mello',       'Ministro', '1989-08-17', '2020-10-13', true),
  ('STF', 'Marco Aurélio',        'Ministro', '1990-06-13', '2021-07-05', true),
  ('STF', 'Rosa Weber',           'Ministro', '2011-12-19', '2023-09-30', true),
  ('STF', 'Ricardo Lewandowski',  'Ministro', '2006-03-16', '2024-04-30', true),
  ('STF', 'Joaquim Barbosa',      'Ministro', '2003-06-25', '2014-07-31', true),
  ('STF', 'Ayres Britto',         'Ministro', '2003-06-25', '2012-11-17', true),
  ('STF', 'Cezar Peluso',         'Ministro', '2003-06-25', '2012-08-31', true),
  ('STF', 'Ellen Gracie',         'Ministro', '2000-12-14', '2011-08-05', true),
  ('STF', 'Nelson Jobim',         'Ministro', '1997-04-15', '2006-03-29', true),
  ('STF', 'Sepúlveda Pertence',   'Ministro', '1989-05-17', '2007-08-17', true),
  ('STF', 'Néri da Silveira',     'Ministro', '1981-09-01', '2002-04-24', true),
  ('STF', 'Octavio Gallotti',     'Ministro', '1984-11-20', '2000-10-28', true),
  ('STF', 'Sydney Sanches',       'Ministro', '1984-08-31', '2003-04-27', true),
  ('STF', 'Carlos Velloso',       'Ministro', '1990-06-13', '2006-01-19', true),
  ('STF', 'Maurício Corrêa',      'Ministro', '1994-12-15', '2004-04-21', true),
  ('STF', 'Ilmar Galvão',         'Ministro', '1991-06-26', '2003-05-03', true),
  ('STF', 'Eros Grau',            'Ministro', '2004-06-30', '2010-07-30', true),
  ('STF', 'Menezes Direito',      'Ministro', '2007-09-05', '2009-09-01', true),
  ('STF', 'Teori Zavascki',       'Ministro', '2012-11-29', '2017-01-19', true);


-- ------------------------------------------------------------
-- 2.5 classe_processual
-- Catálogo de classes com hierarquia recursal declarada
-- origem_externa = true: o processo pai está FORA do STF
-- (ARE não é filho do RE no STF — o RE ficou na origem)
-- ------------------------------------------------------------
CREATE TABLE classe_processual (
  id                    serial PRIMARY KEY,
  tribunal_id           text NOT NULL REFERENCES tribunal(id),
  sigla                 text NOT NULL,
  nome_completo         text NOT NULL,
  tipo_acao             text NOT NULL,
  -- 'ORIGINARIA' | 'RECURSAL' | 'INCIDENTE' | 'CAUTELAR' | 'ADMINISTRATIVO'
  classe_pai_sigla      text,       -- sigla da classe pai (NULL = raiz ou polimórfico)
  nivel_recursal        int DEFAULT 0,
  -- 0 = originárias e recursais primárias
  -- 1 = primeiro recurso interno (ARE, AI, AgR)
  -- 2 = segundo recurso (AgInt, EDcl)
  -- 3 = terceiro recurso (AgInt no EDcl, etc.)
  cpc_aplicavel         text,       -- 'CPC1973' | 'CPC2015' | 'AMBOS'
  origem_externa        boolean DEFAULT false,
  -- true: o processo que originou este está FORA do tribunal
  -- ARE: o RE ficou no tribunal de origem
  -- AREsp: o REsp ficou no tribunal de origem
  descricao_ancoragem   text,       -- explica a ontologia da ancoragem
  ativo                 boolean DEFAULT true,
  observacao            text,
  UNIQUE (tribunal_id, sigla)
);

-- STF
INSERT INTO classe_processual
  (tribunal_id, sigla, nome_completo, tipo_acao, classe_pai_sigla, nivel_recursal, cpc_aplicavel, origem_externa, descricao_ancoragem, observacao)
VALUES
-- Nível 0 — originárias e recursais primárias
('STF','ADI',  'Ação Direta de Inconstitucionalidade',           'ORIGINARIA',    NULL,  0,'AMBOS',    false, NULL, NULL),
('STF','ADC',  'Ação Declaratória de Constitucionalidade',       'ORIGINARIA',    NULL,  0,'AMBOS',    false, NULL, NULL),
('STF','ADPF', 'Arguição de Descumprimento de Preceito Fundamental','ORIGINARIA', NULL,  0,'AMBOS',    false, NULL, NULL),
('STF','ADO',  'Ação Direta de Inconstitucionalidade por Omissão','ORIGINARIA',   NULL,  0,'AMBOS',    false, NULL, NULL),
('STF','ACO',  'Ação Cível Originária',                          'ORIGINARIA',    NULL,  0,'AMBOS',    false, NULL, NULL),
('STF','HC',   'Habeas Corpus',                                  'ORIGINARIA',    NULL,  0,'AMBOS',    false, NULL, NULL),
('STF','MS',   'Mandado de Segurança',                           'ORIGINARIA',    NULL,  0,'AMBOS',    false, NULL, NULL),
('STF','MI',   'Mandado de Injunção',                            'ORIGINARIA',    NULL,  0,'AMBOS',    false, NULL, NULL),
('STF','HD',   'Habeas Data',                                    'ORIGINARIA',    NULL,  0,'AMBOS',    false, NULL, NULL),
('STF','RE',   'Recurso Extraordinário',                         'RECURSAL',      NULL,  0,'AMBOS',    false,
  'RE admitido pelo tribunal de origem chega inteiro ao STF. '
  'O tribunal de origem já reconheceu matéria constitucional controvertida.',
  NULL),
('STF','RHC',  'Recurso em Habeas Corpus',                       'RECURSAL',      NULL,  0,'AMBOS',    false, NULL, NULL),
('STF','Rcl',  'Reclamação',                                     'INCIDENTE',     NULL,  0,'AMBOS',    false, NULL, NULL),
('STF','Ext',  'Extradição',                                     'ORIGINARIA',    NULL,  0,'AMBOS',    false, NULL, NULL),
('STF','AP',   'Ação Penal',                                     'ORIGINARIA',    NULL,  0,'AMBOS',    false, NULL, NULL),
('STF','Inq',  'Inquérito',                                      'ORIGINARIA',    NULL,  0,'AMBOS',    false, NULL, NULL),
('STF','Pet',  'Petição',                                        'ADMINISTRATIVO',NULL,  0,'AMBOS',    false, NULL, NULL),
('STF','AC',   'Ação Cautelar',                                  'CAUTELAR',      NULL,  0,'AMBOS',    false, NULL, NULL),

-- Nível 1 — primeiro recurso (ARE e AI têm origem_externa = true)
('STF','ARE', 'Agravo em Recurso Extraordinário',  'RECURSAL', NULL, 1, 'CPC2015', true,
  'O ARE NÃO é filho do RE no STF. '
  'O RE foi inadmitido pelo tribunal de origem. '
  'O ARE questiona essa inadmissão diretamente no STF. '
  'Se negado: NÃO-DECISÃO primária — o RE fica represado na origem para sempre. '
  'Se admitido: o nó se transforma (ARE→RE), mesma classe, string continua.',
  'CPC/2015 art. 1.042. Substitui o AI (Lei 12.322/2010). '
  'Presidência nega ≈85% = NÃO-DECISÃO sobre admissibilidade.'),

('STF','AI',  'Agravo de Instrumento',             'RECURSAL', NULL, 1, 'CPC1973', true,
  'Equivalente histórico do ARE no CPC/1973. '
  'O RE foi inadmitido na origem. O AI questiona essa inadmissão. '
  'Substituído pelo ARE pela Lei 12.322/2010.',
  'CPC/1973. Extinto para novos recursos a partir de 2010.'),

('STF','AgR', 'Agravo Regimental',                 'INCIDENTE',NULL, 1, 'CPC1973', false,
  'Polimórfico: pode ser filho de qualquer decisão monocrática. '
  'Substituído pelo AgInt no CPC/2015.',
  NULL),

-- Nível 2
('STF','AgInt',    'Agravo Interno',                           'INCIDENTE','ARE', 2,'CPC2015', false,
  'Filho de decisão monocrática no ARE ou em qualquer processo CPC/2015. '
  'Leva ao colegiado a decisão monocrática do relator ou presidente.',
  NULL),
('STF','EDcl',     'Embargos de Declaração',                  'INCIDENTE',NULL,  2,'AMBOS',   false,
  'Polimórfico: filho de qualquer acórdão ou decisão. '
  'Alega omissão, contradição, obscuridade ou erro material.',
  NULL),

-- Nível 3
('STF','AgR-EDcl',  'Agravo Regimental em Embargos de Declaração',  'INCIDENTE','EDcl',3,'CPC1973',false,NULL,NULL),
('STF','AgInt-EDcl','Agravo Interno em Embargos de Declaração',     'INCIDENTE','EDcl',3,'CPC2015',false,NULL,NULL);

-- STJ
INSERT INTO classe_processual
  (tribunal_id, sigla, nome_completo, tipo_acao, classe_pai_sigla, nivel_recursal, cpc_aplicavel, origem_externa, descricao_ancoragem)
VALUES
('STJ','REsp',  'Recurso Especial',              'RECURSAL',      NULL,   0,'AMBOS',   false, NULL),
('STJ','HC',    'Habeas Corpus',                 'ORIGINARIA',    NULL,   0,'AMBOS',   false, NULL),
('STJ','RHC',   'Recurso em Habeas Corpus',      'RECURSAL',      NULL,   0,'AMBOS',   false, NULL),
('STJ','MS',    'Mandado de Segurança',          'ORIGINARIA',    NULL,   0,'AMBOS',   false, NULL),
('STJ','CC',    'Conflito de Competência',       'INCIDENTE',     NULL,   0,'AMBOS',   false, NULL),
('STJ','Rcl',   'Reclamação',                    'INCIDENTE',     NULL,   0,'AMBOS',   false, NULL),
('STJ','Pet',   'Petição',                       'ADMINISTRATIVO',NULL,   0,'AMBOS',   false, NULL),
('STJ','EREsp', 'Embargos de Divergência em REsp','RECURSAL',    'REsp',  1,'AMBOS',   false, NULL),
('STJ','AREsp', 'Agravo em Recurso Especial',    'RECURSAL',      NULL,   1,'CPC2015', true,
  'O AREsp NÃO é filho do REsp no STJ. '
  'O REsp foi inadmitido pelo tribunal de origem. '
  'Mesma ontologia do ARE no STF.'),
('STJ','AgRg',  'Agravo Regimental',             'INCIDENTE',     NULL,   1,'CPC1973', false, NULL),
('STJ','AgInt', 'Agravo Interno',                'INCIDENTE',    'AREsp', 2,'CPC2015', false, NULL),
('STJ','EDcl',  'Embargos de Declaração',        'INCIDENTE',     NULL,   2,'AMBOS',   false, NULL);


-- ------------------------------------------------------------
-- 2.6 tipo_vinculo_recursal
-- Semântica de cada aresta no grafo de processos
-- ------------------------------------------------------------
CREATE TABLE tipo_vinculo_recursal (
  codigo        text PRIMARY KEY,
  nome          text NOT NULL,
  descricao     text NOT NULL,
  gera_no_stf   boolean DEFAULT false,
  -- true: este vínculo origina um processo NO tribunal
  -- false: vínculo interno entre processos já existentes
  e_nao_decisao boolean DEFAULT false
  -- true: o desfecho típico é uma não-decisão de mérito
);

INSERT INTO tipo_vinculo_recursal VALUES
('INADMISSAO_ORIGEM',
 'RE inadmitido na origem → ARE/AI no STF',
 'O tribunal de origem inadmitiu o RE/REsp. A parte recorre ao STF/STJ via ARE/AREsp. '
 'O processo raiz está FORA do STF. '
 'A decisão do STF é sobre admissibilidade da inadmissão, não sobre mérito.',
 true, true),
('AGRAVO_MONOCRATICO',
 'Decisão monocrática → AgInt/AgR',
 'Relator ou presidente negou seguimento monocraticamente. '
 'Parte interpõe AgInt (CPC/2015) ou AgR (CPC/1973) para levar ao colegiado. '
 'Processo interno ao tribunal.',
 false, false),
('EMBARGOS_ACORDAO',
 'Acórdão → EDcl',
 'Embargos de declaração sobre acórdão colegiado ou monocrático. '
 'Alegação de omissão, contradição, obscuridade ou erro material.',
 false, false),
('RECLAMACAO_VINCULADA',
 'Processo → Rcl',
 'Reclamação vinculada a processo anterior. '
 'Alega descumprimento de decisão do tribunal ou usurpação de competência.',
 false, false),
('CAUTELAR_PREPARATORIA',
 'AC preparatória',
 'Ação cautelar preparatória antes do processo principal. '
 'Vinculada ao processo que será distribuído posteriormente.',
 false, false),
('CONVERSAO_ARE_RE',
 'ARE admitido → RE (transformação do nó)',
 'STF deu provimento ao ARE: admitiu o RE. '
 'O nó NÃO é substituído — ele se transforma. '
 'classe_atual muda de ARE para RE, incidente permanece o mesmo, '
 'string continua. Exceção à regra: aqui o ARE gerou um RE dentro do STF.',
 false, false),
('RG_SOBRESTAMENTO',
 'Leading case RG → processos sobrestados',
 'Um RE foi selecionado como paradigma de repercussão geral. '
 'Todos os ARE/RE sobre o mesmo tema ficam sobrestados à espera do julgamento.',
 false, true);


-- ------------------------------------------------------------
-- 2.7 taxonomia_nao_decisao
-- Graus da não-decisão como objeto teórico
-- ------------------------------------------------------------
CREATE TABLE taxonomia_nao_decisao (
  codigo              text PRIMARY KEY,
  nome                text NOT NULL,
  grau                int NOT NULL,
  fluxo_entrada       text NOT NULL,
  orgao_tipico        text NOT NULL,
  ambiente_tipico     text NOT NULL,
  colegial            boolean NOT NULL,
  toca_merito         boolean NOT NULL DEFAULT false,
  descricao           text NOT NULL,
  exemplo_andamento   text,
  pct_estimado        numeric(5,2),
  fonte_estimativa    text
);

INSERT INTO taxonomia_nao_decisao VALUES
('ND_P1_ARE_PRESIDENCIA',
 'Não-decisão primária — ARE negado pela Presidência',
 1, 'ARE_NEGADO', 'Presidência', 'Virtual', false, false,
 'ARE inadmitido monocraticamente pelo Presidente do STF em ambiente virtual. '
 'Decisão sobre admissibilidade da inadmissão proferida pelo tribunal de origem. '
 'O mérito do RE original NUNCA é examinado pelo STF. '
 'O RE fica represado no tribunal de origem. '
 'Representa a maior concentração de decisões do tribunal. '
 'Estruturalmente invisível nas análises que contam apenas decisões de mérito.',
 'Nego seguimento ao agravo.', 55.00, 'Estimativa parcial — confirmar com corpus'),

('ND_P1_AI_PRESIDENCIA',
 'Não-decisão primária — AI negado (CPC/1973)',
 1, 'AI_NEGADO', 'Presidência', 'Presencial', false, false,
 'Equivalente histórico do ARE_NEGADO sob o CPC/1973. '
 'AI negado pelo Presidente ou relator. '
 'Prevalente antes de 2010 (Lei 12.322 converteu AI em ARE).',
 'Nego seguimento ao agravo de instrumento.', 10.00, 'Histórico pré-2010'),

('ND_S2_AGINT_TURMA',
 'Não-decisão secundária — AgInt desprovido pela Turma',
 2, 'ARE_NEGADO', '1ª Turma ou 2ª Turma', 'Virtual', true, false,
 'AgInt interposto contra a não-decisão primária. '
 'Turma confirma a inadmissão em julgamento colegiado virtual. '
 'Formalmente colegiado, materialmente monocrático (votos assíncronos). '
 'Ainda não toca o mérito do RE original.',
 'Negaram provimento ao agravo interno. Decisão unânime.', 18.00, 'Estimativa parcial'),

('ND_S3_EDCL_AGINT',
 'Não-decisão terciária — EDcl rejeitado sobre AgInt desprovido',
 3, 'ARE_NEGADO', '1ª Turma ou 2ª Turma', 'Virtual', true, false,
 'Terceira camada sem exame de mérito. '
 'String: ARE → AgInt → EDcl. Três níveis processuais, '
 'zero pronunciamento sobre o direito material do cidadão.',
 'Rejeitaram os embargos de declaração.', 6.00, 'Estimativa parcial');


-- ------------------------------------------------------------
-- 2.8 poder_presidencia
-- Os poderes da Presidência como objetos ontológicos
-- Inclui poderes dos presidentes de Turma e o destaque
-- ------------------------------------------------------------
CREATE TABLE poder_presidencia (
  codigo                  text PRIMARY KEY,
  tribunal_id             text NOT NULL REFERENCES tribunal(id),
  orgao_sigla             text NOT NULL,
  nome                    text NOT NULL,
  descricao               text NOT NULL,
  tipo_evento_stf         tipo_evento_string,
  e_exclusivo_presidente  boolean DEFAULT true,
  observacao              text
);

INSERT INTO poder_presidencia VALUES
('PODER_DISTRIBUICAO', 'STF', 'PR',
 'Distribuição dos processos',
 'A Presidência distribui TODOS os processos que entram no STF ao relator e ao órgão. '
 'Ato que ancora o processo institucionalmente: define relator e órgão. '
 'Ponto de entrada obrigatório de toda string. '
 '100% dos processos passam aqui — recursais e originárias.',
 'DISTRIBUICAO', true,
 'Exercido sobre todos os processos sem exceção. '
 'É o primeiro evento da string de qualquer nó.'),

('PODER_FILTRO_ARE', 'STF', 'PR',
 'Filtro de admissibilidade do ARE',
 'A Presidência decide se o ARE será admitido ou negado. '
 'Se negado: NÃO-DECISÃO primária. O RE fica represado na origem para sempre. '
 'Se admitido: nó se transforma (ARE→RE), string continua, mérito possível. '
 'Exercido monocraticamente, em ambiente virtual. '
 'Concentra ≈85% dos AREs negados = >70% de todas as decisões do tribunal.',
 'DECISAO_ADMISSIBILIDADE_ARE', true,
 'Poder decisório de admissibilidade. '
 'Exercido pelo presidente do STF (cargo bienal rotativo).'),

('PODER_PAUTA_PP_STF', 'STF', 'PR',
 'Controle da pauta do Plenário Presencial',
 'O Presidente do STF decide o que entra na pauta do Plenário Presencial. '
 'Define o que será genuinamente deliberado (PP) vs. '
 'apenas formalmente colegiado (PV — materialmente monocrático). '
 'Poder sobre a natureza da colegialidade das decisões mais relevantes do tribunal.',
 'INCLUSAO_PAUTA_PP', true,
 'O destaque é necessário mas não suficiente — '
 'o presidente decide se e quando o processo entra na pauta PP.'),

('PODER_PAUTA_PP_1T', 'STF', '1T',
 'Controle da pauta da 1ª Turma Presencial',
 'O Presidente da 1ª Turma decide o que entra na pauta presencial da Turma. '
 'Poder análogo ao do Presidente STF sobre o Plenário, '
 'mas no âmbito da 1ª Turma.',
 'INCLUSAO_PAUTA_PP', true,
 'Bienal. Presidente atual: Flávio Dino (fev/2026).'),

('PODER_PAUTA_PP_2T', 'STF', '2T',
 'Controle da pauta da 2ª Turma Presencial',
 'O Presidente da 2ª Turma decide o que entra na pauta presencial da 2ª Turma.',
 'INCLUSAO_PAUTA_PP', true,
 'Bienal. Presidente atual: Gilmar Mendes (fev/2026).'),

('PODER_DESTAQUE', 'STF', 'PR',
 'Destaque — transferência do PV para presencial',
 'QUALQUER ministro (não apenas o presidente) pode destacar um processo '
 'do ambiente virtual para o presencial. '
 'O destaque é necessário mas não suficiente: '
 'o presidente do órgão precisa incluir na pauta presencial. '
 'Destaque sem inclusão em pauta = processo em limbo. '
 'Único mecanismo de contrapeso individual ao poder de pauta do presidente.',
 'DESTAQUE_MINISTRO', false,
 'e_exclusivo_presidente = false: qualquer ministro pode exercer. '
 'Campo "destaque" nos andamentos — a ser identificado no corpus.');


-- ============================================================
-- PARTE 3: TABELAS PRINCIPAIS (nós e strings)
-- ============================================================

-- ------------------------------------------------------------
-- 3.1 processo_no
-- O NÓ central do modelo
-- Identidade = incidente (imutável)
-- Classe = atributo corrente (pode mudar: ARE→RE)
-- ------------------------------------------------------------
CREATE TABLE processo_no (
  id                      serial PRIMARY KEY,
  tribunal_id             text NOT NULL REFERENCES tribunal(id),

  -- IDENTIDADE IMUTÁVEL (desde o protocolo de entrada)
  incidente               bigint NOT NULL,

  -- ATRIBUTOS DE NASCIMENTO (imutáveis — registram o estado original)
  classe_origem           text NOT NULL,   -- 'ARE', 'RE', 'ADI'...
  numero_origem           text NOT NULL,
  data_autuacao           date,            -- protocolo de entrada = nascimento do nó
  data_distribuicao       date,            -- distribuição ao relator

  -- ANCORAGEM INSTITUCIONAL NO NASCIMENTO
  relator_distribuicao    text,            -- relator quando distribuído
  orgao_distribuicao      text,            -- órgão quando distribuído

  -- ATRIBUTOS CORRENTES (podem mudar ao longo da vida do nó)
  classe_atual            text NOT NULL,   -- classe vigente
  numero_atual            text NOT NULL,   -- número vigente
  relator_atual           text,
  orgao_atual             text,
  situacao                text,            -- 'EM_TRAMITACAO' | 'BAIXADO' | 'SOBRESTADO'

  -- FLAG DE TRANSFORMAÇÃO (ARE virou RE)
  classe_alterada         boolean DEFAULT false,
  -- Se true: houve MUDANCA_CLASSE na string

  -- FLUXO DE ENTRADA (calculado pelo pipeline)
  fluxo_entrada           fluxo_entrada_stf,
  fluxo_definido_em       date,
  -- Data em que o fluxo foi determinado
  -- (data da decisão de admissão ou inadmissão)

  -- REPERCUSSÃO GERAL
  rg_formalmente_processada boolean DEFAULT false,
  -- true: andamento de RG reconhecida/negada existe na string
  rg_reconhecida          boolean,
  -- NULL = não processada; true = reconhecida; false = negada
  re_julgado_sem_rg       boolean DEFAULT false,
  -- true: RE foi julgado sem RG formal registrada
  -- CAMPO DE ESTUDO — pode indicar: paradigma presumido,
  -- RG não registrada no sistema, ou STF julgou sem enfrentar a preliminar

  -- VÍNCULO COM NÓ PAI (aresta do grafo)
  incidente_pai           bigint,
  -- incidente do nó que gerou este (AgInt aponta para ARE)
  classe_pai_origem       text,
  -- classe do nó pai quando este nó nasceu
  tipo_vinculo            text REFERENCES tipo_vinculo_recursal(codigo),

  -- VÍNCULO COM NÓ RAIZ (ancestral mais antigo na cadeia)
  incidente_raiz          bigint,
  classe_raiz_origem      text,
  nivel_na_cadeia         int DEFAULT 0,
  -- 0 = raiz (nó sem pai no tribunal)
  -- 1 = filho direto (ARE, AgInt sobre decisão raiz)
  -- 2 = neto (EDcl sobre AgInt)
  -- N = string longa

  -- ORIGEM EXTERNA (RE represado no tribunal de origem)
  origem_externa          boolean DEFAULT false,
  -- true: o processo que originou este ARE ficou fora do STF
  re_represado_numero     text,
  -- número do RE que ficou no tribunal de origem
  tribunal_origem_sigla   text,
  -- 'TJSP', 'TRF3', 'TRT2'...

  -- MÉTRICAS DA STRING (calculadas pelo pipeline)
  total_eventos           int DEFAULT 0,
  total_decisoes          int DEFAULT 0,
  comprimento_string      text,
  -- 'CURTA' (1-2 decisões) | 'MEDIA' (3-4) | 'LONGA' (5+)

  -- METADADOS
  fonte                   text DEFAULT 'crawler',
  criado_em               timestamptz DEFAULT now(),
  atualizado_em           timestamptz DEFAULT now(),

  UNIQUE (tribunal_id, incidente)
);

-- Índices de navegação no grafo
CREATE INDEX idx_no_incidente       ON processo_no (tribunal_id, incidente);
CREATE INDEX idx_no_pai             ON processo_no (tribunal_id, incidente_pai);
CREATE INDEX idx_no_raiz            ON processo_no (tribunal_id, incidente_raiz);
CREATE INDEX idx_no_classe_origem   ON processo_no (tribunal_id, classe_origem);
CREATE INDEX idx_no_classe_atual    ON processo_no (tribunal_id, classe_atual);
CREATE INDEX idx_no_fluxo           ON processo_no (tribunal_id, fluxo_entrada);
CREATE INDEX idx_no_nivel           ON processo_no (tribunal_id, nivel_na_cadeia);
CREATE INDEX idx_no_sem_rg          ON processo_no (tribunal_id, re_julgado_sem_rg)
  WHERE re_julgado_sem_rg = true;
CREATE INDEX idx_no_origem_externa  ON processo_no (tribunal_id, origem_externa)
  WHERE origem_externa = true;
CREATE INDEX idx_no_classe_alterada ON processo_no (tribunal_id, classe_alterada)
  WHERE classe_alterada = true;


-- ------------------------------------------------------------
-- 3.2 processo_string_evento
-- A STRING de eventos de cada nó, ordenada por seq
-- Cada linha é um momento na vida do processo
-- ------------------------------------------------------------
CREATE TABLE processo_string_evento (
  id                      serial PRIMARY KEY,
  tribunal_id             text NOT NULL REFERENCES tribunal(id),
  incidente               bigint NOT NULL,
  seq                     int NOT NULL,
  -- posição na string (1, 2, 3...)
  -- seq 1 = sempre DISTRIBUICAO (âncora institucional)

  -- TIPO DE EVENTO
  tipo_evento             tipo_evento_string NOT NULL,

  -- ANCORAGEM TEMPORAL
  data_evento             date NOT NULL,

  -- ANCORAGEM INSTITUCIONAL NO MOMENTO DO EVENTO
  orgao_no_evento         text,
  relator_no_evento       text,
  ambiente                text,
  -- 'Virtual' | 'Presencial' | 'Indefinido'

  -- NATUREZA DA COLEGIALIDADE (dimensão analítica central)
  natureza_colegialidade  natureza_colegialidade,
  -- Calculada a partir de tipo_evento + ambiente:
  --   DECISAO_MONOCRATICA              → MONOCRATICA
  --   DECISAO_ADMISSIBILIDADE_ARE      → MONOCRATICA
  --   DECISAO_*_PV                     → COLEGIADA_FORMAL_PV
  --   DECISAO_*_PP                     → COLEGIADA_REAL_PP

  -- PRESIDENTE DO STF E DO ÓRGÃO NO MOMENTO
  -- (preenchido pelo pipeline via JOIN com composicao_temporal)
  presidente_stf_no_evento    text,
  presidente_orgao_no_evento  text,
  -- presidente da Turma ou do Plenário no momento

  -- DADOS DA DECISÃO (quando tipo_evento envolve decisão)
  id_fato_decisao         bigint,
  -- FK para stf_decisoes.id — liga ao dado bruto original
  resultado               resultado_decisao,
  tipo_decisao_raw        text,
  -- valor original do campo tipo_decisao no dado bruto
  descricao_andamento     text,
  observacao_andamento    text,

  -- NÃO-DECISÃO (campos derivados, calculados pelo pipeline)
  e_nao_decisao           boolean DEFAULT false,
  -- true: decisão sobre admissibilidade sem tocar o mérito
  grau_nao_decisao        int,
  -- 1 = primária (Presidência nega ARE)
  -- 2 = secundária (Turma desprovê AgInt)
  -- 3 = terciária (EDcl rejeitado sobre AgInt)
  codigo_taxonomia        text REFERENCES taxonomia_nao_decisao(codigo),

  -- DADOS DE TRANSFORMAÇÃO (tipo_evento = MUDANCA_CLASSE)
  classe_anterior         text,   -- 'ARE'
  classe_nova             text,   -- 'RE'
  -- Quando ARE é admitido: classe_anterior='ARE', classe_nova='RE'
  -- O nó não é substituído — se transforma

  -- DADOS DE DESTAQUE E PAUTA
  ministro_destaque       text,
  -- quem destacou (qualquer ministro)
  presidente_orgao_pauta  text,
  -- quem incluiu na pauta PP (presidente do órgão)
  -- destaque sem pauta = processo em limbo

  -- DADOS DE REPERCUSSÃO GERAL
  tema_rg                 text,
  paradigma_rg            text,

  fonte                   text DEFAULT 'crawler',
  criado_em               timestamptz DEFAULT now(),

  UNIQUE (tribunal_id, incidente, seq),
  FOREIGN KEY (tribunal_id, incidente)
    REFERENCES processo_no (tribunal_id, incidente)
    ON DELETE CASCADE
);

-- Índices principais
CREATE INDEX idx_str_incidente    ON processo_string_evento (tribunal_id, incidente, seq);
CREATE INDEX idx_str_tipo         ON processo_string_evento (tribunal_id, tipo_evento);
CREATE INDEX idx_str_data         ON processo_string_evento (tribunal_id, data_evento);
CREATE INDEX idx_str_nao_decisao  ON processo_string_evento (tribunal_id, e_nao_decisao)
  WHERE e_nao_decisao = true;
CREATE INDEX idx_str_destaque     ON processo_string_evento (tribunal_id, tipo_evento)
  WHERE tipo_evento = 'DESTAQUE_MINISTRO';
CREATE INDEX idx_str_mudanca      ON processo_string_evento (tribunal_id, tipo_evento)
  WHERE tipo_evento = 'MUDANCA_CLASSE';
CREATE INDEX idx_str_ausencia_rg  ON processo_string_evento (tribunal_id, tipo_evento)
  WHERE tipo_evento = 'AUSENCIA_RG_FORMAL';
CREATE INDEX idx_str_colegialidade ON processo_string_evento (tribunal_id, natureza_colegialidade);
CREATE INDEX idx_str_fato          ON processo_string_evento (id_fato_decisao)
  WHERE id_fato_decisao IS NOT NULL;


-- ============================================================
-- PARTE 4: VIEWS ANALÍTICAS
-- ============================================================

-- ------------------------------------------------------------
-- 4.1 nao_decisoes_por_grau
-- Todas as não-decisões com taxonomia e contexto institucional
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW nao_decisoes_por_grau AS
SELECT
  n.tribunal_id,
  n.incidente,
  n.classe_origem,
  n.fluxo_entrada,
  n.origem_externa,
  n.re_represado_numero,
  n.tribunal_origem_sigla,
  n.nivel_na_cadeia,
  e.seq,
  e.tipo_evento,
  e.data_evento,
  e.orgao_no_evento,
  e.relator_no_evento,
  e.ambiente,
  e.natureza_colegialidade,
  e.grau_nao_decisao,
  e.codigo_taxonomia,
  t.nome                       AS taxonomia_nome,
  e.presidente_stf_no_evento,
  ct.ministro                  AS presidente_stf_oficial
FROM processo_no n
JOIN processo_string_evento e
  ON e.tribunal_id = n.tribunal_id
  AND e.incidente  = n.incidente
  AND e.e_nao_decisao = true
LEFT JOIN taxonomia_nao_decisao t
  ON t.codigo = e.codigo_taxonomia
LEFT JOIN composicao_temporal ct
  ON ct.tribunal_id = n.tribunal_id
  AND ct.cargo = 'Presidente STF'
  AND e.data_evento BETWEEN ct.data_inicio
    AND COALESCE(ct.data_fim, '9999-12-31');


-- ------------------------------------------------------------
-- 4.2 destaque_e_pauta
-- Exercício do poder de destaque vs inclusão em pauta
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW destaque_e_pauta AS
SELECT
  n.tribunal_id,
  n.incidente,
  n.classe_atual,
  n.fluxo_entrada,
  d.seq              AS seq_destaque,
  d.data_evento      AS data_destaque,
  d.ministro_destaque,
  d.orgao_no_evento  AS orgao_destaque,
  p.seq              AS seq_inclusao_pauta,
  p.data_evento      AS data_inclusao_pauta,
  p.presidente_orgao_pauta,
  (p.id IS NOT NULL) AS pauta_confirmada,
  -- false = destaque sem pauta = processo em limbo
  (p.data_evento - d.data_evento) AS dias_destaque_para_pauta
FROM processo_no n
JOIN processo_string_evento d
  ON d.tribunal_id = n.tribunal_id
  AND d.incidente  = n.incidente
  AND d.tipo_evento = 'DESTAQUE_MINISTRO'
LEFT JOIN processo_string_evento p
  ON p.tribunal_id = n.tribunal_id
  AND p.incidente  = n.incidente
  AND p.tipo_evento = 'INCLUSAO_PAUTA_PP'
  AND p.seq > d.seq;


-- ------------------------------------------------------------
-- 4.3 colegialidade_por_orgao_ano
-- Evolução histórica da natureza real da colegialidade
-- Dado empírico central para a tese
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW colegialidade_por_orgao_ano AS
SELECT
  e.tribunal_id,
  e.orgao_no_evento,
  EXTRACT(YEAR FROM e.data_evento)::int AS ano,
  e.natureza_colegialidade,
  COUNT(*) AS total_decisoes,
  ROUND(
    COUNT(*) * 100.0 /
    SUM(COUNT(*)) OVER (
      PARTITION BY e.tribunal_id,
                   e.orgao_no_evento,
                   EXTRACT(YEAR FROM e.data_evento)
    ), 2
  ) AS pct_no_orgao_ano
FROM processo_string_evento e
WHERE e.tipo_evento IN (
  'DECISAO_MONOCRATICA',
  'DECISAO_TURMA_PV',     'DECISAO_TURMA_PP',
  'DECISAO_PLENARIO_PV',  'DECISAO_PLENARIO_PP'
)
AND e.natureza_colegialidade IS NOT NULL
GROUP BY
  e.tribunal_id,
  e.orgao_no_evento,
  EXTRACT(YEAR FROM e.data_evento),
  e.natureza_colegialidade;


-- ------------------------------------------------------------
-- 4.4 string_completa_por_no
-- Reconstrói a string completa de qualquer nó com contexto
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW string_completa_por_no AS
SELECT
  n.tribunal_id,
  n.incidente,
  n.classe_origem,
  n.classe_atual,
  n.classe_alterada,
  n.fluxo_entrada,
  n.nivel_na_cadeia,
  n.origem_externa,
  n.re_represado_numero,
  n.incidente_pai,
  n.incidente_raiz,
  e.seq,
  e.tipo_evento,
  e.data_evento,
  e.orgao_no_evento,
  e.relator_no_evento,
  e.ambiente,
  e.natureza_colegialidade,
  e.resultado,
  e.e_nao_decisao,
  e.grau_nao_decisao,
  e.descricao_andamento,
  e.classe_anterior,
  e.classe_nova,
  ct.ministro AS presidente_stf_no_evento
FROM processo_no n
JOIN processo_string_evento e
  ON e.tribunal_id = n.tribunal_id
  AND e.incidente  = n.incidente
LEFT JOIN composicao_temporal ct
  ON ct.tribunal_id = n.tribunal_id
  AND ct.cargo = 'Presidente STF'
  AND e.data_evento BETWEEN ct.data_inicio
    AND COALESCE(ct.data_fim, '9999-12-31');


-- ============================================================
-- PARTE 5: COLUNAS ADICIONADAS EM TABELAS EXISTENTES
-- ============================================================

-- stf_decisoes: liga ao modelo de nós
ALTER TABLE stf_decisoes
  ADD COLUMN IF NOT EXISTS incidente_no   bigint,
  -- incidente do nó ao qual esta decisão pertence
  ADD COLUMN IF NOT EXISTS seq_na_string  int;
  -- posição desta decisão na string do nó


-- ============================================================
-- PARTE 6: PRINCÍPIO ONTOLÓGICO (gravado no sistema)
-- ============================================================

INSERT INTO judx_system_principle (code, title, normative_text, rationale, is_active)
VALUES (
  'ONTO-001',
  'Ancoragem recursal do processo como objeto',
  'NÓ = incidente (imutável). Classe é atributo corrente — ARE vira RE, mesmo incidente. '
  'STRING = sequência ordenada de eventos. Todo nó começa com DISTRIBUICAO. '
  'PRESIDÊNCIA: (1) distribui todos os processos, (2) filtra AREs, (3) pauta PP. '
  'DESTAQUE = poder de qualquer ministro. PAUTA PP = poder exclusivo do presidente do órgão. '
  'PV = formalmente colegiado, materialmente monocrático (assíncrono, sem diálogo). '
  'PP = genuinamente colegiado. RE direto chega inteiro. ARE chega pela metade. '
  'RG ausente em RE julgado = campo de estudo.',
  '79% das decisões são não-decisões: admissibilidade sem mérito, '
  'monocrática, virtual, por cargo bienal rotativo. '
  'Isso é design institucional, não ineficiência. '
  'PV transforma decisões colegiadas em materialmente monocráticas. '
  'Destaque é contrapeso individual — mas depende do presidente do órgão. (Medina, 2026)',
  true
) ON CONFLICT (code) DO UPDATE SET
  normative_text = EXCLUDED.normative_text,
  rationale      = EXCLUDED.rationale;


-- ============================================================
-- FIM DO MODELO ONTOLÓGICO
-- Próximo passo: script de ingestão (basicos.csv + andamentos.csv)
-- para popular processo_no e processo_string_evento
-- ============================================================
