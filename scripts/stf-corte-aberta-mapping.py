#!/usr/bin/env python3
"""
stf-corte-aberta-mapping.py
Gera mapeamento numerico do STF a partir do CSV local stf_master.csv,
em paralelo ao mapeamento Datajud. Nao toca o Supabase, nao faz requests.

Output: G:/datajud_raw/_mapeamento_numerico/stf/
"""
import csv
from collections import Counter
from pathlib import Path
import json

csv.field_size_limit(10*1024*1024)

SRC = Path(r"C:\Users\medin\Desktop\backup_judx\relatorios\2026-04-16_backup_completo\stf_master.csv")
OUT = Path(r"G:\datajud_raw\_mapeamento_numerico\stf")
OUT.mkdir(parents=True, exist_ok=True)

total = 0
por_classe = Counter()
por_relator = Counter()
por_orgao_julgador = Counter()
por_tipo_decisao = Counter()
por_origem_decisao = Counter()
por_ramo_direito = Counter()
por_uf_origem = Counter()
por_ano = Counter()
por_meio_processo = Counter()

# Para assuntos: viram lista em 'assuntos' separadas por algo
por_assunto = Counter()

print(f"Lendo {SRC.name}...")
with open(SRC, encoding='utf-8', errors='replace') as fh:
    r = csv.DictReader(fh)
    for row in r:
        total += 1
        if total % 500000 == 0:
            print(f"  {total:,} linhas", flush=True)

        c = row.get('classe','').strip()
        if c: por_classe[c] += 1
        rel = row.get('relator','').strip()
        if rel: por_relator[rel] += 1
        org = row.get('orgao_julgador','').strip()
        if org: por_orgao_julgador[org] += 1
        td = row.get('tipo_decisao','').strip()
        if td: por_tipo_decisao[td] += 1
        od = row.get('origem_decisao','').strip()
        if od: por_origem_decisao[od] += 1
        rd = row.get('ramo_direito','').strip()
        if rd: por_ramo_direito[rd] += 1
        uf = row.get('uf_origem','').strip()
        if uf: por_uf_origem[uf] += 1
        ano = row.get('ano_decisao','').strip()
        if ano: por_ano[ano] += 1
        mp = row.get('meio_processo','').strip()
        if mp: por_meio_processo[mp] += 1

        # assuntos podem vir separados por | ou ,
        assuntos = row.get('assuntos','')
        if assuntos:
            for a in assuntos.replace('|',',').split(','):
                a = a.strip()
                if a: por_assunto[a] += 1

print(f"\nTotal: {total:,} decisoes\n")

# --- CSVs ---
def write_counter(name, counter, col):
    path = OUT / f"stf_{name}.csv"
    with open(path, 'w', encoding='utf-8', newline='') as fh:
        w = csv.writer(fh)
        w.writerow([col, 'doc_count'])
        for k, v in counter.most_common(500):
            w.writerow([k, v])
    print(f"  {path.name}: {len(counter):,} valores unicos")

write_counter('classes', por_classe, 'classe')
write_counter('relatores', por_relator, 'relator')
write_counter('orgaos_julgadores', por_orgao_julgador, 'orgao_julgador')
write_counter('tipos_decisao', por_tipo_decisao, 'tipo_decisao')
write_counter('origens_decisao', por_origem_decisao, 'origem_decisao')
write_counter('ramos_direito', por_ramo_direito, 'ramo_direito')
write_counter('uf_origem', por_uf_origem, 'uf_origem')
write_counter('ano_decisao', por_ano, 'ano')
write_counter('meio_processo', por_meio_processo, 'meio_processo')
write_counter('assuntos', por_assunto, 'assunto')

# --- Resumo JSON (equivalente ao Datajud aggregates) ---
resumo = {
    'fonte': 'Corte Aberta STF — stf_master.csv (backup 16/abr/2026)',
    'ramo': 'superior',
    'sigla': 'STF',
    'total_decisoes': total,
    'nivel': 0,
    'eh_anteparo_de': ['STJ','TST','TSE','STM'],
    'top20_classes': dict(por_classe.most_common(20)),
    'top20_orgaos_julgadores': dict(por_orgao_julgador.most_common(20)),
    'top20_relatores': dict(por_relator.most_common(20)),
    'top20_assuntos': dict(por_assunto.most_common(20)),
    'top20_ramos_direito': dict(por_ramo_direito.most_common(20)),
    'por_tipo_decisao': dict(por_tipo_decisao.most_common()),
    'por_origem_decisao': dict(por_origem_decisao.most_common()),
    'por_meio_processo': dict(por_meio_processo.most_common()),
    'por_uf_origem': dict(por_uf_origem.most_common()),
    'por_ano': dict(sorted(por_ano.items())),
}
with open(OUT / 'stf_resumo.json', 'w', encoding='utf-8') as fh:
    json.dump(resumo, fh, ensure_ascii=False, indent=2)
print(f"  stf_resumo.json")

# --- MD ---
md = []
md.append('# STF — Mapeamento Numérico (Corte Aberta)\n')
md.append(f'Fonte: `{SRC.name}` (backup 16/abr/2026)\n')
md.append(f'Total: **{total:,}** decisões\n')
md.append('## Distribuição por origem_decisao\n')
md.append('| Origem | Contagem |')
md.append('|---|---:|')
for k,v in por_origem_decisao.most_common(): md.append(f'| {k} | {v:,} |')
md.append('\n## Top 20 órgãos julgadores\n')
md.append('| Órgão | Contagem |')
md.append('|---|---:|')
for k,v in por_orgao_julgador.most_common(20): md.append(f'| {k} | {v:,} |')
md.append('\n## Top 20 classes\n')
md.append('| Classe | Contagem |')
md.append('|---|---:|')
for k,v in por_classe.most_common(20): md.append(f'| {k} | {v:,} |')
md.append('\n## Top 20 relatores\n')
md.append('| Relator | Contagem |')
md.append('|---|---:|')
for k,v in por_relator.most_common(20): md.append(f'| {k} | {v:,} |')
md.append('\n## Distribuição por ano (decisão)\n')
md.append('| Ano | Contagem |')
md.append('|---|---:|')
for k,v in sorted(por_ano.items()): md.append(f'| {k} | {v:,} |')
md.append('\n## Tipo de decisão\n')
md.append('| Tipo | Contagem |')
md.append('|---|---:|')
for k,v in por_tipo_decisao.most_common(): md.append(f'| {k} | {v:,} |')
(OUT / 'stf_mapeamento.md').write_text('\n'.join(md), encoding='utf-8')
print(f"  stf_mapeamento.md")
print(f"\nOK — {OUT}")
