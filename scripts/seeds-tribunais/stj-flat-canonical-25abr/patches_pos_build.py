"""4 patches pós-build:
1. flag_consistente_orgao — recalcula com lógica correta
2. flag_pre_2015 — recalcula incluindo data_ajuizamento como fallback
3. Drop tabelas temp
4. Criar stj_eventos_ministros (POSSE/TRANSITO/APOSENTADORIA)
"""
import sys, time
sys.stdout.reconfigure(encoding='utf-8')
import duckdb

t0 = time.time()
def log(m):
    print(f'[{time.time()-t0:>5.1f}s] {m}', flush=True)

DST = r'G:/staging_local/stj_flat_canonical.duckdb'
con = duckdb.connect(DST)

log('PATCH 1/4 — flag_consistente_orgao')
try:
    # Mapear orgao_esperado canônico (TURMA_1, CORTE_ESPECIAL, etc.) com turma_secao do flat
    # turma_secao no flat: '1a Turma', '2a Turma', 'CORTE ESPECIAL', etc.
    con.execute("""
    UPDATE stj_processos
    SET flag_consistente_orgao = CASE
      WHEN orgao_esperado IS NULL THEN NULL
      WHEN orgao_esperado = 'TURMA_1' AND turma_secao LIKE '1%Turma' THEN TRUE
      WHEN orgao_esperado = 'TURMA_2' AND turma_secao LIKE '2%Turma' THEN TRUE
      WHEN orgao_esperado = 'TURMA_3' AND turma_secao LIKE '3%Turma' THEN TRUE
      WHEN orgao_esperado = 'TURMA_4' AND turma_secao LIKE '4%Turma' THEN TRUE
      WHEN orgao_esperado = 'TURMA_5' AND turma_secao LIKE '5%Turma' THEN TRUE
      WHEN orgao_esperado = 'TURMA_6' AND turma_secao LIKE '6%Turma' THEN TRUE
      WHEN orgao_esperado = 'CORTE_ESPECIAL' AND categoria_orgao = 'corte_especial' THEN TRUE
      WHEN orgao_esperado IN ('PRESIDENCIA','VICE_PRESIDENCIA') AND categoria_orgao IN ('presidencia_STJ','vice_presidencia_STJ') THEN TRUE
      WHEN orgao_esperado LIKE 'TURMA_%_PRESID' THEN
        CASE WHEN turma_secao LIKE SUBSTRING(orgao_esperado, 7, 1) || '%Turma' THEN TRUE ELSE FALSE END
      ELSE FALSE
    END
    """)
    n = con.execute("SELECT SUM(CASE WHEN flag_consistente_orgao THEN 1 ELSE 0 END), COUNT(*) FROM stj_processos WHERE orgao_esperado IS NOT NULL").fetchone()
    log(f'  flag_consistente_orgao: {n[0]:,}/{n[1]:,} = {100*n[0]/n[1]:.2f}% consistentes')
except Exception as e:
    log(f'  ✗ ERRO: {e}')

log('\nPATCH 2/4 — flag_pre_2015')
try:
    # Usar data_primeiro_resultado se disponível, senão data_ajuizamento, senão ano_ajuizamento
    con.execute("""
    UPDATE stj_processos
    SET flag_pre_2015 = CASE
      WHEN data_primeiro_resultado IS NOT NULL THEN (data_primeiro_resultado::DATE < DATE '2015-09-05')
      WHEN data_ajuizamento IS NOT NULL THEN (data_ajuizamento::DATE < DATE '2015-09-05')
      WHEN ano_ajuizamento IS NOT NULL THEN (ano_ajuizamento < 2015)
      ELSE NULL
    END
    """)
    n = con.execute("SELECT SUM(CASE WHEN flag_pre_2015 THEN 1 ELSE 0 END), COUNT(*) FROM stj_processos").fetchone()
    log(f'  flag_pre_2015: {n[0]:,}/{n[1]:,} = {100*n[0]/n[1]:.2f}% pré-2015')
except Exception as e:
    log(f'  ✗ ERRO: {e}')

log('\nPATCH 3/4 — drop tabelas temp')
for t in ['_comp_canonical','_comp_intervalos','_comp_pdf_long','_resultado_canonico']:
    try:
        con.execute(f'DROP TABLE IF EXISTS {t}')
        log(f'  ✓ drop {t}')
    except Exception as e:
        log(f'  ✗ {t}: {e}')

log('\nPATCH 4/4 — stj_eventos_ministros (POSSE/TRANSITO/APOSENTADORIA)')
try:
    con.execute('DROP TABLE IF EXISTS stj_eventos_ministros')
    # POSSE: primeira data_ingresso_orgao por ministro_key (a mais antiga)
    # TRANSITO: cada (ministro, orgao) com valid_from > data_posse
    # APOSENTADORIA: ministro que tem todas as datas anteriores ao último snapshot e cujo último órgão não é vigente

    con.execute("""
    CREATE TABLE stj_eventos_ministros AS
    WITH posses AS (
      -- Posse no STJ: data_ingresso_orgao mínima do PLENARIO de cada ministro
      SELECT
        ministro_key,
        MIN(TRY_CAST(data_ingresso_orgao AS DATE)) AS data_evento,
        'POSSE_STJ' AS tipo_evento,
        NULL AS orgao_de,
        FIRST(orgao_codigo ORDER BY TRY_CAST(data_ingresso_orgao AS DATE) ASC) AS orgao_para
      FROM stj_composicao_temporal_v7
      WHERE ministro_key IS NOT NULL AND ministro_key <> ''
        AND TRY_CAST(data_ingresso_orgao AS DATE) IS NOT NULL
      GROUP BY ministro_key
    ),
    transitos AS (
      -- Transição entre TURMAs: cada data_ingresso_orgao que não é a posse
      SELECT
        c.ministro_key,
        TRY_CAST(c.data_ingresso_orgao AS DATE) AS data_evento,
        'TRANSITO' AS tipo_evento,
        NULL AS orgao_de,
        c.orgao_codigo AS orgao_para
      FROM stj_composicao_temporal_v7 c
      JOIN posses p ON p.ministro_key = c.ministro_key
      WHERE c.ministro_key IS NOT NULL AND c.ministro_key <> ''
        AND TRY_CAST(c.data_ingresso_orgao AS DATE) IS NOT NULL
        AND TRY_CAST(c.data_ingresso_orgao AS DATE) > p.data_evento
        AND c.orgao_codigo IN ('TURMA_1','TURMA_2','TURMA_3','TURMA_4','TURMA_5','TURMA_6',
                                'PRESIDENCIA','VICE_PRESIDENCIA','CORREGEDORIA_CNJ',
                                'CORTE_ESPECIAL_PRESID','SECAO_1_PRESID','SECAO_2_PRESID','SECAO_3_PRESID',
                                'TURMA_1_PRESID','TURMA_2_PRESID','TURMA_3_PRESID','TURMA_4_PRESID','TURMA_5_PRESID','TURMA_6_PRESID',
                                'APOSENTADO')
    )
    SELECT * FROM posses
    UNION ALL
    SELECT * FROM transitos
    ORDER BY ministro_key, data_evento
    """)
    n = con.execute("SELECT COUNT(*), COUNT(DISTINCT ministro_key) FROM stj_eventos_ministros").fetchone()
    log(f'  ✓ stj_eventos_ministros: {n[0]} eventos para {n[1]} ministros distintos')
    # distribuição por tipo
    print('\n  Distribuição por tipo_evento:')
    for r in con.execute("SELECT tipo_evento, COUNT(*) FROM stj_eventos_ministros GROUP BY 1 ORDER BY 2 DESC").fetchall():
        print(f'    {r[0]:20} {r[1]:>5}')
except Exception as e:
    log(f'  ✗ ERRO: {e}')
    import traceback; traceback.print_exc()

# Validação final
log('\n=== VALIDAÇÃO FINAL ===')
print(con.execute("""
SELECT
  COUNT(*) AS total,
  COUNT(ministro_key) AS com_key,
  COUNT(orgao_esperado) AS com_orgao_canonico,
  SUM(CASE WHEN flag_consistente_orgao THEN 1 ELSE 0 END) AS consistentes,
  SUM(CASE WHEN flag_consistente_orgao = FALSE THEN 1 ELSE 0 END) AS inconsistentes,
  SUM(CASE WHEN flag_pre_2015 THEN 1 ELSE 0 END) AS pre_2015
FROM stj_processos
""").fetchdf())

print('\n=== Tabelas finais ===')
for r in con.execute("SHOW TABLES").fetchall():
    n = con.execute(f"SELECT COUNT(*) FROM {r[0]}").fetchone()[0]
    print(f'  {r[0]}: {n:,}')

con.close()
log('OK')
