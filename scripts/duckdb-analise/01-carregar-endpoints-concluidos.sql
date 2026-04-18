-- 01-carregar-endpoints-concluidos.sql
-- Carrega em uma única tabela `docs` todos os endpoints do Datajud
-- que já foram extraídos para G:/datajud_raw/ (checkpoint done = true).
--
-- Uso:
--   duckdb.exe C:/Users/medin/staging_local/analise_trilhas.duckdb -f 01-carregar-endpoints-concluidos.sql
--
-- Política: zero escrita remota. Arquivo .duckdb é single-file local (Camada 2).

SET preserve_insertion_order = false;

-- Tabela mestra: 1 linha por registro do Datajud (por _id).
-- Campos viajam junto para preservar trilha.
CREATE OR REPLACE TABLE docs (
  endpoint              VARCHAR,
  nivel                 VARCHAR,
  especialidade         VARCHAR,
  _id                   VARCHAR,
  _index                VARCHAR,
  numero_processo       VARCHAR,
  classe_codigo         BIGINT,
  classe_nome           VARCHAR,
  assuntos              JSON,
  tribunal              VARCHAR,
  grau                  VARCHAR,
  orgao_codigo          VARCHAR,
  orgao_nome            VARCHAR,
  sistema_nome          VARCHAR,
  formato_nome          VARCHAR,
  nivel_sigilo          BIGINT,
  data_ajuizamento      VARCHAR,
  data_hora_ult_atual   TIMESTAMP,
  movimentos            JSON,
  qtd_movimentos        INTEGER
);

-- helper: insere um endpoint
-- (repetir bloco manualmente por endpoint concluído)

INSERT INTO docs
SELECT
  'STJ' AS endpoint, 'N1' AS nivel, 'superior' AS especialidade,
  _id, _index,
  _source.numeroProcesso,
  _source.classe.codigo, _source.classe.nome,
  to_json(_source.assuntos),
  _source.tribunal,
  _source.grau,
  _source.orgaoJulgador.codigo, _source.orgaoJulgador.nome,
  _source.sistema.nome, _source.formato.nome,
  _source.nivelSigilo,
  _source.dataAjuizamento,
  TRY_CAST(_source.dataHoraUltimaAtualizacao AS TIMESTAMP),
  to_json(_source.movimentos),
  len(_source.movimentos)
FROM read_ndjson('G:/datajud_raw/nivel_1_anteparos/STJ/part-*.ndjson.gz',
                 maximum_object_size=20000000);

INSERT INTO docs
SELECT 'TST','N1','superior',_id,_index,_source.numeroProcesso,
  _source.classe.codigo,_source.classe.nome,to_json(_source.assuntos),
  _source.tribunal,_source.grau,_source.orgaoJulgador.codigo,_source.orgaoJulgador.nome,
  _source.sistema.nome,_source.formato.nome,_source.nivelSigilo,
  _source.dataAjuizamento,TRY_CAST(_source.dataHoraUltimaAtualizacao AS TIMESTAMP),
  to_json(_source.movimentos),len(_source.movimentos)
FROM read_ndjson('G:/datajud_raw/nivel_1_anteparos/TST/part-*.ndjson.gz',maximum_object_size=20000000);

INSERT INTO docs
SELECT 'TSE','N1','superior',_id,_index,_source.numeroProcesso,
  _source.classe.codigo,_source.classe.nome,to_json(_source.assuntos),
  _source.tribunal,_source.grau,_source.orgaoJulgador.codigo,_source.orgaoJulgador.nome,
  _source.sistema.nome,_source.formato.nome,_source.nivelSigilo,
  _source.dataAjuizamento,TRY_CAST(_source.dataHoraUltimaAtualizacao AS TIMESTAMP),
  to_json(_source.movimentos),len(_source.movimentos)
FROM read_ndjson('G:/datajud_raw/nivel_1_anteparos/TSE/part-*.ndjson.gz',maximum_object_size=20000000);

INSERT INTO docs
SELECT 'STM','N1','superior',_id,_index,_source.numeroProcesso,
  _source.classe.codigo,_source.classe.nome,to_json(_source.assuntos),
  _source.tribunal,_source.grau,_source.orgaoJulgador.codigo,_source.orgaoJulgador.nome,
  _source.sistema.nome,_source.formato.nome,_source.nivelSigilo,
  _source.dataAjuizamento,TRY_CAST(_source.dataHoraUltimaAtualizacao AS TIMESTAMP),
  to_json(_source.movimentos),len(_source.movimentos)
FROM read_ndjson('G:/datajud_raw/nivel_1_anteparos/STM/part-*.ndjson.gz',maximum_object_size=20000000);

-- Militares
INSERT INTO docs
SELECT 'TJMMG','N2','militar',_id,_index,_source.numeroProcesso,
  _source.classe.codigo,_source.classe.nome,to_json(_source.assuntos),
  _source.tribunal,_source.grau,_source.orgaoJulgador.codigo,_source.orgaoJulgador.nome,
  _source.sistema.nome,_source.formato.nome,_source.nivelSigilo,
  _source.dataAjuizamento,TRY_CAST(_source.dataHoraUltimaAtualizacao AS TIMESTAMP),
  to_json(_source.movimentos),len(_source.movimentos)
FROM read_ndjson('G:/datajud_raw/nivel_2_regionais/militar/TJMMG/part-*.ndjson.gz',maximum_object_size=20000000);

INSERT INTO docs
SELECT 'TJMRS','N2','militar',_id,_index,_source.numeroProcesso,
  _source.classe.codigo,_source.classe.nome,to_json(_source.assuntos),
  _source.tribunal,_source.grau,_source.orgaoJulgador.codigo,_source.orgaoJulgador.nome,
  _source.sistema.nome,_source.formato.nome,_source.nivelSigilo,
  _source.dataAjuizamento,TRY_CAST(_source.dataHoraUltimaAtualizacao AS TIMESTAMP),
  to_json(_source.movimentos),len(_source.movimentos)
FROM read_ndjson('G:/datajud_raw/nivel_2_regionais/militar/TJMRS/part-*.ndjson.gz',maximum_object_size=20000000);

INSERT INTO docs
SELECT 'TJMSP','N2','militar',_id,_index,_source.numeroProcesso,
  _source.classe.codigo,_source.classe.nome,to_json(_source.assuntos),
  _source.tribunal,_source.grau,_source.orgaoJulgador.codigo,_source.orgaoJulgador.nome,
  _source.sistema.nome,_source.formato.nome,_source.nivelSigilo,
  _source.dataAjuizamento,TRY_CAST(_source.dataHoraUltimaAtualizacao AS TIMESTAMP),
  to_json(_source.movimentos),len(_source.movimentos)
FROM read_ndjson('G:/datajud_raw/nivel_2_regionais/militar/TJMSP/part-*.ndjson.gz',maximum_object_size=20000000);

-- Eleitorais concluídos Fase 1
INSERT INTO docs SELECT 'TRE-AC','N2','eleitoral',_id,_index,_source.numeroProcesso,_source.classe.codigo,_source.classe.nome,to_json(_source.assuntos),_source.tribunal,_source.grau,_source.orgaoJulgador.codigo,_source.orgaoJulgador.nome,_source.sistema.nome,_source.formato.nome,_source.nivelSigilo,_source.dataAjuizamento,TRY_CAST(_source.dataHoraUltimaAtualizacao AS TIMESTAMP),to_json(_source.movimentos),len(_source.movimentos) FROM read_ndjson('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-AC/part-*.ndjson.gz',maximum_object_size=20000000);
INSERT INTO docs SELECT 'TRE-AL','N2','eleitoral',_id,_index,_source.numeroProcesso,_source.classe.codigo,_source.classe.nome,to_json(_source.assuntos),_source.tribunal,_source.grau,_source.orgaoJulgador.codigo,_source.orgaoJulgador.nome,_source.sistema.nome,_source.formato.nome,_source.nivelSigilo,_source.dataAjuizamento,TRY_CAST(_source.dataHoraUltimaAtualizacao AS TIMESTAMP),to_json(_source.movimentos),len(_source.movimentos) FROM read_ndjson('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-AL/part-*.ndjson.gz',maximum_object_size=20000000);
INSERT INTO docs SELECT 'TRE-AM','N2','eleitoral',_id,_index,_source.numeroProcesso,_source.classe.codigo,_source.classe.nome,to_json(_source.assuntos),_source.tribunal,_source.grau,_source.orgaoJulgador.codigo,_source.orgaoJulgador.nome,_source.sistema.nome,_source.formato.nome,_source.nivelSigilo,_source.dataAjuizamento,TRY_CAST(_source.dataHoraUltimaAtualizacao AS TIMESTAMP),to_json(_source.movimentos),len(_source.movimentos) FROM read_ndjson('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-AM/part-*.ndjson.gz',maximum_object_size=20000000);
INSERT INTO docs SELECT 'TRE-AP','N2','eleitoral',_id,_index,_source.numeroProcesso,_source.classe.codigo,_source.classe.nome,to_json(_source.assuntos),_source.tribunal,_source.grau,_source.orgaoJulgador.codigo,_source.orgaoJulgador.nome,_source.sistema.nome,_source.formato.nome,_source.nivelSigilo,_source.dataAjuizamento,TRY_CAST(_source.dataHoraUltimaAtualizacao AS TIMESTAMP),to_json(_source.movimentos),len(_source.movimentos) FROM read_ndjson('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-AP/part-*.ndjson.gz',maximum_object_size=20000000);
INSERT INTO docs SELECT 'TRE-ES','N2','eleitoral',_id,_index,_source.numeroProcesso,_source.classe.codigo,_source.classe.nome,to_json(_source.assuntos),_source.tribunal,_source.grau,_source.orgaoJulgador.codigo,_source.orgaoJulgador.nome,_source.sistema.nome,_source.formato.nome,_source.nivelSigilo,_source.dataAjuizamento,TRY_CAST(_source.dataHoraUltimaAtualizacao AS TIMESTAMP),to_json(_source.movimentos),len(_source.movimentos) FROM read_ndjson('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-ES/part-*.ndjson.gz',maximum_object_size=20000000);
INSERT INTO docs SELECT 'TRE-PB','N2','eleitoral',_id,_index,_source.numeroProcesso,_source.classe.codigo,_source.classe.nome,to_json(_source.assuntos),_source.tribunal,_source.grau,_source.orgaoJulgador.codigo,_source.orgaoJulgador.nome,_source.sistema.nome,_source.formato.nome,_source.nivelSigilo,_source.dataAjuizamento,TRY_CAST(_source.dataHoraUltimaAtualizacao AS TIMESTAMP),to_json(_source.movimentos),len(_source.movimentos) FROM read_ndjson('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-PB/part-*.ndjson.gz',maximum_object_size=20000000);
INSERT INTO docs SELECT 'TRE-PI','N2','eleitoral',_id,_index,_source.numeroProcesso,_source.classe.codigo,_source.classe.nome,to_json(_source.assuntos),_source.tribunal,_source.grau,_source.orgaoJulgador.codigo,_source.orgaoJulgador.nome,_source.sistema.nome,_source.formato.nome,_source.nivelSigilo,_source.dataAjuizamento,TRY_CAST(_source.dataHoraUltimaAtualizacao AS TIMESTAMP),to_json(_source.movimentos),len(_source.movimentos) FROM read_ndjson('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-PI/part-*.ndjson.gz',maximum_object_size=20000000);
INSERT INTO docs SELECT 'TRE-RN','N2','eleitoral',_id,_index,_source.numeroProcesso,_source.classe.codigo,_source.classe.nome,to_json(_source.assuntos),_source.tribunal,_source.grau,_source.orgaoJulgador.codigo,_source.orgaoJulgador.nome,_source.sistema.nome,_source.formato.nome,_source.nivelSigilo,_source.dataAjuizamento,TRY_CAST(_source.dataHoraUltimaAtualizacao AS TIMESTAMP),to_json(_source.movimentos),len(_source.movimentos) FROM read_ndjson('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-RN/part-*.ndjson.gz',maximum_object_size=20000000);
INSERT INTO docs SELECT 'TRE-RO','N2','eleitoral',_id,_index,_source.numeroProcesso,_source.classe.codigo,_source.classe.nome,to_json(_source.assuntos),_source.tribunal,_source.grau,_source.orgaoJulgador.codigo,_source.orgaoJulgador.nome,_source.sistema.nome,_source.formato.nome,_source.nivelSigilo,_source.dataAjuizamento,TRY_CAST(_source.dataHoraUltimaAtualizacao AS TIMESTAMP),to_json(_source.movimentos),len(_source.movimentos) FROM read_ndjson('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-RO/part-*.ndjson.gz',maximum_object_size=20000000);
INSERT INTO docs SELECT 'TRE-RR','N2','eleitoral',_id,_index,_source.numeroProcesso,_source.classe.codigo,_source.classe.nome,to_json(_source.assuntos),_source.tribunal,_source.grau,_source.orgaoJulgador.codigo,_source.orgaoJulgador.nome,_source.sistema.nome,_source.formato.nome,_source.nivelSigilo,_source.dataAjuizamento,TRY_CAST(_source.dataHoraUltimaAtualizacao AS TIMESTAMP),to_json(_source.movimentos),len(_source.movimentos) FROM read_ndjson('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-RR/part-*.ndjson.gz',maximum_object_size=20000000);
INSERT INTO docs SELECT 'TRE-SE','N2','eleitoral',_id,_index,_source.numeroProcesso,_source.classe.codigo,_source.classe.nome,to_json(_source.assuntos),_source.tribunal,_source.grau,_source.orgaoJulgador.codigo,_source.orgaoJulgador.nome,_source.sistema.nome,_source.formato.nome,_source.nivelSigilo,_source.dataAjuizamento,TRY_CAST(_source.dataHoraUltimaAtualizacao AS TIMESTAMP),to_json(_source.movimentos),len(_source.movimentos) FROM read_ndjson('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-SE/part-*.ndjson.gz',maximum_object_size=20000000);
INSERT INTO docs SELECT 'TRE-TO','N2','eleitoral',_id,_index,_source.numeroProcesso,_source.classe.codigo,_source.classe.nome,to_json(_source.assuntos),_source.tribunal,_source.grau,_source.orgaoJulgador.codigo,_source.orgaoJulgador.nome,_source.sistema.nome,_source.formato.nome,_source.nivelSigilo,_source.dataAjuizamento,TRY_CAST(_source.dataHoraUltimaAtualizacao AS TIMESTAMP),to_json(_source.movimentos),len(_source.movimentos) FROM read_ndjson('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-TO/part-*.ndjson.gz',maximum_object_size=20000000);

-- Índices úteis (DuckDB só suporta indexes em ART por CHAR/NUM)
CREATE INDEX IF NOT EXISTS idx_np ON docs(numero_processo);
CREATE INDEX IF NOT EXISTS idx_ep ON docs(endpoint);

-- Resumo de carga
SELECT 'Total docs' AS metrica, COUNT(*) AS valor FROM docs
UNION ALL SELECT 'Endpoints', COUNT(DISTINCT endpoint) FROM docs
UNION ALL SELECT 'Processos únicos (numero_processo)', COUNT(DISTINCT numero_processo) FROM docs
UNION ALL SELECT 'Total movimentos (pulsos)', SUM(qtd_movimentos) FROM docs;
