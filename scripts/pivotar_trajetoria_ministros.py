"""Pivota stf_composicao_completa.csv: 1 linha por ministro, com trajetória cronológica.

Colunas (ordem cronológica do mandato):
  nome_curto, nome_completo, nascimento,
  indicacao, nomeacao, posse_stf,
  turma_inicial, turma_inicial_from,
  trocou_turma, turma_atual, turma_atual_from,
  foi_presidente_turma, turma_presidida, turma_presid_from, turma_presid_to,
  foi_vice_presidente, vice_from, vice_to,
  foi_presidente_stf, presid_from, presid_to,
  aposentadoria, falecimento,
  n_decisoes_mono, n_decisoes_turma, n_decisoes_pleno   (do empírico 2000+)

Saída: stf_ministros_trajetoria.csv (181 linhas — 1 por ministro)
"""
import csv
from collections import defaultdict
from pathlib import Path

SRC = "C:/Users/medin/Desktop/backup_judx/resultados/stf_composicao_completa.csv"
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados/stf_ministros_trajetoria.csv")

with open(SRC, encoding='utf-8') as f:
    rows = list(csv.DictReader(f))

# Unifica duplicatas de grafia: sem-acento → com-acento
ALIAS = {
    'NERI DA SILVEIRA':       'NÉRI DA SILVEIRA',
    'ANDRE MENDONCA':         'ANDRÉ MENDONÇA',
    'ILMAR GALVAO':           'ILMAR GALVÃO',
    'MAURICIO CORREA':        'MAURÍCIO CORRÊA',
    'SEPULVEDA PERTENCE':     'SEPÚLVEDA PERTENCE',
    'MARCO AURELIO':          'MARCO AURÉLIO',
    'CARMEN LUCIA':           'CÁRMEN LÚCIA',
    'LUIS ROBERTO BARROSO':   'LUÍS ROBERTO BARROSO',
    'FLAVIO DINO':            'FLÁVIO DINO',
}
for r in rows:
    if r['nome_canonico'] in ALIAS:
        r['nome_canonico'] = ALIAS[r['nome_canonico']]

# Remove VICE-PRESIDENTE (é cargo genérico, não pessoa)
rows = [r for r in rows if r['nome_canonico'] != 'VICE-PRESIDENTE']

# Agrupa por nome_canonico
ministros = defaultdict(list)
for r in rows:
    ministros[r['nome_canonico']].append(r)

def pick_earliest(rows, filtro=lambda r: True, campo='valid_from'):
    cands = [r for r in rows if filtro(r) and r.get(campo)]
    if not cands: return None
    cands.sort(key=lambda r: r[campo])
    return cands[0]

def pick_latest(rows, filtro=lambda r: True, campo='valid_to'):
    cands = [r for r in rows if filtro(r) and r.get(campo)]
    if not cands: return None
    cands.sort(key=lambda r: r[campo], reverse=True)
    return cands[0]

linhas_out = []
for nome, regs in sorted(ministros.items()):
    # Biografia — todas as linhas do mesmo ministro têm a mesma biografia (repetida)
    b = regs[0]

    # Turma(s) — só as de TURMA_1 / TURMA_2 (sem _PRESID)
    turmas_puras = [r for r in regs if r['codigo_orgao'] in ('TURMA_1','TURMA_2')]
    turmas_puras.sort(key=lambda r: r.get('valid_from','') or '9999')
    turma_inicial = turmas_puras[0]['codigo_orgao'] if turmas_puras else ''
    turma_inicial_from = turmas_puras[0].get('valid_from','') if turmas_puras else ''
    trocou_turma = 'SIM' if len(turmas_puras) > 1 else ('NAO' if turmas_puras else '')
    turma_atual = turmas_puras[-1]['codigo_orgao'] if len(turmas_puras) > 1 else ''
    turma_atual_from = turmas_puras[-1].get('valid_from','') if len(turmas_puras) > 1 else ''

    # Presidência de Turma (_PRESID)
    pres_turma = [r for r in regs if r['codigo_orgao'] in ('TURMA_1_PRESID','TURMA_2_PRESID')]
    pres_turma.sort(key=lambda r: r.get('valid_from','') or '9999')
    foi_pres_turma = 'SIM' if pres_turma else 'NAO'
    turma_presid = pres_turma[0]['codigo_orgao'].replace('_PRESID','') if pres_turma else ''
    turma_presid_from = pres_turma[0].get('valid_from','') if pres_turma else ''
    turma_presid_to = pres_turma[-1].get('valid_to','') if pres_turma else ''

    # Vice-Presidência STF
    vices = [r for r in regs if r['codigo_orgao']=='VICE_PRESIDENCIA']
    vices.sort(key=lambda r: r.get('valid_from','') or '9999')
    foi_vice = 'SIM' if vices else 'NAO'
    vice_from = vices[0].get('valid_from','') if vices else ''
    vice_to = vices[-1].get('valid_to','') if vices else ''

    # Presidência STF
    pres_stf = [r for r in regs if r['codigo_orgao']=='PRESIDENCIA']
    pres_stf.sort(key=lambda r: r.get('valid_from','') or '9999')
    foi_pres = 'SIM' if pres_stf else 'NAO'
    pres_from = pres_stf[0].get('valid_from','') if pres_stf else ''
    pres_to = pres_stf[-1].get('valid_to','') if pres_stf else ''

    # Volumes empíricos (atividade 2000+)
    def get_n(codigo):
        for r in regs:
            if r['codigo_orgao'] == codigo and r.get('n_decisoes_no_orgao'):
                try: return int(r['n_decisoes_no_orgao'])
                except: pass
        return ''

    n_mono = get_n('MONOCRATICA_ATIVIDADE')
    n_pleno = get_n('PLENARIO')
    n_t1 = get_n('TURMA_1')
    n_t2 = get_n('TURMA_2')
    n_turma = (int(n_t1) if n_t1 else 0) + (int(n_t2) if n_t2 else 0)
    n_turma = n_turma if n_turma else ''

    linhas_out.append({
        'nome_canonico': nome,
        'nome_curto': b.get('nome_curto',''),
        'nome_completo': b.get('nome_completo',''),
        'nascimento': b.get('nascimento',''),
        'indicacao': b.get('indicacao',''),
        'nomeacao': b.get('nomeacao',''),
        'posse_stf': b.get('posse_stf',''),
        'turma_inicial': turma_inicial,
        'turma_inicial_from': turma_inicial_from,
        'trocou_turma': trocou_turma,
        'turma_atual': turma_atual,
        'turma_atual_from': turma_atual_from,
        'foi_presidente_turma': foi_pres_turma,
        'turma_presidida': turma_presid,
        'turma_presid_from': turma_presid_from,
        'turma_presid_to': turma_presid_to,
        'foi_vice_presidente': foi_vice,
        'vice_from': vice_from,
        'vice_to': vice_to,
        'foi_presidente_stf': foi_pres,
        'presid_from': pres_from,
        'presid_to': pres_to,
        'aposentadoria': b.get('aposentadoria',''),
        'falecimento': b.get('falecimento_data',''),
        'n_decisoes_mono_corpus': n_mono,
        'n_decisoes_turma_corpus': n_turma,
        'n_decisoes_pleno_corpus': n_pleno,
    })

# Ordena por posse_stf (ministros mais antigos primeiro)
linhas_out.sort(key=lambda r: r['posse_stf'] or '9999')

cols = ['nome_canonico','nome_curto','nome_completo','nascimento',
        'indicacao','nomeacao','posse_stf',
        'turma_inicial','turma_inicial_from','trocou_turma','turma_atual','turma_atual_from',
        'foi_presidente_turma','turma_presidida','turma_presid_from','turma_presid_to',
        'foi_vice_presidente','vice_from','vice_to',
        'foi_presidente_stf','presid_from','presid_to',
        'aposentadoria','falecimento',
        'n_decisoes_mono_corpus','n_decisoes_turma_corpus','n_decisoes_pleno_corpus']
with open(OUT, 'w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for r in linhas_out: w.writerow(r)

print(f"[ok] {OUT}")
print(f"ministros únicos: {len(linhas_out)}")
print()
# Sumário
from collections import Counter
print("Distribuição:")
print(f"  com posse STF registrada: {sum(1 for r in linhas_out if r['posse_stf'])}")
print(f"  trocou de Turma: {sum(1 for r in linhas_out if r['trocou_turma']=='SIM')}")
print(f"  foi presidente de Turma: {sum(1 for r in linhas_out if r['foi_presidente_turma']=='SIM')}")
print(f"  foi Vice-Presidente STF: {sum(1 for r in linhas_out if r['foi_vice_presidente']=='SIM')}")
print(f"  foi Presidente STF: {sum(1 for r in linhas_out if r['foi_presidente_stf']=='SIM')}")
print(f"  com atividade no corpus ≥2000: {sum(1 for r in linhas_out if r['n_decisoes_mono_corpus'])}")
