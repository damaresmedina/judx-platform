"""stj-dashboard-disco-g.py

Gera um dashboard HTML panorâmico do disco G: — raw Datajud por tribunal,
staging DuckDB, backups Supabase. Lê apenas metadados (sem abrir conteúdo).

Saída: Desktop\backup_judx\resultados\2026-04-19_DASHBOARD_DISCO_G.html
"""
import os, json, html, time
from pathlib import Path
from collections import defaultdict

G = Path("G:/")
RAW = G / "datajud_raw"
STAGING = G / "staging_local"
BACKUP = G / "supabase_backup"
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados")

def size_fmt(b):
    for u in ('B','KB','MB','GB','TB'):
        if b < 1024: return f"{b:.1f} {u}"
        b /= 1024
    return f"{b:.1f} PB"

def sum_dir(p):
    """Retorna (tamanho_bytes, n_arquivos) de uma pasta recursivamente."""
    total, n = 0, 0
    try:
        for root, dirs, files in os.walk(p):
            for f in files:
                try:
                    total += os.path.getsize(os.path.join(root, f))
                    n += 1
                except OSError:
                    pass
    except (PermissionError, OSError):
        pass
    return total, n

# ========== espaço em disco ==========
import shutil
du = shutil.disk_usage(str(G))
print(f"[disco] total={size_fmt(du.total)} usado={size_fmt(du.used)} livre={size_fmt(du.free)}", flush=True)

# ========== raw datajud ==========
print(f"[raw] percorrendo {RAW}", flush=True)
t0 = time.time()
raw_total_bytes, raw_total_files = sum_dir(RAW)
print(f"  total: {size_fmt(raw_total_bytes)} em {raw_total_files:,} arquivos ({time.time()-t0:.0f}s)", flush=True)

# manifest raiz
manifest_raiz = {}
if (RAW / "manifest.json").exists():
    try:
        manifest_raiz = json.loads((RAW / "manifest.json").read_text(encoding='utf-8'))
    except Exception as e:
        manifest_raiz = {"erro": str(e)}

# inventário por nível
niveis = [
    ("nivel_0_stf", "STF"),
    ("nivel_1_anteparos", "Superiores (STJ, TST, TSE, STM)"),
    ("nivel_2_regionais", "Regionais (TRFs, TRTs, TREs, TJs, TJMs)"),
    ("nivel_3_varas", "Varas e Primeira Instância"),
]

inventario_por_nivel = []
tribunais_detalhe = []

for subpath, label in niveis:
    p_nivel = RAW / subpath
    if not p_nivel.exists():
        continue
    total_b, total_f = sum_dir(p_nivel)
    inventario_por_nivel.append({
        'subpath': subpath,
        'label': label,
        'bytes': total_b,
        'arquivos': total_f,
        'exists': True,
    })
    # cada subpasta de 1o nivel pode ser tribunal direto ou ramo
    for item in sorted(p_nivel.iterdir()):
        if not item.is_dir(): continue
        nome = item.name
        # ver se é tribunal direto (tem part-*.ndjson.gz) ou ramo (tem subpastas)
        parts_direct = list(item.glob("part-*.ndjson.gz"))
        sub_b, sub_f = sum_dir(item)
        manifest_t = {}
        checkpoint_t = {}
        if (item / "manifest.json").exists():
            try: manifest_t = json.loads((item / "manifest.json").read_text(encoding='utf-8'))
            except: pass
        if (item / "checkpoint.json").exists():
            try: checkpoint_t = json.loads((item / "checkpoint.json").read_text(encoding='utf-8'))
            except: pass

        if parts_direct:
            # tribunal direto
            tribunais_detalhe.append({
                'nivel_label': label,
                'sigla': nome.upper(),
                'caminho_relativo': f"{subpath}/{nome}",
                'n_parts': len(parts_direct),
                'bytes': sub_b,
                'arquivos': sub_f,
                'manifest': manifest_t,
                'checkpoint': checkpoint_t,
                'tipo': 'tribunal',
            })
        else:
            # ramo ou agrupador — entra um nível mais fundo
            for sub in sorted(item.iterdir()):
                if not sub.is_dir(): continue
                # terceiro nível
                sub_parts = list(sub.glob("part-*.ndjson.gz"))
                sub2_b, sub2_f = sum_dir(sub)
                manifest_s = {}
                checkpoint_s = {}
                if (sub / "manifest.json").exists():
                    try: manifest_s = json.loads((sub / "manifest.json").read_text(encoding='utf-8'))
                    except: pass
                if (sub / "checkpoint.json").exists():
                    try: checkpoint_s = json.loads((sub / "checkpoint.json").read_text(encoding='utf-8'))
                    except: pass

                if sub_parts:
                    tribunais_detalhe.append({
                        'nivel_label': label,
                        'sigla': sub.name.upper(),
                        'caminho_relativo': f"{subpath}/{nome}/{sub.name}",
                        'n_parts': len(sub_parts),
                        'bytes': sub2_b,
                        'arquivos': sub2_f,
                        'manifest': manifest_s,
                        'checkpoint': checkpoint_s,
                        'tipo': 'tribunal',
                        'ramo': nome,
                    })
                else:
                    # agregador (ex: nível 2/estadual/)
                    if sub2_b > 0:
                        tribunais_detalhe.append({
                            'nivel_label': label,
                            'sigla': sub.name.upper(),
                            'caminho_relativo': f"{subpath}/{nome}/{sub.name}",
                            'n_parts': 0,
                            'bytes': sub2_b,
                            'arquivos': sub2_f,
                            'manifest': {},
                            'checkpoint': {},
                            'tipo': 'agregador',
                            'ramo': nome,
                        })

# ========== staging DuckDB ==========
print(f"[staging] percorrendo {STAGING}", flush=True)
staging_items = []
if STAGING.exists():
    for item in sorted(STAGING.iterdir()):
        if item.is_file():
            try:
                sz = item.stat().st_size
                staging_items.append({
                    'nome': item.name,
                    'bytes': sz,
                    'eh_duckdb': item.suffix == '.duckdb',
                })
            except: pass
    staging_total_b, staging_total_f = sum_dir(STAGING)
else:
    staging_total_b, staging_total_f = 0, 0

# ========== backup ==========
print(f"[backup] percorrendo {BACKUP}", flush=True)
backup_items = []
if BACKUP.exists():
    for item in sorted(BACKUP.iterdir()):
        if item.is_file():
            try:
                sz = item.stat().st_size
                backup_items.append({'nome': item.name, 'bytes': sz})
            except: pass
    backup_total_b, backup_total_f = sum_dir(BACKUP)
else:
    backup_total_b, backup_total_f = 0, 0

# ========== outras pastas de G ==========
print(f"[outros] listando raiz", flush=True)
outras_raiz = []
for item in sorted(G.iterdir()):
    if item.name in ('datajud_raw', 'staging_local', 'supabase_backup'): continue
    if item.name.startswith('$'): continue  # recycle bin, system
    try:
        if item.is_dir():
            b, f = sum_dir(item)
            if b > 0:
                outras_raiz.append({'nome': item.name, 'bytes': b, 'arquivos': f, 'tipo': 'dir'})
        else:
            outras_raiz.append({'nome': item.name, 'bytes': item.stat().st_size, 'arquivos': 1, 'tipo': 'file'})
    except (OSError, PermissionError):
        pass

# ========== HTML ==========
def esc(s): return html.escape(str(s))

def render_tribunal_row(t):
    target = t['manifest'].get('total_esperado') or t['checkpoint'].get('total_esperado') or ''
    coletado = t['checkpoint'].get('total_coletado') or t['checkpoint'].get('processos') or ''
    status = t['manifest'].get('status', '') or t['checkpoint'].get('status','')
    ult = t['checkpoint'].get('ultimo_run','') or t['manifest'].get('gerado_em','')
    pct = ''
    if isinstance(target, (int, float)) and isinstance(coletado, (int, float)) and target > 0:
        pct = f"{100*coletado/target:.1f}%"
    return (f"<tr><td>{esc(t['nivel_label'])}</td>"
            f"<td><strong>{esc(t['sigla'])}</strong></td>"
            f"<td>{esc(t.get('ramo',''))}</td>"
            f"<td class='n'>{t['n_parts']:,}</td>"
            f"<td class='n'>{size_fmt(t['bytes'])}</td>"
            f"<td class='n'>{coletado if coletado != '' else '—':,}</td>" if isinstance(coletado, (int,float)) else
            f"<td class='n'>—</td>"
            f"<td class='n'>{target if target != '' else '—':,}</td>" if isinstance(target, (int,float)) else
            f"<td class='n'>—</td>"
            f"<td class='n'>{esc(pct) or '—'}</td>"
            f"<td><code>{esc(t['caminho_relativo'])}</code></td></tr>")

# rebuild row (handle inline conditional expressions)
def row_tribunal(t):
    target = t['manifest'].get('total_esperado') or t['checkpoint'].get('total_esperado')
    coletado = t['checkpoint'].get('total_coletado') or t['checkpoint'].get('processos')
    pct = ''
    if isinstance(target, (int, float)) and isinstance(coletado, (int, float)) and target > 0:
        pct = f"{100*coletado/target:.1f}%"
    coletado_txt = f"{coletado:,}" if isinstance(coletado, (int, float)) else '—'
    target_txt = f"{target:,}" if isinstance(target, (int, float)) else '—'
    return (
        f"<tr>"
        f"<td>{esc(t['nivel_label'])}</td>"
        f"<td><strong>{esc(t['sigla'])}</strong></td>"
        f"<td>{esc(t.get('ramo',''))}</td>"
        f"<td class='n'>{t['n_parts']:,}</td>"
        f"<td class='n'>{size_fmt(t['bytes'])}</td>"
        f"<td class='n'>{coletado_txt}</td>"
        f"<td class='n'>{target_txt}</td>"
        f"<td class='n'>{pct or '—'}</td>"
        f"<td><code>{esc(t['caminho_relativo'])}</code></td>"
        f"</tr>"
    )

# ordenar tribunais por tamanho
tribunais_detalhe.sort(key=lambda t: -t['bytes'])

html_doc = f"""<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="60">
<title>JudX · Disco G: · Panorama</title>
<style>
  :root{{--bg:#0d1117;--card:#161b22;--text:#e6edf3;--muted:#8b949e;--brand:#58a6ff;--ok:#3fb950;--warn:#d29922;--err:#f85149;--line:#30363d}}
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
</style>
</head>
<body>

<h1>Disco G: — Panorama</h1>
<div class="sub">Inventário de {RAW.name} + {STAGING.name} + {BACKUP.name} · 19/abr/2026 · atualiza a cada 60s</div>

<h2>Espaço em disco</h2>
<div class="grid">
  <div class="kpi"><div class="kpi-val">{size_fmt(du.total)}</div><div class="kpi-lbl">Capacidade total</div></div>
  <div class="kpi"><div class="kpi-val">{size_fmt(du.used)}</div><div class="kpi-lbl">Usado ({100*du.used/du.total:.1f}%)</div></div>
  <div class="kpi"><div class="kpi-val">{size_fmt(du.free)}</div><div class="kpi-lbl">Livre</div></div>
</div>
<div class="bar-container"><div class="bar-fill" style="width:{100*du.used/du.total:.1f}%"></div></div>

<h2>Raw Datajud (<code>G:\\datajud_raw</code>)</h2>
<div class="grid">
  <div class="kpi"><div class="kpi-val">{size_fmt(raw_total_bytes)}</div><div class="kpi-lbl">Tamanho total</div></div>
  <div class="kpi"><div class="kpi-val">{raw_total_files:,}</div><div class="kpi-lbl">Arquivos</div></div>
  <div class="kpi"><div class="kpi-val">{len([t for t in tribunais_detalhe if t['tipo']=='tribunal'])}</div><div class="kpi-lbl">Tribunais extraídos</div></div>
</div>

<h3>Por nível hierárquico</h3>
<div class="card">
<table>
<thead><tr><th>Nível</th><th>Descrição</th><th class="n">Tamanho</th><th class="n">Arquivos</th><th>Caminho</th></tr></thead>
<tbody>
{''.join(f"<tr><td><strong>{esc(n['subpath'])}</strong></td><td>{esc(n['label'])}</td><td class='n'>{size_fmt(n['bytes'])}</td><td class='n'>{n['arquivos']:,}</td><td><code>G:\\datajud_raw\\{esc(n['subpath'])}</code></td></tr>" for n in inventario_por_nivel)}
</tbody>
</table>
</div>

<h3>Tribunais em detalhe ({len(tribunais_detalhe)} total)</h3>
<div class="card" style="max-height:600px;overflow-y:auto">
<table>
<thead><tr>
<th>Nível</th><th>Sigla</th><th>Ramo</th><th class="n">Parts (ndjson.gz)</th><th class="n">Tamanho</th>
<th class="n">Coletado</th><th class="n">Esperado</th><th class="n">%</th><th>Caminho</th>
</tr></thead>
<tbody>
{''.join(row_tribunal(t) for t in tribunais_detalhe)}
</tbody>
</table>
</div>

<h2>Staging DuckDB (<code>G:\\staging_local</code>)</h2>
<div class="grid">
  <div class="kpi"><div class="kpi-val">{size_fmt(staging_total_b)}</div><div class="kpi-lbl">Tamanho</div></div>
  <div class="kpi"><div class="kpi-val">{len(staging_items)}</div><div class="kpi-lbl">Arquivos no diretório</div></div>
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
print(f"  {len(tribunais_detalhe)} tribunais catalogados")
