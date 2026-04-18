-- 03-trilha-do-processo.sql
-- Reconstituição da biografia de um processo específico.
-- Substitua :numero pelo numero_processo desejado.

-- A. Todas as manifestações ordenadas por tempo
SELECT
  endpoint,
  nivel,
  especialidade,
  grau,
  orgao_nome,
  data_hora_ult_atual,
  qtd_movimentos,
  classe_nome
FROM docs
WHERE numero_processo = :numero
ORDER BY data_hora_ult_atual;

-- B. Trilha de pulsos (movimentos) unificada
-- unnest movimentos[] preservando de qual endpoint veio
WITH movs_unidos AS (
  SELECT
    endpoint,
    nivel,
    grau,
    json_extract_string(m, '$.codigo') AS mov_codigo,
    json_extract_string(m, '$.nome') AS mov_nome,
    TRY_CAST(json_extract_string(m, '$.dataHora') AS TIMESTAMP) AS mov_quando,
    json_extract_string(m, '$.orgaoJulgador.nome') AS mov_orgao
  FROM docs,
       UNNEST(CAST(movimentos AS JSON[])) AS t(m)
  WHERE numero_processo = :numero
)
SELECT *
FROM movs_unidos
ORDER BY mov_quando;

-- C. Tempo entre pulsos (gaps temporais na biografia)
WITH t AS (
  SELECT mov_quando, mov_nome, endpoint,
         LAG(mov_quando) OVER (ORDER BY mov_quando) AS anterior
  FROM (
    SELECT
      endpoint,
      TRY_CAST(json_extract_string(m, '$.dataHora') AS TIMESTAMP) AS mov_quando,
      json_extract_string(m, '$.nome') AS mov_nome
    FROM docs, UNNEST(CAST(movimentos AS JSON[])) AS t(m)
    WHERE numero_processo = :numero
  )
)
SELECT
  mov_quando, endpoint, mov_nome,
  DATE_DIFF('day', anterior, mov_quando) AS dias_desde_anterior
FROM t
WHERE anterior IS NOT NULL
ORDER BY mov_quando;
