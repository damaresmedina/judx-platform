# Queries Cookbook — Receitas Prontas

Queries já testadas e validadas. Copiar e executar — não reinventar.

## STATUS GERAL

### Estado dos bancos
```sql
-- JudX
SELECT 'stf_decisoes' as t, COUNT(*) as n FROM stf_decisoes
UNION ALL SELECT 'judx_case', COUNT(*) FROM judx_case
UNION ALL SELECT 'judx_decision', COUNT(*) FROM judx_decision
UNION ALL SELECT 'stf_partes', COUNT(*) FROM stf_partes
UNION ALL SELECT 'stj_temas', COUNT(*) FROM stj_temas
UNION ALL SELECT 'stj_processos_semente', COUNT(*) FROM stj_processos_semente
UNION ALL SELECT 'stj_contramostra', COUNT(*) FROM stj_contramostra;
```

### Pipeline progress
```sql
SELECT COUNT(*) as cases, ROUND(COUNT(*)*100.0/169851,1) as pct,
  MAX(created_at) as ultimo
FROM judx_case WHERE court_id = (SELECT id FROM judx_court WHERE acronym='STF');
```

### Partes progress
```sql
SELECT COUNT(DISTINCT incidente) as incidentes, COUNT(*) as partes,
  MAX(created_at) as ultimo FROM stf_partes;
```

## STF — ANÁLISES

### Taxa de não-decisão (79%)
```sql
SELECT descricao_andamento, COUNT(*) as n,
  ROUND(COUNT(*)*100.0/SUM(COUNT(*)) OVER(),1) as pct
FROM stf_decisoes GROUP BY 1 ORDER BY n DESC LIMIT 20;
```

### Divergência por ano
```sql
SELECT SUBSTRING(data_decisao FROM '\d{4}$')::int as ano,
  COUNT(*) as total,
  SUM(CASE WHEN observacao_andamento ILIKE '%vencido%' THEN 1 ELSE 0 END) as diverg,
  ROUND(SUM(CASE WHEN observacao_andamento ILIKE '%vencido%' THEN 1 ELSE 0 END)*100.0/NULLIF(COUNT(*),0),1) as pct
FROM stf_decisoes
WHERE tipo_decisao = 'COLEGIADA' AND decisoes_virtual = true
  AND data_decisao ~ '\d{2}/\d{2}/\d{4}'
  AND SUBSTRING(data_decisao FROM '\d{4}$')::int >= 2016
GROUP BY ano ORDER BY ano;
```

### Contrafactual Marco Aurélio
```sql
SELECT SUBSTRING(data_decisao FROM '\d{4}$')::int as ano,
  COUNT(*) as total,
  ROUND(SUM(CASE WHEN observacao_andamento ILIKE '%vencido%' THEN 1 ELSE 0 END)*100.0/NULLIF(COUNT(*),0),1) as pct_com_ma,
  ROUND(SUM(CASE WHEN observacao_andamento ILIKE '%vencido%' AND relator_decisao NOT ILIKE '%MARCO%' THEN 1 ELSE 0 END)*100.0/
    NULLIF(SUM(CASE WHEN relator_decisao NOT ILIKE '%MARCO%' THEN 1 ELSE 0 END),0),1) as pct_sem_ma
FROM stf_decisoes
WHERE tipo_decisao = 'COLEGIADA' AND decisoes_virtual = true
  AND data_decisao ~ '\d{2}/\d{2}/\d{4}'
  AND SUBSTRING(data_decisao FROM '\d{4}$')::int BETWEEN 2018 AND 2025
GROUP BY ano ORDER BY ano;
```

### Ministros vencidos (quem é nomeado no texto)
```sql
SELECT (regexp_matches(observacao_andamento,
  'vencid[ao]s?\s+(?:o|a|os|as)\s+Ministr[ao]s?\s+([^,.;–—]+)', 'i'))[1] as ministro,
  COUNT(*) as n
FROM stf_decisoes
WHERE tipo_decisao = 'COLEGIADA' AND observacao_andamento ~* 'vencid[ao]'
GROUP BY 1 ORDER BY 2 DESC LIMIT 20;
```

### Bloco Mendonça+Nunes — onde são vencidos
```sql
SELECT ramo_direito, COUNT(*) as n
FROM stf_decisoes
WHERE observacao_andamento ~* 'vencid[ao].{0,80}(Mendonça|Nunes Marques)'
  AND SUBSTRING(data_decisao FROM '\d{4}$')::int >= 2021
GROUP BY 1 ORDER BY 2 DESC;
```

### Unanimidade por órgão
```sql
SELECT orgao_julgador,
  COUNT(*) as total,
  SUM(CASE WHEN observacao_andamento ILIKE '%unanimidade%' THEN 1 ELSE 0 END) as unanimes,
  ROUND(SUM(CASE WHEN observacao_andamento ILIKE '%unanimidade%' THEN 1 ELSE 0 END)*100.0/NULLIF(COUNT(*),0),1) as pct
FROM stf_decisoes WHERE tipo_decisao = 'COLEGIADA' AND decisoes_virtual = true
GROUP BY 1 HAVING COUNT(*) > 50 ORDER BY total DESC;
```

### Volume por sessão semanal (pico)
```sql
SELECT DATE_TRUNC('week', TO_DATE(data_decisao, 'DD/MM/YYYY')) as semana,
  COUNT(*) as processos, COUNT(DISTINCT relator_decisao) as relatores,
  ROUND(COUNT(*)*1.0/NULLIF(COUNT(DISTINCT relator_decisao),0),1) as media
FROM stf_decisoes
WHERE decisoes_virtual = true AND tipo_decisao = 'COLEGIADA'
  AND data_decisao ~ '^\d{2}/\d{2}/\d{4}'
GROUP BY semana ORDER BY processos DESC LIMIT 10;
```

### Top relatores no virtual
```sql
SELECT relator_decisao, COUNT(*) as n
FROM stf_decisoes WHERE decisoes_virtual = true AND relator_decisao IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC LIMIT 15;
```

### Divergência por ramo
```sql
SELECT ramo_direito,
  COUNT(*) as total,
  ROUND(SUM(CASE WHEN observacao_andamento ILIKE '%vencido%' THEN 1 ELSE 0 END)*100.0/NULLIF(COUNT(*),0),1) as pct
FROM stf_decisoes WHERE tipo_decisao = 'COLEGIADA' AND decisoes_virtual = true AND ramo_direito IS NOT NULL
GROUP BY 1 HAVING COUNT(*) > 50 ORDER BY pct DESC;
```

## STJ — ANÁLISES

### Temas por ramo
```sql
SELECT ramo_direito, COUNT(*) as temas,
  ROUND(AVG(data_julgamento - data_afetacao)) as dias_medio
FROM stj_temas WHERE data_afetacao IS NOT NULL AND data_julgamento IS NOT NULL
GROUP BY 1 ORDER BY dias_medio DESC;
```

### Top tribunais de origem
```sql
SELECT tribunal_origem, COUNT(*) as n
FROM stj_processos_semente WHERE tribunal_origem IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
```

### Top relatores que afetam
```sql
SELECT relator, COUNT(*) as temas,
  COUNT(*) FILTER (WHERE situacao = 'transito_em_julgado') as transito,
  COUNT(*) FILTER (WHERE situacao = 'afetado') as pendentes
FROM stj_temas WHERE relator IS NOT NULL
GROUP BY 1 ORDER BY temas DESC LIMIT 15;
```

### Circuitos STJ↔STF
```sql
SELECT numero, ramo_direito, situacao, link_stf_rg
FROM stj_temas WHERE link_stf_rg IS NOT NULL
ORDER BY numero DESC LIMIT 20;
```

## ICONS — ANÁLISES

### Top dispositivos por decidibilidade (BANCO ICONS, não JudX)
```sql
SELECT o.slug, COUNT(DISTINCT e.source_id) as decisoes
FROM objects o JOIN edges e ON e.target_id = o.id
WHERE e.type_slug = 'ancora_normativa' AND o.type_slug = 'artigo'
GROUP BY o.id, o.slug ORDER BY decisoes DESC LIMIT 20;
```

## GOTCHAS IMPORTANTES

- data_decisao é TEXT (DD/MM/YYYY), usar: SUBSTRING(data_decisao FROM '\d{4}$')::int para ano
- court_id é UUID: SELECT id FROM judx_court WHERE acronym='STF'
- ICONS usa type_slug (não edge_type), sem coluna label
- Join judx_decision↔stf_decisoes via metadata->>'incidente' é LENTO — usar stf_decisoes direto
- decisoes_virtual = true cobre 85% do corpus (campo ambiente_julgamento só para 2026)
- observacao_andamento = texto longo da decisão; descricao_andamento = categoria curta
