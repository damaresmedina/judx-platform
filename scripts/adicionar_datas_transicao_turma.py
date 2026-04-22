"""Adiciona colunas de datas para cada Turma (1ª e 2ª) ao CSV dos ministros.
Se o ministro trocou de turma, as 2 janelas ficam preenchidas para rastrear
o comportamento antes e depois da transição.

Colunas novas (inseridas logo após trocou_turma):
  turma_1_from, turma_1_to  — período na 1ª Turma
  turma_2_from, turma_2_to  — período na 2ª Turma
  turma_transicao_data      — quando trocou (se aplicável)
  turma_transicao_de        — de onde saiu (TURMA_1 ou TURMA_2)
  turma_transicao_para      — para onde foi
"""
import csv, io, unicodedata
from pathlib import Path
from collections import defaultdict

SRC = Path("C:/Users/medin/Desktop/backup_judx/resultados/stf_175_ministros.csv")
SEED = "C:/Users/medin/projetos/judx-platform/scripts/seeds-tribunais/composicao_ministerial.csv"

def sa(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(s or '')) if not unicodedata.combining(c)).upper().strip()

# Carrega seed
with open(SEED, encoding='utf-8') as f:
    raw = f.read()
lines = [l for l in raw.splitlines() if not l.startswith('#')]
reader = csv.DictReader(io.StringIO('\n'.join(lines)))
seed_rows = [r for r in reader if r.get('tribunal_sigla')=='STF' and r.get('ministro_nome_canonico')]

# Indexa por nome (sem acento)
seed_idx = defaultdict(list)
for r in seed_rows:
    seed_idx[sa(r['ministro_nome_canonico'])].append(r)

# Carrega CSV dos ministros
with open(SRC, encoding='utf-8') as f:
    rows = list(csv.DictReader(f))
    cols = list(rows[0].keys())

# Novas colunas
novas = ['turma_1_from','turma_1_to','turma_2_from','turma_2_to',
         'turma_transicao_data','turma_transicao_de','turma_transicao_para']

# Inserir após 'trocou_turma'
if 'trocou_turma' in cols:
    idx = cols.index('trocou_turma') + 1
    for i, c in enumerate(novas):
        if c not in cols:
            cols.insert(idx + i, c)

def datas_turma(registros, codigo):
    regs = sorted([r for r in registros if r['codigo_orgao']==codigo],
                  key=lambda r: r.get('valid_from','') or '9999')
    if not regs: return ('','')
    return (regs[0].get('valid_from','') or '',
            regs[-1].get('valid_to','') or '')

# Preenche
atualizados = 0
for r in rows:
    # tenta match por nome
    nomes_match = [sa(r.get('nome_oficial','')), sa(r.get('nome_completo_bio','')), sa(r.get('nome_curto_bio',''))]
    regs = []
    for nm in nomes_match:
        if nm and nm in seed_idx:
            regs = seed_idx[nm]
            break
    # fallback: primeiro + último nome do nome_oficial
    if not regs and r.get('nome_oficial'):
        palavras = sa(r['nome_oficial']).split()
        if len(palavras) >= 2:
            chave = palavras[0] + ' ' + palavras[-1]
            if chave in seed_idx: regs = seed_idx[chave]

    t1_from, t1_to = datas_turma(regs, 'TURMA_1')
    t2_from, t2_to = datas_turma(regs, 'TURMA_2')

    r['turma_1_from'] = t1_from
    r['turma_1_to']   = t1_to
    r['turma_2_from'] = t2_from
    r['turma_2_to']   = t2_to

    # Detecta transição
    if r.get('trocou_turma','').upper() == 'SIM' and t1_from and t2_from:
        # quem começou primeiro é origem; o "to" do primeiro = data transição
        if t1_from < t2_from:
            r['turma_transicao_de'] = 'TURMA_1'
            r['turma_transicao_para'] = 'TURMA_2'
            r['turma_transicao_data'] = t1_to or t2_from
        else:
            r['turma_transicao_de'] = 'TURMA_2'
            r['turma_transicao_para'] = 'TURMA_1'
            r['turma_transicao_data'] = t2_to or t1_from
        atualizados += 1
    else:
        r.setdefault('turma_transicao_de', '')
        r.setdefault('turma_transicao_para', '')
        r.setdefault('turma_transicao_data', '')

# Salva
with open(SRC, 'w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for r in rows: w.writerow(r)

print(f"[ok] {SRC}")
print(f"ministros com transição de turma registrada: {atualizados}")

# Mostra os que transitaram para conferência
print("\n=== Transições de Turma ===")
trans = [r for r in rows if r.get('turma_transicao_de')]
trans.sort(key=lambda r: r.get('turma_transicao_data','') or '9999')
for r in trans:
    print(f"  {r['nome_oficial']:<45s} {r['turma_transicao_de']}→{r['turma_transicao_para']}  {r['turma_transicao_data']}")
