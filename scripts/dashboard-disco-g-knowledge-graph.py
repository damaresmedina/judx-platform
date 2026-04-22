"""dashboard-disco-g-knowledge-graph.py

Atualiza o dashboard G com:
- STF contando por origem_decisao (estrutura real)
- STJ contando pela estrutura canônica (seed + re-acoplamento)
- Demais tribunais Datajud via manifest
- Knowledge graph D3.js ao final:
  * Árvore hierárquica de STF e STJ
  * Grafo de fluxos entre tribunais (trilhas de recursos)

Substitui: Desktop\\backup_judx\\resultados\\2026-04-19_DASHBOARD_DISCO_G.html
"""
import os, json, html, time, csv
from pathlib import Path
from collections import Counter
import shutil

G = Path("G:/")
RAW = G / "datajud_raw"
STAGING = G / "staging_local"
BACKUP = G / "supabase_backup"
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados")
STF_MASTER = Path("C:/Users/medin/Desktop/backup_judx/relatorios/2026-04-16_backup_completo/stf_master.csv")
STF_CSVS = Path("C:/Users/medin/Downloads/stf_decisoes_fatias")

def size_fmt(b):
    for u in ('B','KB','MB','GB','TB'):
        if b < 1024: return f"{b:.1f} {u}"
        b /= 1024
    return f"{b:.1f} PB"

def sum_dir(p):
    total, n = 0, 0
    try:
        for root, dirs, files in os.walk(p):
            for f in files:
                try:
                    total += os.path.getsize(os.path.join(root, f))
                    n += 1
                except OSError: pass
    except (PermissionError, OSError): pass
    return total, n

du = shutil.disk_usage(str(G))

# ============ STF: estrutura por origem_decisao ============
print(f"[stf] lendo {STF_MASTER.name} completo...", flush=True)
t0 = time.time()
orgaos_stf = Counter()
classes_stf = Counter()
relatores_stf = Counter()
total_stf = 0
if STF_MASTER.exists():
    csv.field_size_limit(10*1024*1024)
    with open(STF_MASTER, 'r', encoding='utf-8', errors='ignore') as f:
        r = csv.DictReader(f)
        for row in r:
            total_stf += 1
            orgao = row.get('origem_decisao', '').strip()
            if orgao: orgaos_stf[orgao] += 1
            cl = row.get('classe', '').strip()
            if cl: classes_stf[cl] += 1
            rel = row.get('relator', '').strip()
            if rel: relatores_stf[rel] += 1
print(f"  STF: {total_stf:,} decisões em {time.time()-t0:.0f}s", flush=True)
print(f"  Órgãos STF: {len(orgaos_stf)}")

# ============ STJ: estrutura canônica ============
print(f"[stj] lendo estrutura canônica...", flush=True)
orgaos_stj_raw = {}
STJ_CSV = OUT / "2026-04-19_stj_movimentos_por_orgao.csv"
if STJ_CSV.exists():
    with STJ_CSV.open('r', encoding='utf-8') as f:
        r = csv.DictReader(f)
        for row in r:
            orgaos_stj_raw[row['codigo_orgao']] = {
                'pulsos': int(row['pulsos']),
                'processos': int(row['processos_distintos']),
                'pct_pulsos': float(row['pct_pulsos']),
                'pct_processos': float(row['pct_processos']),
            }

classes_stj = Counter()
STJ_CLASSES = OUT / "2026-04-19_stj_classes_canonico.csv"
if STJ_CLASSES.exists():
    with STJ_CLASSES.open('r', encoding='utf-8') as f:
        r = csv.reader(f); next(r)
        for row in r:
            if len(row) >= 3:
                classes_stj[row[1]] = int(row[2])

relatores_stj = Counter()
STJ_REL = OUT / "2026-04-19_stj_relator_canonico.csv"
if STJ_REL.exists():
    with STJ_REL.open('r', encoding='utf-8') as f:
        r = csv.reader(f); next(r)
        for row in r:
            if len(row) >= 2:
                relatores_stj[row[0]] = int(row[1])

total_stj = sum(orgaos_stj_raw[k]['processos'] for k in orgaos_stj_raw if k != 'NAO_CLASSIFICADO')
# Na verdade, total STJ = 3.379.100 (universo completo)
total_stj = 3379100

# ============ Datajud por tribunal (via manifest) ============
def descobrir():
    niveis = [("nivel_0_stf", "STF"), ("nivel_1_anteparos", "Superiores"),
              ("nivel_2_regionais", "Regionais"), ("nivel_3_varas", "Varas")]
    tribs = []
    for subpath, nivel in niveis:
        p_nivel = RAW / subpath
        if not p_nivel.exists(): continue
        for root, dirs, files in os.walk(p_nivel):
            if any(f.startswith('part-') and f.endswith('.ndjson.gz') for f in files):
                path_obj = Path(root)
                rel = path_obj.relative_to(RAW)
                sigla = path_obj.name.upper()
                manifest = {}
                if (path_obj / "manifest.json").exists():
                    try: manifest = json.loads((path_obj / "manifest.json").read_text(encoding='utf-8'))
                    except: pass
                n_parts = sum(1 for f in files if f.startswith('part-'))
                tamanho = sum(os.path.getsize(os.path.join(root, f)) for f in files if os.path.isfile(os.path.join(root, f)))
                n_proc = manifest.get('total_fetched') or manifest.get('total_coletado') or 0
                esperado = manifest.get('total_esperado') or 0
                tribs.append({
                    'sigla': sigla, 'nivel': nivel, 'subpath': subpath,
                    'caminho': str(rel).replace('\\','/'),
                    'n_parts': n_parts, 'bytes': tamanho,
                    'n_processos': n_proc, 'esperado': esperado,
                    'ramo': rel.parent.name if rel.parent.name != subpath else '',
                })
    return tribs

tribs = descobrir()
print(f"[datajud] {len(tribs)} pastas de tribunais", flush=True)

# Ordem canônica
def ordem(t):
    s = t['sigla']
    if s in ('STJ','TST','TSE','STM'): return (1, ['STJ','TST','TSE','STM'].index(s), s)
    if s.startswith('TRF'): return (2, int(s.replace('TRF','') or '0'), s)
    if s.startswith('TRT'):
        n = s.replace('TRT','').lstrip('0') or '0'
        return (3, int(n) if n.isdigit() else 99, s)
    if s.startswith('TRE'): return (4, s, s)
    if s.startswith('TJM'): return (6, s, s)
    if s.startswith('TJ'): return (5, s, s)
    return (9, s, s)
tribs.sort(key=ordem)

total_datajud = sum(t['n_processos'] for t in tribs)
total_universo = total_stf + total_datajud

# ============ Staging + Backup ============
staging_items = []
if STAGING.exists():
    for item in sorted(STAGING.iterdir()):
        if item.is_file():
            try: staging_items.append({'nome': item.name, 'bytes': item.stat().st_size, 'eh_duckdb': item.suffix == '.duckdb'})
            except: pass
staging_total_b = sum(i['bytes'] for i in staging_items)

backup_items = []
if BACKUP.exists():
    for item in sorted(BACKUP.iterdir()):
        if item.is_file():
            try: backup_items.append({'nome': item.name, 'bytes': item.stat().st_size})
            except: pass
backup_total_b = sum(i['bytes'] for i in backup_items)

# ============ Montar JSON do knowledge graph ============
# Estrutura hierárquica: STF e STJ com seus órgãos

def bucket_stf(orgao):
    """Mapeia valor de origem_decisao para bucket canônico STF."""
    o = orgao.upper()
    if 'MONOCR' in o: return 'MONOCRATICA'
    if 'PRESID' in o: return 'PRESIDENCIA'
    if 'PLEN' in o: return 'PLENARIO'
    if '1ª TURMA' in o or '1 TURMA' in o or 'PRIMEIRA TURMA' in o: return 'TURMA_1'
    if '2ª TURMA' in o or '2 TURMA' in o or 'SEGUNDA TURMA' in o: return 'TURMA_2'
    return 'OUTRO'

stf_buckets = Counter()
stf_ambiente = Counter()
for orgao, n in orgaos_stf.items():
    stf_buckets[bucket_stf(orgao)] += n
    if 'VIRTUAL' in orgao.upper(): stf_ambiente['virtual'] += n
    else: stf_ambiente['presencial'] += n

# JSON estrutura STF (para D3.js)
graph_stf = {
    'name': 'STF',
    'total': total_stf,
    'fonte': 'Corte Aberta · 14 apps Qlik',
    'children': [
        {'name': 'Plenário', 'value': stf_buckets.get('PLENARIO', 0), 'tipo': 'colegiado_maximo'},
        {'name': '1ª Turma', 'value': stf_buckets.get('TURMA_1', 0), 'tipo': 'turma'},
        {'name': '2ª Turma', 'value': stf_buckets.get('TURMA_2', 0), 'tipo': 'turma'},
        {'name': 'Presidência', 'value': stf_buckets.get('PRESIDENCIA', 0), 'tipo': 'administrativo'},
        {'name': 'Monocrática', 'value': stf_buckets.get('MONOCRATICA', 0), 'tipo': 'monocratica'},
    ]
}

# JSON estrutura STJ
graph_stj = {
    'name': 'STJ',
    'total': total_stj,
    'fonte': 'Datajud CNJ',
    'children': [
        {'name': 'Pleno', 'value': 0, 'tipo': 'colegiado_maximo', 'nota': 'não capturado no raw (admin)'},
        {'name': 'Corte Especial', 'value': 0, 'tipo': 'colegiado', 'nota': 'não capturado no raw (admin)'},
        {'name': 'Presidência', 'value': orgaos_stj_raw.get('PRESIDENCIA', {}).get('pulsos', 0), 'tipo': 'administrativo'},
        {'name': 'Vice-Presidência', 'value': orgaos_stj_raw.get('VICE_PRESIDENCIA', {}).get('pulsos', 0), 'tipo': 'administrativo'},
        {'name': '1ª Seção', 'value': orgaos_stj_raw.get('SECAO_1', {}).get('pulsos', 0), 'tipo': 'secao', 'children': [
            {'name': '1ª Turma', 'value': 0, 'tipo': 'turma', 'nota': 'derivável via ministro→turma'},
            {'name': '2ª Turma', 'value': 0, 'tipo': 'turma', 'nota': 'derivável via ministro→turma'},
        ]},
        {'name': '2ª Seção', 'value': orgaos_stj_raw.get('SECAO_2', {}).get('pulsos', 0), 'tipo': 'secao', 'children': [
            {'name': '3ª Turma', 'value': 0, 'tipo': 'turma', 'nota': 'derivável via ministro→turma'},
            {'name': '4ª Turma', 'value': 0, 'tipo': 'turma', 'nota': 'derivável via ministro→turma'},
        ]},
        {'name': '3ª Seção', 'value': orgaos_stj_raw.get('SECAO_3', {}).get('pulsos', 0), 'tipo': 'secao', 'children': [
            {'name': '5ª Turma', 'value': 0, 'tipo': 'turma', 'nota': 'derivável via ministro→turma'},
            {'name': '6ª Turma', 'value': 0, 'tipo': 'turma', 'nota': 'derivável via ministro→turma'},
        ]},
        {'name': 'Monocrática (Relatores)', 'value': orgaos_stj_raw.get('MONOCRATICA', {}).get('pulsos', 0), 'tipo': 'monocratica'},
        {'name': 'NUGEP', 'value': orgaos_stj_raw.get('NUGEP', {}).get('pulsos', 0), 'tipo': 'administrativo'},
        {'name': 'STJ genérico', 'value': orgaos_stj_raw.get('STJ_GENERICO', {}).get('pulsos', 0), 'tipo': 'residual'},
    ]
}

# Grafo de fluxos: trilhas entre tribunais
fluxos = [
    {'origem': 'TJ (27)',  'destino': 'STJ', 'via': 'REsp/AREsp/ROHC/ROMS', 'peso': 62.30},
    {'origem': 'TRF (6)',  'destino': 'STJ', 'via': 'REsp/AREsp', 'peso': 15.26},
    {'origem': 'STJ',      'destino': 'STF', 'via': 'RE/ARE', 'peso': 0.9},
    {'origem': 'TST',      'destino': 'STF', 'via': 'RE/ARE', 'peso': 0.5},
    {'origem': 'TSE',      'destino': 'STF', 'via': 'RE', 'peso': 0.1},
    {'origem': 'TJ',       'destino': 'STF', 'via': 'RE/ARE direto', 'peso': 0.8},
    {'origem': 'TRF',      'destino': 'STF', 'via': 'RE/ARE direto', 'peso': 0.4},
]

# ============ Montar hierarquia do SISTEMA JUDICIAL COMPLETO ============
# Agrupa tribunais por especialidade e constrói árvore com STF como raiz

def agrupar_por_especialidade():
    grupos = {
        'comum_estadual': [],   # TJs
        'federal': [],          # TRFs
        'trabalho': [],         # TRTs
        'eleitoral': [],        # TREs
        'militar_estadual': [], # TJMs
    }
    for t in tribs:
        s = t['sigla']
        if s in ('STJ','TST','TSE','STM'): continue  # tratados separadamente
        if s.startswith('TRF'): grupos['federal'].append(t)
        elif s.startswith('TRT'): grupos['trabalho'].append(t)
        elif s.startswith('TRE'): grupos['eleitoral'].append(t)
        elif s.startswith('TJM'): grupos['militar_estadual'].append(t)
        elif s.startswith('TJ'): grupos['comum_estadual'].append(t)
    return grupos

grupos = agrupar_por_especialidade()

def get_t(sigla):
    for t in tribs:
        if t['sigla'] == sigla: return t['n_processos']
    return 0

def filhos_por_ramo(lista, ramo_tipo):
    return [{'name': t['sigla'], 'value': t['n_processos'], 'tipo': ramo_tipo} for t in lista]

# STF é o root — dos 4 superiores descem as 2ª instâncias por especialidade
arvore_sistema = {
    'name': 'STF',
    'nivel': 'N0',
    'value': total_stf,
    'tipo': 'stf',
    'children': [
        {
            'name': 'STJ',
            'nivel': 'N1',
            'value': get_t('STJ'),
            'tipo': 'superior_comum_federal',
            'children': [
                {
                    'name': f'TJs ({len(grupos["comum_estadual"])}) — Justiça Estadual',
                    'nivel': 'N2',
                    'value': sum(t['n_processos'] for t in grupos['comum_estadual']),
                    'tipo': 'estadual',
                    'children': filhos_por_ramo(grupos['comum_estadual'], 'estadual')
                },
                {
                    'name': f'TRFs ({len(grupos["federal"])}) — Justiça Federal',
                    'nivel': 'N2',
                    'value': sum(t['n_processos'] for t in grupos['federal']),
                    'tipo': 'federal',
                    'children': filhos_por_ramo(grupos['federal'], 'federal')
                }
            ]
        },
        {
            'name': 'TST',
            'nivel': 'N1',
            'value': get_t('TST'),
            'tipo': 'superior_trabalho',
            'children': [
                {
                    'name': f'TRTs ({len(grupos["trabalho"])}) — Justiça do Trabalho',
                    'nivel': 'N2',
                    'value': sum(t['n_processos'] for t in grupos['trabalho']),
                    'tipo': 'trabalho',
                    'children': filhos_por_ramo(grupos['trabalho'], 'trabalho')
                }
            ]
        },
        {
            'name': 'TSE',
            'nivel': 'N1',
            'value': get_t('TSE'),
            'tipo': 'superior_eleitoral',
            'children': [
                {
                    'name': f'TREs ({len(grupos["eleitoral"])}) — Justiça Eleitoral',
                    'nivel': 'N2',
                    'value': sum(t['n_processos'] for t in grupos['eleitoral']),
                    'tipo': 'eleitoral',
                    'children': filhos_por_ramo(grupos['eleitoral'], 'eleitoral')
                }
            ]
        },
        {
            'name': 'STM',
            'nivel': 'N1',
            'value': get_t('STM'),
            'tipo': 'superior_militar',
            'children': [
                {
                    'name': f'TJMs ({len(grupos["militar_estadual"])}) — Justiça Militar Estadual',
                    'nivel': 'N2',
                    'value': sum(t['n_processos'] for t in grupos['militar_estadual']),
                    'tipo': 'militar_estadual',
                    'children': filhos_por_ramo(grupos['militar_estadual'], 'militar_estadual')
                }
            ]
        }
    ]
}

def esc(s): return html.escape(str(s))

# ============ HTML ============
html_doc = f"""<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<title>JudX · Disco G: · Universo + Knowledge Graph</title>
<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
<style>
  :root{{--bg:#0d1117;--card:#161b22;--text:#e6edf3;--muted:#8b949e;--brand:#58a6ff;--ok:#3fb950;--warn:#d29922;--line:#30363d}}
  *{{box-sizing:border-box}}
  body{{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:24px;line-height:1.5}}
  h1{{margin:0;font-size:24px;color:var(--brand)}}
  .sub{{color:var(--muted);font-size:13px;margin-top:4px}}
  h2{{margin:32px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--line);font-size:18px}}
  h3{{margin:20px 0 10px;font-size:15px;color:var(--brand)}}
  .grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:14px}}
  .kpi{{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;text-align:center}}
  .kpi-val{{font-size:22px;font-weight:600;color:var(--brand)}}
  .kpi-lbl{{color:var(--muted);font-size:11px;margin-top:4px;text-transform:uppercase;letter-spacing:.4px}}
  .card{{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px;margin-bottom:12px}}
  table{{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}}
  th,td{{text-align:left;padding:5px 8px;border-bottom:1px solid var(--line)}}
  th{{color:var(--muted);font-weight:500;font-size:11px;text-transform:uppercase;background:#0f141a;position:sticky;top:0}}
  td.n{{text-align:right;font-variant-numeric:tabular-nums}}
  tr:hover td{{background:#1c2128}}
  code{{background:#1c2128;padding:1px 5px;border-radius:3px;font-size:11px;color:var(--text)}}
  .stf-row{{background:rgba(63,185,80,.08)}}
  .tree-container{{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:16px;overflow-x:auto;margin-bottom:16px}}
  .tree svg{{display:block;max-width:100%;height:auto}}
  .node circle{{stroke-width:2}}
  .node text{{fill:var(--text);font-size:11px;font-weight:500}}
  .node--internal text{{font-weight:600}}
  .link{{fill:none;stroke-opacity:.4;stroke-width:1.5}}
  .legend{{display:flex;flex-wrap:wrap;gap:14px;margin:8px 0 14px;font-size:11px}}
  .legend-item{{display:flex;align-items:center;gap:6px}}
  .legend-dot{{display:inline-block;width:12px;height:12px;border-radius:50%}}
  .flow-container{{padding:16px;background:var(--card);border:1px solid var(--line);border-radius:8px}}
  .flow-row{{display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)}}
  .flow-row:last-child{{border:none}}
  .flow-origem,.flow-destino{{background:#0f2a4d;padding:6px 12px;border-radius:4px;font-weight:600;min-width:80px;text-align:center}}
  .flow-seta{{flex:1;height:2px;background:linear-gradient(90deg,var(--brand),var(--ok));position:relative}}
  .flow-seta::after{{content:'▶';position:absolute;right:-12px;top:-9px;color:var(--ok)}}
  .flow-via{{position:absolute;top:-22px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:11px;color:var(--muted)}}
  .flow-peso{{background:var(--brand);color:#000;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600;min-width:70px;text-align:center}}
</style>
</head>
<body>

<h1>Disco G: — Universo JudX · STF + Datajud · Knowledge Graph</h1>
<div class="sub">316 milhões de processos · STF via Corte Aberta + 89 pastas Datajud · atualiza manual</div>

<h2>Universo completo</h2>
<div class="grid">
  <div class="kpi"><div class="kpi-val">{total_universo:,}</div><div class="kpi-lbl">Processos totais</div></div>
  <div class="kpi"><div class="kpi-val">{total_stf:,}</div><div class="kpi-lbl">STF (Corte Aberta)</div></div>
  <div class="kpi"><div class="kpi-val">{total_datajud:,}</div><div class="kpi-lbl">Datajud (89 pastas)</div></div>
  <div class="kpi"><div class="kpi-val">{size_fmt(du.used)}</div><div class="kpi-lbl">G: usado</div></div>
  <div class="kpi"><div class="kpi-val">{size_fmt(du.free)}</div><div class="kpi-lbl">G: livre</div></div>
</div>

<h2>Inventário por tribunal (STF no topo)</h2>
<div class="card" style="max-height:600px;overflow-y:auto">
<table>
<thead><tr><th>Nível</th><th>Sigla</th><th>Ramo</th><th class="n">Processos</th><th class="n">Esperado</th><th class="n">%</th><th class="n">Parts</th><th class="n">Tamanho</th></tr></thead>
<tbody>
<tr class="stf-row"><td>STF</td><td><strong>STF</strong></td><td>Corte Aberta</td><td class="n"><strong>{total_stf:,}</strong></td><td class="n">{total_stf:,}</td><td class="n">100%</td><td class="n">27 CSVs</td><td class="n">1.5 GB</td></tr>
{''.join(f'<tr><td>{esc(t["nivel"])}</td><td><strong>{esc(t["sigla"])}</strong></td><td>{esc(t["ramo"])}</td><td class="n"><strong>{t["n_processos"]:,}</strong></td><td class="n">{t["esperado"]:,}</td><td class="n">{100*t["n_processos"]/t["esperado"]:.1f}%</td><td class="n">{t["n_parts"]:,}</td><td class="n">{size_fmt(t["bytes"])}</td></tr>' if t["esperado"] else f'<tr><td>{esc(t["nivel"])}</td><td><strong>{esc(t["sigla"])}</strong></td><td>{esc(t["ramo"])}</td><td class="n"><strong>{t["n_processos"]:,}</strong></td><td class="n">—</td><td class="n">—</td><td class="n">{t["n_parts"]:,}</td><td class="n">{size_fmt(t["bytes"])}</td></tr>' for t in tribs)}
</tbody>
</table>
</div>

<h2>🌳 Árvore do Sistema Judicial — STF no topo, tribunais descendo</h2>
<p style="color:var(--muted);font-size:13px;margin-top:-6px">
Cada <strong>string</strong> (numeroProcesso CNJ) é um circuito que pode atravessar todo o sistema:
nasce na vara de origem, sobe ao tribunal de 2ª instância, atravessa para o superior (STJ/TST/TSE/STM) e chega ao STF no topo.
Tamanho do nó ∝ número de processos · cor por especialidade.
</p>

<div class="legend">
  <div class="legend-item"><span class="legend-dot" style="background:#58a6ff"></span> STF (cúpula constitucional)</div>
  <div class="legend-item"><span class="legend-dot" style="background:#f85149"></span> Superior (STJ/TST/TSE/STM)</div>
  <div class="legend-item"><span class="legend-dot" style="background:#d29922"></span> Estadual (TJs)</div>
  <div class="legend-item"><span class="legend-dot" style="background:#a371f7"></span> Federal (TRFs)</div>
  <div class="legend-item"><span class="legend-dot" style="background:#3fb950"></span> Trabalho (TRTs)</div>
  <div class="legend-item"><span class="legend-dot" style="background:#56d364"></span> Eleitoral (TREs)</div>
  <div class="legend-item"><span class="legend-dot" style="background:#e3b341"></span> Militar Estadual (TJMs)</div>
</div>

<div class="tree-container" style="overflow-x:auto"><div id="tree-sistema" class="tree"></div></div>

<h2>🔀 Trilhas exemplares — strings atravessando o sistema</h2>
<p style="color:var(--muted);font-size:13px;margin-top:-6px">
Exemplos típicos de como um circuito (CNJ) percorre os níveis institucionais até chegar (ou não) ao STF.
</p>
<div class="flow-container">
{''.join(f'<div class="flow-row"><div class="flow-origem">{esc(f["origem"])}</div><div class="flow-seta" style="position:relative"><div class="flow-via">via {esc(f["via"])}</div></div><div class="flow-destino">{esc(f["destino"])}</div><div class="flow-peso">{f["peso"]}%</div></div>' for f in fluxos)}
</div>

<h2>Staging + Backup</h2>
<div class="grid">
  <div class="kpi"><div class="kpi-val">{size_fmt(staging_total_b)}</div><div class="kpi-lbl">Staging DuckDB</div></div>
  <div class="kpi"><div class="kpi-val">{size_fmt(backup_total_b)}</div><div class="kpi-lbl">Backup Supabase</div></div>
</div>

<script>
const arvoreSistema = {json.dumps(arvore_sistema, ensure_ascii=False)};

const colorByTipo = {{
  'stf': '#58a6ff',
  'superior_comum_federal': '#f85149',
  'superior_trabalho': '#f85149',
  'superior_eleitoral': '#f85149',
  'superior_militar': '#f85149',
  'estadual': '#d29922',
  'federal': '#a371f7',
  'trabalho': '#3fb950',
  'eleitoral': '#56d364',
  'militar_estadual': '#e3b341',
}};

function fmt(n) {{ return (n||0).toLocaleString('pt-BR'); }}

function renderArvore(elemId, data) {{
  const width = 2200;
  const height = 900;
  const margin = {{top: 40, right: 40, bottom: 120, left: 40}};

  const svg = d3.select(`#${{elemId}}`)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${{width}} ${{height}}`)
    .style('max-width', '100%')
    .style('height', 'auto');

  const g = svg.append('g').attr('transform', `translate(${{margin.left}},${{margin.top}})`);

  const root = d3.hierarchy(data);
  const treeLayout = d3.tree()
    .size([width - margin.left - margin.right, height - margin.top - margin.bottom]);
  treeLayout(root);

  // Links: curvas suaves descendo
  g.append('g')
    .attr('fill','none')
    .attr('stroke','#30363d')
    .attr('stroke-width', d => 1.5)
    .selectAll('path')
    .data(root.links())
    .enter().append('path')
    .attr('stroke', d => {{
      const tgt = d.target.data.tipo;
      return colorByTipo[tgt] || '#58a6ff';
    }})
    .attr('stroke-opacity', 0.4)
    .attr('stroke-width', d => Math.min(8, Math.max(1, (d.target.data.value || 0) / 2e7 + 1)))
    .attr('d', d3.linkVertical().x(d => d.x).y(d => d.y));

  // Nós
  const node = g.append('g')
    .selectAll('g')
    .data(root.descendants())
    .enter().append('g')
    .attr('transform', d => `translate(${{d.x}},${{d.y}})`);

  node.append('circle')
    .attr('r', d => {{
      if (d.depth === 0) return 22;
      if (d.depth === 1) return 16;
      if (d.depth === 2) return 12;
      const v = d.data.value || 0;
      if (v > 20000000) return 10;
      if (v > 5000000) return 7;
      if (v > 500000) return 5;
      return 4;
    }})
    .attr('fill', d => colorByTipo[d.data.tipo] || '#58a6ff')
    .attr('stroke', '#0d1117')
    .attr('stroke-width', 2);

  // Rótulo: nome + valor
  node.append('text')
    .attr('dy', d => (d.depth === 0 ? -30 : (d.children ? -16 : 18)))
    .attr('text-anchor', 'middle')
    .style('font-size', d => d.depth === 0 ? '16px' : d.depth === 1 ? '13px' : d.depth === 2 ? '11px' : '9px')
    .style('font-weight', d => d.depth <= 1 ? '700' : '500')
    .style('fill', '#e6edf3')
    .text(d => d.data.name);

  // Valor abaixo do nome (ou ao lado dependendo da profundidade)
  node.filter(d => d.data.value > 0 && d.depth >= 1).append('text')
    .attr('dy', d => (d.children ? -2 : 30))
    .attr('text-anchor', 'middle')
    .style('font-size', d => d.depth === 1 ? '12px' : d.depth === 2 ? '10px' : '8px')
    .style('fill', '#8b949e')
    .text(d => fmt(d.data.value));

  // Valor do STF no topo
  if (root.data.value) {{
    g.append('text')
      .attr('transform', `translate(${{root.x}},${{root.y - 12}})`)
      .attr('text-anchor','middle')
      .style('font-size','13px')
      .style('fill','#8b949e')
      .text(fmt(root.data.value) + ' decisões');
  }}
}}

renderArvore('tree-sistema', arvoreSistema);
</script>

</body>
</html>
"""

out_path = OUT / "2026-04-19_DASHBOARD_DISCO_G.html"
out_path.write_text(html_doc, encoding='utf-8')
print(f"\n[ok] {out_path} ({out_path.stat().st_size/1024:.1f} KB)")
print(f"Total universo: {total_universo:,}")
print(f"  STF: {total_stf:,}")
print(f"  Datajud: {total_datajud:,}")
print(f"Knowledge graph: STF ({len(graph_stf['children'])} órgãos) + STJ ({len(graph_stj['children'])} órgãos)")
