-- 01-carregar-endpoints-concluidos.sql (v2 — dado puro)
-- Carrega em uma única tabela `docs` todos os endpoints do Datajud
-- que já foram extraídos para G:/datajud_raw/.
--
-- REGRA: dado PURO. Nenhum campo é inferido automaticamente pelo DuckDB.
-- Tudo vem como VARCHAR/JSON cru. Conversões acontecem só sob demanda,
-- em análises específicas, conscientes.
--
-- Baseado no princípio mestre: nada pode ser descartado, nada pode ser
-- transformado silenciosamente. Chaves (numero_processo, _id) jamais
-- podem ser inferidas como número — estouram bigint e truncam dígitos.
--
-- Uso:
--   duckdb.exe C:/Users/medin/staging_local/analise_trilhas.duckdb \
--     -f scripts/duckdb-analise/01-carregar-endpoints-concluidos.sql

SET preserve_insertion_order = false;

-- Tabela mestra: 1 linha por registro do Datajud (por _id).
-- TODOS os campos-chave são VARCHAR puro para preservar os dígitos.
CREATE OR REPLACE TABLE docs (
  endpoint              VARCHAR,    -- STJ, TST, TSE, etc (adicionado pelo nosso SELECT)
  nivel                 VARCHAR,    -- N0/N1/N2/N3/N4 (adicionado pelo nosso SELECT)
  especialidade         VARCHAR,    -- superior/federal/comum/trabalho/eleitoral/militar
  _id                   VARCHAR,    -- id ES bruto
  _index                VARCHAR,
  numero_processo       VARCHAR,    -- CNJ 20 dígitos — jamais inferir como número
  classe_codigo         VARCHAR,    -- mantido como string por conservadorismo
  classe_nome           VARCHAR,
  assuntos              JSON,       -- lista JSON crua
  tribunal              VARCHAR,
  grau                  VARCHAR,    -- G1/G2/SUP/JE/TR/TRU
  orgao_codigo          VARCHAR,    -- identificador do órgão — VARCHAR sempre
  orgao_nome            VARCHAR,
  sistema_nome          VARCHAR,
  formato_nome          VARCHAR,
  nivel_sigilo          VARCHAR,
  data_ajuizamento      VARCHAR,    -- YYYYMMDDHHmmss — formato CNJ, não ISO
  data_hora_ult_atual   VARCHAR,    -- ISO — mantido como string, cast sob demanda
  movimentos            JSON,       -- lista JSON crua
  qtd_movimentos        INTEGER     -- único campo convertido (len da lista)
);

-- Função auxiliar: carregar um endpoint.
-- Usa read_json com columns= explícito para forçar _source como JSON cru,
-- sem inferência de tipos internos.
-- ---------------------------------------------------------------------

-- N1 SUPERIORES

INSERT INTO docs BY NAME
SELECT
  'STJ' AS endpoint, 'N1' AS nivel, 'superior' AS especialidade,
  _id, _index,
  json_extract_string(_source, '$.numeroProcesso') AS numero_processo,
  json_extract_string(_source, '$.classe.codigo') AS classe_codigo,
  json_extract_string(_source, '$.classe.nome') AS classe_nome,
  json_extract(_source, '$.assuntos') AS assuntos,
  json_extract_string(_source, '$.tribunal') AS tribunal,
  json_extract_string(_source, '$.grau') AS grau,
  json_extract_string(_source, '$.orgaoJulgador.codigo') AS orgao_codigo,
  json_extract_string(_source, '$.orgaoJulgador.nome') AS orgao_nome,
  json_extract_string(_source, '$.sistema.nome') AS sistema_nome,
  json_extract_string(_source, '$.formato.nome') AS formato_nome,
  json_extract_string(_source, '$.nivelSigilo') AS nivel_sigilo,
  json_extract_string(_source, '$.dataAjuizamento') AS data_ajuizamento,
  json_extract_string(_source, '$.dataHoraUltimaAtualizacao') AS data_hora_ult_atual,
  json_extract(_source, '$.movimentos') AS movimentos,
  TRY_CAST(json_array_length(json_extract(_source, '$.movimentos')) AS INTEGER) AS qtd_movimentos
FROM read_json('G:/datajud_raw/nivel_1_anteparos/STJ/part-*.ndjson.gz',
               format='newline_delimited',
               maximum_object_size=20000000,
               columns={_id: 'VARCHAR', _index: 'VARCHAR', _source: 'JSON', _score: 'DOUBLE', sort: 'JSON'});

INSERT INTO docs BY NAME
SELECT 'TST','N1','superior',_id,_index,
  json_extract_string(_source,'$.numeroProcesso'),
  json_extract_string(_source,'$.classe.codigo'),
  json_extract_string(_source,'$.classe.nome'),
  json_extract(_source,'$.assuntos'),
  json_extract_string(_source,'$.tribunal'),
  json_extract_string(_source,'$.grau'),
  json_extract_string(_source,'$.orgaoJulgador.codigo'),
  json_extract_string(_source,'$.orgaoJulgador.nome'),
  json_extract_string(_source,'$.sistema.nome'),
  json_extract_string(_source,'$.formato.nome'),
  json_extract_string(_source,'$.nivelSigilo'),
  json_extract_string(_source,'$.dataAjuizamento'),
  json_extract_string(_source,'$.dataHoraUltimaAtualizacao'),
  json_extract(_source,'$.movimentos'),
  TRY_CAST(json_array_length(json_extract(_source,'$.movimentos')) AS INTEGER)
FROM read_json('G:/datajud_raw/nivel_1_anteparos/TST/part-*.ndjson.gz',
               format='newline_delimited',
               maximum_object_size=20000000,
               columns={_id: 'VARCHAR', _index: 'VARCHAR', _source: 'JSON', _score: 'DOUBLE', sort: 'JSON'});

INSERT INTO docs BY NAME
SELECT 'TSE','N1','superior',_id,_index,
  json_extract_string(_source,'$.numeroProcesso'),
  json_extract_string(_source,'$.classe.codigo'),
  json_extract_string(_source,'$.classe.nome'),
  json_extract(_source,'$.assuntos'),
  json_extract_string(_source,'$.tribunal'),
  json_extract_string(_source,'$.grau'),
  json_extract_string(_source,'$.orgaoJulgador.codigo'),
  json_extract_string(_source,'$.orgaoJulgador.nome'),
  json_extract_string(_source,'$.sistema.nome'),
  json_extract_string(_source,'$.formato.nome'),
  json_extract_string(_source,'$.nivelSigilo'),
  json_extract_string(_source,'$.dataAjuizamento'),
  json_extract_string(_source,'$.dataHoraUltimaAtualizacao'),
  json_extract(_source,'$.movimentos'),
  TRY_CAST(json_array_length(json_extract(_source,'$.movimentos')) AS INTEGER)
FROM read_json('G:/datajud_raw/nivel_1_anteparos/TSE/part-*.ndjson.gz',
               format='newline_delimited',
               maximum_object_size=20000000,
               columns={_id: 'VARCHAR', _index: 'VARCHAR', _source: 'JSON', _score: 'DOUBLE', sort: 'JSON'});

INSERT INTO docs BY NAME
SELECT 'STM','N1','superior',_id,_index,
  json_extract_string(_source,'$.numeroProcesso'),
  json_extract_string(_source,'$.classe.codigo'),
  json_extract_string(_source,'$.classe.nome'),
  json_extract(_source,'$.assuntos'),
  json_extract_string(_source,'$.tribunal'),
  json_extract_string(_source,'$.grau'),
  json_extract_string(_source,'$.orgaoJulgador.codigo'),
  json_extract_string(_source,'$.orgaoJulgador.nome'),
  json_extract_string(_source,'$.sistema.nome'),
  json_extract_string(_source,'$.formato.nome'),
  json_extract_string(_source,'$.nivelSigilo'),
  json_extract_string(_source,'$.dataAjuizamento'),
  json_extract_string(_source,'$.dataHoraUltimaAtualizacao'),
  json_extract(_source,'$.movimentos'),
  TRY_CAST(json_array_length(json_extract(_source,'$.movimentos')) AS INTEGER)
FROM read_json('G:/datajud_raw/nivel_1_anteparos/STM/part-*.ndjson.gz',
               format='newline_delimited',
               maximum_object_size=20000000,
               columns={_id: 'VARCHAR', _index: 'VARCHAR', _source: 'JSON', _score: 'DOUBLE', sort: 'JSON'});

-- N2 MILITARES

INSERT INTO docs BY NAME
SELECT 'TJMMG','N2','militar',_id,_index,
  json_extract_string(_source,'$.numeroProcesso'),
  json_extract_string(_source,'$.classe.codigo'),
  json_extract_string(_source,'$.classe.nome'),
  json_extract(_source,'$.assuntos'),
  json_extract_string(_source,'$.tribunal'),
  json_extract_string(_source,'$.grau'),
  json_extract_string(_source,'$.orgaoJulgador.codigo'),
  json_extract_string(_source,'$.orgaoJulgador.nome'),
  json_extract_string(_source,'$.sistema.nome'),
  json_extract_string(_source,'$.formato.nome'),
  json_extract_string(_source,'$.nivelSigilo'),
  json_extract_string(_source,'$.dataAjuizamento'),
  json_extract_string(_source,'$.dataHoraUltimaAtualizacao'),
  json_extract(_source,'$.movimentos'),
  TRY_CAST(json_array_length(json_extract(_source,'$.movimentos')) AS INTEGER)
FROM read_json('G:/datajud_raw/nivel_2_regionais/militar/TJMMG/part-*.ndjson.gz',
               format='newline_delimited',
               maximum_object_size=20000000,
               columns={_id: 'VARCHAR', _index: 'VARCHAR', _source: 'JSON', _score: 'DOUBLE', sort: 'JSON'});

INSERT INTO docs BY NAME
SELECT 'TJMRS','N2','militar',_id,_index,
  json_extract_string(_source,'$.numeroProcesso'),
  json_extract_string(_source,'$.classe.codigo'),
  json_extract_string(_source,'$.classe.nome'),
  json_extract(_source,'$.assuntos'),
  json_extract_string(_source,'$.tribunal'),
  json_extract_string(_source,'$.grau'),
  json_extract_string(_source,'$.orgaoJulgador.codigo'),
  json_extract_string(_source,'$.orgaoJulgador.nome'),
  json_extract_string(_source,'$.sistema.nome'),
  json_extract_string(_source,'$.formato.nome'),
  json_extract_string(_source,'$.nivelSigilo'),
  json_extract_string(_source,'$.dataAjuizamento'),
  json_extract_string(_source,'$.dataHoraUltimaAtualizacao'),
  json_extract(_source,'$.movimentos'),
  TRY_CAST(json_array_length(json_extract(_source,'$.movimentos')) AS INTEGER)
FROM read_json('G:/datajud_raw/nivel_2_regionais/militar/TJMRS/part-*.ndjson.gz',
               format='newline_delimited',
               maximum_object_size=20000000,
               columns={_id: 'VARCHAR', _index: 'VARCHAR', _source: 'JSON', _score: 'DOUBLE', sort: 'JSON'});

INSERT INTO docs BY NAME
SELECT 'TJMSP','N2','militar',_id,_index,
  json_extract_string(_source,'$.numeroProcesso'),
  json_extract_string(_source,'$.classe.codigo'),
  json_extract_string(_source,'$.classe.nome'),
  json_extract(_source,'$.assuntos'),
  json_extract_string(_source,'$.tribunal'),
  json_extract_string(_source,'$.grau'),
  json_extract_string(_source,'$.orgaoJulgador.codigo'),
  json_extract_string(_source,'$.orgaoJulgador.nome'),
  json_extract_string(_source,'$.sistema.nome'),
  json_extract_string(_source,'$.formato.nome'),
  json_extract_string(_source,'$.nivelSigilo'),
  json_extract_string(_source,'$.dataAjuizamento'),
  json_extract_string(_source,'$.dataHoraUltimaAtualizacao'),
  json_extract(_source,'$.movimentos'),
  TRY_CAST(json_array_length(json_extract(_source,'$.movimentos')) AS INTEGER)
FROM read_json('G:/datajud_raw/nivel_2_regionais/militar/TJMSP/part-*.ndjson.gz',
               format='newline_delimited',
               maximum_object_size=20000000,
               columns={_id: 'VARCHAR', _index: 'VARCHAR', _source: 'JSON', _score: 'DOUBLE', sort: 'JSON'});

-- N2 ELEITORAIS CONCLUÍDOS
-- (as colunas do read_json são as mesmas; formato uniforme)

INSERT INTO docs BY NAME SELECT 'TRE-AC','N2','eleitoral',_id,_index,json_extract_string(_source,'$.numeroProcesso'),json_extract_string(_source,'$.classe.codigo'),json_extract_string(_source,'$.classe.nome'),json_extract(_source,'$.assuntos'),json_extract_string(_source,'$.tribunal'),json_extract_string(_source,'$.grau'),json_extract_string(_source,'$.orgaoJulgador.codigo'),json_extract_string(_source,'$.orgaoJulgador.nome'),json_extract_string(_source,'$.sistema.nome'),json_extract_string(_source,'$.formato.nome'),json_extract_string(_source,'$.nivelSigilo'),json_extract_string(_source,'$.dataAjuizamento'),json_extract_string(_source,'$.dataHoraUltimaAtualizacao'),json_extract(_source,'$.movimentos'),TRY_CAST(json_array_length(json_extract(_source,'$.movimentos')) AS INTEGER) FROM read_json('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-AC/part-*.ndjson.gz',format='newline_delimited',maximum_object_size=20000000,columns={_id: 'VARCHAR', _index: 'VARCHAR', _source: 'JSON', _score: 'DOUBLE', sort: 'JSON'});
INSERT INTO docs BY NAME SELECT 'TRE-AL','N2','eleitoral',_id,_index,json_extract_string(_source,'$.numeroProcesso'),json_extract_string(_source,'$.classe.codigo'),json_extract_string(_source,'$.classe.nome'),json_extract(_source,'$.assuntos'),json_extract_string(_source,'$.tribunal'),json_extract_string(_source,'$.grau'),json_extract_string(_source,'$.orgaoJulgador.codigo'),json_extract_string(_source,'$.orgaoJulgador.nome'),json_extract_string(_source,'$.sistema.nome'),json_extract_string(_source,'$.formato.nome'),json_extract_string(_source,'$.nivelSigilo'),json_extract_string(_source,'$.dataAjuizamento'),json_extract_string(_source,'$.dataHoraUltimaAtualizacao'),json_extract(_source,'$.movimentos'),TRY_CAST(json_array_length(json_extract(_source,'$.movimentos')) AS INTEGER) FROM read_json('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-AL/part-*.ndjson.gz',format='newline_delimited',maximum_object_size=20000000,columns={_id: 'VARCHAR', _index: 'VARCHAR', _source: 'JSON', _score: 'DOUBLE', sort: 'JSON'});
INSERT INTO docs BY NAME SELECT 'TRE-AM','N2','eleitoral',_id,_index,json_extract_string(_source,'$.numeroProcesso'),json_extract_string(_source,'$.classe.codigo'),json_extract_string(_source,'$.classe.nome'),json_extract(_source,'$.assuntos'),json_extract_string(_source,'$.tribunal'),json_extract_string(_source,'$.grau'),json_extract_string(_source,'$.orgaoJulgador.codigo'),json_extract_string(_source,'$.orgaoJulgador.nome'),json_extract_string(_source,'$.sistema.nome'),json_extract_string(_source,'$.formato.nome'),json_extract_string(_source,'$.nivelSigilo'),json_extract_string(_source,'$.dataAjuizamento'),json_extract_string(_source,'$.dataHoraUltimaAtualizacao'),json_extract(_source,'$.movimentos'),TRY_CAST(json_array_length(json_extract(_source,'$.movimentos')) AS INTEGER) FROM read_json('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-AM/part-*.ndjson.gz',format='newline_delimited',maximum_object_size=20000000,columns={_id: 'VARCHAR', _index: 'VARCHAR', _source: 'JSON', _score: 'DOUBLE', sort: 'JSON'});
INSERT INTO docs BY NAME SELECT 'TRE-AP','N2','eleitoral',_id,_index,json_extract_string(_source,'$.numeroProcesso'),json_extract_string(_source,'$.classe.codigo'),json_extract_string(_source,'$.classe.nome'),json_extract(_source,'$.assuntos'),json_extract_string(_source,'$.tribunal'),json_extract_string(_source,'$.grau'),json_extract_string(_source,'$.orgaoJulgador.codigo'),json_extract_string(_source,'$.orgaoJulgador.nome'),json_extract_string(_source,'$.sistema.nome'),json_extract_string(_source,'$.formato.nome'),json_extract_string(_source,'$.nivelSigilo'),json_extract_string(_source,'$.dataAjuizamento'),json_extract_string(_source,'$.dataHoraUltimaAtualizacao'),json_extract(_source,'$.movimentos'),TRY_CAST(json_array_length(json_extract(_source,'$.movimentos')) AS INTEGER) FROM read_json('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-AP/part-*.ndjson.gz',format='newline_delimited',maximum_object_size=20000000,columns={_id: 'VARCHAR', _index: 'VARCHAR', _source: 'JSON', _score: 'DOUBLE', sort: 'JSON'});
INSERT INTO docs BY NAME SELECT 'TRE-ES','N2','eleitoral',_id,_index,json_extract_string(_source,'$.numeroProcesso'),json_extract_string(_source,'$.classe.codigo'),json_extract_string(_source,'$.classe.nome'),json_extract(_source,'$.assuntos'),json_extract_string(_source,'$.tribunal'),json_extract_string(_source,'$.grau'),json_extract_string(_source,'$.orgaoJulgador.codigo'),json_extract_string(_source,'$.orgaoJulgador.nome'),json_extract_string(_source,'$.sistema.nome'),json_extract_string(_source,'$.formato.nome'),json_extract_string(_source,'$.nivelSigilo'),json_extract_string(_source,'$.dataAjuizamento'),json_extract_string(_source,'$.dataHoraUltimaAtualizacao'),json_extract(_source,'$.movimentos'),TRY_CAST(json_array_length(json_extract(_source,'$.movimentos')) AS INTEGER) FROM read_json('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-ES/part-*.ndjson.gz',format='newline_delimited',maximum_object_size=20000000,columns={_id: 'VARCHAR', _index: 'VARCHAR', _source: 'JSON', _score: 'DOUBLE', sort: 'JSON'});
INSERT INTO docs BY NAME SELECT 'TRE-PB','N2','eleitoral',_id,_index,json_extract_string(_source,'$.numeroProcesso'),json_extract_string(_source,'$.classe.codigo'),json_extract_string(_source,'$.classe.nome'),json_extract(_source,'$.assuntos'),json_extract_string(_source,'$.tribunal'),json_extract_string(_source,'$.grau'),json_extract_string(_source,'$.orgaoJulgador.codigo'),json_extract_string(_source,'$.orgaoJulgador.nome'),json_extract_string(_source,'$.sistema.nome'),json_extract_string(_source,'$.formato.nome'),json_extract_string(_source,'$.nivelSigilo'),json_extract_string(_source,'$.dataAjuizamento'),json_extract_string(_source,'$.dataHoraUltimaAtualizacao'),json_extract(_source,'$.movimentos'),TRY_CAST(json_array_length(json_extract(_source,'$.movimentos')) AS INTEGER) FROM read_json('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-PB/part-*.ndjson.gz',format='newline_delimited',maximum_object_size=20000000,columns={_id: 'VARCHAR', _index: 'VARCHAR', _source: 'JSON', _score: 'DOUBLE', sort: 'JSON'});
INSERT INTO docs BY NAME SELECT 'TRE-PI','N2','eleitoral',_id,_index,json_extract_string(_source,'$.numeroProcesso'),json_extract_string(_source,'$.classe.codigo'),json_extract_string(_source,'$.classe.nome'),json_extract(_source,'$.assuntos'),json_extract_string(_source,'$.tribunal'),json_extract_string(_source,'$.grau'),json_extract_string(_source,'$.orgaoJulgador.codigo'),json_extract_string(_source,'$.orgaoJulgador.nome'),json_extract_string(_source,'$.sistema.nome'),json_extract_string(_source,'$.formato.nome'),json_extract_string(_source,'$.nivelSigilo'),json_extract_string(_source,'$.dataAjuizamento'),json_extract_string(_source,'$.dataHoraUltimaAtualizacao'),json_extract(_source,'$.movimentos'),TRY_CAST(json_array_length(json_extract(_source,'$.movimentos')) AS INTEGER) FROM read_json('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-PI/part-*.ndjson.gz',format='newline_delimited',maximum_object_size=20000000,columns={_id: 'VARCHAR', _index: 'VARCHAR', _source: 'JSON', _score: 'DOUBLE', sort: 'JSON'});
INSERT INTO docs BY NAME SELECT 'TRE-RN','N2','eleitoral',_id,_index,json_extract_string(_source,'$.numeroProcesso'),json_extract_string(_source,'$.classe.codigo'),json_extract_string(_source,'$.classe.nome'),json_extract(_source,'$.assuntos'),json_extract_string(_source,'$.tribunal'),json_extract_string(_source,'$.grau'),json_extract_string(_source,'$.orgaoJulgador.codigo'),json_extract_string(_source,'$.orgaoJulgador.nome'),json_extract_string(_source,'$.sistema.nome'),json_extract_string(_source,'$.formato.nome'),json_extract_string(_source,'$.nivelSigilo'),json_extract_string(_source,'$.dataAjuizamento'),json_extract_string(_source,'$.dataHoraUltimaAtualizacao'),json_extract(_source,'$.movimentos'),TRY_CAST(json_array_length(json_extract(_source,'$.movimentos')) AS INTEGER) FROM read_json('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-RN/part-*.ndjson.gz',format='newline_delimited',maximum_object_size=20000000,columns={_id: 'VARCHAR', _index: 'VARCHAR', _source: 'JSON', _score: 'DOUBLE', sort: 'JSON'});
INSERT INTO docs BY NAME SELECT 'TRE-RO','N2','eleitoral',_id,_index,json_extract_string(_source,'$.numeroProcesso'),json_extract_string(_source,'$.classe.codigo'),json_extract_string(_source,'$.classe.nome'),json_extract(_source,'$.assuntos'),json_extract_string(_source,'$.tribunal'),json_extract_string(_source,'$.grau'),json_extract_string(_source,'$.orgaoJulgador.codigo'),json_extract_string(_source,'$.orgaoJulgador.nome'),json_extract_string(_source,'$.sistema.nome'),json_extract_string(_source,'$.formato.nome'),json_extract_string(_source,'$.nivelSigilo'),json_extract_string(_source,'$.dataAjuizamento'),json_extract_string(_source,'$.dataHoraUltimaAtualizacao'),json_extract(_source,'$.movimentos'),TRY_CAST(json_array_length(json_extract(_source,'$.movimentos')) AS INTEGER) FROM read_json('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-RO/part-*.ndjson.gz',format='newline_delimited',maximum_object_size=20000000,columns={_id: 'VARCHAR', _index: 'VARCHAR', _source: 'JSON', _score: 'DOUBLE', sort: 'JSON'});
INSERT INTO docs BY NAME SELECT 'TRE-RR','N2','eleitoral',_id,_index,json_extract_string(_source,'$.numeroProcesso'),json_extract_string(_source,'$.classe.codigo'),json_extract_string(_source,'$.classe.nome'),json_extract(_source,'$.assuntos'),json_extract_string(_source,'$.tribunal'),json_extract_string(_source,'$.grau'),json_extract_string(_source,'$.orgaoJulgador.codigo'),json_extract_string(_source,'$.orgaoJulgador.nome'),json_extract_string(_source,'$.sistema.nome'),json_extract_string(_source,'$.formato.nome'),json_extract_string(_source,'$.nivelSigilo'),json_extract_string(_source,'$.dataAjuizamento'),json_extract_string(_source,'$.dataHoraUltimaAtualizacao'),json_extract(_source,'$.movimentos'),TRY_CAST(json_array_length(json_extract(_source,'$.movimentos')) AS INTEGER) FROM read_json('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-RR/part-*.ndjson.gz',format='newline_delimited',maximum_object_size=20000000,columns={_id: 'VARCHAR', _index: 'VARCHAR', _source: 'JSON', _score: 'DOUBLE', sort: 'JSON'});
INSERT INTO docs BY NAME SELECT 'TRE-SE','N2','eleitoral',_id,_index,json_extract_string(_source,'$.numeroProcesso'),json_extract_string(_source,'$.classe.codigo'),json_extract_string(_source,'$.classe.nome'),json_extract(_source,'$.assuntos'),json_extract_string(_source,'$.tribunal'),json_extract_string(_source,'$.grau'),json_extract_string(_source,'$.orgaoJulgador.codigo'),json_extract_string(_source,'$.orgaoJulgador.nome'),json_extract_string(_source,'$.sistema.nome'),json_extract_string(_source,'$.formato.nome'),json_extract_string(_source,'$.nivelSigilo'),json_extract_string(_source,'$.dataAjuizamento'),json_extract_string(_source,'$.dataHoraUltimaAtualizacao'),json_extract(_source,'$.movimentos'),TRY_CAST(json_array_length(json_extract(_source,'$.movimentos')) AS INTEGER) FROM read_json('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-SE/part-*.ndjson.gz',format='newline_delimited',maximum_object_size=20000000,columns={_id: 'VARCHAR', _index: 'VARCHAR', _source: 'JSON', _score: 'DOUBLE', sort: 'JSON'});
INSERT INTO docs BY NAME SELECT 'TRE-TO','N2','eleitoral',_id,_index,json_extract_string(_source,'$.numeroProcesso'),json_extract_string(_source,'$.classe.codigo'),json_extract_string(_source,'$.classe.nome'),json_extract(_source,'$.assuntos'),json_extract_string(_source,'$.tribunal'),json_extract_string(_source,'$.grau'),json_extract_string(_source,'$.orgaoJulgador.codigo'),json_extract_string(_source,'$.orgaoJulgador.nome'),json_extract_string(_source,'$.sistema.nome'),json_extract_string(_source,'$.formato.nome'),json_extract_string(_source,'$.nivelSigilo'),json_extract_string(_source,'$.dataAjuizamento'),json_extract_string(_source,'$.dataHoraUltimaAtualizacao'),json_extract(_source,'$.movimentos'),TRY_CAST(json_array_length(json_extract(_source,'$.movimentos')) AS INTEGER) FROM read_json('G:/datajud_raw/nivel_2_regionais/eleitoral/TRE-TO/part-*.ndjson.gz',format='newline_delimited',maximum_object_size=20000000,columns={_id: 'VARCHAR', _index: 'VARCHAR', _source: 'JSON', _score: 'DOUBLE', sort: 'JSON'});

-- ---------------------------------------------------------------------
-- Validação pós-carga (princípio: nada pode ser descartado)
-- ---------------------------------------------------------------------

SELECT '== Totais ==' AS info, '' AS valor
UNION ALL SELECT 'Total registros', COUNT(*)::VARCHAR FROM docs
UNION ALL SELECT 'Total endpoints', COUNT(DISTINCT endpoint)::VARCHAR FROM docs
UNION ALL SELECT 'numero_processo distintos (strings)', COUNT(DISTINCT numero_processo)::VARCHAR FROM docs
UNION ALL SELECT 'numero_processo NULOS', SUM(CASE WHEN numero_processo IS NULL THEN 1 ELSE 0 END)::VARCHAR FROM docs
UNION ALL SELECT 'numero_processo com tamanho <> 20', SUM(CASE WHEN numero_processo IS NOT NULL AND length(numero_processo) <> 20 THEN 1 ELSE 0 END)::VARCHAR FROM docs
UNION ALL SELECT '_id NULOS', SUM(CASE WHEN _id IS NULL THEN 1 ELSE 0 END)::VARCHAR FROM docs
UNION ALL SELECT 'Total pulsos (movimentos somados)', SUM(qtd_movimentos)::VARCHAR FROM docs
UNION ALL SELECT 'Média movs/registro', ROUND(AVG(qtd_movimentos),1)::VARCHAR FROM docs;

-- Contagem por endpoint (checagem de saúde — cada endpoint carregou o que o scraper baixou?)
SELECT '== Por endpoint ==' AS info, '' AS qtd
UNION ALL
SELECT endpoint, COUNT(*)::VARCHAR FROM docs GROUP BY endpoint ORDER BY endpoint;
