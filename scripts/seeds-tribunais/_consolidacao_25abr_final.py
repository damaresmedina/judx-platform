"""
Consolidação final 25/abr — aplica a compilação Damares com fontes verificadas
ao seed canônico composicao_ministerial.csv.

PASSO 1: REMOVE do seed:
  - Linhas com validado in (rascunho_25abr_a_pesquisar, atividade_flat,
    sem_atividade_no_flat, data_absurda_raw) — 37 batch automáticas
  - Linhas STJ de JORGE MUSSI e TEODORO SILVA SANTOS (manuais antigas — substituídas pela compilação)

PASSO 2: ADICIONA compilação validada Damares 25/abr:
  - 1 Mussi consolidado (1 linha)
  - 2 Teodoro (TURMA_2 + TURMA_2_PRESID)
  - 13 presidências (turma 1-6 + seção 1-3 + corte especial PRESID/VICE)
  - 15 membros Corte Especial (rascunho_pesquisar)
  - 17 históricos com datas validadas
  - 6 convocados com datas validadas
  - 6 convocados sem datas (rascunho_pesquisar)
"""
import sys, csv, io, shutil
sys.stdout.reconfigure(encoding='utf-8')
import pandas as pd

SEED = r'C:/Users/medin/projetos/judx-platform/scripts/seeds-tribunais/composicao_ministerial.csv'

# Backup
shutil.copy2(SEED, SEED + '.bak_pre_consolidacao_25abr')
print(f'[backup] {SEED}.bak_pre_consolidacao_25abr')

# Ler seed atual
with open(SEED, encoding='utf-8') as f:
    raw = f.read()
lines = raw.splitlines()
header = lines[0]
HF = header.split(',')

RASCUNHOS_REMOVER = {
    'rascunho_25abr_a_pesquisar',
    'rascunho_25abr_atividade_flat',
    'rascunho_25abr_sem_atividade_no_flat',
    'rascunho_25abr_data_absurda_raw',
}

MIN_REMOVER_STJ = {'JORGE MUSSI', 'TEODORO SILVA SANTOS'}

# PASSO 1: filtrar linhas a manter
new_lines = [header]
n_removidas_rascunho = 0
n_removidas_min = 0
for line in lines[1:]:
    if line.startswith('#') or not line.strip():
        new_lines.append(line); continue
    r = next(csv.reader([line]))
    if len(r) < len(HF): continue
    validado = r[HF.index('validado')]
    nome = r[HF.index('ministro_nome_canonico')]
    tribunal = r[HF.index('tribunal_sigla')]

    if validado in RASCUNHOS_REMOVER:
        n_removidas_rascunho += 1; continue
    if tribunal == 'STJ' and nome in MIN_REMOVER_STJ:
        n_removidas_min += 1; continue

    new_lines.append(line)

print(f'[PASSO 1] removidas {n_removidas_rascunho} rascunho_batch + {n_removidas_min} Mussi/Teodoro antigas')

# PASSO 2: compilação Damares
INSERCOES = []

# 1 — Mussi consolidado (1 linha)
INSERCOES.append(('STJ','JORGE MUSSI','TURMA_5','2007-12-12','2023-01-10',1,
    'saiu','Posse 12/12/2007 com Sidnei Beneti. Migrou TURMA_5→TURMA_3 (matéria criminal). Aposentadoria 10/01/2023',
    'AMB + linha sucessória STJ','validado_25abr'))

# 2 — Teodoro Silva Santos (2 linhas)
INSERCOES.append(('STJ','TEODORO SILVA SANTOS','TURMA_2','2021-11-09','',1,
    'em_exercicio','','guia_2turma_fev2026','validado_25abr'))
INSERCOES.append(('STJ','TEODORO SILVA SANTOS','TURMA_2_PRESID','2026-01-15','',2,
    'presidencia','Biênio 15/01/2026–14/01/2028','guia_2turma_fev2026','validado_25abr'))

# 13 presidências de turma/seção
INSERCOES.extend([
    ('STJ','SERGIO LUIZ KUKINA','TURMA_1_PRESID','2025-05-05','',2,'presidencia','Biênio 05/05/2025–04/05/2027','guia_1turma_out2025','validado_25abr'),
    ('STJ','HUMBERTO MARTINS','TURMA_3_PRESID','2024-04-01','2026-03-31',2,'presidencia','Biênio 01/04/2024–31/03/2026','guia_3turma_set2025','validado_25abr'),
    ('STJ','JOAO OTAVIO DE NORONHA','TURMA_4_PRESID','2024-08-30','',2,'presidencia','Biênio 30/08/2024–29/08/2026','guia_4turma_abr2026','validado_25abr'),
    ('STJ','REYNALDO SOARES DA FONSECA','TURMA_5_PRESID','2025-05-07','',2,'presidencia','Biênio 07/05/2025–06/05/2027','guia_5turma_set2025','validado_25abr'),
    ('STJ','CARLOS AUGUSTO PIRES BRANDAO','TURMA_6_PRESID','2025-10-19','',2,'presidencia','Biênio 19/10/2025–18/10/2027','guia_6turma_out2025','validado_25abr'),
    ('STJ','GURGEL DE FARIA','SECAO_1_PRESID','2026-01-15','',2,'presidencia','Biênio 15/01/2026–14/01/2028','guia_1secao_jan2026','validado_25abr'),
    ('STJ','MARCO AURELIO BUZZI','SECAO_2_PRESID','2025-08-27','',1,'presidencia','Biênio 27/08/2025–26/08/2027 (Buzzi presidiu antes do afastamento)','guia_2secao_ago2025','validado_25abr'),
    ('STJ','ANTONIO SALDANHA PALHEIRO','SECAO_3_PRESID','2025-03-11','',2,'presidencia','Biênio 11/03/2025–10/03/2027','guia_3secao_set2025','validado_25abr'),
    ('STJ','HERMAN BENJAMIN','CORTE_ESPECIAL_PRESID','2024-08-22','',2,'presidencia','Biênio 22/08/2024–22/08/2026','guia_corte_especial_set2024','validado_25abr'),
    ('STJ','LUIS FELIPE SALOMAO','CORTE_ESPECIAL_VICE','2024-08-22','',5,'vice_presidencia','Vice-Pres Corte Especial biênio 22/08/2024','guia_corte_especial_set2024','validado_25abr'),
])

# 15 membros Corte Especial (rascunho — composição por antiguidade)
membros_ce = [
    'HUMBERTO MARTINS','OG FERNANDES','LUIS FELIPE SALOMAO',
    'JOAO OTAVIO DE NORONHA','NANCY ANDRIGHI','MAURO CAMPBELL MARQUES',
    'BENEDITO GONCALVES','RAUL ARAUJO','MARIA THEREZA DE ASSIS MOURA',
    'FRANCISCO FALCAO','HERMAN BENJAMIN','ANTONIO CARLOS FERREIRA',
    'MARIA ISABEL GALLOTTI','RICARDO VILLAS BOAS CUEVA','MARCO AURELIO BUZZI',
]
for m in membros_ce:
    INSERCOES.append(('STJ', m, 'CORTE_ESPECIAL_MEMBRO', '', '', 99, 'em_exercicio',
        'Composição por antiguidade — sem portaria de início. Pesquisar data de ingresso na Corte Especial',
        'guia_corte_especial_set2024','rascunho_pesquisar'))

# 17 históricos com datas validadas
historicos_validados = [
    # (ministro, valid_from, valid_to, codigo_orgao, fonte, motivo)
    ('SIDNEI BENETI','2007-12-12','2014-08-21','TURMA_3','STJ notícia oficial','Posse 12/12/2007 com Mussi. Aposentadoria 21/08/2014'),
    ('ELIANA CALMON','1999-06-30','2013-12-18','TURMA_2','Linha sucessória STJ','Posse 30/06/1999. Aposentadoria 18/12/2013'),
    ('CASTRO MEIRA','2003-06-04','2013-09-19','TURMA_2','Linha sucessória STJ','Posse 04/06/2003. Aposentadoria 19/09/2013'),
    ('ARI PARGENDLER','1995-06-19','2014-09-15','TURMA_3','Linha sucessória + Senado','Posse 19/06/1995. Aposentadoria 15/09/2014'),
    ('LUIZ FUX','2001-11-29','2011-03-03','TURMA_1','AtoM STJ + STF notícia','Posse 29/11/2001. Saiu 03/03/2011 para STF'),
    ('TEORI ALBINO ZAVASCKI','2003-05-01','2012-11-29','TURMA_1','STF notícia posse STF','Posse 01/05/2003. Saiu 29/11/2012 para STF'),
    ('MASSAMI UYEDA','2006-06-14','2013-08-28','TURMA_3','Conjur posse Moura Ribeiro','Posse 14/06/2006. Aposentadoria 28/08/2013'),
    ('DENISE ARRUDA','2004-05-17','2010-07-14','TURMA_1','AtoM (Sanseverino em vaga dela)','Posse 17/05/2004. Aposentadoria 14/07/2010'),
    ('PAULO GALLOTTI','1999-06-30','2009-07-17','TURMA_6','Migalhas','Posse 30/06/1999. Aposentadoria 17/07/2009'),
    ('HELIO QUAGLIA BARBOSA','2004-11-01','2008-06-04','TURMA_4','Senado (falecimento → vaga Salomão)','Posse 01/11/2004. Falecimento 04/06/2008'),
    ('FONTES DE ALENCAR','1992-06-01','2004-11-01','TURMA_4','AtoM (Quaglia em vaga dele)','Posse 01/06/1992. Aposentadoria 01/11/2004'),
    ('HUMBERTO GOMES DE BARROS','1992-10-01','2007-07-23','TURMA_3','Conjur (aposentadoria jul/2007)','Posse 01/10/1992. Aposentadoria 23/07/2007'),
    ('FERNANDO GONCALVES','1992-06-01','2008-08-26','TURMA_4','Senado (Benedito Gonçalves em vaga)','Posse 01/06/1992. Aposentadoria 26/08/2008'),
    ('JORGE SCARTEZZINI','2001-11-07','2008-08-26','TURMA_4','Senado (Napoleão em vaga dele)','Posse 07/11/2001. Aposentadoria 26/08/2008'),
    ('JOSE DELGADO','1995-04-10','2008-08-26','TURMA_1','Conjur (Hamilton → Delgado vaga)','Posse 10/04/1995. Aposentadoria 26/08/2008'),
    ('GILSON DIPP','','2016-03-09','TURMA_3','Senado (Paciornik em vaga dele)','Aposentadoria 09/03/2016 (data posse a confirmar)'),
    ('CESAR ASFOR ROCHA','','2012-08-31','TURMA_4','Linha sucessória STJ','Aposentadoria ~2012 (data posse a confirmar)'),
]
for m, vf, vt, ord_, src, mot in historicos_validados:
    INSERCOES.append(('STJ', m, ord_, vf, vt, 1, 'saiu', mot, src, 'validado_25abr'))

# 6 convocados com datas validadas
convocados_validados = [
    ('OTAVIO DE ALMEIDA TOLEDO','','2025-09-04','TURMA_6','STJ notícia 04/09/2025','Convocado TJSP. Saiu 04/09/2025 com posses Brandão+Marluce'),
    ('CARLOS CINI MARCHIONATTI','','2025-09-04','TURMA_5','STJ notícia 04/09/2025','Convocado TJ-RS. Saiu 04/09/2025'),
    ('LUIS CARLOS GAMBOGI','2026-02-23','','TURMA_4','STJ + ConJur 23/02/2026','Convocado TJ-MG para vaga Buzzi afastado. Estreou 03/03/2026'),
    ('OLINDO HERCULANO DE MENEZES','2021-03-17','2022-12-06','TURMA_6','STJ notícias','Convocado TRF1'),
    ('DIVA MALERBI','','','TURMA_2','STJ jurisprudência','Convocada TRF3 — datas a precisar'),
    ('LAZARO GUIMARAES','','','TURMA_4','STJ jurisprudência','Convocado TRF5 — datas a precisar'),
]
for m, vf, vt, ord_, src, mot in convocados_validados:
    INSERCOES.append(('STJ', m, ord_, vf, vt, 1, 'convocado', mot, src, 'validado_25abr'))

# 6 convocados sem datas (rascunho)
convocados_pendentes = [
    ('LEOPOLDO DE ARRUDA RAPOSO','TURMA_5','Convocado TJPE'),
    ('JOAO BATISTA MOREIRA','TURMA_1','Convocado TRF1'),
    ('ERICSON MARANHO','TURMA_6','Convocado TJSP'),
    ('MARILZA MAYNARD','TURMA_5','Convocado TJSE'),
    ('WALTER DE ALMEIDA GUILHERME','TURMA_3','Convocado TJSP'),
    ('NEWTON TRISOTTO','TURMA_3','Convocado TJSC'),
]
for m, ord_, mot in convocados_pendentes:
    INSERCOES.append(('STJ', m, ord_, '', '', 1, 'convocado', mot, 'rascunho_pesquisar_DOU','rascunho_pesquisar'))

print(f'[PASSO 2] {len(INSERCOES)} linhas a inserir (compilação validada)')

# Anexar
for nl in INSERCOES:
    buf = io.StringIO(); csv.writer(buf).writerow(nl)
    new_lines.append(buf.getvalue().rstrip('\r\n'))

# Salvar
with open(SEED, 'w', encoding='utf-8', newline='') as f:
    f.write('\n'.join(new_lines) + '\n')

# Verificação
df = pd.read_csv(SEED, comment='#')
print(f'\n[OK] Total: {len(df)} | STJ: {len(df[df.tribunal_sigla=="STJ"])} | STF: {len(df[df.tribunal_sigla=="STF"])}')
print('\n=== Distribuição validado (STJ) ===')
print(df[df.tribunal_sigla=='STJ'].groupby('validado').size().to_string())
