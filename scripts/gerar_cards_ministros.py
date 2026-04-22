"""Gera 1 card HTML por ministro do STF + dashboard índice.

Fonte canônica: excel_parsed_174.json (174 ministros com slug + dados completos)
Fotos: 'stf no diva/fotos/<slug>.jpg' (127 com foto)
Complemento: stf_175_ministros.csv (janelas de Turma, vice, presidência)

Saída: Desktop/backup_judx/resultados/cards_ministros_stf/
  <slug>.html (1 por ministro) + fotos/ + DASHBOARD_MINISTROS_STF.html
"""
import json, csv, re, html, unicodedata, shutil
from pathlib import Path
from collections import defaultdict

BASE_DIVA = Path("C:/Users/medin/Desktop/stf no diva")
EXCEL_JSON = BASE_DIVA / "dados_ministros/excel_parsed_174.json"
FOTOS_SRC = BASE_DIVA / "fotos"
CSV_TURMAS = "C:/Users/medin/Desktop/backup_judx/resultados/stf_175_ministros.csv"

OUT_DIR = Path("C:/Users/medin/Desktop/backup_judx/resultados/cards_ministros_stf")
OUT_DIR.mkdir(parents=True, exist_ok=True)
FOTOS_DST = OUT_DIR / "fotos"
FOTOS_DST.mkdir(exist_ok=True)

# ============================================================
# 1. Copia fotos + indexa
# ============================================================
FOTO_MAP = {}
if FOTOS_SRC.exists():
    for img in FOTOS_SRC.glob("*.jpg"):
        dst = FOTOS_DST / img.name
        if not dst.exists():
            shutil.copy2(img, dst)
        FOTO_MAP[img.stem.lower()] = img.name

# ============================================================
# 2. Carrega excel_parsed_174 (fonte canônica)
# ============================================================
with open(EXCEL_JSON, encoding='utf-8') as f:
    ministros = json.load(f)

# Filtra só o rodapé (nome > 100 chars = não é nome de ministro)
ministros = [m for m in ministros if m.get('nome') and len(m.get('nome','')) < 100]

# ============================================================
# 3. Carrega CSV de turmas para complementar
# ============================================================
turmas_por_slug = {}
def slug_nome(s):
    s = ''.join(c for c in unicodedata.normalize('NFKD', s or '') if not unicodedata.combining(c))
    s = s.lower()
    return re.sub(r'[^a-z0-9]+', '_', s).strip('_')

with open(CSV_TURMAS, encoding='utf-8') as f:
    for r in csv.DictReader(f):
        # gera slug do nome_oficial para casar com excel_parsed
        s = slug_nome(r.get('nome_oficial',''))
        turmas_por_slug[s] = r
        # variante com underscore simples
        s2 = slug_nome(r.get('nome_curto_bio','') or r.get('nome_oficial',''))
        if s2 and s2 not in turmas_por_slug:
            turmas_por_slug[s2] = r

def esc(s): return html.escape(str(s or ''))

def get_turma(slug_oficial, nome_completo):
    if slug_oficial in turmas_por_slug: return turmas_por_slug[slug_oficial]
    # tenta variantes
    for k, v in turmas_por_slug.items():
        if k.replace('_','') == slug_oficial.replace('_',''):
            return v
    # por substring
    for k, v in turmas_por_slug.items():
        ss = slug_oficial.split('_')
        if len(ss) >= 2 and ss[-1] in k and ss[0] in k:
            return v
    return {}

# ============================================================
# 4. CSS
# ============================================================
CSS = """
:root{--bg:#0d1117;--card:#161b22;--text:#e6edf3;--muted:#8b949e;--brand:#58a6ff;--warn:#d29922;--ok:#3fb950;--err:#f85149;--line:#30363d}
*{box-sizing:border-box}body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:24px;line-height:1.55}
.container{max-width:920px;margin:0 auto}
h1{margin:0;font-size:26px;color:var(--brand)}
.sub{color:var(--muted);font-size:13px;margin-top:4px;margin-bottom:20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:24px;margin-bottom:16px}
.head{display:flex;gap:24px;align-items:flex-start;padding-bottom:18px;border-bottom:1px solid var(--line)}
.foto{width:160px;height:200px;object-fit:cover;border-radius:8px;background:#0a0e13;border:1px solid var(--line)}
.foto-ph{width:160px;height:200px;display:flex;align-items:center;justify-content:center;background:#0a0e13;border:1px dashed var(--line);border-radius:8px;color:var(--muted);font-size:12px;text-align:center;padding:8px}
.ordem{color:var(--brand);font-weight:700;font-size:13px;letter-spacing:.4px}
.nome{font-size:23px;font-weight:700;margin:4px 0 6px;color:var(--text)}
.subnome{color:var(--muted);font-size:12px}
.grid{display:grid;grid-template-columns:190px 1fr;gap:6px 16px;margin-top:18px}
.label{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.5px;align-self:center}
.val{font-size:14px}
.empty{color:var(--muted);font-style:italic}
h2{margin-top:24px;margin-bottom:10px;font-size:15px;color:var(--brand);border-left:3px solid var(--brand);padding-left:10px;text-transform:uppercase;letter-spacing:.6px}
.tag{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;text-transform:uppercase;margin-right:4px;margin-bottom:4px}
.tag-ativo{background:rgba(63,185,80,.2);color:var(--ok)}
.tag-aposentado{background:rgba(139,148,158,.2);color:var(--muted)}
.tag-falecido{background:rgba(248,81,73,.15);color:var(--err)}
.tag-nao-posse{background:rgba(210,153,34,.2);color:var(--warn)}
.tag-pres{background:rgba(88,166,255,.2);color:var(--brand)}
.tag-mulher{background:rgba(210,90,153,.18);color:#e58fc4}
.back{color:var(--brand);text-decoration:none;font-size:13px}
.back:hover{text-decoration:underline}
.rel{display:flex;gap:24px;margin-top:6px;font-size:13px}
.rel-item{color:var(--muted)}
.rel-item b{color:var(--text);font-weight:600}
"""

def status(m, t):
    if t.get('posse_stf','') == 'NAO TOMOU POSSE': return '<span class="tag tag-nao-posse">Nao tomou posse</span>'
    if not m.get('atual', False) and m.get('saida_tipo','')=='falecimento_em_exercicio': return '<span class="tag tag-falecido">Falecido em exercicio</span>'
    if not m.get('atual', False): return '<span class="tag tag-aposentado">Fora do STF</span>'
    return '<span class="tag tag-ativo">Em exercicio</span>'

# ============================================================
# 5. Gera cards
# ============================================================
for m in ministros:
    s = m.get('slug') or slug_nome(m.get('nome',''))
    foto_file = FOTO_MAP.get(s)
    foto_html = (f'<img src="fotos/{esc(foto_file)}" alt="{esc(m["nome"])}" class="foto">'
                 if foto_file else '<div class="foto-ph">sem foto registrada</div>')
    t = get_turma(s, m.get('nome',''))

    # tags adicionais
    tag_genero = '<span class="tag tag-mulher">Mulher</span>' if m.get('genero') == 'F' else ''
    tag_pres = '<span class="tag tag-pres">Presidente STF</span>' if (t.get('foi_pres_stf')=='SIM') else ''
    tag_pai = f"<span class='tag' style='background:rgba(139,148,158,.15);color:var(--muted)'>Pai de ministro do STJ</span>" if m.get('pai') else ''

    html_doc = f"""<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8">
<title>{esc(m['nome'])} — Ministros STF</title>
<style>{CSS}</style></head><body><div class="container">
<a href="DASHBOARD_MINISTROS_STF.html" class="back">← Dashboard</a>
<div class="card">
  <div class="head">
    {foto_html}
    <div>
      <div class="ordem">Ordem oficial #{esc(m.get('ordem',''))}{(' · antiguidade ' + esc(t.get('ordem_antiguidade',''))) if t.get('ordem_antiguidade') else ''}</div>
      <div class="nome">{esc(m['nome'])}</div>
      <div class="subnome">slug: <code>{esc(s)}</code></div>
      <div style="margin-top:10px">{status(m,t)} {tag_pres} {tag_genero} {tag_pai}</div>
      <div class="rel">
        <div class="rel-item"><b>Antecessor:</b> {esc(m.get('antecessor','')) or '—'}</div>
        <div class="rel-item"><b>Sucessor:</b> {esc(m.get('sucessor','')) or '—'}</div>
      </div>
    </div>
  </div>

  <h2>Trajetória biográfica</h2>
  <div class="grid">
    <div class="label">Nascimento</div><div class="val">{esc(m.get('nascimento_data','')) or '<span class="empty">—</span>'} {esc(m.get('nascimento_local','')) or ''}</div>
    <div class="label">Faculdade</div><div class="val">{esc(m.get('faculdade','')) or '<span class="empty">—</span>'}</div>
    <div class="label">Carreira</div><div class="val">{esc(m.get('carreira','')) or '<span class="empty">—</span>'}</div>
    <div class="label">Presidente que indicou</div><div class="val">{esc(m.get('presidente_indicou','')) or '<span class="empty">—</span>'}</div>
    <div class="label">Idade na posse</div><div class="val">{esc(m.get('idade_posse','')) or '<span class="empty">—</span>'}</div>
    <div class="label">Posse no STF</div><div class="val">{esc(m.get('posse_stf_data','')) or esc(t.get('posse_stf','')) or '<span class="empty">—</span>'}</div>
    <div class="label">Saída (tipo)</div><div class="val">{esc(m.get('saida_tipo','')) or '<span class="empty">—</span>'}</div>
    <div class="label">Saída (data)</div><div class="val">{esc(m.get('saida_data','')) or esc(t.get('aposentadoria','')) or '<span class="empty">—</span>'}</div>
  </div>

  <h2>Mandato(s) por órgão</h2>
  <div class="grid">
    <div class="label">Turma inicial</div><div class="val">{esc(t.get('turma_inicial','')) or '<span class="empty">—</span>'} {(' desde ' + esc(t.get('turma_inicial_from',''))) if t.get('turma_inicial_from') else ''}</div>
    <div class="label">Trocou de Turma</div><div class="val">{esc(t.get('trocou_turma','')) or '<span class="empty">—</span>'}</div>
    <div class="label">Turma 1 (janela)</div><div class="val">{(esc(t.get('turma_1_from','')) + ' → ' + esc(t.get('turma_1_to',''))) if t.get('turma_1_from') else '<span class="empty">—</span>'}</div>
    <div class="label">Turma 2 (janela)</div><div class="val">{(esc(t.get('turma_2_from','')) + ' → ' + esc(t.get('turma_2_to',''))) if t.get('turma_2_from') else '<span class="empty">—</span>'}</div>
    <div class="label">Foi presid. de Turma</div><div class="val">{esc(t.get('foi_pres_turma','')) or '—'} {('(' + esc(t.get('turma_presidida','')) + ' ' + esc(t.get('pres_turma_from','')) + ' → ' + esc(t.get('pres_turma_to','')) + ')') if t.get('foi_pres_turma')=='SIM' else ''}</div>
    <div class="label">Vice-Presidência STF</div><div class="val">{esc(t.get('foi_vice_stf','')) or '—'} {(esc(t.get('vice_from','')) + ' → ' + esc(t.get('vice_to',''))) if t.get('foi_vice_stf')=='SIM' else ''}</div>
    <div class="label">Presidência STF</div><div class="val">{esc(t.get('foi_pres_stf','')) or '—'} {(esc(t.get('pres_stf_from','')) + ' → ' + esc(t.get('pres_stf_to',''))) if t.get('foi_pres_stf')=='SIM' else ''}</div>
  </div>

</div></div></body></html>"""
    (OUT_DIR / f"{s}.html").write_text(html_doc, encoding='utf-8')

# ============================================================
# 6. DASHBOARD
# ============================================================
linhas_tbl = []
for m in sorted(ministros, key=lambda x: -(x.get('ordem') or 0)):
    s = m.get('slug')
    foto_file = FOTO_MAP.get(s)
    img = (f'<img src="fotos/{esc(foto_file)}" style="width:40px;height:50px;object-fit:cover;border-radius:4px">'
           if foto_file else '<div style="width:40px;height:50px;background:#0a0e13;border:1px solid #30363d;border-radius:4px"></div>')
    t = get_turma(s, m.get('nome',''))
    st = status(m, t)
    pres = ' <span class="tag tag-pres">Presid.</span>' if t.get('foi_pres_stf')=='SIM' else ''
    gen  = ' <span class="tag tag-mulher">♀</span>' if m.get('genero')=='F' else ''
    linhas_tbl.append(f'''<tr onclick="location='{esc(s)}.html'">
      <td class="n">{esc(m.get('ordem',''))}</td>
      <td>{img}</td>
      <td><strong>{esc(m['nome'])}</strong></td>
      <td class="n">{esc(m.get('posse_stf_data','')) or esc(t.get('posse_stf',''))}</td>
      <td class="n">{esc(m.get('saida_data','')) or esc(t.get('aposentadoria',''))}</td>
      <td>{st}{pres}{gen}</td>
      <td class="tiny">{esc(m.get('presidente_indicou',''))}</td>
    </tr>''')

n_fotos = sum(1 for m in ministros if FOTO_MAP.get(m.get('slug')))
n_pres = sum(1 for m in ministros if get_turma(m.get('slug'), m.get('nome','')).get('foi_pres_stf')=='SIM')
n_mulheres = sum(1 for m in ministros if m.get('genero')=='F')

dash = f"""<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8">
<meta http-equiv="refresh" content="5">
<title>Dashboard dos Ministros STF</title>
<style>{CSS}
table{{width:100%;border-collapse:collapse;font-size:12px;background:var(--card);border:1px solid var(--line);border-radius:6px;overflow:hidden}}
th,td{{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:middle}}
th{{color:var(--muted);font-size:11px;text-transform:uppercase;background:#0f141a}}
td.n{{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}}
td.tiny{{color:var(--muted);font-size:11px}}
tr{{cursor:pointer}}tr:hover td{{background:#1c2128}}
input{{background:var(--card);border:1px solid var(--line);color:var(--text);padding:8px 12px;border-radius:6px;width:100%;font-size:14px;margin-bottom:12px}}
.kpi{{display:flex;gap:12px;margin-bottom:16px}}
.kpi-box{{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:10px 16px;flex:1;text-align:center}}
.kpi-v{{font-size:22px;font-weight:700;color:var(--brand)}}
.kpi-l{{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}}
</style></head><body><div class="container" style="max-width:1400px">
<h1>Ministros do STF — {len(ministros)} trajetórias</h1>
<div class="sub">Ordem oficial (decreto de nomeação). Clique na linha para abrir o card completo.</div>
<div class="kpi">
  <div class="kpi-box"><div class="kpi-v">{len(ministros)}</div><div class="kpi-l">Ministros</div></div>
  <div class="kpi-box"><div class="kpi-v">{n_fotos}</div><div class="kpi-l">Com foto</div></div>
  <div class="kpi-box"><div class="kpi-v">{n_pres}</div><div class="kpi-l">Presidentes STF</div></div>
  <div class="kpi-box"><div class="kpi-v">{n_mulheres}</div><div class="kpi-l">Mulheres</div></div>
</div>
<input id="f" placeholder="filtrar por nome, presidente que indicou, etc..." oninput="ff()">
<table><thead><tr>
<th class="n">Ordem</th><th></th><th>Nome</th><th class="n">Posse STF</th><th class="n">Saída</th><th>Status</th><th>Indicado por</th>
</tr></thead><tbody id="tb">{''.join(linhas_tbl)}</tbody></table>
</div>
<script>
function ff(){{
  const q=document.getElementById('f').value.toLowerCase();
  document.querySelectorAll('#tb tr').forEach(tr=>{{
    tr.style.display = tr.textContent.toLowerCase().includes(q)?'':'none';
  }});
}}
</script></body></html>"""
(OUT_DIR / "DASHBOARD_MINISTROS_STF.html").write_text(dash, encoding='utf-8')

print(f"[ok] cards: {len(ministros)} em {OUT_DIR}")
print(f"[ok] fotos: {n_fotos}/{len(ministros)}")
print(f"[ok] dashboard: {OUT_DIR/'DASHBOARD_MINISTROS_STF.html'}")
