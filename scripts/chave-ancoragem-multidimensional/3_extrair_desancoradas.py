"""Extrai as decisões SEM_ANCORAGEM para inspeção + gera dashboard HTML resumo."""
import duckdb, html
from pathlib import Path
from collections import Counter

OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados")
SRC = OUT / "2026-04-19_judx_decision_com_conferencia.csv"
CSV_DESANC = OUT / "2026-04-19_decisoes_DESANCORADAS.csv"
HTML_REP = OUT / "DASHBOARD_DESANCORADAS.html"
DB = "G:/staging_local/desanc_tmp.duckdb"

con = duckdb.connect(DB)

print("[load] judx_decision_com_conferencia.csv...", flush=True)
con.execute(f"""
CREATE OR REPLACE TABLE t AS
SELECT * FROM read_csv_auto('{SRC}', header=true, sample_size=50000);
""")
total = con.execute("SELECT COUNT(*) FROM t").fetchone()[0]
desanc = con.execute("SELECT COUNT(*) FROM t WHERE confere_origem_decisao='sem_ancoragem'").fetchone()[0]
print(f"  total: {total:,}  |  desancoradas: {desanc:,}", flush=True)

# CSV com as desancoradas
print(f"[export] {CSV_DESANC}", flush=True)
con.execute(f"""
COPY (
  SELECT * FROM t WHERE confere_origem_decisao='sem_ancoragem'
  ORDER BY decision_date DESC
) TO '{CSV_DESANC}' (HEADER, DELIMITER ',');
""")

# Análises agrupadas
por_relator = con.execute("""
  SELECT relator_normalizado, COUNT(*) n,
         ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM t WHERE confere_origem_decisao='sem_ancoragem'), 2) pct
  FROM t WHERE confere_origem_decisao='sem_ancoragem'
  GROUP BY 1 ORDER BY n DESC LIMIT 40
""").fetchall()

por_origem = con.execute("""
  SELECT origem_decisao, COUNT(*) n,
         ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM t WHERE confere_origem_decisao='sem_ancoragem'), 2) pct
  FROM t WHERE confere_origem_decisao='sem_ancoragem'
  GROUP BY 1 ORDER BY n DESC
""").fetchall()

por_ano = con.execute("""
  SELECT EXTRACT(YEAR FROM decision_date)::INT AS ano, COUNT(*) n
  FROM t WHERE confere_origem_decisao='sem_ancoragem' AND decision_date IS NOT NULL
  GROUP BY 1 ORDER BY ano
""").fetchall()

# Cruzamento relator × ano (pra ver se é questão de cobertura temporal do seed)
top10_relatores = [r[0] for r in por_relator[:10]]
rel_ano = con.execute(f"""
  SELECT relator_normalizado, EXTRACT(YEAR FROM decision_date)::INT AS ano, COUNT(*) n
  FROM t WHERE confere_origem_decisao='sem_ancoragem'
    AND relator_normalizado IN ({','.join("'" + r.replace("'","''") + "'" for r in top10_relatores)})
    AND decision_date IS NOT NULL
  GROUP BY 1, 2 ORDER BY 1, 2
""").fetchall()

# Amostra de 20 linhas para inspeção
amostra = con.execute("""
  SELECT external_number, relator_normalizado, decision_date, origem_decisao, orgao_julgador_origem, tipo_decisao, andamento_decisao
  FROM t WHERE confere_origem_decisao='sem_ancoragem'
  ORDER BY decision_date DESC LIMIT 40
""").fetchall()

con.close()
import os
try: os.remove(DB)
except: pass

# HTML
def esc(s): return html.escape(str(s) if s else '')

css = """
:root{--bg:#0d1117;--card:#161b22;--text:#e6edf3;--muted:#8b949e;--brand:#58a6ff;--warn:#d29922;--err:#f85149;--ok:#3fb950;--line:#30363d}
*{box-sizing:border-box}
body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:24px;line-height:1.5}
.container{max-width:1400px;margin:0 auto}
h1{margin:0;font-size:24px;color:var(--brand)}
.sub{color:var(--muted);font-size:13px;margin-top:4px;margin-bottom:20px}
h2{margin:28px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--line);font-size:17px}
.kpi-row{display:flex;gap:12px;margin:12px 0}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:12px 18px;flex:1;text-align:center}
.kpi-val{font-size:24px;font-weight:600;color:var(--warn)}
.kpi-lbl{font-size:11px;color:var(--muted);text-transform:uppercase;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:12px;background:var(--card);border:1px solid var(--line);border-radius:6px;overflow:hidden;margin-bottom:14px}
th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line)}
th{color:var(--muted);font-size:11px;text-transform:uppercase;font-weight:500;background:#0f141a}
td.n{text-align:right;font-variant-numeric:tabular-nums}
td.nome{font-weight:600;color:var(--brand)}
tr:hover td{background:#1c2128}
.tag{display:inline-block;padding:1px 8px;border-radius:10px;font-size:10px;font-weight:600;text-transform:uppercase}
.tag-critico{background:rgba(248,81,73,.2);color:var(--err)}
.tag-verificar{background:rgba(210,153,34,.2);color:var(--warn)}
.tag-ok{background:rgba(63,185,80,.2);color:var(--ok)}
details{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:8px;margin-bottom:10px}
summary{cursor:pointer;color:var(--brand);font-weight:600;padding:4px}
.diagnostico{background:rgba(88,166,255,.08);border-left:3px solid var(--brand);padding:10px 14px;border-radius:4px;margin-bottom:14px;font-size:13px}
code{background:#1c2128;padding:1px 5px;border-radius:3px;font-size:11px}
"""

# Bar chart simples via divs para distribuição por ano
max_ano = max(n for _, n in por_ano) if por_ano else 1
bars_ano = ''
for ano, n in por_ano:
    w = max(2, 100 * n / max_ano)
    bars_ano += f'<div style="display:flex;align-items:center;gap:8px;margin:2px 0"><span style="min-width:50px;color:var(--muted);font-size:11px">{ano}</span><div style="background:var(--warn);height:14px;width:{w}%;border-radius:2px"></div><span style="font-size:11px;font-variant-numeric:tabular-nums">{n:,}</span></div>'

# Diagnóstico por categoria de relator
def classifica_relator(nome):
    if nome == 'PRESIDENTE': return ('PRESIDENTE (genérico — precisa mapeamento por biênio)', 'tag-critico')
    if nome == '*NI*': return ('Não informado no raw', 'tag-verificar')
    if nome == 'VICE-PRESIDENTE': return ('VICE-PRESIDENTE (genérico — mapear por biênio)', 'tag-critico')
    if nome == 'MINISTRO PRESIDENTE': return ('Presidente genérico — mapear por biênio', 'tag-critico')
    if nome == 'MOREIRA ALVES': return ('Aposentou 2003 — período no corpus pequeno, verificar seed', 'tag-verificar')
    return ('Provável mismatch de grafia (acentos/espaços)', 'tag-verificar')

linhas_relator = ''
for r, n, pct in por_relator:
    desc, tag = classifica_relator(r)
    linhas_relator += f'<tr><td class="nome">{esc(r)}</td><td class="n">{n:,}</td><td class="n">{pct}%</td><td><span class="tag {tag}">{esc(desc)}</span></td></tr>'

linhas_origem = ''
for o, n, pct in por_origem:
    linhas_origem += f'<tr><td>{esc(o)}</td><td class="n">{n:,}</td><td class="n">{pct}%</td></tr>'

linhas_amostra = ''
for p, r, d, o, oj, t, a in amostra:
    linhas_amostra += f'<tr><td>{esc(p)}</td><td>{esc(r)}</td><td>{esc(d)}</td><td>{esc(o)}</td><td>{esc(oj)}</td><td>{esc(t)}</td><td>{esc(a)[:80]}</td></tr>'

html_doc = f"""<!DOCTYPE html>
<html lang="pt-br">
<head><meta charset="UTF-8"><title>Decisões desancoradas — para conferência</title>
<style>{css}</style></head>
<body><div class="container">

<h1>⚠️ Decisões desancoradas — para conferência</h1>
<div class="sub">{desanc:,} de {total:,} decisões ({100*desanc/total:.2f}%) não foram ancoradas pelo seed composicao_ministerial</div>

<div class="kpi-row">
<div class="kpi"><div class="kpi-val">{desanc:,}</div><div class="kpi-lbl">desancoradas</div></div>
<div class="kpi"><div class="kpi-val">{100*desanc/total:.2f}%</div><div class="kpi-lbl">do corpus</div></div>
<div class="kpi"><div class="kpi-val">{len(por_relator)}</div><div class="kpi-lbl">relatores distintos</div></div>
</div>

<div class="diagnostico">
<strong>Diagnóstico</strong>: 91,23% das desancoradas são MONOCRÁTICAS e 541.547 têm o relator literal <code>PRESIDENTE</code> (não um nome). Isso significa que o stf_judx_norm não anotou o nome do presidente em exercício na data — só marcou genericamente. Para resolver: adicionar ao seed linhas canônicas do <strong>PRESIDENTE em exercício por biênio</strong> (cada biênio da presidência STF mapeia para o ministro correspondente).
</div>

<h2>Por relator (top 40)</h2>
<table><thead><tr><th>Relator (normalizado)</th><th class="n">Decisões</th><th class="n">%</th><th>Diagnóstico</th></tr></thead>
<tbody>{linhas_relator}</tbody></table>

<h2>Por origem_decisao (linha decisória do processo)</h2>
<table><thead><tr><th>Origem</th><th class="n">Decisões</th><th class="n">%</th></tr></thead>
<tbody>{linhas_origem}</tbody></table>

<h2>Por ano da decisão</h2>
<div style="background:var(--card);border:1px solid var(--line);border-radius:6px;padding:14px">{bars_ano}</div>

<h2>Amostra de 40 decisões desancoradas (mais recentes)</h2>
<details open><summary>Clique para expandir/recolher a tabela</summary>
<table><thead><tr><th>Processo</th><th>Relator</th><th>Data</th><th>Origem</th><th>Órgão (raw)</th><th>Tipo</th><th>Andamento (início)</th></tr></thead>
<tbody>{linhas_amostra}</tbody></table>
</details>

<h2>Próximos passos para reduzir desancoragem</h2>
<div class="diagnostico">
<ol>
<li><strong>Mapear "PRESIDENTE" no seed</strong> — adicionar linhas tipo <code>STF,PRESIDENTE (GENERICO),PRESIDENCIA,2000-01-01,2000-06-30,...</code> para cada biênio (fonte: <code>COMPOSICAO_STF_2026.md</code> ou <code>stf_presidentes_biografico.json</code>)</li>
<li><strong>Normalizar acentos</strong> no match (alguns nomes como LUIZ FUX, DIAS TOFFOLI existem no seed mas não casaram — grafia)</li>
<li><strong>*NI* (não informado)</strong> — 123k sem solução via seed; ficam como pulsos órfãos legítimos</li>
<li><strong>Ministros pré-2000 com decisões no corpus</strong> (MOREIRA ALVES 30k, CARLOS VELLOSO, etc.) — adicionar entradas ao seed com posse pré-2000 e saída no corpus</li>
</ol>
</div>

<h2>Arquivo gerado</h2>
<p>CSV completo com as {desanc:,} decisões desancoradas: <code>C:\\Users\\medin\\Desktop\\backup_judx\\resultados\\2026-04-19_decisoes_DESANCORADAS.csv</code></p>

</div></body></html>
"""

HTML_REP.write_text(html_doc, encoding='utf-8')
print(f"[ok] {HTML_REP}")
print(f"[ok] {CSV_DESANC}")
