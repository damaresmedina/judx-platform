-- =========================================================
-- JUDX :: VALIDATION QUERIES
-- Consultas prontas para validar a camada ontológica JudX
-- Colar diretamente no Supabase SQL Editor
-- =========================================================


-- =========================================================
-- 1. COMPARE VIRTUAL vs PRESENTIAL DECISIONS
-- Conta decisões por session_environment com totais e percentuais.
-- =========================================================

select
  d.session_environment,
  count(*)                                              as total,
  round(
    count(*) * 100.0 / nullif(sum(count(*)) over (), 0),
    2
  )                                                     as pct
from judx_decision d
group by d.session_environment
order by total desc;


-- =========================================================
-- 2. LIST CASES WITH DESTAQUE (HIGHLIGHT)
-- Casos cujo regime de julgamento indica destaque,
-- com detalhes do caso, tribunal e classe.
-- =========================================================

select
  c.external_number,
  co.acronym                        as court,
  pc.normalized_name                as procedural_class,
  s.normalized_name                 as main_subject,
  jr.was_highlighted,
  jr.highlight_count,
  jr.first_highlight_at,
  jr.last_highlight_at,
  jr.judgment_path,
  jr.initial_environment,
  jr.final_environment
from judx_judgment_regime jr
join judx_case c   on c.id  = jr.case_id
join judx_court co on co.id = c.court_id
left join judx_procedural_class pc on pc.id = c.procedural_class_id
left join judx_subject s           on s.id  = c.main_subject_id
where jr.was_highlighted = true
order by jr.last_highlight_at desc nulls last;


-- =========================================================
-- 3. CLASSES AND SUBJECTS THAT MIGRATE TO PRESENTIAL
-- Cruza judx_case com judx_judgment_regime para identificar
-- classes e assuntos cujo judgment_path indica migração
-- do virtual para o presencial.
-- =========================================================

select
  pc.normalized_name                as procedural_class,
  s.normalized_name                 as main_subject,
  jr.judgment_path,
  count(*)                          as case_count
from judx_judgment_regime jr
join judx_case c on c.id = jr.case_id
left join judx_procedural_class pc on pc.id = c.procedural_class_id
left join judx_subject s           on s.id  = c.main_subject_id
where jr.judgment_path = 'virtual_para_presencial'
group by pc.normalized_name, s.normalized_name, jr.judgment_path
order by case_count desc;


-- =========================================================
-- 4. RAPPORTEUR PREVALENCE RATE
-- A partir de judx_judge_position_in_case (role = 'relator'),
-- calcula taxas de prevalência (majority_side), vencido e
-- substituição (outro relator conduziu o voto condutor).
-- =========================================================

select
  j.name                                                  as judge_name,
  count(*)                                                as total_as_relator,
  count(*) filter (where jp.majority_side = true)         as prevaleceu,
  count(*) filter (where jp.majority_side = false)        as vencido,
  count(*) filter (where jp.leading_vote = false
                     and jp.majority_side is not null)    as substituido,
  round(
    count(*) filter (where jp.majority_side = true) * 100.0
    / nullif(count(*), 0), 2
  )                                                       as pct_prevaleceu,
  round(
    count(*) filter (where jp.majority_side = false) * 100.0
    / nullif(count(*), 0), 2
  )                                                       as pct_vencido
from judx_judge_position_in_case jp
join judx_judge j on j.id = jp.judge_id
where jp.role = 'relator'
group by j.name
order by total_as_relator desc;


-- =========================================================
-- 5. FREQUENCY OF RELATOR-PARA-ACORDAO (RAPPORTEUR SUBSTITUTION)
-- Conta quantas vezes o relator foi substituído como condutor
-- do acórdão, agrupado por tribunal e órgão.
-- Um relator é considerado "substituído" quando role = 'relator'
-- mas leading_vote = false (outro ministro redigiu o acórdão).
-- =========================================================

select
  co.acronym                        as court,
  o.name                            as organ,
  count(*)                          as substitution_count
from judx_judge_position_in_case jp
join judx_case c   on c.id  = jp.case_id
join judx_court co on co.id = c.court_id
left join judx_organ o on o.id = c.organ_id
where jp.role = 'relator'
  and jp.leading_vote = false
group by co.acronym, o.name
order by substitution_count desc;


-- =========================================================
-- 6. COMPARE RAPPORTEUR PREVALENCE BY ENVIRONMENT
-- Compara taxas de prevalência do relator entre ambientes
-- virtual e presencial.
-- =========================================================

select
  d.session_environment,
  count(*)                                                as total_as_relator,
  count(*) filter (where jp.majority_side = true)         as prevaleceu,
  count(*) filter (where jp.majority_side = false)        as vencido,
  round(
    count(*) filter (where jp.majority_side = true) * 100.0
    / nullif(count(*), 0), 2
  )                                                       as pct_prevaleceu,
  round(
    count(*) filter (where jp.majority_side = false) * 100.0
    / nullif(count(*), 0), 2
  )                                                       as pct_vencido
from judx_judge_position_in_case jp
join judx_decision d on d.id = jp.decision_id
where jp.role = 'relator'
  and d.session_environment in ('virtual', 'presencial')
group by d.session_environment
order by d.session_environment;


-- =========================================================
-- 7. DISTRIBUTION OF ENVIRONMENT EVENTS
-- Conta eventos por event_type na tabela
-- judx_judgment_environment_event.
-- =========================================================

select
  e.event_type,
  count(*)                                              as total,
  round(
    count(*) * 100.0 / nullif(sum(count(*)) over (), 0),
    2
  )                                                     as pct
from judx_judgment_environment_event e
group by e.event_type
order by total desc;


-- =========================================================
-- 8. UNNAMED PATTERNS AND LATENT SIGNALS
-- Lista registros de judx_unknown_pattern_registry e
-- judx_latent_signal com status e recorrência.
-- =========================================================

-- 8a. Unknown pattern registry
select
  'unknown_pattern'                 as source,
  upr.pattern_label,
  upr.description,
  upr.status,
  upr.recurrence,
  upr.first_seen_at,
  upr.last_seen_at,
  upr.hypothesis,
  upr.linked_cases,
  upr.linked_events
from judx_unknown_pattern_registry upr
order by upr.recurrence desc, upr.last_seen_at desc nulls last;

-- 8b. Latent signals
select
  'latent_signal'                   as source,
  ls.signal_domain,
  ls.signal_name,
  ls.signal_value,
  ls.extracted_from,
  ls.signal_payload,
  c.external_number                 as case_number,
  j.name                            as judge_name,
  ls.created_at
from judx_latent_signal ls
left join judx_case c  on c.id = ls.case_id
left join judx_judge j on j.id = ls.judge_id
order by ls.created_at desc;


-- =========================================================
-- 9. CROSS ENVIRONMENT x TECHNIQUE x RESULT
-- Tabulação cruzada de session_environment, technique e
-- result na tabela judx_decision, revelando padrões.
-- =========================================================

select
  d.session_environment,
  d.technique,
  d.result,
  count(*)                          as total
from judx_decision d
where d.technique is not null
group by d.session_environment, d.technique, d.result
order by d.session_environment, total desc;


-- =========================================================
-- 10. PIPELINE HEALTH CHECK
-- Conta registros em cada tabela judx_* para verificar
-- se o pipeline populou corretamente.
-- =========================================================

select 'judx_court'                       as table_name, count(*) as row_count from judx_court
union all
select 'judx_ecology',                                   count(*) from judx_ecology
union all
select 'judx_organ',                                     count(*) from judx_organ
union all
select 'judx_procedural_class',                          count(*) from judx_procedural_class
union all
select 'judx_subject',                                   count(*) from judx_subject
union all
select 'judx_litigant',                                  count(*) from judx_litigant
union all
select 'judx_case',                                      count(*) from judx_case
union all
select 'judx_case_litigant',                             count(*) from judx_case_litigant
union all
select 'judx_judgment_regime',                           count(*) from judx_judgment_regime
union all
select 'judx_judgment_environment_event',                count(*) from judx_judgment_environment_event
union all
select 'judx_judge',                                     count(*) from judx_judge
union all
select 'judx_decision',                                  count(*) from judx_decision
union all
select 'judx_collegial_context',                         count(*) from judx_collegial_context
union all
select 'judx_judge_position_in_case',                    count(*) from judx_judge_position_in_case
union all
select 'judx_situated_profile',                          count(*) from judx_situated_profile
union all
select 'judx_environmental_profile',                     count(*) from judx_environmental_profile
union all
select 'judx_decision_line',                             count(*) from judx_decision_line
union all
select 'judx_decision_line_case',                        count(*) from judx_decision_line_case
union all
select 'judx_decisional_dna',                            count(*) from judx_decisional_dna
union all
select 'judx_regime_outcome_profile',                    count(*) from judx_regime_outcome_profile
union all
select 'judx_environment_inference',                     count(*) from judx_environment_inference
union all
select 'judx_emergent_taxonomy',                         count(*) from judx_emergent_taxonomy
union all
select 'judx_latent_signal',                             count(*) from judx_latent_signal
union all
select 'judx_unknown_pattern_registry',                  count(*) from judx_unknown_pattern_registry
union all
select 'judx_intercourt_relation',                       count(*) from judx_intercourt_relation
union all
select 'judx_intercourt_pattern',                        count(*) from judx_intercourt_pattern
union all
select 'judx_ingest_source',                             count(*) from judx_ingest_source
union all
select 'judx_raw_document',                              count(*) from judx_raw_document
union all
select 'judx_normalization_log',                         count(*) from judx_normalization_log
union all
select 'judx_inference_rule',                            count(*) from judx_inference_rule
union all
select 'judx_inference_log',                             count(*) from judx_inference_log
union all
select 'judx_prompt_template',                           count(*) from judx_prompt_template
union all
select 'judx_system_principle',                          count(*) from judx_system_principle
order by table_name;


-- =========================================================
-- 11. INFERENCE CONFIDENCE DISTRIBUTION
-- Distribuição de scores de confiança por campo inferido,
-- usando judx_inference_log e judx_environment_inference
-- (as duas tabelas com campo confidence).
-- =========================================================

-- 11a. judx_inference_log — confidence by target_table and status
select
  il.target_table                    as inferred_field,
  il.status,
  count(*)                           as total,
  round(avg(il.confidence), 4)       as avg_confidence,
  round(min(il.confidence), 4)       as min_confidence,
  round(max(il.confidence), 4)       as max_confidence,
  percentile_cont(0.5) within group (order by il.confidence) as median_confidence
from judx_inference_log il
where il.confidence is not null
group by il.target_table, il.status
order by il.target_table, il.status;

-- 11b. judx_environment_inference — confidence by inferred_driver
select
  ei.inferred_driver                 as inferred_field,
  ei.status,
  count(*)                           as total,
  round(avg(ei.confidence), 4)       as avg_confidence,
  round(min(ei.confidence), 4)       as min_confidence,
  round(max(ei.confidence), 4)       as max_confidence,
  percentile_cont(0.5) within group (order by ei.confidence) as median_confidence
from judx_environment_inference ei
where ei.confidence is not null
group by ei.inferred_driver, ei.status
order by ei.inferred_driver, ei.status;

-- 11c. judx_normalization_log — confidence by entity_type
select
  nl.entity_type                     as inferred_field,
  count(*)                           as total,
  round(avg(nl.confidence), 4)       as avg_confidence,
  round(min(nl.confidence), 4)       as min_confidence,
  round(max(nl.confidence), 4)       as max_confidence,
  percentile_cont(0.5) within group (order by nl.confidence) as median_confidence
from judx_normalization_log nl
where nl.confidence is not null
group by nl.entity_type
order by nl.entity_type;


-- =========================================================
-- 12. STATE LITIGATION PROFILE
-- Distribuição de state_involved e state_litigation_profile
-- na tabela judx_case.
-- =========================================================

-- 12a. Contagem por state_involved
select
  c.state_involved,
  count(*)                                              as total,
  round(
    count(*) * 100.0 / nullif(sum(count(*)) over (), 0),
    2
  )                                                     as pct
from judx_case c
group by c.state_involved
order by total desc;

-- 12b. Contagem por state_litigation_profile
select
  c.state_litigation_profile,
  count(*)                                              as total,
  round(
    count(*) * 100.0 / nullif(sum(count(*)) over (), 0),
    2
  )                                                     as pct
from judx_case c
where c.state_litigation_profile is not null
group by c.state_litigation_profile
order by total desc;

-- 12c. Cruzamento: state_litigation_profile x session_environment
select
  c.state_litigation_profile,
  d.session_environment,
  count(*)                          as total
from judx_case c
join judx_decision d on d.case_id = c.id
where c.state_involved = true
  and c.state_litigation_profile is not null
group by c.state_litigation_profile, d.session_environment
order by c.state_litigation_profile, total desc;
