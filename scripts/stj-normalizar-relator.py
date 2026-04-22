"""stj-normalizar-relator.py

Varre o raw STJ corrigindo encoding (mojibake latin-1↔utf-8) e normalizando
nomes de relatores. Produz dicionário de equivalência e agregados canônicos.

Saídas em Desktop\backup_judx\resultados\:
  - 2026-04-19_stj_relator_canonico.csv        (nome_canonico, ocorrencias, pct)
  - 2026-04-19_stj_relator_equivalencias.csv    (nome_raw, nome_canonico, n)
  - 2026-04-19_stj_orgao_julgador_canonico.csv  (bucket_canonico, ocorrencias)
"""
import gzip, json, re, csv, time
from collections import Counter, defaultdict
from pathlib import Path

RAW = Path("G:/datajud_raw/nivel_1_anteparos/STJ")
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados")
DATA = "2026-04-19"

def fix_mojibake(s):
    """Se o texto tem padrão de UTF-8 lido como Latin-1, reverte.
    Caso contrário retorna original."""
    if not s or not isinstance(s, str):
        return s
    # heurística: se tem padrão 'Ã' seguido de char maiúsculo ou símbolo, é mojibake
    if re.search(r'Ã[A-Za-z\x80-\xff\x7f\x00-\x1f\x21-\x40]', s):
        try:
            fixed = s.encode('latin-1', errors='strict').decode('utf-8', errors='strict')
            # só aceita se o tamanho diminuiu (bytes multi-byte consolidados) e não introduziu lixo
            return fixed
        except (UnicodeEncodeError, UnicodeDecodeError):
            return s
    return s

def normalizar(s):
    if not s: return ''
    s = fix_mojibake(s)
    s = re.sub(r'\s+', ' ', s).strip()
    # uppercase canônico (nomes de ministros vêm em maiúsculas no Datajud)
    s = s.upper()
    return s

# Buckets de órgão julgador (não são relatores)
BUCKET_PATTERNS = [
    (re.compile(r'^VICE[-\s]?PRESID'), 'VICE-PRESIDÊNCIA'),
    (re.compile(r'^PRESIDÊNCIA$|^PRESIDENCIA$'), 'PRESIDÊNCIA'),
    (re.compile(r'^PRESIDENTE DA PRIMEIRA SEÇÃO'), 'PRESIDENTE DA PRIMEIRA SEÇÃO'),
    (re.compile(r'^PRESIDENTE DA SEGUNDA SEÇÃO'), 'PRESIDENTE DA SEGUNDA SEÇÃO'),
    (re.compile(r'^PRESIDENTE DA TERCEIRA SEÇÃO'), 'PRESIDENTE DA TERCEIRA SEÇÃO'),
    (re.compile(r'^PRESIDENTE DA PRIMEIRA TURMA'), 'PRESIDENTE DA PRIMEIRA TURMA'),
    (re.compile(r'^NÚCLEO DE GERENCIAMENTO|^NUCLEO DE GERENCIAMENTO'), 'NUGEP'),
    (re.compile(r'^SUPERIOR TRIBUNAL'), 'STJ_GENERICO'),
]

# Extração de nome de ministro/desembargador dentro do gabinete
RE_GABINETE_MIN = re.compile(r'^GABINETE\s+(?:DA|DO)\s+MINISTR[AO]\s+(.+?)$')
RE_GABINETE_DESEMB = re.compile(r'^GABINETE\s+(?:DA|DO)?\s*DESEMBARGADOR\s+(?:CONVOCAD[AO]\s+)?(.+?)$')

def extrair_relator(nome_normalizado):
    """Retorna (nome_canonico_relator, tipo, bucket_orgao)
    tipo: 'ministro' | 'desembargador' | 'bucket' | 'outro'
    bucket_orgao: string para agregar órgão julgador (para não-relatores)
    """
    n = nome_normalizado
    for pat, lbl in BUCKET_PATTERNS:
        if pat.match(n):
            return (None, 'bucket', lbl)
    m = RE_GABINETE_MIN.match(n)
    if m:
        rel = m.group(1).strip()
        # remover sufixos redundantes ("FILHO", títulos de cortesia)
        rel = re.sub(r'\s+$', '', rel)
        return (rel, 'ministro', 'GABINETE_MIN')
    m = RE_GABINETE_DESEMB.match(n)
    if m:
        rel = m.group(1).strip()
        return (rel, 'desembargador_convocado', 'GABINETE_DESEMB')
    return (None, 'outro', n[:50])

# ====== varredura ======
print(f"[normalizador] varrendo {RAW}", flush=True)
parts = sorted(p for p in RAW.glob("part-*.ndjson.gz"))
n_parts = len(parts)

c_relator = Counter()                    # nome_canonico -> n
c_equiv = defaultdict(Counter)            # nome_canonico -> Counter(nome_raw)
c_bucket_orgao = Counter()                # bucket -> n
c_outros = Counter()                      # nomes não classificados

t0 = time.time()
docs_total = 0

for i, p in enumerate(parts):
    try:
        with gzip.open(p, 'rt', encoding='utf-8') as f:
            for line in f:
                docs_total += 1
                try: doc = json.loads(line)
                except: continue
                s = doc.get('_source', doc)
                if not isinstance(s, dict): continue
                oj = s.get('orgaoJulgador') or {}
                n_raw = oj.get('nome', '') if isinstance(oj, dict) else ''
                if not n_raw: continue
                n_norm = normalizar(n_raw)
                rel, tipo, bucket = extrair_relator(n_norm)
                if tipo in ('ministro', 'desembargador_convocado') and rel:
                    c_relator[rel] += 1
                    c_equiv[rel][n_raw] += 1
                    c_bucket_orgao[bucket.upper()] += 1
                elif tipo == 'bucket':
                    c_bucket_orgao[bucket] += 1
                else:
                    c_outros[n_norm[:50]] += 1
    except Exception as e:
        print(f'[erro] {p.name}: {e}', flush=True)
        continue
    if (i+1) % 400 == 0 or (i+1) == n_parts:
        el = time.time() - t0
        pct = 100*(i+1)/n_parts
        print(f'[{el:.0f}s] part {i+1}/{n_parts} ({pct:.1f}%) docs={docs_total:,}', flush=True)

elapsed = time.time() - t0
print(f'\n[fim] {docs_total:,} docs em {elapsed:.0f}s', flush=True)
print(f'  relatores canônicos distintos: {len(c_relator):,}', flush=True)
print(f'  buckets de órgão julgador: {len(c_bucket_orgao):,}', flush=True)
print(f'  não classificados (outros): {len(c_outros):,}', flush=True)

# ====== CSVs ======
def pct(n, tot):
    return round(100*n/tot, 4) if tot else 0

# 1. Relatores canônicos
fp = OUT / f"{DATA}_stj_relator_canonico.csv"
with fp.open('w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['relator_canonico', 'ocorrencias', 'pct_corpus', 'variacoes_raw'])
    for rel, n in c_relator.most_common():
        variacoes = len(c_equiv[rel])
        w.writerow([rel, n, pct(n, docs_total), variacoes])
print(f'  csv: {fp.name} ({fp.stat().st_size/1024:.1f} KB)')

# 2. Dicionário de equivalências (nome_raw → canonico)
fp = OUT / f"{DATA}_stj_relator_equivalencias.csv"
with fp.open('w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['nome_raw', 'nome_canonico', 'ocorrencias'])
    for rel, cnt_raw in c_equiv.items():
        for raw, n in cnt_raw.most_common():
            w.writerow([raw, rel, n])
print(f'  csv: {fp.name} ({fp.stat().st_size/1024:.1f} KB)')

# 3. Buckets de órgão julgador canônicos
fp = OUT / f"{DATA}_stj_orgao_julgador_canonico.csv"
with fp.open('w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['bucket', 'ocorrencias', 'pct_corpus'])
    for bucket, n in c_bucket_orgao.most_common():
        w.writerow([bucket, n, pct(n, docs_total)])
print(f'  csv: {fp.name} ({fp.stat().st_size/1024:.1f} KB)')

# 4. Não classificados (para inspeção)
fp = OUT / f"{DATA}_stj_orgao_nao_classificados.csv"
with fp.open('w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['nome_raw_truncado', 'ocorrencias'])
    for n, c in c_outros.most_common(200):
        w.writerow([n, c])
print(f'  csv: {fp.name} ({fp.stat().st_size/1024:.1f} KB)')

print('\n[pronto] normalização concluída.')
