-- ============================================================
-- JudX — Views preservadas do Supabase (DDL dump)
-- ============================================================
-- Gerado em: 2026-04-18T02:38:09.687Z
-- Autora: Damares Medina
-- Origem: extraídas de ejwyguskoiraredinqmb.supabase.co (pg_get_viewdef)
-- Motivo: 6 views existiam no banco de produção mas não estavam
--         versionadas em git. Preservação contra perda.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- VIEW: cadeia_recursal_completa
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.cadeia_recursal_completa AS
SELECT pa.tribunal_id,
    pa.processo_raiz AS raiz,
    pa.classe_raiz,
    pa.processo_pai AS pai,
    pa.classe_pai,
    pa.processo_filho AS filho,
    pa.classe_filho,
    pa.nivel_na_cadeia,
    pa.tipo_vinculo,
    d.orgao_decisorio,
    d.ministro_real AS relator_filho,
    d.ambiente_unificado,
    d.data_autuacao,
    ct.ministro AS presidente_stf_na_data
   FROM processo_ancoragem pa
     LEFT JOIN stf_decisoes d ON d.processo = pa.processo_filho
     LEFT JOIN composicao_temporal ct ON ct.tribunal_id = 'STF'::text AND ct.cargo = 'Presidente STF'::text AND d.data_autuacao >= ct.data_inicio AND d.data_autuacao <= COALESCE(ct.data_fim, '9999-12-31'::date);

-- ════════════════════════════════════════════════════════════
-- VIEW: judx_relator_environment_comparison
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.judx_relator_environment_comparison AS
SELECT j.id AS judge_id,
    j.name AS judge_name,
    co.acronym AS court_acronym,
    rdo.environment,
    count(*) AS total,
    count(*) FILTER (WHERE rdo.outcome = 'prevaleceu'::text) AS prevaleceu,
    count(*) FILTER (WHERE rdo.outcome = 'vencido'::text) AS vencido,
    count(*) FILTER (WHERE rdo.outcome = 'substituido_por_relator_acordao'::text) AS substituido,
    round(count(*) FILTER (WHERE rdo.outcome = 'prevaleceu'::text)::numeric / NULLIF(count(*), 0)::numeric, 4) AS prevalence_rate,
    round(count(*) FILTER (WHERE rdo.outcome = 'vencido'::text)::numeric / NULLIF(count(*), 0)::numeric, 4) AS defeat_rate,
    round(count(*) FILTER (WHERE rdo.outcome = 'substituido_por_relator_acordao'::text)::numeric / NULLIF(count(*), 0)::numeric, 4) AS substitution_rate
   FROM judx_relator_decision_outcome rdo
     JOIN judx_judge j ON j.id = rdo.relator_judge_id
     JOIN judx_case c ON c.id = rdo.case_id
     JOIN judx_court co ON co.id = c.court_id
  GROUP BY j.id, j.name, co.acronym, rdo.environment;

-- ════════════════════════════════════════════════════════════
-- VIEW: nao_decisoes_presidencia
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.nao_decisoes_presidencia AS
SELECT d.processo,
    d.data_autuacao,
    d.data_decisao,
    d.ministro_real AS presidente_na_data,
    d.descricao_andamento AS andamento,
    d.tipo_decisao,
    d.ambiente_unificado AS ambiente,
    ct.ministro AS presidente_stf_oficial,
    split_part(d.processo, ' '::text, 1) AS classe,
    pa.re_numero_origem,
    pa.re_tribunal_origem,
    pa.tipo_vinculo_codigo
   FROM stf_decisoes d
     LEFT JOIN composicao_temporal ct ON ct.tribunal_id = 'STF'::text AND ct.cargo = 'Presidente STF'::text AND d.data_autuacao >= ct.data_inicio AND d.data_autuacao <= COALESCE(ct.data_fim, '9999-12-31'::date)
     LEFT JOIN processo_ancoragem pa ON pa.processo_filho = d.processo AND pa.tribunal_id = 'STF'::text
  WHERE d.orgao_decisorio = 'Presidência'::text AND (d.descricao_andamento ~~* '%inadmit%'::text OR d.descricao_andamento ~~* '%não conhec%'::text OR d.descricao_andamento ~~* '%negado seguimento%'::text OR d.descricao_andamento ~~* '%não provid%'::text OR d.descricao_andamento ~~* '%desprovid%'::text);

-- ════════════════════════════════════════════════════════════
-- VIEW: v_nao_decisao_presidencia
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_nao_decisao_presidencia AS
SELECT relator,
    ramo_direito,
    assunto_principal,
    EXTRACT(year FROM data_autuacao)::integer AS ano,
    resultado,
        CASE
            WHEN resultado ~~* '%negado seguimento%'::text THEN 'inadmitido'::text
            WHEN resultado ~~* '%determinad%'::text THEN 'devolvido_rg'::text
            WHEN resultado ~~* '%sobrestado%'::text THEN 'sobrestado'::text
            WHEN resultado ~~* '%prejudicado%'::text THEN 'prejudicado'::text
            ELSE 'outros'::text
        END AS categoria_nao_decisao
   FROM stf_universal
  WHERE (relator = ANY (ARRAY['MINISTRO PRESIDENTE'::text, 'VICE-PRESIDENTE'::text])) AND resultado IS NOT NULL AND resultado <> ''::text;

-- ════════════════════════════════════════════════════════════
-- VIEW: v_provimento
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_provimento AS
SELECT COALESCE(ministro_real, relator_atual) AS relator,
    ramo_direito,
    split_part(assunto, ' | '::text, 1) AS assunto_principal,
    "substring"(data_decisao, '\d{4}$'::text)::integer AS ano,
        CASE
            WHEN descricao_andamento ~~* '%provido%'::text AND descricao_andamento !~~* '%não provido%'::text AND descricao_andamento !~~* '%negado%'::text THEN 'provido'::text
            WHEN descricao_andamento ~~* 'procedente'::text THEN 'provido'::text
            WHEN descricao_andamento ~~* 'concedida a ordem%'::text THEN 'provido'::text
            WHEN descricao_andamento ~~* 'concedida a segurança%'::text THEN 'provido'::text
            WHEN descricao_andamento ~~* 'concedida a suspensão%'::text THEN 'provido'::text
            WHEN descricao_andamento ~~* 'conhecido e provido%'::text THEN 'provido'::text
            WHEN descricao_andamento ~~* 'embargos recebidos'::text THEN 'provido'::text
            WHEN descricao_andamento = 'Recebidos'::text THEN 'provido'::text
            WHEN descricao_andamento ~~* '%não provido%'::text THEN 'nao_provido'::text
            WHEN descricao_andamento ~~* '%negado%'::text THEN 'nao_provido'::text
            WHEN descricao_andamento ~~* 'improcedente%'::text THEN 'nao_provido'::text
            WHEN descricao_andamento ~~* 'embargos rejeitados%'::text THEN 'nao_provido'::text
            WHEN descricao_andamento ~~* 'denegada%'::text THEN 'nao_provido'::text
            WHEN descricao_andamento ~~* 'rejeitad%'::text THEN 'nao_provido'::text
            WHEN descricao_andamento ~~* 'conhecido e negado%'::text THEN 'nao_provido'::text
            WHEN descricao_andamento ~~* 'conhecido em parte e nessa parte negado%'::text THEN 'nao_provido'::text
            WHEN descricao_andamento ~~* '%em parte%'::text THEN 'parcial'::text
            WHEN descricao_andamento ~~* 'procedente em parte%'::text THEN 'parcial'::text
            WHEN descricao_andamento ~~* '%não conhecido%'::text THEN 'nao_conhecido'::text
            WHEN descricao_andamento ~~* 'embargos não conhecidos%'::text THEN 'nao_conhecido'::text
            WHEN descricao_andamento ~~* 'prejudicado%'::text THEN 'nao_conhecido'::text
            ELSE NULL::text
        END AS categoria_provimento
   FROM stf_decisoes
  WHERE (subgrupo_andamento = ANY (ARRAY['Decisão Final'::text, 'Decisão em recurso interno'::text])) AND data_decisao IS NOT NULL AND "substring"(data_decisao, '\d{4}$'::text)::integer >= 2016;

-- ════════════════════════════════════════════════════════════
-- VIEW: v_provimento_merito
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_provimento_merito AS
SELECT relator,
    orgao_julgador,
        CASE
            WHEN orgao_julgador = ANY (ARRAY['1ª Turma'::text, '1ª TURMA'::text]) THEN '1ª Turma'::text
            WHEN orgao_julgador = ANY (ARRAY['2ª Turma'::text, '2ª TURMA'::text]) THEN '2ª Turma'::text
            WHEN orgao_julgador = ANY (ARRAY['Tribunal Pleno'::text, 'TRIBUNAL PLENO'::text]) THEN 'Tribunal Pleno'::text
            ELSE orgao_julgador
        END AS orgao_norm,
    ramo_direito,
    assunto_principal,
    EXTRACT(year FROM data_autuacao)::integer AS ano,
    resultado,
        CASE
            WHEN resultado ~~* 'Agravo regimental provido'::text THEN 'provido'::text
            WHEN resultado ~~* 'Agravo provido e desde logo provido o RE'::text THEN 'provido'::text
            WHEN resultado ~~* 'Agravo provido e desde logo provido parcialmente o RE'::text THEN 'parcial'::text
            WHEN resultado ~~* 'Embargos recebidos como agravo regimental desde logo provido'::text THEN 'provido'::text
            WHEN resultado ~~* 'Provido'::text THEN 'provido'::text
            WHEN resultado ~~* 'Procedente'::text THEN 'provido'::text
            WHEN resultado ~~* 'Concedida a ordem'::text THEN 'provido'::text
            WHEN resultado ~~* 'Concedida a ordem de ofício'::text THEN 'provido'::text
            WHEN resultado ~~* 'Concedida a segurança'::text THEN 'provido'::text
            WHEN resultado ~~* 'Deferido'::text AND resultado !~~* '%indeferido%'::text THEN 'provido'::text
            WHEN resultado ~~* 'Conhecido e provido'::text THEN 'provido'::text
            WHEN resultado ~~* 'Agravo provido e desde logo negado seguimento ao RE'::text THEN 'provido'::text
            WHEN resultado ~~* '%em parte%'::text THEN 'parcial'::text
            WHEN resultado ~~* 'Conhecido em parte e nessa parte provido'::text THEN 'parcial'::text
            WHEN resultado ~~* 'Agravo regimental não provido'::text THEN 'nao_provido'::text
            WHEN resultado ~~* 'Agravo regimental não conhecido'::text THEN 'nao_provido'::text
            WHEN resultado ~~* 'Embargos recebidos como agravo regimental desde logo não provido'::text THEN 'nao_provido'::text
            WHEN resultado ~~* 'Embargos recebidos como agravo regimental desde logo não conhecido'::text THEN 'nao_provido'::text
            WHEN resultado ~~* 'Não provido'::text THEN 'nao_provido'::text
            WHEN resultado ~~* 'Improcedente'::text THEN 'nao_provido'::text
            WHEN resultado ~~* 'Denegada a ordem'::text THEN 'nao_provido'::text
            WHEN resultado ~~* 'Denegada a segurança'::text THEN 'nao_provido'::text
            WHEN resultado ~~* 'Indeferido'::text THEN 'nao_provido'::text
            WHEN resultado ~~* 'Embargos rejeitados'::text THEN 'nao_provido'::text
            WHEN resultado ~~* 'Rejeitados'::text THEN 'nao_provido'::text
            WHEN resultado ~~* 'Rejeitada a denúncia'::text THEN 'nao_provido'::text
            WHEN resultado ~~* 'Rejeitada a queixa'::text THEN 'nao_provido'::text
            WHEN resultado ~~* 'Conhecido e negado provimento'::text THEN 'nao_provido'::text
            WHEN resultado ~~* 'Conhecido em parte e nessa parte negado provimento'::text THEN 'nao_provido'::text
            WHEN resultado ~~* 'Agravo não provido'::text THEN 'nao_provido'::text
            WHEN resultado ~~* 'Não conhecido(s)'::text THEN 'nao_conhecido'::text
            WHEN resultado ~~* 'Embargos não conhecidos'::text THEN 'nao_conhecido'::text
            WHEN resultado ~~* 'Inadmitidos os embargos de divergência'::text THEN 'nao_conhecido'::text
            WHEN resultado ~~* 'Prejudicado'::text THEN 'neutro'::text
            WHEN resultado ~~* 'Extinto o processo'::text THEN 'neutro'::text
            WHEN resultado ~~* 'Homologada a desistência'::text THEN 'neutro'::text
            WHEN resultado ~~* 'Homologado o acordo'::text THEN 'neutro'::text
            WHEN resultado ~~* 'Sobrestado'::text THEN 'neutro'::text
            WHEN resultado ~~* 'Declinada a competência'::text THEN 'neutro'::text
            WHEN resultado ~~* 'Declarada a extinção da punibilidade'::text THEN 'neutro'::text
            WHEN resultado ~~* 'Questão de ordem'::text THEN 'neutro'::text
            WHEN resultado ~~* 'Recebida denúncia%'::text THEN 'excluido_natureza_distinta'::text
            WHEN resultado ~~* 'Recebida a queixa%'::text THEN 'excluido_natureza_distinta'::text
            WHEN resultado ~~* 'Recebidos'::text THEN 'excluido_natureza_distinta'::text
            WHEN resultado ~~* 'Recebidos em parte'::text THEN 'excluido_natureza_distinta'::text
            WHEN resultado ~~* 'Liminar%'::text THEN 'excluido_tutela_urgencia'::text
            WHEN resultado ~~* 'Decisão Referendada'::text THEN 'excluido_tutela_urgencia'::text
            WHEN resultado ~~* 'Julgado mérito de tema com repercussão geral%'::text THEN 'excluido_rg'::text
            WHEN resultado ~~* 'Reconhecida a repercussão geral%'::text THEN 'excluido_rg'::text
            WHEN resultado ~~* 'Determinada a devolução%'::text THEN 'excluido_rg'::text
            WHEN resultado ~~* 'Embargos recebidos'::text THEN 'excluido_admissibilidade'::text
            ELSE 'outros'::text
        END AS categoria_provimento,
        CASE
            WHEN virtual = true THEN 'virtual'::text
            WHEN virtual = false THEN 'presencial'::text
            ELSE 'desconhecido'::text
        END AS ambiente
   FROM stf_universal
  WHERE resultado IS NOT NULL AND resultado <> ''::text AND relator IS NOT NULL AND relator <> ''::text AND (orgao_julgador = ANY (ARRAY['1ª Turma'::text, '1ª TURMA'::text, '2ª Turma'::text, '2ª TURMA'::text, 'Tribunal Pleno'::text, 'TRIBUNAL PLENO'::text])) AND (relator <> ALL (ARRAY['MINISTRO PRESIDENTE'::text, 'VICE-PRESIDENTE'::text]));
