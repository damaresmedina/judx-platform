"""stj-acoplar-movimentos-estrutura.py

Acopla os movimentos (pulsos) do raw STJ à estrutura decisória oficial do tribunal.
Lê o seed canônico (scripts/stj-estrutura-decisoria-seed.csv) e atribui cada
orgaoJulgador.nome encontrado nos movimentos a um órgão dessa estrutura.

Regra cardinal: a estrutura é fixa (Regimento Interno STJ). Os movimentos se
acoplam a ela. Pulsos cuja string de órgão não bate com nenhum órgão canônico
vão para 'NAO_CLASSIFICADO' — nunca forçamos encaixe.

Saídas em Desktop\backup_judx\resultados\:
  - 2026-04-19_stj_movimentos_por_orgao.csv       (orgao_canonico, pulsos, processos)
  - 2026-04-19_stj_processo_por_orgao.csv         (numero_cnj, orgaos atravessados)
  - 2026-04-19_stj_movimento_amostra_por_orgao.csv (amostra das strings raw de cada órgão)
  - 2026-04-19_stj_orgaos_nao_classificados.csv   (strings que escaparam)
"""
import gzip, json, re, csv, time
from collections import Counter, defaultdict
from pathlib import Path

RAW = Path("G:/datajud_raw/nivel_1_anteparos/STJ")
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados")
SEED_PATH = Path("C:/Users/medin/projetos/judx-platform/scripts/stj-estrutura-decisoria-seed.csv")
DATA = "2026-04-19"

# ====== fix encoding (mesmo do script anterior) ======
def fix_mojibake(s):
    if not s or not isinstance(s, str): return s
    if re.search(r'Ã[A-Za-z\x80-\xff\x7f\x00-\x1f\x21-\x40]', s):
        try:
            return s.encode('latin-1', errors='strict').decode('utf-8', errors='strict')
        except (UnicodeEncodeError, UnicodeDecodeError):
            return s
    return s

def normalizar(s):
    if not s: return ''
    s = fix_mojibake(s).strip()
    s = re.sub(r'\s+', ' ', s)
    return s.upper()

# ====== Carregar seed da estrutura ======
print(f"[seed] carregando {SEED_PATH.name}", flush=True)
with SEED_PATH.open('r', encoding='utf-8') as f:
    r = csv.DictReader(f)
    estrutura = list(r)
print(f"  {len(estrutura)} órgãos na estrutura canônica", flush=True)

# ====== Padrões de reconhecimento (ESTRUTURA → REGEX) ======
# Cada órgão canônico define regex que casa o que aparece no raw.
# Ordem importa: casos mais específicos antes dos mais genéricos.
MATCHERS = [
    # Corte Especial / Pleno
    ('CORTE_ESPECIAL', re.compile(r'^CORTE ESPECIAL$|^PRESIDENTE DA CORTE ESPECIAL')),
    ('PLENO',          re.compile(r'^PLEN(O|ÁRIO)$|^TRIBUNAL PLENO$')),

    # Seções (antes das Turmas, pois "PRIMEIRA SEÇÃO" contém "PRIMEIRA")
    ('SECAO_1',        re.compile(r'PRIMEIRA SEÇÃO|1ª SEÇÃO|\b1\. SEÇÃO')),
    ('SECAO_2',        re.compile(r'SEGUNDA SEÇÃO|2ª SEÇÃO|\b2\. SEÇÃO')),
    ('SECAO_3',        re.compile(r'TERCEIRA SEÇÃO|3ª SEÇÃO|\b3\. SEÇÃO')),

    # Turmas
    ('TURMA_1',        re.compile(r'PRIMEIRA TURMA|1ª TURMA|\b1\. TURMA')),
    ('TURMA_2',        re.compile(r'SEGUNDA TURMA|2ª TURMA|\b2\. TURMA')),
    ('TURMA_3',        re.compile(r'TERCEIRA TURMA|3ª TURMA|\b3\. TURMA')),
    ('TURMA_4',        re.compile(r'QUARTA TURMA|4ª TURMA|\b4\. TURMA')),
    ('TURMA_5',        re.compile(r'QUINTA TURMA|5ª TURMA|\b5\. TURMA')),
    ('TURMA_6',        re.compile(r'SEXTA TURMA|6ª TURMA|\b6\. TURMA')),

    # Admin-decisórios
    ('VICE_PRESIDENCIA', re.compile(r'^VICE[-\s]?PRESIDÊNCIA|^VICE[-\s]?PRESIDENCIA|VICE[-\s]?PRESIDENTE')),
    ('PRESIDENCIA',      re.compile(r'^PRESIDÊNCIA$|^PRESIDENCIA$|^PRESIDENTE DO STJ|^PRESIDENTE$|^PRESIDENTE\s*-')),

    # NUGEP
    ('NUGEP',          re.compile(r'NÚCLEO DE GERENCIAMENTO DE PRECEDENTES|NUGEP')),

    # Decisão monocrática do relator — o raw registra "GABINETE DO MINISTRO X".
    # Gabinete NÃO é órgão julgador. O órgão é MONOCRATICA; o nome capturado no grupo 1 é o RELATOR.
    ('MONOCRATICA', re.compile(r'^GABINETE (?:DA|DO) MINISTR[AO] (.+?)$')),

    # Desembargador convocado atuando como relator (também monocrática, relator é desembargador)
    ('DESEMBARGADOR_CONVOCADO', re.compile(r'DESEMBARGADOR(?:A)? CONVOCAD[AO]')),

    # STJ genérico — raw registrou apenas "SUPERIOR TRIBUNAL DE JUSTIÇA", sem órgão específico
    ('STJ_GENERICO', re.compile(r'^SUPERIOR TRIBUNAL DE JUSTIÇA$')),
]

def classificar_orgao(nome_norm):
    """Retorna (codigo_orgao, relator_se_gabinete)."""
    for codigo, pat in MATCHERS:
        m = pat.search(nome_norm)
        if m:
            relator = None
            if codigo == 'MONOCRATICA':
                relator = m.group(1).strip()
            return (codigo, relator)
    return ('NAO_CLASSIFICADO', None)

# ====== Varredura ======
parts = sorted(p for p in RAW.glob("part-*.ndjson.gz"))
n_parts = len(parts)
print(f"[varredura] {n_parts} parts", flush=True)

# acumuladores
pulsos_por_orgao   = Counter()          # codigo -> n pulsos
processos_por_orgao = defaultdict(set)   # codigo -> set(numero_cnj)
amostras_por_orgao = defaultdict(Counter) # codigo -> Counter(nome_raw)
relatores_por_orgao = defaultdict(Counter) # codigo='MONOCRATICA' -> Counter(relator)
nao_classificados  = Counter()           # nome_norm -> n
trilha_por_processo = defaultdict(list)  # numero_cnj -> [codigo_orgao, ...]

t0 = time.time()
docs_total = 0
pulsos_total = 0

for i, p in enumerate(parts):
    try:
        with gzip.open(p, 'rt', encoding='utf-8') as f:
            for line in f:
                docs_total += 1
                try: doc = json.loads(line)
                except: continue
                s = doc.get('_source', doc)
                if not isinstance(s, dict): continue
                np_ = s.get('numeroProcesso', '')
                movs = s.get('movimentos') or []
                if not isinstance(movs, list): continue

                for m in movs:
                    if not isinstance(m, dict): continue
                    oj = m.get('orgaoJulgador') or {}
                    nome_raw = oj.get('nome', '') if isinstance(oj, dict) else ''
                    if not nome_raw: continue
                    pulsos_total += 1
                    nome_norm = normalizar(nome_raw)
                    codigo, relator = classificar_orgao(nome_norm)
                    pulsos_por_orgao[codigo] += 1
                    processos_por_orgao[codigo].add(np_)
                    if len(amostras_por_orgao[codigo]) < 40:
                        amostras_por_orgao[codigo][nome_raw] += 1
                    else:
                        # já tem 40 amostras, só incrementa se já existe
                        if nome_raw in amostras_por_orgao[codigo]:
                            amostras_por_orgao[codigo][nome_raw] += 1
                    if relator:
                        relatores_por_orgao[codigo][relator] += 1
                    if codigo == 'NAO_CLASSIFICADO':
                        nao_classificados[nome_norm[:80]] += 1
    except Exception as e:
        print(f"[erro] {p.name}: {e}", flush=True)
        continue

    if (i+1) % 400 == 0 or (i+1) == n_parts:
        el = time.time() - t0
        pct = 100*(i+1)/n_parts
        print(f"[{el:.0f}s] part {i+1}/{n_parts} ({pct:.1f}%) docs={docs_total:,} pulsos={pulsos_total:,}", flush=True)

elapsed = time.time() - t0
print(f"\n[fim] {docs_total:,} docs · {pulsos_total:,} pulsos em {elapsed:.0f}s", flush=True)

# ====== Saídas ======
def pct(n, tot):
    return round(100*n/tot, 4) if tot else 0

# 1. pulsos por órgão (com % de cobertura de processos)
fp = OUT / f"{DATA}_stj_movimentos_por_orgao.csv"
with fp.open('w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['codigo_orgao', 'pulsos', 'pct_pulsos', 'processos_distintos', 'pct_processos'])
    for codigo, n in pulsos_por_orgao.most_common():
        n_proc = len(processos_por_orgao[codigo])
        w.writerow([codigo, n, pct(n, pulsos_total), n_proc, pct(n_proc, docs_total)])
print(f"  csv: {fp.name} ({fp.stat().st_size/1024:.1f} KB)")

# 2. amostra de strings raw por órgão (para inspeção)
fp = OUT / f"{DATA}_stj_movimento_amostra_por_orgao.csv"
with fp.open('w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['codigo_orgao', 'string_raw_exemplo', 'ocorrencias'])
    for codigo, cnt in amostras_por_orgao.items():
        for raw, n in cnt.most_common(10):
            w.writerow([codigo, raw, n])
print(f"  csv: {fp.name} ({fp.stat().st_size/1024:.1f} KB)")

# 3. relatores agregados (acoplados ao órgão MONOCRATICA)
fp = OUT / f"{DATA}_stj_relator_via_movimentos.csv"
with fp.open('w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['relator', 'pulsos_como_relator', 'pct'])
    tot_rel = sum(relatores_por_orgao['MONOCRATICA'].values())
    for rel, n in relatores_por_orgao['MONOCRATICA'].most_common():
        w.writerow([rel, n, pct(n, tot_rel)])
print(f"  csv: {fp.name} ({fp.stat().st_size/1024:.1f} KB)")

# 4. órgãos não classificados (para curadoria do seed)
fp = OUT / f"{DATA}_stj_orgaos_nao_classificados.csv"
with fp.open('w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['nome_normalizado', 'ocorrencias'])
    for nome, n in nao_classificados.most_common(300):
        w.writerow([nome, n])
print(f"  csv: {fp.name} ({fp.stat().st_size/1024:.1f} KB)")

print(f"\n[resumo] distribuição de pulsos por órgão canônico:")
for codigo, n in pulsos_por_orgao.most_common():
    n_proc = len(processos_por_orgao[codigo])
    print(f"  {codigo:30s} {n:>12,} pulsos  ({pct(n,pulsos_total):>5.2f}%)  em {n_proc:>10,} processos ({pct(n_proc,docs_total):>5.2f}%)")

print("\n[pronto] estrutura decisória acoplada. Pulsos não classificados:",
      sum(v for k,v in pulsos_por_orgao.items() if k=='NAO_CLASSIFICADO'),
      f"({pct(pulsos_por_orgao.get('NAO_CLASSIFICADO',0), pulsos_total)}% dos pulsos)")
