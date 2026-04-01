"""
Pipeline Ontológico — Teoria dos Objetos Ancorados (Medina, 2026)

Cada decisão é um NÓ ANCORADO na STRING do processo.
O Processo é o fio. Cada idFatoDecisao é um evento na string.

Fontes:
  1. stf_decisoes_universo.csv (250K decisões) — cada linha = evento na string
  2. stf_universal_2026-03-28.csv (39 cols) — incidente + partes
  3. stf_chave_processos.csv — classe_processo + numero_processo

Saídas:
  - 2026-03-30_ontologia_completa.csv (todas as decisões ancoradas)
  - 2026-03-30_audit1_processo_no.xlsx (nós únicos)
  - 2026-03-30_audit2_string_eventos.xlsx (strings)
  - 2026-03-30_audit3_nao_decisoes.xlsx (não-decisões + composição)
"""

import pandas as pd
import numpy as np
import re, time, os

t0 = time.time()
OUT = r'C:\Users\medin\Desktop\backup_judx\resultados'

# ============================================================
# COMPOSIÇÃO TEMPORAL
# ============================================================
PRESIDENCIAS = [
    ('Néri da Silveira',     '1989-10-01', '1991-04-02'),
    ('Sydney Sanches',       '1991-04-03', '1993-04-07'),
    ('Octavio Gallotti',     '1993-04-08', '1995-04-04'),
    ('Sepúlveda Pertence',   '1995-04-05', '1997-04-22'),
    ('Celso de Mello',       '1997-04-23', '1999-04-14'),
    ('Carlos Velloso',       '1999-04-15', '2001-05-23'),
    ('Marco Aurélio',        '2001-05-24', '2003-05-14'),
    ('Maurício Corrêa',      '2003-05-15', '2004-04-21'),
    ('Nelson Jobim',         '2004-04-22', '2006-03-29'),
    ('Ellen Gracie',         '2006-04-20', '2008-04-22'),
    ('Gilmar Mendes',        '2008-04-23', '2010-04-22'),
    ('Cezar Peluso',         '2010-04-23', '2012-04-11'),
    ('Ayres Britto',         '2012-04-12', '2012-11-16'),
    ('Joaquim Barbosa',      '2012-11-22', '2014-07-31'),
    ('Ricardo Lewandowski',  '2014-09-10', '2016-10-11'),
    ('Cármen Lúcia',         '2016-10-12', '2018-10-12'),
    ('Dias Toffoli',         '2018-10-12', '2020-10-22'),
    ('Luiz Fux',             '2020-10-22', '2022-10-12'),
    ('Rosa Weber',           '2022-10-12', '2023-09-27'),
    ('Luís Roberto Barroso', '2023-09-28', '2025-10-22'),
    ('Edson Fachin',         '2025-10-23', '2030-12-31'),
]

VICE_PRESIDENCIAS = [
    ('Cezar Peluso',         '2008-04-23', '2010-04-22'),
    ('Ayres Britto',         '2010-04-23', '2012-04-11'),
    ('Joaquim Barbosa',      '2012-04-12', '2012-11-21'),
    ('Ricardo Lewandowski',  '2012-11-22', '2014-09-09'),
    ('Cármen Lúcia',         '2014-09-10', '2016-10-11'),
    ('Dias Toffoli',         '2016-10-12', '2018-10-11'),
    ('Luiz Fux',             '2018-10-12', '2020-10-21'),
    ('Rosa Weber',           '2020-10-22', '2022-10-11'),
    ('Luís Roberto Barroso', '2022-10-12', '2023-09-27'),
    ('Edson Fachin',         '2023-09-28', '2025-10-22'),
    ('Alexandre de Moraes',  '2025-10-23', '2030-12-31'),
]

def resolver_presidente(d):
    if pd.isna(d): return None
    for nome, ini, fim in PRESIDENCIAS:
        if ini <= d <= fim: return nome
    return None

def resolver_vice(d):
    if pd.isna(d): return None
    for nome, ini, fim in VICE_PRESIDENCIAS:
        if ini <= d <= fim: return nome
    return None

# ============================================================
# FUNÇÕES DE CLASSIFICAÇÃO ONTOLÓGICA
# ============================================================

def parse_data(dd):
    """DD/MM/YYYY HH:MM:SS → YYYY-MM-DD"""
    if pd.isna(dd): return None
    m = re.match(r'(\d{2})/(\d{2})/(\d{4})', str(dd))
    if m: return f'{m.group(3)}-{m.group(2)}-{m.group(1)}'
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', str(dd))
    if m: return str(dd)[:10]
    return None

def classificar_fluxo(classe, andamento, orgao):
    cl = str(classe).upper().strip() if pd.notna(classe) else ''
    and_ = str(andamento).lower() if pd.notna(andamento) else ''
    org = str(orgao).lower() if pd.notna(orgao) else ''
    if cl in ('ARE', 'AI'):
        prefix = 'ARE' if cl == 'ARE' else 'AI'
        if any(x in and_ for x in ['negado seguimento','não conhecido','não provido','inadmitido','arquivado']):
            return f'{prefix}_NEGADO'
        elif any(x in and_ for x in ['provido','convertido','admitido','deu provimento']):
            return f'{prefix}_ADMITIDO_RE'
        else:
            return f'{prefix}_PENDENTE'
    elif cl == 'RE':
        return 'RE_DIRETO'
    else:
        return 'ORIGINARIA'

def classificar_tipo_evento(tipo_dec, orgao, andamento, ind_col):
    td = str(tipo_dec).lower() if pd.notna(tipo_dec) else ''
    org = str(orgao).lower() if pd.notna(orgao) else ''
    and_ = str(andamento).lower() if pd.notna(andamento) else ''
    ic = str(ind_col).lower() if pd.notna(ind_col) else ''

    # RG
    if 'repercussão geral' in and_ or 'rep. geral' in td:
        if 'inexistência' in and_ or 'negada' in and_:
            return 'DECISAO_RG_NEGADA'
        return 'DECISAO_RG_RECONHECIDA'

    # Colegiada
    if ic == 'colegiada' or 'colegiada' in td:
        if 'plenário' in org or 'pleno' in org:
            if 'virtual' in org:
                return 'DECISAO_PLENARIO_PV'
            return 'DECISAO_PLENARIO_PP'
        if 'turma' in org:
            return 'DECISAO_TURMA_PV'  # default PV (85% virtual)
        return 'DECISAO_PLENARIO_PV'

    # Monocrática
    if ic == 'monocrática' or 'monocrática' in org or 'monocrática' in td:
        # Presidência?
        if 'presidência' in and_ or 'presidente' in and_:
            return 'DECISAO_ADMISSIBILIDADE_ARE'
        return 'DECISAO_MONOCRATICA'

    # Decisão final genérica
    if 'decisão final' in td:
        return 'DECISAO_MONOCRATICA'
    if 'recurso interno' in td:
        return 'DECISAO_TURMA_PV'
    if 'interlocutória' in td:
        return 'DECISAO_MONOCRATICA'

    return 'DECISAO_MONOCRATICA'

def classificar_natureza(tipo_ev):
    if tipo_ev in ('DECISAO_MONOCRATICA','DECISAO_ADMISSIBILIDADE_ARE'):
        return 'MONOCRATICA'
    if tipo_ev in ('DECISAO_TURMA_PV','DECISAO_PLENARIO_PV','DECISAO_RG_RECONHECIDA','DECISAO_RG_NEGADA'):
        return 'COLEGIADA_FORMAL_PV'
    if tipo_ev in ('DECISAO_TURMA_PP','DECISAO_PLENARIO_PP'):
        return 'COLEGIADA_REAL_PP'
    return None

def classificar_nao_decisao(fluxo, tipo_ev, andamento):
    and_ = str(andamento).lower() if pd.notna(andamento) else ''
    # Grau 1: Presidência nega ARE/AI
    if tipo_ev in ('DECISAO_MONOCRATICA','DECISAO_ADMISSIBILIDADE_ARE') and fluxo in ('ARE_NEGADO','AI_NEGADO'):
        return True, 1, 'ND_P1_ARE_PRESIDENCIA' if 'ARE' in fluxo else 'ND_P1_AI_PRESIDENCIA'
    # Negado seguimento genérico
    if any(x in and_ for x in ['negado seguimento','não conhecido']):
        if tipo_ev == 'DECISAO_MONOCRATICA':
            return True, 1, 'ND_P1_ARE_PRESIDENCIA'
    # Grau 2: AgInt/AgR desprovido
    if tipo_ev in ('DECISAO_TURMA_PV','DECISAO_PLENARIO_PV'):
        if any(x in and_ for x in ['agravo regimental não provido','agravo interno não provido','agravo não provido']):
            return True, 2, 'ND_S2_AGINT_TURMA'
        if 'agravo regimental não conhecido' in and_:
            return True, 2, 'ND_S2_AGINT_TURMA'
    # Grau 3: EDcl rejeitado
    if any(x in and_ for x in ['embargos rejeitados','embargos não conhecidos']):
        return True, 3, 'ND_S3_EDCL_AGINT'
    return False, None, None

def normalizar_orgao(org):
    if pd.isna(org): return 'Indefinido'
    o = str(org).lower()
    if '1' in o and 'turma' in o: return '1ª Turma'
    if '2' in o and 'turma' in o: return '2ª Turma'
    if 'plenário' in o and 'virtual' in o: return 'Plenário Virtual'
    if 'plenário' in o or 'pleno' in o: return 'Plenário'
    if 'monocrática' in o: return 'Monocrática'
    return str(org).strip()

def resolver_ministro_real(relator, data_iso):
    """Resolve MINISTRO PRESIDENTE/VICE para nome real"""
    r = str(relator).strip() if pd.notna(relator) else ''
    if 'PRESIDENTE' in r.upper() and 'VICE' not in r.upper():
        p = resolver_presidente(data_iso)
        return p if p else relator
    if 'VICE' in r.upper():
        v = resolver_vice(data_iso)
        return v if v else relator
    return relator

# ============================================================
# ETAPA 1: LER stf_decisoes_universo.csv (250K decisões)
# ============================================================
print('1/7 Lendo stf_decisoes_universo.csv (250K decisões)...')
univ = pd.read_csv(
    r'C:\Users\medin\Downloads\stf_decisoes_universo.csv',
    encoding='utf-8-sig', dtype=str, low_memory=False
)
print(f'  {len(univ):,} decisões, {len(univ.columns)} colunas')

# Renomear para snake_case
univ.rename(columns={
    'idFatoDecisao': 'id_fato_decisao',
    'Processo': 'processo',
    'Relator atual': 'relator_atual',
    'Meio Processo': 'meio_processo',
    'Origem decisão': 'origem_decisao',
    'Ambiente julgamento': 'ambiente_julgamento',
    'Data de autuação': 'data_autuacao_raw',
    'Data baixa': 'data_baixa_raw',
    'Indicador colegiado': 'indicador_colegiado',
    'Ano da decisão': 'ano_decisao',
    'Data da decisão': 'data_decisao_raw',
    'Tipo decisão': 'tipo_decisao',
    'Andamento decisão': 'andamento_decisao',
    'Observação do andamento': 'observacao_andamento',
    'Ramo direito': 'ramo_direito',
    'Assuntos do processo': 'assuntos',
    'Indicador de tramitação': 'em_tramitacao',
    'Órgão julgador': 'orgao_julgador',
    'Descrição Procedência Processo': 'procedencia',
    'Descrição Órgão Origem': 'orgao_origem',
}, inplace=True)

# Extrair classe e número
univ['processo'] = univ['processo'].str.strip()
split = univ['processo'].str.split(' ', n=1)
univ['classe'] = split.str[0]
univ['numero'] = split.str[1].fillna('')

# Parsear datas
univ['data_decisao'] = univ['data_decisao_raw'].apply(parse_data)
univ['data_autuacao'] = univ['data_autuacao_raw'].apply(parse_data)
univ['data_baixa'] = univ['data_baixa_raw'].apply(parse_data)

# ============================================================
# ETAPA 2: ENRIQUECER COM INCIDENTE (do stf_universal)
# ============================================================
print('2/7 Linkando com stf_universal para incidente + partes...')
univ_cols = pd.read_csv(
    os.path.join(OUT, 'stf_universal_2026-03-28.csv'),
    encoding='utf-8-sig', sep=';', dtype=str, low_memory=False,
    usecols=['processo','incidente','polo_ativo','polo_passivo','advogados',
             'amicus_curiae','procuradores','total_partes','link_processo']
)
# Pegar primeiro incidente por processo (dedup)
univ_link = univ_cols.drop_duplicates(subset='processo', keep='first')
print(f'  stf_universal: {len(univ_link):,} processos com incidente')

univ = univ.merge(univ_link, on='processo', how='left')
print(f'  Linkados com incidente: {univ["incidente"].notna().sum():,}/{len(univ):,}')

# ============================================================
# ETAPA 3: CLASSIFICAÇÃO ONTOLÓGICA
# ============================================================
print('3/7 Classificando ontologicamente cada decisão...')

# Ministro real (resolve PRESIDENTE/VICE)
univ['ministro_real'] = univ.apply(
    lambda r: resolver_ministro_real(r['relator_atual'], r['data_decisao']), axis=1)

# Órgão normalizado
univ['orgao_decisorio'] = univ['orgao_julgador'].apply(normalizar_orgao)

# Fluxo de entrada
univ['fluxo_entrada'] = univ.apply(
    lambda r: classificar_fluxo(r['classe'], r['andamento_decisao'], r['orgao_julgador']), axis=1)

# Tipo de evento
univ['tipo_evento'] = univ.apply(
    lambda r: classificar_tipo_evento(r['tipo_decisao'], r['orgao_julgador'],
                                       r['andamento_decisao'], r['indicador_colegiado']), axis=1)

# Natureza da colegialidade
univ['natureza_colegialidade'] = univ['tipo_evento'].apply(classificar_natureza)

# Não-decisão
nd = univ.apply(lambda r: classificar_nao_decisao(r['fluxo_entrada'], r['tipo_evento'], r['andamento_decisao']), axis=1)
univ['e_nao_decisao'] = nd.apply(lambda x: x[0])
univ['grau_nao_decisao'] = nd.apply(lambda x: x[1])
univ['codigo_taxonomia'] = nd.apply(lambda x: x[2])

# ============================================================
# ETAPA 4: COMPOSIÇÃO TEMPORAL
# ============================================================
print('4/7 Resolvendo composição temporal...')
univ['presidente_stf'] = univ['data_decisao'].apply(resolver_presidente)
univ['vice_presidente_stf'] = univ['data_decisao'].apply(resolver_vice)

# ============================================================
# ETAPA 5: CONSTRUIR STRING (seq dentro de cada processo)
# ============================================================
print('5/7 Construindo strings (seq por processo)...')
univ = univ.sort_values(['processo', 'data_decisao', 'id_fato_decisao'])
univ['seq'] = univ.groupby('processo').cumcount() + 1

# Limpar *NI* → NULL
for c in ['ramo_direito', 'assuntos']:
    univ[c] = univ[c].replace('*NI*', np.nan)

# ============================================================
# ETAPA 6: CONSTRUIR PROCESSO_NO (nós únicos por processo)
# ============================================================
print('6/7 Construindo processo_no...')
primeiro = univ.groupby('processo').first().reset_index()
ultimo = univ.groupby('processo').last().reset_index()
dec_count = univ.groupby('processo').size().reset_index(name='total_decisoes')
nd_count = univ[univ['e_nao_decisao']==True].groupby('processo').size().reset_index(name='total_nao_decisoes')

processo_no = primeiro[['processo','classe','numero','incidente','data_autuacao',
                         'relator_atual','orgao_julgador','ramo_direito','assuntos',
                         'procedencia','orgao_origem','meio_processo',
                         'polo_ativo','polo_passivo','advogados','amicus_curiae',
                         'procuradores','total_partes','link_processo']].copy()

processo_no.rename(columns={
    'classe': 'classe_origem',
    'relator_atual': 'relator_distribuicao',
    'orgao_julgador': 'orgao_distribuicao',
}, inplace=True)

processo_no['classe_atual'] = ultimo.set_index('processo').reindex(processo_no['processo'].values)['classe'].values
processo_no['relator_atual'] = ultimo.set_index('processo').reindex(processo_no['processo'].values)['ministro_real'].values
processo_no['orgao_atual'] = ultimo.set_index('processo').reindex(processo_no['processo'].values)['orgao_decisorio'].values
processo_no['data_ultima_decisao'] = ultimo.set_index('processo').reindex(processo_no['processo'].values)['data_decisao'].values
sit = ultimo.set_index('processo').reindex(processo_no['processo'].values)['em_tramitacao'].values
processo_no['situacao'] = pd.Series(sit).map({'Sim': 'EM_TRAMITACAO', 'Não': 'BAIXADO'}).fillna('INDEFINIDO').values
processo_no['fluxo_entrada'] = primeiro.set_index('processo').reindex(processo_no['processo'].values)['fluxo_entrada'].values
processo_no['classe_alterada'] = processo_no['classe_origem'] != processo_no['classe_atual']
processo_no['origem_externa'] = processo_no['classe_origem'].isin(['ARE', 'AI'])
processo_no = processo_no.merge(dec_count, on='processo', how='left')
processo_no = processo_no.merge(nd_count, on='processo', how='left')
processo_no['total_nao_decisoes'] = processo_no['total_nao_decisoes'].fillna(0).astype(int)
processo_no['comprimento_string'] = processo_no['total_decisoes'].apply(
    lambda n: 'CURTA' if n <= 2 else ('MEDIA' if n <= 4 else 'LONGA'))
processo_no['pct_nao_decisao'] = (processo_no['total_nao_decisoes'] / processo_no['total_decisoes'] * 100).round(1)

print(f'  {len(processo_no):,} processos (nós)')

# ============================================================
# ETAPA 7: SALVAR
# ============================================================
print('7/7 Salvando arquivos...')

# --- CSV FINAL ---
csv_cols = ['id_fato_decisao','processo','classe','numero','incidente','seq',
            'data_decisao','data_autuacao','data_baixa',
            'ministro_real','relator_atual','orgao_julgador','orgao_decisorio',
            'tipo_decisao','indicador_colegiado','andamento_decisao','observacao_andamento',
            'ambiente_julgamento','meio_processo',
            'tipo_evento','natureza_colegialidade','fluxo_entrada',
            'e_nao_decisao','grau_nao_decisao','codigo_taxonomia',
            'presidente_stf','vice_presidente_stf',
            'ramo_direito','assuntos','procedencia','orgao_origem',
            'em_tramitacao','ano_decisao',
            'polo_ativo','polo_passivo','advogados','amicus_curiae','procuradores','link_processo']
csv_path = os.path.join(OUT, '2026-03-30_ontologia_completa.csv')
univ[[c for c in csv_cols if c in univ.columns]].to_csv(csv_path, encoding='utf-8-sig', sep=';', index=False)
print(f'  CSV: {os.path.getsize(csv_path)/1024/1024:.1f} MB')

# --- EXCEL 1: PROCESSO_NO ---
xl1 = os.path.join(OUT, '2026-03-30_audit1_processo_no.xlsx')
with pd.ExcelWriter(xl1, engine='openpyxl') as w:
    resumo = pd.DataFrame({
        'Métrica': ['Total nós'] + [f for f in processo_no['fluxo_entrada'].value_counts().index] +
                   ['Classe alterada','Origem externa','String CURTA','String MEDIA','String LONGA','Com não-decisão'],
        'Valor': [len(processo_no)] + list(processo_no['fluxo_entrada'].value_counts().values) +
                  [int(processo_no['classe_alterada'].sum()), int(processo_no['origem_externa'].sum()),
                   int((processo_no['comprimento_string']=='CURTA').sum()),
                   int((processo_no['comprimento_string']=='MEDIA').sum()),
                   int((processo_no['comprimento_string']=='LONGA').sum()),
                   int((processo_no['total_nao_decisoes']>0).sum())]
    })
    resumo.to_excel(w, sheet_name='Resumo', index=False)
    processo_no.groupby(['classe_origem','fluxo_entrada']).size().reset_index(name='total').to_excel(w, sheet_name='Fluxo por Classe', index=False)
    processo_no.sample(min(500,len(processo_no)), random_state=42).to_excel(w, sheet_name='Amostra 500', index=False)
    no_leve = processo_no.drop(columns=['polo_ativo','polo_passivo','advogados','amicus_curiae','procuradores'], errors='ignore')
    no_leve.to_excel(w, sheet_name='Todos os nós', index=False)
print(f'  Excel 1: {os.path.getsize(xl1)/1024/1024:.1f} MB')

# --- EXCEL 2: STRING EVENTOS ---
xl2 = os.path.join(OUT, '2026-03-30_audit2_string_eventos.xlsx')
with pd.ExcelWriter(xl2, engine='openpyxl') as w:
    univ.groupby('tipo_evento').size().reset_index(name='total').sort_values('total',ascending=False).to_excel(w, sheet_name='Tipo Evento', index=False)
    univ.groupby('natureza_colegialidade').size().reset_index(name='total').sort_values('total',ascending=False).to_excel(w, sheet_name='Natureza Colegialidade', index=False)
    univ.groupby(['orgao_decisorio','ano_decisao','natureza_colegialidade']).size().reset_index(name='total').to_excel(w, sheet_name='Colegialidade Órgão-Ano', index=False)
    # 20 strings longas
    longas = processo_no[processo_no['total_decisoes']>=3]['processo']
    if len(longas) > 20: longas = longas.sample(20, random_state=42)
    univ[univ['processo'].isin(longas)].sort_values(['processo','seq']).to_excel(w, sheet_name='Amostra 20 Strings', index=False)
    processo_no.nlargest(50,'total_decisoes')[['processo','classe_origem','total_decisoes','fluxo_entrada','situacao']].to_excel(w, sheet_name='Top 50 Longas', index=False)
print(f'  Excel 2: {os.path.getsize(xl2)/1024/1024:.1f} MB')

# --- EXCEL 3: NÃO-DECISÕES ---
xl3 = os.path.join(OUT, '2026-03-30_audit3_nao_decisoes.xlsx')
nd_df = univ[univ['e_nao_decisao']==True]
with pd.ExcelWriter(xl3, engine='openpyxl') as w:
    nd_df.groupby(['grau_nao_decisao','codigo_taxonomia']).size().reset_index(name='total').sort_values('total',ascending=False).to_excel(w, sheet_name='Resumo ND', index=False)
    nd_df.groupby(['presidente_stf','grau_nao_decisao']).size().reset_index(name='total').sort_values('total',ascending=False).to_excel(w, sheet_name='ND por Presidente', index=False)
    nd_df.groupby(['ano_decisao','grau_nao_decisao']).size().reset_index(name='total').to_excel(w, sheet_name='ND por Ano', index=False)
    nd_df.groupby(['natureza_colegialidade','grau_nao_decisao']).size().reset_index(name='total').to_excel(w, sheet_name='ND por Colegialidade', index=False)
    # Composição temporal
    comp = pd.DataFrame(PRESIDENCIAS, columns=['ministro','inicio','fim'])
    comp['cargo'] = 'Presidente STF'
    vice = pd.DataFrame(VICE_PRESIDENCIAS, columns=['ministro','inicio','fim'])
    vice['cargo'] = 'Vice-Presidente STF'
    pd.concat([comp,vice]).sort_values(['cargo','inicio']).to_excel(w, sheet_name='Composição Temporal', index=False)
    # Amostra ND grau 1
    g1 = nd_df[nd_df['grau_nao_decisao']==1]
    g1.sample(min(300,len(g1)), random_state=42).to_excel(w, sheet_name='Amostra ND Grau 1', index=False)
    # Mérito vs não-mérito
    univ.groupby(['ano_decisao','e_nao_decisao']).size().reset_index(name='total').to_excel(w, sheet_name='Mérito vs Não-Mérito', index=False)
print(f'  Excel 3: {os.path.getsize(xl3)/1024/1024:.1f} MB')

# ============================================================
# DIAGNÓSTICO FINAL
# ============================================================
elapsed = time.time() - t0
print(f'\n{"="*60}')
print(f'PIPELINE ONTOLÓGICO — {elapsed:.0f}s')
print(f'{"="*60}')
print(f'Decisões (eventos):    {len(univ):,}')
print(f'Processos (nós):       {len(processo_no):,}')
nd_total = univ['e_nao_decisao'].sum()
print(f'Não-decisões:          {nd_total:,} ({nd_total/len(univ)*100:.1f}%)')
print(f'\nFLUXOS:')
for f, c in processo_no['fluxo_entrada'].value_counts().items():
    print(f'  {f:20s}: {c:>8,} ({c/len(processo_no)*100:.1f}%)')
print(f'\nCOLEGIALIDADE:')
for n, c in univ['natureza_colegialidade'].value_counts().items():
    print(f'  {str(n):25s}: {c:>8,} ({c/len(univ)*100:.1f}%)')
print(f'\nNÃO-DECISÃO POR GRAU:')
for g in [1, 2, 3]:
    c = (univ['grau_nao_decisao']==g).sum()
    if c: print(f'  Grau {g}: {c:>8,}')
print(f'\nARQUIVOS:')
for p in [csv_path, xl1, xl2, xl3]:
    print(f'  {p} ({os.path.getsize(p)/1024/1024:.1f} MB)')
