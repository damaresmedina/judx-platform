"""Corrige as datas de PRESIDENCIA no seed composicao_ministerial.csv
usando stf_presidentes_biografico.json como fonte canônica.

- Cada presidente do bio: valid_from = posse_pres; valid_to = posse do próximo - 1 dia
- Adiciona Aldir Passarinho (faltante)
- Preserva linhas PRESIDENCIA históricas que não estão no bio (pré-1963)
- Faz backup antes de sobrescrever
"""
import json, csv, re, unicodedata, io, shutil
from pathlib import Path
from datetime import datetime, timedelta

BIO = "C:/Users/medin/Desktop/backup_judx/resultados/stf_presidentes_biografico.json"
SEED = Path("C:/Users/medin/projetos/judx-platform/scripts/seeds-tribunais/composicao_ministerial.csv")
BACKUP = SEED.with_suffix('.csv.bak_pre_correcao_presid')

def strip_accents(s):
    if not s: return ''
    return ''.join(c for c in unicodedata.normalize('NFKD', str(s)) if not unicodedata.combining(c)).upper().strip()

def dmY(s):
    if not s: return None
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})', str(s).strip())
    return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}" if m else None

# ============================================================
# 1. Lê bio e monta lista ordenada de presidentes
# ============================================================
with open(BIO, encoding='utf-8') as f:
    bio = json.load(f)

presidentes = []
for m in bio:
    posse_pres = dmY(m.get('posse_pres'))
    if not posse_pres: continue
    saida = dmY(m.get('aposentadoria')) or dmY((m.get('falecimento') or '').split(',')[0].strip())
    presidentes.append({
        'nome': m.get('nome'),
        'nome_completo': m.get('nome_completo'),
        'posse_pres': posse_pres,
        'saida': saida,
    })

presidentes.sort(key=lambda x: x['posse_pres'])

# Calcula valid_to como (posse do próximo - 1 dia); último = aposentadoria
for i, p in enumerate(presidentes):
    if i + 1 < len(presidentes):
        prox = datetime.strptime(presidentes[i+1]['posse_pres'], '%Y-%m-%d')
        p['valid_to'] = (prox - timedelta(days=1)).strftime('%Y-%m-%d')
    else:
        p['valid_to'] = p['saida'] or ''
    p['valid_from'] = p['posse_pres']

print(f"bio: {len(presidentes)} presidentes encontrados, ordenados")
print(f"  primeiro: {presidentes[0]['nome']} ({presidentes[0]['valid_from']})")
print(f"  último:   {presidentes[-1]['nome']} ({presidentes[-1]['valid_from']})")

# ============================================================
# 2. Carrega seed (preserva comentários iniciais)
# ============================================================
with open(SEED, encoding='utf-8') as f:
    raw = f.read()
lines = raw.splitlines(keepends=True)
comments_top = []
i = 0
while i < len(lines) and lines[i].startswith('#'):
    comments_top.append(lines[i])
    i += 1
header_and_data = ''.join(lines[i:])
reader = csv.DictReader(io.StringIO(header_and_data))
fieldnames = reader.fieldnames
all_rows = list(reader)
print(f"\nseed: {len(all_rows)} linhas (+ {len(comments_top)} linhas de comentário)")

# ============================================================
# 3. Separa PRESIDENCIA (no bio) vs PRESIDENCIA histórica (fora do bio) vs não-PRESIDENCIA
# ============================================================
bio_keys = set()
for p in presidentes:
    bio_keys.add(strip_accents(p['nome']))
    if p.get('nome_completo'):
        bio_keys.add(strip_accents(p['nome_completo']))
    # acrescentar sobrenome único se composto
    if p.get('nome'):
        partes = p['nome'].split()
        if len(partes) >= 2:
            bio_keys.add(strip_accents(' '.join(partes[-2:])))

seed_pres_no_bio = []
seed_pres_historico = []
seed_outros = []

for r in all_rows:
    if r.get('tribunal_sigla')=='STF' and r.get('codigo_orgao')=='PRESIDENCIA':
        nome_key = strip_accents(r.get('ministro_nome_canonico',''))
        # tenta match pelo nome inteiro ou sobrenome final
        bateu = nome_key in bio_keys or any(nome_key.endswith(k) or k.endswith(nome_key) for k in bio_keys if len(k) > 5)
        if bateu:
            seed_pres_no_bio.append(r)
        else:
            seed_pres_historico.append(r)
    else:
        seed_outros.append(r)

print(f"  não-PRESIDENCIA: {len(seed_outros)}")
print(f"  PRESIDENCIA históricas (fora do bio, preservadas): {len(seed_pres_historico)}")
print(f"  PRESIDENCIA no bio (a corrigir): {len(seed_pres_no_bio)}")

# Mostra quais históricos serão preservados
print("\nPresidentes históricos preservados (pré-bio):")
for r in seed_pres_historico[:20]:
    print(f"  {r['ministro_nome_canonico']:<35s} {r['valid_from']} → {r['valid_to']}")
if len(seed_pres_historico) > 20:
    print(f"  ... + {len(seed_pres_historico)-20}")

# ============================================================
# 4. Gera novas linhas PRESIDENCIA para cada presidente do bio
# ============================================================
def match_seed_nome(bio_nome, bio_nome_completo):
    """Procura o nome canônico no seed antigo para preservar a grafia."""
    bio_key = strip_accents(bio_nome)
    bio_key_completo = strip_accents(bio_nome_completo or '')
    for r in seed_pres_no_bio:
        k = strip_accents(r['ministro_nome_canonico'])
        if k == bio_key or k == bio_key_completo:
            return r['ministro_nome_canonico']
        # substring — último 2 palavras
        if len(bio_key.split()) >= 2:
            ult2 = ' '.join(bio_key.split()[-2:])
            if k.endswith(ult2) or ult2.endswith(k):
                return r['ministro_nome_canonico']
    # não achou: usa o do bio (UPPER)
    return bio_nome.upper()

novas_pres = []
for i, p in enumerate(presidentes):
    nome_canonico = match_seed_nome(p['nome'], p.get('nome_completo'))
    nova = {
        'tribunal_sigla': 'STF',
        'ministro_nome_canonico': nome_canonico,
        'codigo_orgao': 'PRESIDENCIA',
        'valid_from': p['valid_from'],
        'valid_to': p['valid_to'],
        'ordem_historico': str(len(seed_pres_historico) + i + 1),
        'tipo_ancoragem': 'presidencia',
        'motivo_mudanca': 'Fonte: stf_presidentes_biografico.json (19/abr/2026)',
        'fonte': 'stf_presidentes_biografico.json',
        'validado': 'validado',
    }
    novas_pres.append(nova)

print(f"\n{len(novas_pres)} novas linhas PRESIDENCIA (corrigidas do bio):")
for r in novas_pres:
    print(f"  {r['ministro_nome_canonico']:<35s} {r['valid_from']} → {r['valid_to']}")

# ============================================================
# 5. Backup + grava seed novo
# ============================================================
shutil.copy2(SEED, BACKUP)
print(f"\n[backup] {BACKUP}")

with open(SEED, 'w', encoding='utf-8', newline='') as f:
    for line in comments_top:
        f.write(line)
    w = csv.DictWriter(f, fieldnames=fieldnames)
    w.writeheader()
    for r in seed_outros: w.writerow(r)
    for r in seed_pres_historico: w.writerow(r)
    for r in novas_pres: w.writerow(r)

print(f"[ok] {SEED} atualizado")
print(f"  total linhas: {len(seed_outros) + len(seed_pres_historico) + len(novas_pres)}")
