-- 02-catalogo-strings.sql
-- Catálogo de strings: quantos processos atravessaram quantos endpoints.
-- ZERO dedupe. Preserva toda manifestação.

-- 1. Distribuição: strings × quantidade de endpoints atravessados
SELECT
  qtd_endpoints,
  COUNT(*) AS strings,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS pct
FROM (
  SELECT numero_processo, COUNT(DISTINCT endpoint) AS qtd_endpoints
  FROM docs
  WHERE numero_processo IS NOT NULL
  GROUP BY numero_processo
)
GROUP BY qtd_endpoints
ORDER BY qtd_endpoints;

-- 2. Pares de endpoints mais frequentes (strings que tocaram A e B)
WITH pares AS (
  SELECT
    LEAST(a.endpoint, b.endpoint) AS e1,
    GREATEST(a.endpoint, b.endpoint) AS e2,
    a.numero_processo
  FROM docs a
  JOIN docs b USING (numero_processo)
  WHERE a.endpoint < b.endpoint
    AND a.numero_processo IS NOT NULL
)
SELECT e1, e2, COUNT(DISTINCT numero_processo) AS strings_em_comum
FROM pares
GROUP BY e1, e2
ORDER BY strings_em_comum DESC
LIMIT 20;

-- 3. Strings multi-nível (atravessaram mais de um dos N0-N4)
SELECT
  nivel_combo,
  COUNT(*) AS strings
FROM (
  SELECT
    numero_processo,
    string_agg(DISTINCT nivel, '→' ORDER BY nivel) AS nivel_combo
  FROM docs
  WHERE numero_processo IS NOT NULL
  GROUP BY numero_processo
  HAVING COUNT(DISTINCT nivel) > 1
)
GROUP BY nivel_combo
ORDER BY strings DESC;
