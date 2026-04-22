"""dashboard-disco-g-rapido.py
Versão instantânea: lê apenas manifest.json de cada tribunal para pegar total_fetched.
Não conta linhas. Gera HTML em <5s.
"""
import os, json, html, time, csv
from pathlib import Path
import shutil

G = Path("G:/")
RAW = G / "datajud_raw"
STAGING = G / "staging_local"
BACKUP = G / "supabase_backup"
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados")
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

# Descobrir tribunais + ler manifest
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
                checkpoint = {}
                if (path_obj / "checkpoint.json").exists():
                    try: checkpoint = json.loads((path_obj / "checkpoint.json").read_text(encoding='utf-8'))
                    except: pass
                n_parts = sum(1 for f in files if f.startswith('part-') and f.endswith('.ndjson.gz'))
                tamanho = sum(os.path.getsize(os.path.join(root, f)) for f in files if os.path.isfile(os.path.join(root, f)))
                n_proc = (manifest.get('total_fetched') or checkpoint.get('total_fetched')
                          or manifest.get('total_coletado') or checkpoint.get('total_coletado') or 0)
                esperado = manifest.get('total_esperado') or checkpoint.get('total_esperado') or 0
                tribs.append({
                    'sigla': sigla, 'nivel': nivel, 'subpath': subpath,
                    'caminho': str(rel).replace('\\','/'),
                    'n_parts': n_parts, 'bytes': tamanho,
                    'n_processos': n_proc, 'esperado': esperado,
                    'ramo': rel.parent.name if rel.parent.name != subpath else '',
                })
    return tribs

tribs = descobrir()
print(f"{len(tribs)} tribunais lidos via manifest.json", flush=True)

# STF local
stf = {'n_processos': 0, 'bytes': 0, 'n_arquivos': 0, 'detalhe': []}
if STF_CSVS.exists():
    for csv_path in sorted(STF_CSVS.glob("*.csv")):
        try:
            with open(csv_path, 'r', encoding='utf-8', errors='ignore') as f:
                n = sum(1 for _ in f) - 1
            sz = csv_path.stat().st_size
            stf['n_processos'] += max(0, n)
            stf['bytes'] += sz
            stf['n_arquivos'] += 1
            stf['detalhe'].append({'nome': csv_path.name, 'linhas': n, 'bytes': sz})
        except: pass

# Staging + Backup
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

# Totais
total_datajud = sum(t['n_processos'] for t in tribs)
total_universo = total_datajud + stf['n_processos']
raw_bytes, raw_arqs = sum_dir(RAW)

# Ordenar canônico
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

def esc(s): return html.escape(str(s))

def row(t):
    pct = ''
    if isinstance(t['esperado'], (int, float)) and t['esperado'] > 0 and t['n_processos']:
        pct = f"{100*t['n_processos']/t['esperado']:.1f}%"
    return (f"<tr>"
            f"<td>{esc(t['nivel'])}</td>"
            f"<td><strong>{esc(t['sigla'])}</strong></td>"
            f"<td>{esc(t['ramo'])}</td>"
            f"<td class='n'><strong>{t['n_processos']:,}</strong></td>"
            f"<td class='n'>{t['esperado']:,}" + ('</td>' if t['esperado'] else '—</td>')
            + f"<td class='n'>{pct or '—'}</td>"
            f"<td class='n'>{t['n_parts']:,}</td>"
            f"<td class='n'>{size_fmt(t['bytes'])}</td>"
            f"<td><code>{esc(t['caminho'])}</code></td>"
            f"</tr>")

html_doc = f"""<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="60">
<title>JudX · Disco G: · Universo com processos</title>
<style>
  :root{{--bg:#0d1117;--card:#161b22;--text:#e6edf3;--muted:#8b949e;--brand:#58a6ff;--ok:#3fb950;--line:#30363d}}
  *{{box-sizing:border-box}}
  body{{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:24px;line-height:1.5}}
  h1{{margin:0;font-size:24px;color:var(--brand)}}
  .sub{{color:var(--muted);font-size:13px;margin-top:4px}}
  h2{{margin:28px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line);font-size:17px}}
  .grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:14px}}
  .kpi{{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;text-align:center}}
  .kpi-val{{font-size:22px;font-weight:600;color:var(--brand)}}
  .kpi-lbl{{color:var(--muted);font-size:11px;margin-top:4px;text-transform:uppercase;letter-spacing:.4px}}
  .card{{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;margin-bottom:10px}}
  table{{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}}
  th,td{{text-align:left;padding:5px 8px;border-bottom:1px solid var(--line)}}
  th{{color:var(--muted);font-weight:500;font-size:11px;text-transform:uppercase;background:#0f141a;position:sticky;top:0}}
  td.n{{text-align:right;font-variant-numeric:tabular-nums}}
  tr:hover td{{background:#1c2128}}
  code{{background:#1c2128;padding:1px 5px;border-radius:3px;font-size:11px;color:var(--text)}}
  .stf{{background:rgba(63,185,80,.08)}}
</style>
</head>
<body>

<h1>Disco G: — Universo JudX (com número de processos)</h1>
<div class="sub">STF (Corte Aberta) no topo + 89 tribunais Datajud · atualiza a cada 60s</div>

<h2>Universo completo</h2>
<div class="grid">
  <div class="kpi"><div class="kpi-val">{total_universo:,}</div><div class="kpi-lbl">Total processos</div></div>
  <div class="kpi"><div class="kpi-val">{stf['n_processos']:,}</div><div class="kpi-lbl">STF Corte Aberta</div></div>
  <div class="kpi"><div class="kpi-val">{total_datajud:,}</div><div class="kpi-lbl">Datajud total</div></div>
  <div class="kpi"><div class="kpi-val">{len(tribs)}</div><div class="kpi-lbl">Pastas Datajud</div></div>
  <div class="kpi"><div class="kpi-val">{size_fmt(raw_bytes)}</div><div class="kpi-lbl">Raw em disco</div></div>
</div>

<h2>STF (fonte Corte Aberta — <code>Downloads/stf_decisoes_fatias/</code>)</h2>
<div class="card stf">
  <strong>{stf['n_processos']:,} decisões</strong> em <strong>{stf['n_arquivos']}</strong> CSVs anuais (2000–2026) · {size_fmt(stf['bytes'])}
  <p style="color:var(--muted);font-size:12px">O STF não integra o Datajud — fonte paralela via transparencia.stf.jus.br (14 apps Qlik). Backup 16/abr/2026.</p>
</div>

<h2>Datajud CNJ — {total_datajud:,} processos em {len(tribs)} pastas</h2>
<div class="card" style="max-height:700px;overflow-y:auto">
<table>
<thead><tr>
<th>Nível</th><th>Sigla</th><th>Ramo</th>
<th class="n">Processos</th><th class="n">Esperado</th><th class="n">%</th>
<th class="n">Parts</th><th class="n">Tamanho</th><th>Caminho</th>
</tr></thead>
<tbody>
{''.join(row(t) for t in tribs)}
</tbody>
</table>
</div>

<h2>Espaço em disco G:</h2>
<div class="grid">
  <div class="kpi"><div class="kpi-val">{size_fmt(du.total)}</div><div class="kpi-lbl">Total</div></div>
  <div class="kpi"><div class="kpi-val">{size_fmt(du.used)}</div><div class="kpi-lbl">Usado ({100*du.used/du.total:.1f}%)</div></div>
  <div class="kpi"><div class="kpi-val">{size_fmt(du.free)}</div><div class="kpi-lbl">Livre</div></div>
</div>

<h2>Staging + Backup</h2>
<div class="grid">
  <div class="kpi"><div class="kpi-val">{size_fmt(staging_total_b)}</div><div class="kpi-lbl">Staging DuckDB</div></div>
  <div class="kpi"><div class="kpi-val">{size_fmt(backup_total_b)}</div><div class="kpi-lbl">Backup Supabase</div></div>
</div>

</body>
</html>
"""

out_path = OUT / "2026-04-19_DASHBOARD_DISCO_G.html"
out_path.write_text(html_doc, encoding='utf-8')
print(f"[ok] {out_path} ({out_path.stat().st_size/1024:.1f} KB)")
print(f"Total universo: {total_universo:,} processos")
print(f"  STF: {stf['n_processos']:,}")
print(f"  Datajud: {total_datajud:,}")
