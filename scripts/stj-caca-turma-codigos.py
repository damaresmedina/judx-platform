"""stj-caca-turma-codigos.py

Segunda rodada de caça às Turmas no raw STJ. Procura:
1. Abreviações: T1, T2, T3, T4, T5, T6, 1T, 2T, 3T, 4T, 5T, 6T
2. Códigos numéricos distintos em orgaoJulgador.codigo (agrupamento)
3. Padrões em classe.codigo / complementosTabelados (códigos CNJ)
4. Qualquer campo do _source que contenha mais variações

Hipótese: Datajud pode estar gravando Turma em código abreviado ou numérico,
em vez de texto por extenso.
"""
import gzip, json, re, time
from collections import Counter, defaultdict
from pathlib import Path

RAW = Path("G:/datajud_raw/nivel_1_anteparos/STJ")
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados")

# Regex para abreviações de turma/seção
ABREV_PATS = {
    'T_numero': re.compile(r'\b[Tt][1-6]\b'),                 # T1, T2... T6
    'numero_T': re.compile(r'\b[1-6][Tt]\b'),                 # 1T, 2T... 6T
    'numero_aT': re.compile(r'\b[1-6][aºª]?\s*[Tt][Uu]?'),     # 1aT, 1ªT, 1aTu...
    'S_numero': re.compile(r'\b[Ss][1-3]\b'),                 # S1, S2, S3 (seções)
    'numero_aS': re.compile(r'\b[1-3][aºª]?\s*[Ss][Ee]?'),
    'numero_turma': re.compile(r'\b[1-6][ºª]?\s*TURMA\b', re.I),  # 1ª TURMA, 1 TURMA
    'numero_secao': re.compile(r'\b[1-3][ºª]?\s*SEÇÃO\b', re.I),  # 1ª SEÇÃO
    'corte_especial': re.compile(r'CORTE\s*ESPECIAL', re.I),
    'plenario': re.compile(r'PLEN[ÁA]RIO|TRIBUNAL\s+PLENO', re.I),
}

# Acumuladores
matches_por_campo = defaultdict(Counter)          # campo:pattern -> ocorrências
codigos_orgao_topo = Counter()                     # código numérico
codigos_orgao_movimento = Counter()
orgao_codigo_nome = defaultdict(Counter)            # código -> Counter(nome_associado)
chaves_todas_source = Counter()
chaves_todas_movimento = Counter()

def fix_mojibake(s):
    if not isinstance(s, str): return s
    if re.search(r'Ã[A-Za-z\x80-\xff\x7f\x00-\x1f\x21-\x40]', s):
        try: return s.encode('latin-1').decode('utf-8')
        except: return s
    return s

def scan_str(s, fonte):
    if not s or not isinstance(s, str): return
    s = fix_mojibake(s)
    for nome, pat in ABREV_PATS.items():
        if pat.search(s):
            matches_por_campo[f'{fonte}:{nome}'][s[:80]] += 1

parts = sorted(RAW.glob("part-*.ndjson.gz"))
print(f"[caça v2] varrendo {len(parts)} parts", flush=True)

t0 = time.time()
docs_total = 0
for i, p in enumerate(parts):
    try:
        with gzip.open(p, 'rt', encoding='utf-8') as f:
            for line in f:
                docs_total += 1
                try: d = json.loads(line)
                except: continue
                s = d.get('_source', d)
                if not isinstance(s, dict): continue

                for k in s.keys(): chaves_todas_source[k] += 1

                # orgão topo
                oj = s.get('orgaoJulgador', {}) or {}
                if isinstance(oj, dict):
                    nome = oj.get('nome', '')
                    cod = oj.get('codigo')
                    if cod is not None:
                        codigos_orgao_topo[str(cod)] += 1
                        orgao_codigo_nome[str(cod)][nome[:60]] += 1
                    scan_str(nome, 'oj_topo_nome')

                # movimentos
                for m in s.get('movimentos', []) or []:
                    if not isinstance(m, dict): continue
                    for k in m.keys(): chaves_todas_movimento[k] += 1
                    mo = m.get('orgaoJulgador', {}) or {}
                    if isinstance(mo, dict):
                        mcod = mo.get('codigo')
                        mnome = mo.get('nome', '')
                        if mcod is not None:
                            codigos_orgao_movimento[str(mcod)] += 1
                            orgao_codigo_nome[str(mcod)][mnome[:60]] += 1
                        scan_str(mnome, 'mov_oj_nome')
                    scan_str(m.get('nome', ''), 'mov_nome')
                    for c in m.get('complementosTabelados', []) or []:
                        if isinstance(c, dict):
                            scan_str(c.get('nome', ''), 'compl_nome')
                            scan_str(c.get('descricao', ''), 'compl_desc')

                # classe e assuntos
                cl = s.get('classe', {}) or {}
                if isinstance(cl, dict):
                    scan_str(cl.get('nome', ''), 'classe_nome')
                for a in s.get('assuntos', []) or []:
                    if isinstance(a, dict):
                        scan_str(a.get('nome', ''), 'assunto_nome')
    except Exception as e:
        print(f"[erro] {p.name}: {e}", flush=True)

    if (i+1) % 400 == 0 or (i+1) == len(parts):
        el = time.time() - t0
        print(f"[{el:.0f}s] {i+1}/{len(parts)} ({100*(i+1)/len(parts):.1f}%) docs={docs_total:,}", flush=True)

print(f"\n[fim] {docs_total:,} docs em {time.time()-t0:.0f}s")

# === Saídas ===
print(f"\n=== Chaves top-level observadas ===")
for k, n in chaves_todas_source.most_common():
    print(f"  {k}: {n:,}")

print(f"\n=== Chaves observadas em movimentos ===")
for k, n in chaves_todas_movimento.most_common():
    print(f"  {k}: {n:,}")

print(f"\n=== Códigos de orgaoJulgador (topo) — top 40 ===")
for cod, n in codigos_orgao_topo.most_common(40):
    nomes = orgao_codigo_nome[cod].most_common(2)
    amostra = ' / '.join(f'{x}({c})' for x,c in nomes)
    print(f"  {cod}: {n:,} → {amostra}")
print(f"  TOTAL CÓDIGOS DISTINTOS NO TOPO: {len(codigos_orgao_topo)}")

print(f"\n=== Códigos de orgaoJulgador (movimentos) — top 40 ===")
for cod, n in codigos_orgao_movimento.most_common(40):
    nomes = orgao_codigo_nome[cod].most_common(2)
    amostra = ' / '.join(f'{x}({c})' for x,c in nomes)
    print(f"  {cod}: {n:,} → {amostra}")
print(f"  TOTAL CÓDIGOS DISTINTOS EM MOVIMENTOS: {len(codigos_orgao_movimento)}")

print(f"\n=== Matches de abreviação (T1-T6, 1T-6T, etc) ===")
if not matches_por_campo:
    print("  (nenhum match)")
for ident, cnt in matches_por_campo.items():
    print(f"\n  >> {ident} — {sum(cnt.values())} ocorrências:")
    for s, n in cnt.most_common(10):
        print(f"     {s}: {n}")

# CSV consolidado
import csv
fp = OUT / "2026-04-19_stj_caca_turma_v2_codigos.csv"
with fp.open('w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['codigo_orgao', 'ocorrencias_topo', 'ocorrencias_movimento', 'nomes_associados'])
    todos_codigos = set(codigos_orgao_topo) | set(codigos_orgao_movimento)
    for cod in sorted(todos_codigos, key=lambda c: -(codigos_orgao_topo.get(c,0)+codigos_orgao_movimento.get(c,0))):
        nomes = ' | '.join(f'{x}({c})' for x,c in orgao_codigo_nome[cod].most_common(3))
        w.writerow([cod, codigos_orgao_topo.get(cod,0), codigos_orgao_movimento.get(cod,0), nomes])
print(f"\n[csv] {fp}")
