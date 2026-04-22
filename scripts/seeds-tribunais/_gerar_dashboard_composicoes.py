"""Gera HTML visual das composições e presidências STF/STJ para conferência.

Inclui linha sucessória histórica completa (presidentes STF desde 1963) + corpus operacional (2000+).
"""
import csv, html, json
from pathlib import Path
from collections import defaultdict
from datetime import datetime, date

SEED = Path("C:/Users/medin/projetos/judx-platform/scripts/seeds-tribunais/composicao_ministerial.csv")
PRESID_JSON = Path("C:/Users/medin/Desktop/backup_judx/resultados/stf_presidentes_biografico.json")
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados/DASHBOARD_COMPOSICOES.html")

CORPUS_INICIO = date(2000, 1, 1)  # <-- DECISÃO CANÔNICA: corpus decisório começa em 2000

# --- seed ---
rows = []
with SEED.open('r', encoding='utf-8') as f:
    r = csv.reader(f)
    header = None
    for row in r:
        if not row or row[0].startswith('#'): continue
        if row[0] == 'tribunal_sigla':
            header = row; continue
        if len(row) < len(header): continue
        rows.append(dict(zip(header, row)))
por_tribunal = defaultdict(list)
for r in rows: por_tribunal[r['tribunal_sigla']].append(r)

# --- presidentes históricos STF (do JSON biográfico) ---
presid_historicos = []
if PRESID_JSON.exists():
    with PRESID_JSON.open('r', encoding='utf-8') as f:
        dados = json.load(f)
    for p in dados:
        pres_inicio = p.get('posse_pres', '')
        if not pres_inicio: continue
        # converter DD/M/YYYY para YYYY-MM-DD
        try:
            dt = datetime.strptime(pres_inicio, '%d/%m/%Y').date()
        except:
            continue
        presid_historicos.append({
            'nome': p.get('nome_completo') or p.get('nome'),
            'posse_pres': dt,
            'aposent': p.get('aposentadoria', ''),
            'falec': p.get('falecimento', ''),
            'nasc': p.get('nascimento', ''),
            'posse_stf': p.get('posse_stf', ''),
            'posse_vice': p.get('posse_vice', ''),
        })
presid_historicos.sort(key=lambda x: x['posse_pres'])

# Calcular fim de cada presidência (início da próxima - 1 dia)
for i, p in enumerate(presid_historicos):
    if i + 1 < len(presid_historicos):
        p['fim_pres'] = presid_historicos[i+1]['posse_pres']
    else:
        p['fim_pres'] = None  # atual

def esc(s): return html.escape(str(s) if s else '')
def fmt(d):
    if not d: return '—'
    if isinstance(d, date): return d.strftime('%d/%m/%Y')
    try: return datetime.strptime(d, '%Y-%m-%d').strftime('%d/%m/%Y')
    except: return d
def fmt_d(s):
    if not s: return None
    try: return datetime.strptime(s, '%Y-%m-%d').date()
    except: return None
def ativo(r): return not r.get('valid_to', '').strip()

def no_corpus(r):
    """True se período cobre >= 2000-01-01."""
    vto = fmt_d(r.get('valid_to', ''))
    if vto is None: return True  # em exercício
    return vto >= CORPUS_INICIO

def pre_corpus(r):
    """True se período termina antes de 2000."""
    vto = fmt_d(r.get('valid_to', ''))
    return vto is not None and vto < CORPUS_INICIO

# ==================== BLOCOS ====================

def bloco_linha_sucessoria_stf():
    """Linha sucessória completa dos Presidentes STF — histórica + operacional."""
    html_ = '<h3>Linha sucessória — Presidentes do STF (completa desde 1963)</h3>'
    html_ += '<div class="aviso-mini">🔵 cor azul = dentro do corpus operacional (≥ 2000) · ⚪ cor cinza = rastro histórico (pré-2000)</div>'
    html_ += '<table><thead><tr><th>#</th><th>Presidente</th><th>Posse na Presidência</th><th>Fim</th><th>Status</th></tr></thead><tbody>'
    for i, p in enumerate(presid_historicos, 1):
        inicio = p['posse_pres']
        fim = p['fim_pres']
        dentro_corpus = (fim is None) or (fim >= CORPUS_INICIO) or (inicio >= CORPUS_INICIO)
        classe = 'no-corpus' if dentro_corpus else 'rastro'
        status = '🟢 em exercício' if fim is None else ('🔵 no corpus' if dentro_corpus else '⚪ rastro histórico')
        html_ += (f'<tr class="{classe}"><td>{i}</td>'
                  f'<td class="nome">{esc(p["nome"])}</td>'
                  f'<td>{fmt(inicio)}</td>'
                  f'<td>{fmt(fim) if fim else "em exercício"}</td>'
                  f'<td>{status}</td></tr>')
    html_ += '</tbody></table>'
    return html_

def bloco_presidencias_seed(tribunal, lista):
    """Presidentes do seed (com dados formais de posse/aposentadoria/motivo)."""
    pres = [r for r in lista if r['codigo_orgao'] == 'PRESIDENCIA']
    pres.sort(key=lambda x: x.get('valid_from', ''))
    html_ = f'<h3>{tribunal} — Presidências registradas no seed ({len(pres)})</h3>'
    if not pres: return html_ + '<p class="vazio">(nenhum presidente registrado)</p>'
    html_ += '<table><thead><tr><th>Ministro</th><th>Início</th><th>Fim</th><th>Status</th><th>Observação</th></tr></thead><tbody>'
    for p in pres:
        dentro = no_corpus(p)
        classe = 'no-corpus' if dentro else 'rastro'
        status = '🟢 em exercício' if ativo(p) else ('🔵 no corpus' if dentro else '⚪ rastro')
        html_ += (f'<tr class="{classe}"><td class="nome">{esc(p["ministro_nome_canonico"])}</td>'
                  f'<td>{fmt(p["valid_from"])}</td>'
                  f'<td>{fmt(p.get("valid_to",""))}</td>'
                  f'<td>{status}</td>'
                  f'<td>{esc(p.get("motivo_mudanca",""))}</td></tr>')
    html_ += '</tbody></table>'
    return html_

def bloco_vice(tribunal, lista):
    vice = [r for r in lista if r['codigo_orgao'] == 'VICE_PRESIDENCIA']
    vice.sort(key=lambda x: x.get('valid_from', ''))
    if not vice: return ''
    html_ = f'<h3>{tribunal} — Vice-Presidentes ({len(vice)})</h3>'
    html_ += '<table><thead><tr><th>Ministro</th><th>Início</th><th>Fim</th><th>Status</th></tr></thead><tbody>'
    for p in vice:
        dentro = no_corpus(p)
        classe = 'no-corpus' if dentro else 'rastro'
        status = '🟢 em exercício' if ativo(p) else ('🔵 no corpus' if dentro else '⚪ rastro')
        html_ += (f'<tr class="{classe}"><td class="nome">{esc(p["ministro_nome_canonico"])}</td>'
                  f'<td>{fmt(p["valid_from"])}</td>'
                  f'<td>{fmt(p.get("valid_to",""))}</td>'
                  f'<td>{status}</td></tr>')
    html_ += '</tbody></table>'
    return html_

def bloco_atual(tribunal, lista):
    atual = [r for r in lista if ativo(r)]
    por_orgao = defaultdict(list)
    for r in atual: por_orgao[r['codigo_orgao']].append(r)
    ordem = ['PRESIDENCIA','VICE_PRESIDENCIA','CORREGEDORIA','PLENARIO','CORTE_ESPECIAL',
             'TURMA_1_PRESID','TURMA_1','TURMA_2_PRESID','TURMA_2','TURMA_3','TURMA_4','TURMA_5','TURMA_6',
             'SECAO_1','SECAO_2','SECAO_3']
    html_ = f'<h3>{tribunal} — Composição atual em exercício (corpus vivo)</h3>'
    html_ += '<div class="grid-orgaos">'
    for orgao in ordem:
        if orgao not in por_orgao: continue
        membros = sorted(por_orgao[orgao], key=lambda x: x.get('valid_from',''))
        html_ += f'<div class="orgao-box"><h4>{esc(orgao)}</h4><ul>'
        for m in membros:
            html_ += (f'<li><strong>{esc(m["ministro_nome_canonico"])}</strong>'
                      f' <span class="data">posse: {fmt(m["valid_from"])}</span></li>')
        html_ += '</ul></div>'
    for orgao, membros in por_orgao.items():
        if orgao in ordem: continue
        html_ += f'<div class="orgao-box"><h4>{esc(orgao)}</h4><ul>'
        for m in sorted(membros, key=lambda x: x.get('valid_from','')):
            html_ += f'<li><strong>{esc(m["ministro_nome_canonico"])}</strong> <span class="data">posse: {fmt(m["valid_from"])}</span></li>'
        html_ += '</ul></div>'
    html_ += '</div>'
    return html_

def bloco_historico(tribunal, lista):
    no_c = [r for r in lista if no_corpus(r) or ativo(r)]
    pre = [r for r in lista if pre_corpus(r)]
    html_ = f'<h3>{tribunal} — Histórico ancorado no tempo</h3>'
    html_ += f'<div class="aviso-mini">📊 {len(no_c)} registros no corpus operacional (≥2000) · 📜 {len(pre)} registros pré-2000 (rastro sucessório)</div>'
    html_ += '<details open><summary>Corpus operacional (≥ 2000) — tabela completa</summary>'
    html_ += _tabela_historico(no_c, 'no-corpus')
    html_ += '</details>'
    if pre:
        html_ += '<details><summary>Rastro sucessório pré-2000 (clique para expandir)</summary>'
        html_ += _tabela_historico(pre, 'rastro')
        html_ += '</details>'
    return html_

def _tabela_historico(lista, classe_css):
    t = f'<table class="hist {classe_css}"><thead><tr><th>Ministro</th><th>Órgão</th><th>Início</th><th>Fim</th><th>Tipo</th><th>Motivo</th></tr></thead><tbody>'
    for r in sorted(lista, key=lambda x: (x['ministro_nome_canonico'], x.get('valid_from',''))):
        status = 'ativo' if ativo(r) else 'encerrado'
        t += (f'<tr class="{status}"><td class="nome">{esc(r["ministro_nome_canonico"])}</td>'
              f'<td>{esc(r["codigo_orgao"])}</td>'
              f'<td>{fmt(r["valid_from"])}</td>'
              f'<td>{fmt(r.get("valid_to",""))}</td>'
              f'<td>{esc(r.get("tipo_ancoragem",""))}</td>'
              f'<td>{esc(r.get("motivo_mudanca",""))}</td></tr>')
    t += '</tbody></table>'
    return t

# ==================== HTML ====================
css = """
:root{--bg:#0d1117;--card:#161b22;--text:#e6edf3;--muted:#8b949e;--brand:#58a6ff;--ok:#3fb950;--warn:#d29922;--err:#f85149;--rastro:#6e7681;--line:#30363d}
*{box-sizing:border-box}
body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:32px 24px;line-height:1.5}
.container{max-width:1400px;margin:0 auto}
h1{margin:0;font-size:26px;color:var(--brand)}
.sub{color:var(--muted);font-size:13px;margin-top:6px;margin-bottom:28px}
h2{margin:40px 0 14px;padding-bottom:8px;border-bottom:2px solid var(--brand);font-size:20px;color:var(--brand)}
h3{margin:24px 0 10px;font-size:16px;color:var(--warn)}
h4{margin:0 0 8px;font-size:13px;color:var(--ok);text-transform:uppercase;letter-spacing:.5px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;background:var(--card);border:1px solid var(--line);border-radius:6px;overflow:hidden}
th,td{text-align:left;padding:7px 12px;border-bottom:1px solid var(--line)}
th{color:var(--muted);font-weight:500;font-size:11px;text-transform:uppercase;background:#0f141a}
td.nome{font-weight:600;color:var(--brand)}
tr.ativo{background:rgba(63,185,80,.04)}
tr.no-corpus td:first-child{border-left:3px solid var(--brand)}
tr.rastro td:first-child{border-left:3px solid var(--rastro)}
tr.rastro td{color:#8b949e}
tr.encerrado td{color:#8b949e}
tr:hover td{background:#1c2128}
.grid-orgaos{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-bottom:16px}
.orgao-box{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:12px}
.orgao-box ul{margin:0;padding-left:16px;font-size:13px}
.orgao-box li{margin-bottom:4px;line-height:1.4}
.orgao-box .data{color:var(--muted);font-size:11px}
details{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:10px;margin-bottom:12px}
details summary{cursor:pointer;color:var(--brand);font-weight:600;padding:6px}
.vazio{color:var(--muted);font-style:italic;padding:8px}
.kpi-row{display:flex;gap:16px;margin:12px 0;flex-wrap:wrap}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:10px 16px;flex:1;min-width:140px;text-align:center}
.kpi-val{font-size:22px;font-weight:600;color:var(--brand)}
.kpi-lbl{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-top:2px}
.aviso{background:rgba(210,153,34,.1);border-left:3px solid var(--warn);padding:10px 14px;border-radius:4px;margin-bottom:16px;font-size:13px}
.aviso-mini{font-size:11px;color:var(--muted);margin-bottom:8px}
.destaque-corpus{background:rgba(88,166,255,.08);border-left:3px solid var(--brand);padding:10px 14px;border-radius:4px;margin-bottom:16px;font-size:13px}
"""

html_doc = f"""<!DOCTYPE html>
<html lang="pt-br">
<head><meta charset="UTF-8"><title>Composições e Presidências — STF + STJ</title>
<style>{css}</style></head>
<body><div class="container">

<h1>Composições e Presidências — para conferência</h1>
<div class="sub">Seed <code>composicao_ministerial.csv</code> + biografias dos presidentes STF · ancoragem temporal · {len(rows)} registros + {len(presid_historicos)} presidentes históricos</div>

<div class="destaque-corpus">
<strong>⚓ DECISÃO CANÔNICA</strong>: o corpus decisório operacional começa em <strong>1º/1/2000</strong>. Ministros/presidentes com mandato anterior ficam registrados como <strong>rastro sucessório</strong> (marcados em cinza) — contexto histórico sem peso analítico.
</div>

<h2>🏛️ STF — Linha sucessória completa</h2>
{bloco_linha_sucessoria_stf()}

<h2>🏛️ STF — Seed com ancoragem temporal ({len(por_tribunal.get('STF',[]))} registros)</h2>
<div class="kpi-row">
<div class="kpi"><div class="kpi-val">{len([r for r in por_tribunal.get('STF',[]) if ativo(r)])}</div><div class="kpi-lbl">em exercício</div></div>
<div class="kpi"><div class="kpi-val">{len([r for r in por_tribunal.get('STF',[]) if no_corpus(r) or ativo(r)])}</div><div class="kpi-lbl">no corpus (≥2000)</div></div>
<div class="kpi"><div class="kpi-val">{len([r for r in por_tribunal.get('STF',[]) if pre_corpus(r)])}</div><div class="kpi-lbl">rastro pré-2000</div></div>
<div class="kpi"><div class="kpi-val">{len(set(r['ministro_nome_canonico'] for r in por_tribunal.get('STF',[])))}</div><div class="kpi-lbl">ministros distintos</div></div>
</div>
{bloco_presidencias_seed('STF', por_tribunal.get('STF', []))}
{bloco_vice('STF', por_tribunal.get('STF', []))}
{bloco_atual('STF', por_tribunal.get('STF', []))}
{bloco_historico('STF', por_tribunal.get('STF', []))}

<h2>⚖️ STJ — Seed com ancoragem temporal ({len(por_tribunal.get('STJ',[]))} registros)</h2>
<div class="kpi-row">
<div class="kpi"><div class="kpi-val">{len([r for r in por_tribunal.get('STJ',[]) if ativo(r)])}</div><div class="kpi-lbl">em exercício</div></div>
<div class="kpi"><div class="kpi-val">{len([r for r in por_tribunal.get('STJ',[]) if no_corpus(r) or ativo(r)])}</div><div class="kpi-lbl">no corpus</div></div>
<div class="kpi"><div class="kpi-val">{len(set(r['ministro_nome_canonico'] for r in por_tribunal.get('STJ',[])))}</div><div class="kpi-lbl">ministros distintos</div></div>
</div>
<div class="aviso">⚠️ STJ é rascunho construído por conhecimento base — não existe <code>stj_composicao_temporal</code> no backup local. Precisa validação contra PDF oficial "Composição-do-STJ.pdf".</div>
{bloco_presidencias_seed('STJ', por_tribunal.get('STJ', []))}
{bloco_atual('STJ', por_tribunal.get('STJ', []))}
{bloco_historico('STJ', por_tribunal.get('STJ', []))}

</div></body></html>
"""

OUT.write_text(html_doc, encoding='utf-8')
print(f'[ok] {OUT}')
print(f'  {len(rows)} seed + {len(presid_historicos)} presidentes históricos (1963→hoje)')
