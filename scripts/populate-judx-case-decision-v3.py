"""
populate_judx_v3b.py — Repopula judx_case + judx_decision (tabelas já limpas)
Fonte: stf_master + stf_master_premium (Supabase)
Otimizado: usa SQL direto no servidor, sem transferir dados para Python.
"""
import psycopg2, time

CONN = "postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres"
STF_COURT_ID = 'ff7f5ecd-2cb2-4bbb-bb70-265ea9683863'

t0 = time.time()
conn = psycopg2.connect(CONN)
conn.autocommit = False
cur = conn.cursor()

try:
    # Confirmar que tabelas estao vazias
    cur.execute("SELECT count(*) FROM judx_case")
    n = cur.fetchone()[0]
    print(f'judx_case: {n} rows (deve ser 0)')
    cur.execute("SELECT count(*) FROM judx_decision")
    n2 = cur.fetchone()[0]
    print(f'judx_decision: {n2} rows (deve ser 0)')
    if n > 0 or n2 > 0:
        print('ERRO: tabelas nao estao vazias. Abortando.')
        raise Exception('Tabelas nao vazias')

    # ========== FASE 1: Popular judx_case via SQL direto ==========
    print('\n=== FASE 1: judx_case (SQL direto no servidor) ===')

    cur.execute("""
        INSERT INTO judx_case (
            id, external_number, court_id, organ_id, procedural_class_id,
            phase, filed_at, state_involved, metadata, created_at, updated_at
        )
        SELECT
            gen_random_uuid(),
            sub.processo,
            %s::uuid,
            -- organ: buscar por nome, NULL se nao existe
            (SELECT o.id FROM judx_organ o
             WHERE o.court_id = %s::uuid
             AND o.name = sub.orgao_julgador
             LIMIT 1),
            -- classe: buscar por raw_name
            (SELECT pc.id FROM judx_procedural_class pc
             WHERE pc.court_id = %s::uuid
             AND pc.raw_name = sub.classe
             LIMIT 1),
            'outra'::judx_case_phase_enum,
            sub.data_autuacao,
            false,
            jsonb_build_object(
                'incidente', sub.incidente,
                'ramo_direito', COALESCE(sub.ramo_direito, ''),
                'uf_origem', COALESCE(sub.uf_origem, ''),
                'relator', COALESCE(sub.relator, ''),
                'source', 'stf_master_v3'
            ),
            now(),
            now()
        FROM (
            SELECT DISTINCT ON (processo)
                incidente, processo, classe, relator,
                data_autuacao, orgao_julgador, ramo_direito, uf_origem
            FROM stf_master
            ORDER BY processo, ano_decisao DESC
        ) sub
    """, (STF_COURT_ID, STF_COURT_ID, STF_COURT_ID))

    cases_inserted = cur.rowcount
    conn.commit()
    print(f'  {cases_inserted:,} cases inseridos em {time.time()-t0:.0f}s')

    # ========== FASE 2: Criar indice temporario para lookup ==========
    print('\n=== FASE 2: Indice para lookup case ===')
    cur.execute("CREATE INDEX IF NOT EXISTS idx_judx_case_ext_num ON judx_case(external_number)")
    conn.commit()
    print(f'  Indice criado em {time.time()-t0:.0f}s')

    # ========== FASE 3: Popular judx_decision via SQL direto ==========
    print('\n=== FASE 3: judx_decision (SQL direto no servidor) ===')

    # Criar funcao temporaria de mapeamento no banco
    cur.execute("""
        CREATE OR REPLACE FUNCTION pg_temp.infer_result(andamento text, obs text)
        RETURNS judx_decision_result_enum AS $$
        DECLARE
            s text;
            r judx_decision_result_enum;
        BEGIN
            -- Tentar andamento primeiro
            s := lower(coalesce(andamento, ''));
            r := pg_temp._infer(s);
            IF r != 'outro' THEN RETURN r; END IF;
            -- Fallback: observacao
            s := lower(coalesce(obs, ''));
            IF s = '' THEN RETURN 'outro'; END IF;
            RETURN pg_temp._infer(s);
        END;
        $$ LANGUAGE plpgsql IMMUTABLE;
    """)

    cur.execute("""
        CREATE OR REPLACE FUNCTION pg_temp._infer(s text)
        RETURNS judx_decision_result_enum AS $$
        BEGIN
            IF s = '' THEN RETURN 'outro'; END IF;

            -- PARCIALMENTE PROCEDENTE
            IF s LIKE '%provido em parte%' OR s LIKE '%procedente em parte%'
               OR s LIKE '%parcial provimento%' OR s LIKE '%def. em parte%'
               OR s LIKE '%deferido em parte%' OR s LIKE '%dar parcial provimento%'
               OR s LIKE '%embargos recebidos em parte%' OR s LIKE '%recebidos em parte%'
               OR s LIKE '%concedida em parte%' OR s LIKE '%liminar deferida em parte%'
               OR s LIKE '%liminar parcialmente deferida%'
               OR s LIKE '%negado seguimento em parte%'
               OR s LIKE '%conhecido em parte e nessa parte provido%'
               OR s LIKE '%conhece em parte e nessa parte d_  provimento%'
               OR s LIKE '%conhecido e provido em parte%'
               OR s LIKE '%regimental provido em parte%'
            THEN RETURN 'parcialmente_procedente'; END IF;

            -- IMPROCEDENTE
            IF s LIKE '%n_o provido%' OR s LIKE '%nao provido%'
               OR s LIKE '%negado provimento%' OR s LIKE '%nego provimento%'
               OR s LIKE '%negou provimento%' OR s LIKE '%desprovido%'
               OR s LIKE '%improcedente%'
               OR s LIKE '%embargos rejeitados%'
               OR s LIKE '%denegada a ordem%' OR s LIKE '%denegada a seguran%'
               OR s LIKE '%denegada a suspens%' OR s LIKE '%denegado exequatur%'
               OR s LIKE '%n_o referendad%' OR s LIKE '%n_o-referendad%'
               OR s LIKE '%conhecido e negado provimento%'
               OR s LIKE '%conhecido em parte, mas negado%'
               OR s LIKE '%conhecido em parte e nessa parte negado%'
               OR s LIKE '%inexist_ncia de repercuss_o geral%'
            THEN RETURN 'improcedente'; END IF;

            IF s LIKE '%rejeitado%' AND s NOT LIKE '%proposta%' THEN RETURN 'improcedente'; END IF;
            IF s LIKE '%rejeitada a queixa%' OR s LIKE '%rejeitada a den_ncia%' THEN RETURN 'improcedente'; END IF;
            IF s LIKE '%embargos recebidos como agravo%' AND s NOT LIKE '%provido%' THEN RETURN 'improcedente'; END IF;

            -- NAO CONHECIDO (antes de procedente para nao capturar "provido e negado seguimento")
            IF s LIKE '%agravo provido e desde logo negado seguimento%' THEN RETURN 'nao_conhecido'; END IF;
            IF s LIKE '%inadmitidos os embargos%' THEN RETURN 'nao_conhecido'; END IF;
            IF s LIKE '%deser__o%' OR s LIKE '%deserto%' THEN RETURN 'nao_conhecido'; END IF;

            -- PROCEDENTE
            IF s LIKE '%provido%' AND s NOT LIKE '%n_o%' AND s NOT LIKE '%nao%'
               AND s NOT LIKE '%negado%' AND s NOT LIKE '%desprovido%'
            THEN RETURN 'procedente'; END IF;
            IF s LIKE '%procedente%' THEN RETURN 'procedente'; END IF;
            IF s LIKE '%provejo%' OR s LIKE '%dou provimento%' OR s LIKE '%dar provimento%' THEN RETURN 'procedente'; END IF;
            IF s LIKE '%embargos recebidos%' AND s NOT LIKE '%agravo%' AND s NOT LIKE '%em parte%' THEN RETURN 'procedente'; END IF;
            IF s LIKE '%concedida a ordem%' OR s LIKE '%concedida a seguran%' OR s LIKE '%concedida a suspens%' THEN RETURN 'procedente'; END IF;
            IF s LIKE '%exist_ncia de repercuss_o geral%' AND s NOT LIKE '%inexist%' THEN RETURN 'procedente'; END IF;
            IF s LIKE '%reconhecida a repercuss_o%' THEN RETURN 'procedente'; END IF;
            IF s LIKE '%julgado m_rito de tema%' THEN RETURN 'procedente'; END IF;
            IF s LIKE '%reafirma__o de jurisprud%' THEN RETURN 'procedente'; END IF;
            IF s LIKE '%recebida den_ncia%' OR s LIKE '%recebida a queixa%' THEN RETURN 'procedente'; END IF;
            IF s LIKE '%conced. exequatur%' OR s LIKE '%homol. a senten%' OR s LIKE '%homologado%' THEN RETURN 'procedente'; END IF;
            IF s LIKE '%conhecer do agravo e dar provimento%' THEN RETURN 'procedente'; END IF;
            IF s LIKE '%acolhida proposta%' OR s LIKE '%admitidos embargos de diverg%' THEN RETURN 'procedente'; END IF;

            -- DEFERIDO / INDEFERIDO
            IF s LIKE '%indeferid%' THEN RETURN 'indeferido'; END IF;
            IF s LIKE '%deferido%' OR s LIKE '%deferida%' THEN RETURN 'deferido'; END IF;
            IF s LIKE '%referendada%' OR s LIKE '%referendado%' OR s LIKE '%ratificada%' THEN RETURN 'deferido'; END IF;

            -- NAO CONHECIDO
            IF s LIKE '%negado seguimento%' OR s LIKE '%nego seguimento%' THEN RETURN 'nao_conhecido'; END IF;
            IF s LIKE '%n_o conhecido%' OR s LIKE '%nao conhecido%' THEN RETURN 'nao_conhecido'; END IF;
            IF s LIKE '%declinad%' OR s LIKE '%declinacao%' THEN RETURN 'nao_conhecido'; END IF;
            IF s LIKE '%retornem os autos%' OR s LIKE '%retorno dos autos%' THEN RETURN 'nao_conhecido'; END IF;

            -- PREJUDICADO
            IF s LIKE '%prejudicado%' OR s LIKE '%prejudicada%' THEN RETURN 'prejudicado'; END IF;
            IF s LIKE '%homologada a desist%' OR s LIKE '%homologo a desist%' OR s LIKE '%homol. a desist%' THEN RETURN 'prejudicado'; END IF;
            IF s LIKE '%prej./desist%' THEN RETURN 'prejudicado'; END IF;
            IF s LIKE '%determinada a devolu%' OR s LIKE '%devolvo pelo%' THEN RETURN 'prejudicado'; END IF;

            -- SOBRESTADO
            IF s LIKE '%sobrest%' THEN RETURN 'sobrestado'; END IF;

            -- EXTINTO
            IF s LIKE '%extinto o processo%' OR s LIKE '%extin__o%' THEN RETURN 'extinto_sem_resolucao'; END IF;
            IF s LIKE '%arquiv%' THEN RETURN 'extinto_sem_resolucao'; END IF;

            -- CONVERTIDO
            IF s LIKE '%convertido em dilig%' OR s LIKE '%convers_o%' THEN RETURN 'convertido_em_diligencia'; END IF;

            RETURN 'outro';
        END;
        $$ LANGUAGE plpgsql IMMUTABLE;
    """)
    conn.commit()
    print(f'  Funcoes de mapeamento criadas em {time.time()-t0:.0f}s')

    # Inserir decisions
    t_dec = time.time()
    cur.execute("""
        INSERT INTO judx_decision (
            id, case_id, decision_date, kind, result,
            session_environment, metadata, created_at, updated_at
        )
        SELECT
            gen_random_uuid(),
            c.id,
            m.data_decisao,
            -- kind
            CASE
                WHEN lower(m.origem_decisao) LIKE '%monocr%' THEN 'monocratica'::judx_decision_kind_enum
                WHEN lower(m.origem_decisao) LIKE '%turma%' THEN 'acordao'::judx_decision_kind_enum
                WHEN lower(m.origem_decisao) LIKE '%plen%' THEN 'acordao'::judx_decision_kind_enum
                WHEN lower(m.origem_decisao) LIKE '%virtual%' THEN 'acordao'::judx_decision_kind_enum
                ELSE 'outra'::judx_decision_kind_enum
            END,
            -- result (com fallback premium)
            pg_temp.infer_result(m.andamento, p.observacao_andamento),
            -- session_environment
            CASE
                WHEN lower(m.origem_decisao) LIKE '%virtual%' THEN 'virtual'::judx_session_environment_enum
                WHEN lower(m.origem_decisao) LIKE '%turma%' THEN 'presencial'::judx_session_environment_enum
                WHEN lower(m.origem_decisao) LIKE '%plen%' THEN 'presencial'::judx_session_environment_enum
                ELSE 'nao_informado'::judx_session_environment_enum
            END,
            jsonb_build_object(
                'id_fato_decisao', m.id_fato_decisao,
                'incidente', m.incidente,
                'source', 'stf_master_v3'
            ),
            now(),
            now()
        FROM stf_master m
        JOIN judx_case c ON c.external_number = m.processo
        LEFT JOIN stf_master_premium p ON m.id_fato_decisao = p.id_fato_decisao
    """)

    dec_inserted = cur.rowcount
    conn.commit()
    print(f'  {dec_inserted:,} decisions inseridas em {time.time()-t_dec:.0f}s')

    # ========== VERIFICACAO ==========
    print('\n=== VERIFICACAO ===')
    cur.execute("""
        SELECT result, count(*) as n
        FROM judx_decision
        GROUP BY result
        ORDER BY n DESC
    """)
    total = 0
    for result, n in cur.fetchall():
        total += n
        print(f'  {result:<30} {n:>10,}  ({n*100/2927525:.1f}%)')
    print(f'  {"TOTAL":<30} {total:>10,}')

    cur.execute("SELECT count(*) FROM judx_case")
    print(f'\n  judx_case:     {cur.fetchone()[0]:,}')
    cur.execute("SELECT count(*) FROM judx_decision")
    print(f'  judx_decision: {cur.fetchone()[0]:,}')

    elapsed = time.time() - t0
    print(f'\nCOMPLETO em {elapsed:.0f}s')

except Exception as e:
    conn.rollback()
    print(f'\nERRO: {e}')
    import traceback
    traceback.print_exc()
finally:
    cur.close()
    conn.close()
