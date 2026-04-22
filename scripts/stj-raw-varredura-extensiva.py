"""Varredura extensiva do raw Datajud STJ (3.380 parts).

Enumera todos os formatos distintos dos campos-chave para consolidar o dicionário
canônico do universo STJ — base para o parser definitivo das views dinâmicas.

Não processa dados, só cataloga formatos.
"""
import gzip, json, re, time, sys, os
from collections import Counter, defaultdict
from pathlib import Path

RAW = Path("G:/datajud_raw/nivel_1_anteparos/STJ")
OUT_DIR = Path("C:/Users/medin/Desktop/backup_judx/resultados")
PROGRESS = OUT_DIR / "_varredura_stj_progress.txt"

parts = sorted([p for p in RAW.glob("part-*.ndjson.gz")])
total_parts = len(parts)
print(f"[varredura] {total_parts} parts em {RAW}", flush=True)

# Acumuladores
classes = Counter()                  # (codigo, nome) -> contagem
classes_sem_codigo = Counter()       # só nome quando codigo null
oj_prefixos = Counter()              # primeiro token do orgaoJulgador.nome
oj_exemplos = defaultdict(list)      # prefixo -> amostras (max 5 por prefixo)
da_formatos = Counter()              # formato bucket
assuntos_shapes = Counter()          # shape da lista de assuntos
assuntos_tops = Counter()            # (codigo, nome) do primeiro assunto
mov_nomes = Counter()                # todos os nomes distintos de movimento
mov_codigos = Counter()              # (codigo, nome)
np_len = Counter()                   # comprimento
tr_counter = Counter()               # digitos 14-16 (TR do CNJ 20d)
j_counter = Counter()                # digito 14 (J) isolado
sistema_vals = Counter()             # (codigo, nome)
formato_vals = Counter()             # (codigo, nome)
grau_vals = Counter()
nivelSigilo_vals = Counter()
tribunal_vals = Counter()
top_keys = Counter()                 # chaves top-level observadas

# Regex para bucketizar dataAjuizamento
RE_14D = re.compile(r'^\d{14}$')
RE_8D = re.compile(r'^\d{8}$')
RE_ISO = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}')

def bucket_da(s):
    if not s: return '(vazio)'
    if RE_14D.match(s): return 'AAAAMMDDhhmmss_14d'
    if RE_8D.match(s): return 'AAAAMMDD_8d'
    if RE_ISO.match(s): return 'ISO8601'
    return f'outro:{s[:12]}'

def shape_assuntos(ass):
    if ass is None: return 'null'
    if not isinstance(ass, list): return f'nao_lista:{type(ass).__name__}'
    if len(ass) == 0: return 'lista_vazia'
    a0 = ass[0]
    if isinstance(a0, dict):
        keys = tuple(sorted(a0.keys()))
        return f'lista_dict:{keys}'
    if isinstance(a0, list):
        return 'lista_de_lista'
    if isinstance(a0, (int, str)):
        return f'lista_escalar:{type(a0).__name__}'
    return f'lista_outro:{type(a0).__name__}'

def oj_prefix(nome):
    if not nome: return '(vazio)'
    n = nome.upper().strip()
    # primeiro bucket por prefixo relevante
    if n.startswith('GABINETE'): return 'GABINETE'
    if n.startswith('PRESID'): return 'PRESIDENCIA'
    if n.startswith('VICE-PRESID') or n.startswith('VICE PRESID'): return 'VICE-PRESIDENCIA'
    if 'SEÇÃO' in n or 'SECAO' in n or 'SEÃÃO' in n: return 'SECAO'
    if 'TURMA' in n: return 'TURMA'
    if 'NÚCLEO' in n or 'NUCLEO' in n or 'NÃCLEO' in n: return 'NUCLEO'
    if 'SUPERIOR TRIBUNAL' in n or n.upper() == 'STJ': return 'STJ_GENERICO'
    if 'DESEMB' in n: return 'DESEMBARGADOR'
    # primeiro token
    return n.split()[0][:30]

t0 = time.time()
docs_total = 0
docs_sem_source = 0
docs_erro = 0
last_progress = t0

for i, p in enumerate(parts):
    try:
        with gzip.open(p, 'rt', encoding='utf-8') as f:
            for line in f:
                docs_total += 1
                try:
                    doc = json.loads(line)
                except Exception:
                    docs_erro += 1
                    continue
                src = doc.get('_source', doc) if isinstance(doc, dict) else {}
                if not isinstance(src, dict):
                    docs_sem_source += 1
                    continue

                # top-level keys
                for k in src.keys():
                    top_keys[k] += 1

                # classe
                cl = src.get('classe') or {}
                if isinstance(cl, dict):
                    classes[(cl.get('codigo'), cl.get('nome',''))] += 1

                # orgaoJulgador
                oj = src.get('orgaoJulgador') or {}
                ojn = (oj.get('nome','') if isinstance(oj, dict) else '') or ''
                pref = oj_prefix(ojn)
                oj_prefixos[pref] += 1
                if len(oj_exemplos[pref]) < 5 and ojn and ojn not in oj_exemplos[pref]:
                    oj_exemplos[pref].append(ojn)

                # dataAjuizamento
                da = src.get('dataAjuizamento')
                if isinstance(da, str):
                    da_formatos[bucket_da(da)] += 1
                elif da is None:
                    da_formatos['(null)'] += 1
                else:
                    da_formatos[f'tipo:{type(da).__name__}'] += 1

                # assuntos
                ass = src.get('assuntos')
                assuntos_shapes[shape_assuntos(ass)] += 1
                if isinstance(ass, list) and ass:
                    a0 = ass[0]
                    if isinstance(a0, dict):
                        assuntos_tops[(a0.get('codigo'), a0.get('nome',''))] += 1

                # numeroProcesso
                np_ = src.get('numeroProcesso') or ''
                if isinstance(np_, str):
                    np_len[len(np_)] += 1
                    if len(np_) == 20 and np_.isdigit():
                        tr_counter[np_[13:16]] += 1
                        j_counter[np_[13]] += 1

                # movimentos
                movs = src.get('movimentos') or []
                if isinstance(movs, list):
                    for m in movs:
                        if not isinstance(m, dict):
                            continue
                        mn = (m.get('nome') or '').strip()
                        if mn:
                            mov_nomes[mn] += 1
                            mov_codigos[(m.get('codigo'), mn)] += 1

                # outros escalares
                sistema_vals[(
                    (src.get('sistema') or {}).get('codigo') if isinstance(src.get('sistema'), dict) else None,
                    (src.get('sistema') or {}).get('nome','') if isinstance(src.get('sistema'), dict) else ''
                )] += 1
                formato_vals[(
                    (src.get('formato') or {}).get('codigo') if isinstance(src.get('formato'), dict) else None,
                    (src.get('formato') or {}).get('nome','') if isinstance(src.get('formato'), dict) else ''
                )] += 1
                grau_vals[src.get('grau') or '(null)'] += 1
                nivelSigilo_vals[src.get('nivelSigilo') if src.get('nivelSigilo') is not None else '(null)'] += 1
                tribunal_vals[src.get('tribunal') or '(null)'] += 1
    except Exception as e:
        print(f"[erro] {p.name}: {e}", flush=True)
        continue

    # progresso a cada 200 parts
    now = time.time()
    if (i+1) % 200 == 0 or (now - last_progress) > 30:
        elapsed = now - t0
        pct = 100*(i+1)/total_parts
        eta = elapsed/(i+1) * (total_parts-i-1) if i>0 else 0
        msg = f"[{elapsed:.0f}s] part {i+1}/{total_parts} ({pct:.1f}%) — docs={docs_total:,} — eta {eta:.0f}s"
        print(msg, flush=True)
        PROGRESS.write_text(msg)
        last_progress = now

elapsed = time.time() - t0
print(f"\n[fim] {docs_total:,} docs lidos em {elapsed:.0f}s", flush=True)
print(f"  classes distintas: {len(classes):,}", flush=True)
print(f"  orgaoJulgador prefixos: {len(oj_prefixos):,}", flush=True)
print(f"  movimentos nomes distintos: {len(mov_nomes):,}", flush=True)
print(f"  TR distintos (14-16): {len(tr_counter):,}", flush=True)

# ========== RELATÓRIO ==========
def pct(n, tot):
    return f"{100*n/tot:.2f}%" if tot else "0%"

MD = OUT_DIR / "2026-04-19_raw_stj_dicionario_canonico.md"
lines = []
lines.append("# Raw Datajud STJ — dicionário canônico de formatos")
lines.append(f"\n**Data**: 19/abr/2026")
lines.append(f"**Fonte**: `{RAW}`")
lines.append(f"**Partes lidas**: {total_parts:,}")
lines.append(f"**Docs totais**: {docs_total:,}")
lines.append(f"**Tempo**: {elapsed:.0f}s")
lines.append(f"**Erros de parse**: {docs_erro:,}  |  Sem _source: {docs_sem_source:,}")

lines.append("\n---\n\n## 1. Chaves top-level observadas\n")
lines.append("| chave | ocorrências | % docs |")
lines.append("|---|---:|---:|")
for k, c in top_keys.most_common():
    lines.append(f"| {k} | {c:,} | {pct(c, docs_total)} |")

lines.append(f"\n---\n\n## 2. Classes processuais — {len(classes):,} distintas\n")
lines.append("| codigo | nome | ocorrências | % |")
lines.append("|---:|---|---:|---:|")
for (cod, nome), c in classes.most_common():
    lines.append(f"| {cod} | {nome} | {c:,} | {pct(c, docs_total)} |")

lines.append(f"\n---\n\n## 3. orgaoJulgador prefixos — {len(oj_prefixos):,} buckets\n")
lines.append("| bucket | ocorrências | % | exemplos |")
lines.append("|---|---:|---:|---|")
for pref, c in oj_prefixos.most_common(50):
    ex = ' / '.join((x[:60] for x in oj_exemplos[pref]))
    lines.append(f"| {pref} | {c:,} | {pct(c, docs_total)} | {ex} |")

lines.append("\n---\n\n## 4. dataAjuizamento — formatos\n")
lines.append("| formato | ocorrências | % |")
lines.append("|---|---:|---:|")
for f, c in da_formatos.most_common(20):
    lines.append(f"| `{f}` | {c:,} | {pct(c, docs_total)} |")

lines.append("\n---\n\n## 5. assuntos — shapes observados\n")
lines.append("| shape | ocorrências | % |")
lines.append("|---|---:|---:|")
for s, c in assuntos_shapes.most_common():
    lines.append(f"| `{s}` | {c:,} | {pct(c, docs_total)} |")

lines.append(f"\n### 5.1 Assuntos TPU mais comuns (top 50 do primeiro assunto)\n")
lines.append("| codigo_tpu | nome | ocorrências |")
lines.append("|---:|---|---:|")
for (cod, nome), c in assuntos_tops.most_common(50):
    lines.append(f"| {cod} | {nome} | {c:,} |")

lines.append("\n---\n\n## 6. numeroProcesso — comprimentos\n")
lines.append("| len | ocorrências | % |")
lines.append("|---:|---:|---:|")
for L, c in sorted(np_len.items()):
    lines.append(f"| {L} | {c:,} | {pct(c, docs_total)} |")

lines.append(f"\n### 6.1 Distribuição por J (segmento, dígito 14)\n")
lines.append("| J | segmento | ocorrências | % (dos 20d) |")
lines.append("|---|---|---:|---:|")
J_MAP = {'1':'STF','2':'CNJ','3':'Superiores','4':'Federal','5':'Trabalho','6':'Eleitoral','7':'Militar Federal','8':'Estadual','9':'Militar Estadual'}
tot20 = sum(j_counter.values())
for jd, c in sorted(j_counter.items(), key=lambda x: -x[1]):
    lines.append(f"| {jd} | {J_MAP.get(jd,'?')} | {c:,} | {pct(c, tot20)} |")

lines.append(f"\n### 6.2 TR (dígitos 14-16) — top 40\n")
lines.append("| TR | ocorrências | % (dos 20d) |")
lines.append("|---|---:|---:|")
for tr, c in tr_counter.most_common(40):
    lines.append(f"| {tr} | {c:,} | {pct(c, tot20)} |")

lines.append(f"\n---\n\n## 7. Movimentos — {len(mov_nomes):,} nomes distintos\n")
lines.append("**Top 100 nomes de movimento:**\n")
lines.append("| nome | ocorrências |")
lines.append("|---|---:|")
for nome, c in mov_nomes.most_common(100):
    lines.append(f"| {nome[:100]} | {c:,} |")

lines.append(f"\n---\n\n## 8. Outros campos — valores observados\n")
for label, counter in [('grau', grau_vals), ('nivelSigilo', nivelSigilo_vals), ('tribunal', tribunal_vals)]:
    lines.append(f"\n### {label}\n")
    lines.append("| valor | ocorrências |")
    lines.append("|---|---:|")
    for v, c in counter.most_common(20):
        lines.append(f"| `{v}` | {c:,} |")

lines.append(f"\n### sistema — (codigo, nome)\n")
lines.append("| codigo | nome | ocorrências |")
lines.append("|---:|---|---:|")
for (cod, nome), c in sistema_vals.most_common(20):
    lines.append(f"| {cod} | {nome} | {c:,} |")

lines.append(f"\n### formato — (codigo, nome)\n")
lines.append("| codigo | nome | ocorrências |")
lines.append("|---:|---|---:|")
for (cod, nome), c in formato_vals.most_common(20):
    lines.append(f"| {cod} | {nome} | {c:,} |")

MD.write_text('\n'.join(lines), encoding='utf-8')
print(f"\n[relatorio] {MD}")
print(f"  tamanho: {MD.stat().st_size/1024:.1f} KB")

# ========== CSVs canônicos ==========
import csv
with (OUT_DIR / "2026-04-19_stj_classes_canonico.csv").open('w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['codigo', 'nome', 'ocorrencias'])
    for (cod, nome), c in classes.most_common():
        w.writerow([cod, nome, c])

with (OUT_DIR / "2026-04-19_stj_movimentos_canonico.csv").open('w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['codigo', 'nome', 'ocorrencias'])
    for (cod, nome), c in mov_codigos.most_common():
        w.writerow([cod, nome, c])

with (OUT_DIR / "2026-04-19_stj_tr_canonico.csv").open('w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['tr', 'ocorrencias'])
    for tr, c in tr_counter.most_common():
        w.writerow([tr, c])

print("CSVs canônicos salvos.")
