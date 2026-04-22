"""Consolida composição STF em um único CSV.

Junta 3 fontes:
  1. composicao_ministerial.csv (seed) — curado, com PRESIDENCIA corrigida pelo bio
  2. stf_todos_ministros_consolidado.json (bio 171 ministros) — biografia
  3. janelas_empiricas_derivadas.csv — TURMA/PLENARIO/MONOCRATICA derivadas do corpus 2000+

Regra de merge: para cada (ministro × órgão):
  - Se existe no seed → usa seed (curado)
  - Se não existe no seed mas existe no empírico → adiciona como 'derivado_empirico'
  - Bio sempre complementa com datas de identidade

Saída: Desktop/backup_judx/resultados/stf_composicao_completa.csv
"""
import json, csv, re, unicodedata, io
from pathlib import Path
from collections import defaultdict

BIO = "C:/Users/medin/Desktop/backup_judx/resultados/stf_todos_ministros_consolidado.json"
SEED = "C:/Users/medin/projetos/judx-platform/scripts/seeds-tribunais/composicao_ministerial.csv"
EMP = "C:/Users/medin/Desktop/backup_judx/resultados/janelas_empiricas_derivadas.csv"
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados/stf_composicao_completa.csv")

def strip_accents(s):
    if not s: return ''
    return ''.join(c for c in unicodedata.normalize('NFKD', str(s)) if not unicodedata.combining(c)).upper().strip()

def dmY(s):
    if not s: return None
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})', str(s).strip())
    return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}" if m else None

def first_date(s):
    if not s: return None
    return dmY(str(s).split(',')[0].strip())

# ============================================================
# 1. Biografia — indexa por nome curto E completo
# ============================================================
with open(BIO, 'r', encoding='utf-8') as f:
    bio_list = json.load(f)
bio_por_slug = {}
bio_idx = {}  # key → bio_m
for m in bio_list:
    slug = m.get('slug') or m.get('nome')
    if slug and slug not in bio_por_slug:
        bio_por_slug[slug] = m
    for n in (m.get('nome'), m.get('nome_completo')):
        if n:
            k = strip_accents(n)
            if k not in bio_idx:
                bio_idx[k] = m

# ============================================================
# 2. Seed (com comentários)
# ============================================================
with open(SEED, encoding='utf-8') as f:
    raw = f.read()
lines = raw.splitlines(keepends=True)
i = 0
while i < len(lines) and lines[i].startswith('#'):
    i += 1
reader = csv.DictReader(io.StringIO(''.join(lines[i:])))
seed_rows = [r for r in reader if r.get('tribunal_sigla')=='STF' and r.get('ministro_nome_canonico')]

# Indexa seed por nome
seed_idx = defaultdict(list)
for r in seed_rows:
    seed_idx[strip_accents(r['ministro_nome_canonico'])].append(r)

# ============================================================
# 3. Empíricas
# ============================================================
with open(EMP, encoding='utf-8') as f:
    emp_rows = list(csv.DictReader(f))

emp_idx = defaultdict(list)
for r in emp_rows:
    emp_idx[strip_accents(r['nome_canonico'])].append(r)

# ============================================================
# 4. Monta linhas de saída
# ============================================================
def make_row(bio_m, codigo_orgao, valid_from, valid_to, ordem_hist,
             tipo_ancoragem, motivo, fonte, validado, n_decisoes=None, nome_canonico=None):
    return {
        'nome_canonico': nome_canonico or (bio_m.get('nome_completo') if bio_m else '') or (bio_m.get('nome') if bio_m else ''),
        'nome_completo': bio_m.get('nome_completo') if bio_m else '',
        'nome_curto': bio_m.get('nome') if bio_m else '',
        'slug': bio_m.get('slug') if bio_m else '',
        'nascimento': bio_m.get('nascimento') if bio_m else '',
        'indicacao': dmY(bio_m.get('indicacao')) if bio_m else '',
        'nomeacao': dmY(bio_m.get('nomeacao')) if bio_m else '',
        'posse_stf': dmY(bio_m.get('posse_stf')) if bio_m else '',
        'posse_vice': dmY(bio_m.get('posse_vice')) if bio_m else '',
        'posse_pres': dmY(bio_m.get('posse_pres')) if bio_m else '',
        'aposentadoria': dmY(bio_m.get('aposentadoria')) if bio_m else '',
        'falecimento_data': first_date(bio_m.get('falecimento')) if bio_m else '',
        'foi_presidente': bio_m.get('foi_presidente', False) if bio_m else False,
        'codigo_orgao': codigo_orgao,
        'valid_from': valid_from,
        'valid_to': valid_to,
        'ordem_historico': ordem_hist,
        'tipo_ancoragem': tipo_ancoragem,
        'motivo_mudanca': motivo,
        'fonte': fonte,
        'validado': validado,
        'n_decisoes_no_orgao': n_decisoes if n_decisoes is not None else '',
    }

rows_out = []

# 4.1 — Linhas do seed (curadas) + enriquecimento bio
for key in sorted(seed_idx.keys()):
    bio_m = bio_idx.get(key)
    for s in seed_idx[key]:
        rows_out.append(make_row(
            bio_m=bio_m,
            codigo_orgao=s['codigo_orgao'],
            valid_from=s.get('valid_from',''),
            valid_to=s.get('valid_to',''),
            ordem_hist=s.get('ordem_historico',''),
            tipo_ancoragem=s.get('tipo_ancoragem',''),
            motivo=s.get('motivo_mudanca',''),
            fonte=s.get('fonte','composicao_ministerial.csv'),
            validado=s.get('validado',''),
            nome_canonico=s['ministro_nome_canonico'],
        ))

# 4.2 — Empíricas que complementam o seed (mesmo ministro, órgão novo)
orgao_map_emp = {'TURMA_1':'TURMA_1', 'TURMA_2':'TURMA_2', 'PLENARIO':'PLENARIO',
                 'PLENARIO_VIRTUAL':'PLENARIO_VIRTUAL', 'PLENARIO_VIRTUAL_RG':'PLENARIO_VIRTUAL_RG',
                 'MONOCRATICA':'MONOCRATICA_ATIVIDADE'}

# Conjunto de (nome, órgão) já cobertos pelo seed
seed_cobertos = set()
for key, lst in seed_idx.items():
    for s in lst:
        seed_cobertos.add((key, s['codigo_orgao']))
        # adiciona também sem os sufixos _PRESID (equivalência)
        cg = s['codigo_orgao'].replace('_PRESID','')
        seed_cobertos.add((key, cg))

for key in sorted(emp_idx.keys()):
    bio_m = bio_idx.get(key)
    for e in emp_idx[key]:
        orgao_emp = orgao_map_emp.get(e['codigo_orgao'], e['codigo_orgao'])
        if (key, orgao_emp) in seed_cobertos or (key, e['codigo_orgao']) in seed_cobertos:
            continue  # seed já tem esse órgão
        rows_out.append(make_row(
            bio_m=bio_m,
            codigo_orgao=orgao_emp,
            valid_from=e.get('valid_from_empirico',''),
            valid_to=e.get('valid_to_empirico',''),
            ordem_hist='',
            tipo_ancoragem='empirico_corpus',
            motivo=f"Derivado empiricamente do corpus 2000+ (n={e.get('n_decisoes','?')} pulsos)",
            fonte='janelas_empiricas_derivadas.csv',
            validado='empirico',
            n_decisoes=e.get('n_decisoes'),
            nome_canonico=e['nome_canonico'],
        ))

# 4.3 — Ministros só em bio (sem seed nem empírico) — registra posse→aposentadoria como STF_GERAL
ministros_cobertos = set()
for r in rows_out:
    slug = r.get('slug')
    if slug: ministros_cobertos.add(slug)

for slug, bio_m in bio_por_slug.items():
    if slug in ministros_cobertos: continue
    rows_out.append(make_row(
        bio_m=bio_m,
        codigo_orgao='STF_GERAL',
        valid_from=dmY(bio_m.get('posse_stf')) or '',
        valid_to=dmY(bio_m.get('aposentadoria')) or first_date(bio_m.get('falecimento')) or '',
        ordem_hist='1',
        tipo_ancoragem='bio_only_pre_corpus',
        motivo='Ministro pré-2000 sem decisões no corpus operacional',
        fonte='stf_todos_ministros_consolidado.json',
        validado='bio',
        nome_canonico=(bio_m.get('nome_completo') or bio_m.get('nome')).upper(),
    ))

# Ordena por nome + valid_from
rows_out.sort(key=lambda r: (r['nome_canonico'] or '', r['valid_from'] or '9999'))

# ============================================================
# 5. Export
# ============================================================
cols = ['nome_canonico','nome_completo','nome_curto','slug',
        'nascimento','indicacao','nomeacao','posse_stf','posse_vice','posse_pres','aposentadoria','falecimento_data',
        'foi_presidente',
        'codigo_orgao','valid_from','valid_to','ordem_historico','tipo_ancoragem','motivo_mudanca','fonte','validado',
        'n_decisoes_no_orgao']
with open(OUT, 'w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for r in rows_out: w.writerow(r)

# ============================================================
# 6. Sumário
# ============================================================
from collections import Counter
cargos = Counter(r['codigo_orgao'] for r in rows_out)
fontes = Counter(r['fonte'] for r in rows_out)
print(f"total linhas no CSV final: {len(rows_out)}")
print(f"ministros únicos: {len(set(r['nome_canonico'] for r in rows_out))}")
print()
print("Cargos (codigo_orgao):")
for c, n in cargos.most_common():
    print(f"  {c:<30s} {n:>4d}")
print()
print("Fontes:")
for c, n in fontes.most_common():
    print(f"  {c:<45s} {n:>4d}")

print(f"\n[ok] {OUT}")
