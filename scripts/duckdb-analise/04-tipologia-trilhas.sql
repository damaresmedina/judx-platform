-- 04-tipologia-trilhas.sql
-- Classificação empírica de trilhas por número de pulsos totais (movs somados
-- entre todas as manifestações) e por número de nós atravessados.

-- Tipologia proposta (a partir da memória de ontologias e heurísticas):
--   curta        < 10 movs
--   normal       10 - 100 movs
--   longa        100 - 1.000 movs
--   patologica   1.000+ movs

WITH strings AS (
  SELECT
    numero_processo,
    COUNT(DISTINCT endpoint) AS endpoints_tocados,
    COUNT(DISTINCT nivel) AS niveis_tocados,
    COUNT(DISTINCT especialidade) AS especialidades_tocadas,
    SUM(qtd_movimentos) AS movs_total,
    MIN(data_hora_ult_atual) AS primeira_manifestacao,
    MAX(data_hora_ult_atual) AS ultima_manifestacao
  FROM docs
  WHERE numero_processo IS NOT NULL
  GROUP BY numero_processo
)
SELECT
  CASE
    WHEN movs_total < 10 THEN '1-curta (<10)'
    WHEN movs_total < 100 THEN '2-normal (10-100)'
    WHEN movs_total < 1000 THEN '3-longa (100-1k)'
    ELSE '4-patologica (1k+)'
  END AS tipologia,
  COUNT(*) AS strings,
  SUM(movs_total) AS pulsos_totais,
  AVG(endpoints_tocados)::DOUBLE AS endpoints_medio,
  AVG(niveis_tocados)::DOUBLE AS niveis_medio,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS pct_strings
FROM strings
GROUP BY tipologia
ORDER BY tipologia;

-- Top 10 trilhas patológicas (mais pulsos)
SELECT *
FROM (
  SELECT
    numero_processo,
    COUNT(DISTINCT endpoint) AS endpoints,
    string_agg(DISTINCT endpoint, ',' ORDER BY endpoint) AS endpoints_lista,
    SUM(qtd_movimentos) AS pulsos,
    MAX(data_hora_ult_atual) - MIN(data_hora_ult_atual) AS duracao
  FROM docs
  WHERE numero_processo IS NOT NULL
  GROUP BY numero_processo
) ORDER BY pulsos DESC LIMIT 10;
