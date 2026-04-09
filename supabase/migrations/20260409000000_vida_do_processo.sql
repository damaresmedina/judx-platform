-- vida_do_processo: linha decisória de cada processo no STF
-- Cada processo é uma linha, cada decisão cronológica uma coluna
-- Fonte: stf_master (2.927.525 decisões) pivotado por incidente
-- Presidente do STF em cada decisão: JOIN com stf_composicao_temporal
-- Criado em: 2026-04-09

DROP TABLE IF EXISTS vida_do_processo;

CREATE TABLE vida_do_processo (
  incidente bigint PRIMARY KEY,
  classe text,
  n_decisoes smallint,
  -- Decisão 1 (primeira cronologicamente)
  dec_1 text, data_1 date, orgao_1 text, relator_1 text, presidente_1 text,
  -- Decisão 2
  dec_2 text, data_2 date, orgao_2 text, relator_2 text, presidente_2 text,
  -- Decisão 3
  dec_3 text, data_3 date, orgao_3 text, relator_3 text, presidente_3 text,
  -- Decisão 4
  dec_4 text, data_4 date, orgao_4 text, relator_4 text, presidente_4 text,
  -- Decisão 5
  dec_5 text, data_5 date, orgao_5 text, relator_5 text, presidente_5 text,
  -- Decisões 6+ em JSONB
  overflow jsonb
);

-- População: feita por faixas de n_decisoes (1, 2, 3, 4, 5, 6+)
-- GROUP BY incidente (sem relator, pois relator pode mudar entre decisões)
-- ROW_NUMBER ordenado por data_decisao, id_fato_decisao
-- JOIN com stf_composicao_temporal para presidente em cada data
-- DISTINCT ON para resolver sobreposição de mandatos presidenciais

-- Índices
CREATE INDEX idx_vdp_incidente ON vida_do_processo(incidente);
CREATE INDEX idx_vdp_classe ON vida_do_processo(classe);
CREATE INDEX idx_vdp_n_decisoes ON vida_do_processo(n_decisoes);
CREATE INDEX idx_vdp_orgao1 ON vida_do_processo(orgao_1);
CREATE INDEX idx_vdp_relator1 ON vida_do_processo(relator_1);
CREATE INDEX idx_vdp_data1 ON vida_do_processo(data_1);

-- Resultado: 2.212.761 processos
-- n_decisoes=1: 1.694.089 (76,6%)
-- n_decisoes=2: 393.333 (17,8%)
-- n_decisoes=3: 88.120 (4,0%)
-- n_decisoes=4: 23.924 (1,1%)
-- n_decisoes=5: 7.592 (0,3%)
-- n_decisoes>=6: 5.703 (0,3%) — com overflow JSONB

-- Regra fundante: cada evento registrado tem lastro em dado primário.
-- Se o Corte Aberta não registra distribuição como decisão, ela não entra.
-- orgao_julgador distingue: PRESIDÊNCIA / MONOCRÁTICA / 1ª TURMA / 2ª TURMA / TRIBUNAL PLENO
-- presidente_N identifica quem era presidente do STF na data de cada decisão
