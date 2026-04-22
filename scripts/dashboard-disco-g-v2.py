"""dashboard-disco-g-v2.py

Atualiza o dashboard HTML panorâmico do disco G: incluindo:
- Número de processos (linhas contadas nos ndjson.gz) por tribunal
- Contagem em paralelo (ThreadPoolExecutor) para cobrir os ~90 tribunais
- STF local (Downloads/stf_decisoes_fatias/) incluído no inventário

Saída: Desktop\\backup_judx\\resultados\\2026-04-19_DASHBOARD_DISCO_G.html (substitui v1)
"""
import os, json, html, time, gzip, csv
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict

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

def count_lines_gz(path):
    """Conta linhas de um arquivo .ndjson.gz. Cada linha = 1 processo."""
    try:
        n = 0
        with gzip.open(path, 'rt', encoding='utf-8', errors='ignore') as f:
            for _ in f: n += 1
        return n
    except Exception:
        return 0

def count_processos_tribunal(path):
    """Soma linhas de todos os .ndjson.gz do tribunal."""
    parts = list(Path(path).glob("part-*.ndjson.gz"))
    if not parts: return 0
    total = 0
    for p in parts:
        total += count_lines_gz(p)
    return total

# =========== Identificar pastas de tribunais ===========
print(f"[disco] capacidade G:", flush=True)
import shutil
du = shutil.disk_usage(str(G))

print(f"[raw] inventariando {RAW}", flush=True)
t0 = time.time()
raw_total_bytes, raw_total_files = sum_dir(RAW)
print(f"  total: {size_fmt(raw_total_bytes)} em {raw_total_files:,} arquivos ({time.time()-t0:.0f}s)", flush=True)

# Descobrir tribunais (pastas que têm part-*.ndjson.gz)
def descobrir_tribunais():
    tribunais = []
    niveis = [
        ("nivel_0_stf", "STF"),
        ("nivel_1_anteparos", "Superiores"),
        ("nivel_2_regionais", "Regionais"),
        ("nivel_3_varas", "Varas"),
    ]
    for subpath, nivel_label in niveis:
        p_nivel = RAW / subpath
        if not p_nivel.exists(): continue
        # descer até achar pastas com part-*.ndjson.gz
        for root, dirs, files in os.walk(p_nivel):
            if any(f.startswith('part-') and f.endswith('.ndjson.gz') for f in files):
                path_obj = Path(root)
                rel = path_obj.relative_to(RAW)
                sigla = path_obj.name.upper()
                ramo = rel.parent.name if rel.parent != Path('.') and rel.parent.name != subpath else ''
                if rel.parent.name == subpath: ramo = ''
                tribunais.append({
                    'sigla': sigla,
                    'path': path_obj,
                    'nivel_label': nivel_label,
                    'subpath': subpath,
                    'ramo': ramo,
                    'caminho_relativo': str(rel).replace('\\', '/'),
                })
    return tribunais

tribs = descobrir_tribunais()
print(f"[tribunais] {len(tribs)} identificados", flush=True)

# =========== Contar processos em paralelo ===========
print(f"[contagem] iniciando em paralelo (8 threads)...", flush=True)
t0 = time.time()

def processar(t):
    """Retorna tribunal enriquecido com contagem e metadados."""
    p = t['path']
    parts = list(p.glob("part-*.ndjson.gz"))
    total_bytes, total_files = sum_dir(p)
    manifest = {}
    checkpoint = {}
    if (p / "manifest.json").exists():
        try: manifest = json.loads((p / "manifest.json").read_text(encoding='utf-8'))
        except: pass
    if (p / "checkpoint.json").exists():
        try: checkpoint = json.loads((p / "checkpoint.json").read_text(encoding='utf-8'))
        except: pass
    # contagem real
    n_processos = count_processos_tribunal(p)
    t.update({
        'n_parts': len(parts),
        'bytes': total_bytes,
        'arquivos': total_files,
        'manifest': manifest,
        'checkpoint': checkpoint,
        'n_processos': n_processos,
        'esperado': manifest.get('total_esperado') or checkpoint.get('total_esperado') or '',
    })
    return t

resultados = []
with ThreadPoolExecutor(max_workers=8) as ex:
    futures = {ex.submit(processar, t): t for t in tribs}
    for i, fut in enumerate(as_completed(futures)):
        t = fut.result()
        resultados.append(t)
        if (i+1) % 10 == 0 or (i+1) == len(tribs):
            el = time.time() - t0
            print(f"  [{el:.0f}s] {i+1}/{len(tribs)} processados", flush=True)

total_processos_datajud = sum(t['n_processos'] for t in resultados)
print(f"[contagem] {total_processos_datajud:,} processos Datajud contados em {time.time()-t0:.0f}s", flush=True)

# =========== STF local (Corte Aberta CSVs) ===========
stf_info = {
    'fonte': 'Corte Aberta STF (transparencia.stf.jus.br)',
    'caminho': str(STF_CSVS) if STF_CSVS.exists() else '(stf_master.csv)',
    'n_processos': 0,
    'bytes': 0,
    'n_arquivos': 0,
    'detalhe_csvs': [],
}
if STF_CSVS.exists():
    t0 = time.time()
    total_stf = 0
    for csv_path in sorted(STF_CSVS.glob("*.csv")):
        try:
            # contar linhas (menos 1 de header)
            with open(csv_path, 'r', encoding='utf-8', errors='ignore') as f:
                n = sum(1 for _ in f) - 1
            sz = csv_path.stat().st_size
            total_stf += max(0, n)
            stf_info['detalhe_csvs'].append({'nome': csv_path.name, 'linhas': n, 'bytes': sz})
            stf_info['bytes'] += sz
            stf_info['n_arquivos'] += 1
        except Exception as e:
            print(f'  [stf] erro em {csv_path.name}: {e}')
    stf_info['n_processos'] = total_stf
    print(f"[stf] {total_stf:,} decisões em {stf_info['n_arquivos']} CSVs ({time.time()-t0:.0f}s)", flush=True)

# =========== Staging + Backup ===========
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

outras_raiz = []
for item in sorted(G.iterdir()):
    if item.name in ('datajud_raw','staging_local','supabase_backup'): continue
    if item.name.startswith('$'): continue
    try:
        if item.is_dir():
            b, f = sum_dir(item)
            if b > 0: outras_raiz.append({'nome': item.name, 'bytes': b, 'arquivos': f, 'tipo': 'dir'})
        else:
            outras_raiz.append({'nome': item.name, 'bytes': item.stat().st_size, 'arquivos': 1, 'tipo': 'file'})
    except (OSError, PermissionError): pass

# =========== Ordenação canônica + HTML ===========
def ordem(t):
    sigla = t['sigla']
    if sigla in ('STJ','TST','TSE','STM'): return (1, ['STJ','TST','TSE','STM'].index(sigla), sigla)
    if sigla.startswith('TRF'): return (2, int(sigla.replace('TRF','') or '0'), sigla)
    if sigla.startswith('TRT'):
        n = sigla.replace('TRT','').lstrip('0') or '0'
        return (3, int(n) if n.isdigit() else 99, sigla)
    if sigla.startswith('TRE'): return (4, sigla, sigla)
    if sigla.startswith('TJM'): return (6, sigla, sigla)
    if sigla.startswith('TJ'): return (5, sigla, sigla)
    return (9, sigla, sigla)
resultados.sort(key=ordem)

def esc(s): return html.escape(str(s))

total_geral_processos = total_processos_datajud + stf_info['n_processos']

def row_t(t):
    esperado = t.get('esperado', '')
    n = t['n_processos']
    pct = ''
    if isinstance(esperado, (int, float)) and esperado > 0:
        pct = f"{100*n/esperado:.1f}%"
    esperado_txt = f"{esperado:,}" if isinstance(esperado, (int, float)) else '—'
    return (
        f"<tr>"
        f"<td>{esc(t['nivel_label'])}</td>"
        f"<td><strong>{esc(t['sigla'])}</strong></td>"
        f"<td>{esc(t.get('ramo',''))}</td>"
        f"<td class='n'><strong>{n:,}</strong></td>"
        f"<td class='n'>{esperado_txt}</td>"
        f"<td class='n'>{pct or '—'}</td>"
        f"<td class='n'>{t['n_parts']:,}</td>"
        f"<td class='n'>{size_fmt(t['bytes'])}</td>"
        f"<td><code>{esc(t['caminho_relativo'])}</code></td>"
        f"</tr>"
    )

html_doc = f"""<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="120">
<title>JudX · Disco G: · Panorama com processos</title>
<style>
  :root{{--bg:#0d1117;--card:#161b22;--text:#e6edf3;--muted:#8b949e;--brand:#58a6ff;--ok:#3fb950;--warn:#d29922;--line:#30363d}}
  *{{box-sizing:border-box}}
  body{{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:24px;line-height:1.5}}
  h1{{margin:0;font-size:24px;color:var(--brand)}}
  .sub{{color:var(--muted);font-size:13px;margin-top:4px}}
  h2{{margin:32px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--line);font-size:18px}}
  .grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:16px}}
  .kpi{{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px;text-align:center}}
  .kpi-val{{font-size:22px;font-weight:600;color:var(--brand)}}
  .kpi-lbl{{color:var(--muted);font-size:11px;margin-top:4px;text-transform:uppercase;letter-spacing:.4px}}
  .card{{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px;margin-bottom:12px}}
  table{{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}}
  th,td{{text-align:left;padding:5px 8px;border-bottom:1px solid var(--line);vertical-align:top}}
  th{{color:var(--muted);font-weight:500;font-size:11px;text-transform:uppercase;background:#0f141a;position:sticky;top:0}}
  td.n{{text-align:right;font-variant-numeric:tabular-nums}}
  tr:hover td{{background:#1c2128}}
  code{{background:#1c2128;padding:1px 5px;border-radius:3px;font-size:11px;color:var(--text)}}
  .bar-container{{width:100%;height:8px;background:#1c2128;border-radius:4px;overflow:hidden;margin-top:4px}}
  .bar-fill{{height:100%;background:linear-gradient(90deg,var(--brand),var(--ok));border-radius:4px}}
  .highlight-stf{{background:rgba(63,185,80,.08)}}
</style>
</head>
<body>

<h1>Disco G: — Panorama do Universo JudX</h1>
<div class="sub">STF (Corte Aberta) + Datajud CNJ · atualiza a cada 2 min · agora mostra número de processos por tribunal</div>

<h2>Universo completo</h2>
<div class="grid">
  <div class="kpi"><div class="kpi-val">{total_geral_processos:,}</div><div class="kpi-lbl">Processos totais</div></div>
  <div class="kpi"><div class="kpi-val">{stf_info['n_processos']:,}</div><div class="kpi-lbl">STF (Corte Aberta)</div></div>
  <div class="kpi"><div class="kpi-val">{total_processos_datajud:,}</div><div class="kpi-lbl">Datajud (89 tribunais)</div></div>
  <div class="kpi"><div class="kpi-val">{len(resultados)}</div><div class="kpi-lbl">Tribunais Datajud</div></div>
</div>

<h2>Espaço em disco</h2>
<div class="grid">
  <div class="kpi"><div class="kpi-val">{size_fmt(du.total)}</div><div class="kpi-lbl">Capacidade total</div></div>
  <div class="kpi"><div class="kpi-val">{size_fmt(du.used)}</div><div class="kpi-lbl">Usado ({100*du.used/du.total:.1f}%)</div></div>
  <div class="kpi"><div class="kpi-val">{size_fmt(du.free)}</div><div class="kpi-lbl">Livre</div></div>
  <div class="kpi"><div class="kpi-val">{size_fmt(raw_total_bytes)}</div><div class="kpi-lbl">Raw Datajud (G:\\datajud_raw)</div></div>
</div>
<div class="bar-container"><div class="bar-fill" style="width:{100*du.used/du.total:.1f}%"></div></div>

<h2>STF — Corte Aberta (fonte paralela ao Datajud)</h2>
<div class="card highlight-stf">
  <p><strong>{stf_info['n_processos']:,} decisões</strong> em <strong>{stf_info['n_arquivos']}</strong> CSVs anuais (2000–2026) · <code>{esc(stf_info['caminho'])}</code></p>
  <p style="color:var(--muted);font-size:12px">Fonte: {esc(stf_info['fonte'])}. O STF não integra o Datajud — baixamos diretamente do Corte Aberta (14 apps Qlik).</p>
  <details style="margin-top:8px"><summary style="cursor:pointer;color:var(--brand)">Ver os {stf_info['n_arquivos']} CSVs ano a ano</summary>
  <table style="margin-top:8px">
  <thead><tr><th>Arquivo</th><th class="n">Decisões</th><th class="n">Tamanho</th></tr></thead>
  <tbody>
  {''.join(f"<tr><td><code>{esc(c['nome'])}</code></td><td class='n'>{c['linhas']:,}</td><td class='n'>{size_fmt(c['bytes'])}</td></tr>" for c in stf_info['detalhe_csvs'])}
  </tbody>
  </table>
  </details>
</div>

<h2>Datajud CNJ — {total_processos_datajud:,} processos em {len(resultados)} tribunais</h2>
<div class="card" style="max-height:720px;overflow-y:auto">
<table>
<thead><tr>
<th>Nível</th><th>Sigla</th><th>Ramo</th>
<th class="n">Processos (contagem real)</th><th class="n">Esperado</th><th class="n">%</th>
<th class="n">Parts</th><th class="n">Tamanho</th><th>Caminho</th>
</tr></thead>
<tbody>
{''.join(row_t(t) for t in resultados)}
</tbody>
</table>
</div>

<h2>Staging DuckDB (<code>G:\\staging_local</code>)</h2>
<div class="grid">
  <div class="kpi"><div class="kpi-val">{size_fmt(staging_total_b)}</div><div class="kpi-lbl">Tamanho</div></div>
  <div class="kpi"><div class="kpi-val">{len(staging_items)}</div><div class="kpi-lbl">Arquivos</div></div>
  <div class="kpi"><div class="kpi-val">{len([i for i in staging_items if i.get('eh_duckdb')])}</div><div class="kpi-lbl">Bancos DuckDB</div></div>
</div>
<div class="card">
<table>
<thead><tr><th>Arquivo</th><th class="n">Tamanho</th><th>Tipo</th></tr></thead>
<tbody>
{''.join(f"<tr><td><code>{esc(i['nome'])}</code></td><td class='n'>{size_fmt(i['bytes'])}</td><td>{'DuckDB' if i.get('eh_duckdb') else 'Outro'}</td></tr>" for i in staging_items)}
</tbody>
</table>
</div>

<h2>Backup Supabase (<code>G:\\supabase_backup</code>)</h2>
<div class="grid">
  <div class="kpi"><div class="kpi-val">{size_fmt(backup_total_b)}</div><div class="kpi-lbl">Tamanho</div></div>
  <div class="kpi"><div class="kpi-val">{len(backup_items)}</div><div class="kpi-lbl">Arquivos</div></div>
</div>
<div class="card">
<table>
<thead><tr><th>Arquivo</th><th class="n">Tamanho</th></tr></thead>
<tbody>
{''.join(f"<tr><td><code>{esc(i['nome'])}</code></td><td class='n'>{size_fmt(i['bytes'])}</td></tr>" for i in backup_items)}
</tbody>
</table>
</div>

<h2>Outras pastas em G:</h2>
<div class="card">
<table>
<thead><tr><th>Nome</th><th>Tipo</th><th class="n">Tamanho</th><th class="n">Arquivos</th></tr></thead>
<tbody>
{''.join(f"<tr><td><code>{esc(o['nome'])}</code></td><td>{esc(o['tipo'])}</td><td class='n'>{size_fmt(o['bytes'])}</td><td class='n'>{o['arquivos']:,}</td></tr>" for o in outras_raiz)}
</tbody>
</table>
</div>

</body>
</html>
"""

out_path = OUT / "2026-04-19_DASHBOARD_DISCO_G.html"
out_path.write_text(html_doc, encoding='utf-8')
print(f"\n[dashboard] {out_path}")
print(f"  tamanho: {out_path.stat().st_size/1024:.1f} KB")
print(f"  {len(resultados)} tribunais Datajud + STF Corte Aberta")
print(f"  total universo: {total_geral_processos:,} processos")
