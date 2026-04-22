"""stj-caca-turma-raw.py

Varre as 3.380 parts do raw STJ procurando TODA ocorrência da substring
"urma" (case-insensitive) em qualquer campo. Relata onde aparece.

Objetivo: refutar ou confirmar a afirmação "Datajud STJ não grava Turmas".
"""
import gzip, json, re
from collections import Counter
from pathlib import Path

RAW = Path("G:/datajud_raw/nivel_1_anteparos/STJ")
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados")

parts = sorted(RAW.glob("part-*.ndjson.gz"))
print(f"[caça] varrendo {len(parts)} parts procurando 'urma'", flush=True)

# Contadores por lugar
lugares = {
    'orgaoJulgador_topo': Counter(),
    'movimento_orgaoJulgador': Counter(),
    'movimento_nome': Counter(),
    'complementoTabelado_nome': Counter(),
    'complementoTabelado_descricao': Counter(),
    'classe_nome': Counter(),
    'assunto_nome': Counter(),
    'outro_top_level': Counter(),
}

docs_com_urma = 0
docs_total = 0
t0 = __import__('time').time()

for i, p in enumerate(parts):
    try:
        with gzip.open(p, 'rt', encoding='utf-8') as fh:
            for line in fh:
                docs_total += 1
                if 'urma' not in line.lower():
                    continue
                docs_com_urma += 1
                try: d = json.loads(line)
                except: continue
                s = d.get('_source', d)
                # orgaoJulgador topo
                oj = s.get('orgaoJulgador', {}) or {}
                n = (oj.get('nome','') or '')
                if 'urma' in n.lower():
                    lugares['orgaoJulgador_topo'][n] += 1
                # movimentos
                for m in s.get('movimentos', []) or []:
                    if not isinstance(m, dict): continue
                    mo = m.get('orgaoJulgador', {}) or {}
                    mon = (mo.get('nome','') or '') if isinstance(mo, dict) else ''
                    if 'urma' in mon.lower():
                        lugares['movimento_orgaoJulgador'][mon] += 1
                    mn = m.get('nome','')
                    if 'urma' in mn.lower():
                        lugares['movimento_nome'][mn] += 1
                    for c in m.get('complementosTabelados', []) or []:
                        if isinstance(c, dict):
                            cn = c.get('nome','')
                            cd = c.get('descricao','')
                            if 'urma' in cn.lower():
                                lugares['complementoTabelado_nome'][cn] += 1
                            if 'urma' in cd.lower():
                                lugares['complementoTabelado_descricao'][cd] += 1
                # classe
                cl = s.get('classe', {}) or {}
                cln = cl.get('nome','')
                if 'urma' in cln.lower():
                    lugares['classe_nome'][cln] += 1
                # assuntos
                for a in s.get('assuntos', []) or []:
                    if isinstance(a, dict):
                        an = a.get('nome','')
                        if 'urma' in an.lower():
                            lugares['assunto_nome'][an] += 1
    except Exception as e:
        print(f"[erro] {p.name}: {e}", flush=True)
        continue
    if (i+1) % 400 == 0 or (i+1) == len(parts):
        el = __import__('time').time() - t0
        print(f"[{el:.0f}s] part {i+1}/{len(parts)} — docs={docs_total:,} com_urma={docs_com_urma:,}", flush=True)

print(f"\n[fim] {docs_total:,} docs, {docs_com_urma:,} com 'urma' em algum lugar")
for lugar, cnt in lugares.items():
    print(f"\n=== {lugar} — {sum(cnt.values()):,} ocorrências, {len(cnt)} valores distintos ===")
    for v, n in cnt.most_common(20):
        print(f"  {v[:100]}: {n:,}")

# Salvar CSV
import csv
fp = OUT / "2026-04-19_stj_caca_turma.csv"
with fp.open('w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['lugar_no_json', 'valor', 'ocorrencias'])
    for lugar, cnt in lugares.items():
        for v, n in cnt.most_common():
            w.writerow([lugar, v, n])
print(f"\n[csv] {fp}")
