"""Amostragem do raw STJ para mapear stj_string + topologia de trilhas por classe.

Lê 20 partes intercaladas (início, meio, fim) do corpus STJ ndjson.gz,
gera catálogo de classes, padrões de orgaoJulgador, formato dataAjuizamento,
e infere topologia ancestral por classe processual.
"""
import gzip, json, re, os, sys
from collections import Counter, defaultdict
from pathlib import Path

RAW = Path("G:/datajud_raw/nivel_1_anteparos/STJ")
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados/2026-04-19_raw_stj_schema_trilhas.md")

parts = sorted([p for p in RAW.glob("part-*.ndjson.gz")])
print(f"Total parts disponiveis: {len(parts)}")

# Amostrar 20 partes intercaladas
n = len(parts)
idxs = [int(i * n / 20) for i in range(20)]
amostra = [parts[i] for i in idxs]
print(f"Amostrando: {[p.name for p in amostra[:5]]} ... {amostra[-1].name}")

classes_counter = Counter()
classes_codigos = {}  # nome -> codigo
orgao_padroes = Counter()
orgao_nao_gabinete = []  # exemplos que nao seguem "GABINETE"
assuntos_top = Counter()
data_ajuizamento_formatos = Counter()
data_ajuizamento_anos = Counter()
numero_processo_len = Counter()
numero_processo_tr = Counter()  # digitos 14-16
movimentos_nomes = Counter()
movimentos_decisorios_candidatos = Counter()

DECISION_PAT = re.compile(r'provi|conhec|prejudic|desist|extin|homolog|procedent|denega|acolh|deferi|indeferi|julg', re.I)

docs_lidos = 0
for p in amostra:
    with gzip.open(p, 'rt', encoding='utf-8') as f:
        for line in f:
            try:
                doc = json.loads(line)
                src = doc.get('_source', doc)
            except Exception:
                continue
            docs_lidos += 1
            # classe
            cl = src.get('classe', {})
            cnome = cl.get('nome', '')
            ccod = cl.get('codigo')
            if cnome:
                classes_counter[cnome] += 1
                classes_codigos[cnome] = ccod
            # orgaoJulgador
            oj = src.get('orgaoJulgador', {}) or {}
            ojn = (oj.get('nome') or '').strip()
            if ojn.upper().startswith('GABINETE'):
                orgao_padroes['GABINETE_*'] += 1
            else:
                orgao_padroes[ojn[:40] or '(vazio)'] += 1
                if len(orgao_nao_gabinete) < 40 and ojn:
                    orgao_nao_gabinete.append(ojn)
            # assuntos (tolerante a variacoes)
            ass = src.get('assuntos') or []
            if ass:
                a0 = ass[0]
                if isinstance(a0, dict):
                    acod = a0.get('codigo')
                    anome = a0.get('nome', '')
                    assuntos_top[(acod, anome)] += 1
                elif isinstance(a0, list) and a0:
                    # forma aninhada: assuntos = [[{...}]]
                    inner = a0[0] if isinstance(a0[0], dict) else None
                    if inner:
                        assuntos_top[(inner.get('codigo'), inner.get('nome',''))] += 1
                    else:
                        assuntos_top[('(list_of_list)', str(a0)[:40])] += 1
                elif isinstance(a0, (int, str)):
                    assuntos_top[('(scalar)', str(a0)[:40])] += 1
                else:
                    assuntos_top[('(outro)', type(a0).__name__)] += 1
            # dataAjuizamento
            da = src.get('dataAjuizamento') or ''
            if da:
                if re.match(r'^\d{14}$', da):
                    data_ajuizamento_formatos['AAAAMMDDhhmmss(14d)'] += 1
                    data_ajuizamento_anos[da[:4]] += 1
                elif re.match(r'^\d{8}$', da):
                    data_ajuizamento_formatos['AAAAMMDD(8d)'] += 1
                    data_ajuizamento_anos[da[:4]] += 1
                else:
                    data_ajuizamento_formatos[f'outro({da[:20]})'] += 1
            # numeroProcesso
            np_ = src.get('numeroProcesso') or ''
            numero_processo_len[len(np_)] += 1
            if len(np_) == 20 and np_.isdigit():
                tr = np_[13:16]  # posicoes 14-16 (indices 13..15)
                numero_processo_tr[tr] += 1
            # movimentos
            for m in (src.get('movimentos') or []):
                mnome = (m.get('nome') or '').strip()
                movimentos_nomes[mnome] += 1
                if mnome and DECISION_PAT.search(mnome):
                    movimentos_decisorios_candidatos[mnome] += 1
            if docs_lidos % 50000 == 0:
                print(f"  ... {docs_lidos:,} docs lidos")

print(f"\nTotal docs amostrados: {docs_lidos:,}")
print(f"Partes amostradas: {len(amostra)} de {n} ({docs_lidos/n*len(amostra):.0f}/parte)")

# ===== Escrever relatorio =====
def pct(n, tot):
    return f"{100*n/tot:.2f}%" if tot else "0%"

lines = []
lines.append(f"# Raw Datajud STJ — schema + topologia de trilhas")
lines.append(f"\n**Data**: 19/abr/2026")
lines.append(f"**Amostra**: {docs_lidos:,} docs de {len(amostra)} partes (de {n} totais)")
lines.append(f"**Corpus total**: 3.379.100 docs (3.390.010 esperados)")
lines.append(f"**Fonte**: `G:/datajud_raw/nivel_1_anteparos/STJ/part-*.ndjson.gz`")

lines.append("\n---\n\n## 1. Classes processuais observadas (top 30)\n")
lines.append("| # | codigo | nome | ocorrencias | % | processo_curto_proposto | posicao_na_trilha |")
lines.append("|---|---|---|---:|---:|---|---|")

# Mapa proposto: classe -> curto + posicao
def inferir_curto_e_posicao(nome):
    n = nome.lower()
    if 'agravo interno' in n and 'especial' in n:
        return 'AgInt em AREsp' if 'em agravo' in n or 'em arec' in n.lower() else 'AgInt em REsp', 'no interno a string REsp'
    if 'agravo regimental' in n and 'especial' in n:
        return 'AgRg em REsp', 'no interno a string REsp (rito antigo)'
    if 'embargos de declara' in n and 'especial' in n:
        return 'EDcl em REsp', 'refra��o do no na string REsp'
    if 'agravo em recurso especial' in n:
        return 'AREsp', 'brota de inadmiss�o do REsp na origem'
    if 'recurso especial' in n:
        return 'REsp', 'filho direto de ac�rd�o TJ/TRF (N2 -> N1)'
    if 'habeas corpus' in n:
        return 'HC', 'string auton�ma (nao brota de recurso)'
    if 'mandado de seguran' in n:
        return 'MS', 'string auton�ma'
    if 'recurso ordin' in n:
        return 'RO', 'filho direto para mat�ria constitucional estadual'
    if 'reclama' in n:
        return 'Rcl', 'string corretiva'
    if 'conflito' in n and 'compet' in n:
        return 'CC', 'string administrativa entre juizos'
    if 'ac�o rescis' in n or 'acao rescis' in n:
        return 'AR', 'string rescis�ria sobre transito'
    if 'suspens' in n and 'lim' in n:
        return 'SLS', 'string cautelar'
    if 'peti' in n:
        return 'Pet', 'variada'
    if 'reviso' in n.lower() and 'crim' in n.lower():
        return 'RvCr', 'string de revisao criminal'
    return '(a definir)', '(a classificar)'

tot_classes = sum(classes_counter.values())
for i, (nome, cnt) in enumerate(classes_counter.most_common(30), 1):
    curto, pos = inferir_curto_e_posicao(nome)
    cod = classes_codigos.get(nome, '')
    lines.append(f"| {i} | {cod} | {nome} | {cnt:,} | {pct(cnt, tot_classes)} | {curto} | {pos} |")

lines.append(f"\n**Total de classes distintas na amostra**: {len(classes_counter)}")

lines.append("\n---\n\n## 2. Padr�o do orgaoJulgador (topo)\n")
lines.append("| padrao | ocorrencias | % |")
lines.append("|---|---:|---:|")
tot_oj = sum(orgao_padroes.values())
for p, cnt in orgao_padroes.most_common(15):
    lines.append(f"| {p} | {cnt:,} | {pct(cnt, tot_oj)} |")
lines.append(f"\n**Exemplos que NAO seguem 'GABINETE'**:")
for ex in orgao_nao_gabinete[:10]:
    lines.append(f"- `{ex}`")

lines.append("\n---\n\n## 3. dataAjuizamento � formato\n")
lines.append("| formato | ocorrencias |")
lines.append("|---|---:|")
for f, cnt in data_ajuizamento_formatos.most_common():
    lines.append(f"| {f} | {cnt:,} |")
lines.append("\n**Distribuicao por ano (top 15)**:\n")
lines.append("| ano | ocorrencias |")
lines.append("|---|---:|")
for ano, cnt in sorted(data_ajuizamento_anos.items())[-15:]:
    lines.append(f"| {ano} | {cnt:,} |")

lines.append("\n---\n\n## 4. numeroProcesso � forma\n")
lines.append("| comprimento | ocorrencias |")
lines.append("|---|---:|")
for L, cnt in sorted(numero_processo_len.items()):
    lines.append(f"| {L} | {cnt:,} |")
lines.append("\n**Top TR (digitos 14-16) � tribunal de origem embutido**:\n")
lines.append("| TR | ocorrencias | % (do total 20d) |")
lines.append("|---|---:|---:|")
tot_20 = sum(numero_processo_tr.values())
for tr, cnt in numero_processo_tr.most_common(25):
    lines.append(f"| {tr} | {cnt:,} | {pct(cnt, tot_20)} |")

lines.append("\n---\n\n## 5. Assuntos mais comuns (top 20)\n")
lines.append("| codigo_tpu | nome | ocorrencias |")
lines.append("|---|---|---:|")
for (cod, nome), cnt in assuntos_top.most_common(20):
    lines.append(f"| {cod} | {nome} | {cnt:,} |")

lines.append("\n---\n\n## 6. Movimentos � decisorios candidatos (top 25)\n")
lines.append("Detectados por regex sobre o nome do movimento (provi|conhec|prejudic|desist|extin|homolog|procedent|denega|acolh|deferi|julg).")
lines.append("")
lines.append("| movimento_nome | ocorrencias |")
lines.append("|---|---:|")
for nome, cnt in movimentos_decisorios_candidatos.most_common(25):
    lines.append(f"| {nome[:80]} | {cnt:,} |")

lines.append(f"\n**Total movimentos na amostra**: {sum(movimentos_nomes.values()):,}")
lines.append(f"**Movimentos decis�rios (sinais)**: {sum(movimentos_decisorios_candidatos.values()):,} ({pct(sum(movimentos_decisorios_candidatos.values()), sum(movimentos_nomes.values()))})")

lines.append("\n---\n\n## 7. Topologia inferida das trilhas\n")
lines.append("Cada classe processual revela sua posi��o na �rvore ancestral, sem precisar do portal STJ:\n")
lines.append("```")
lines.append("ACORDAO N2 (TJ/TRF)")
lines.append("  |")
lines.append("  +-- REsp (filho direto: N2 -> N1)")
lines.append("  |     |")
lines.append("  |     +-- AgInt em REsp (no interno)")
lines.append("  |     +-- EDcl em REsp (refra��o)")
lines.append("  |")
lines.append("  +-- [REsp inadmitido na origem]")
lines.append("        |")
lines.append("        +-- AREsp (brota da inadmiss�o)")
lines.append("              |")
lines.append("              +-- AgInt em AREsp")
lines.append("              +-- EDcl em AREsp")
lines.append("")
lines.append("Independentes (n�o recursais):")
lines.append("  HC, MS, Rcl, CC, AR, SLS, Pet, RvCr")
lines.append("```")

lines.append("\n**Consequ�ncia operacional**: j� posso povoar `stj_string.processo_curto` e `stj_trilha_ancestral` parcial (s� pelo tipo da classe) usando s� o raw � o portal fecha a lacuna do N� CNJ ancestral exato.\n")

OUT.write_text('\n'.join(lines), encoding='utf-8')
print(f"\nRelatorio: {OUT}")
print(f"Tamanho: {OUT.stat().st_size/1024:.1f} KB")
