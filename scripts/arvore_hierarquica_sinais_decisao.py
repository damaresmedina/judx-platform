"""Árvore hierárquica dos sinais decisórios em AI/ARE/RE (STF, ≥2000).

Estrutura (do mais geral para o mais específico):
  Nível 1: Tipo decisão        (ex: Decisão Final, Decisão em recurso interno)
  Nível 2: Andamento decisão   (ex: Negado seguimento, Agravo regimental não provido)
  Nível 3: Observação do andamento (ex: placar 3x2, unanimidade, voto vencido)

Saídas:
  - CSV plano: 2026-04-19_arvore_tipo_andamento_obs.csv (cada nó com n e %)
  - HTML navegável: DASHBOARD_ARVORE_SINAIS.html (dobra/desdobra nós)
  - Amostras de 'Observação do andamento' com regex para placar e unanimidade

Princípio: nenhum sinal é classificado por heurística do Claude. Apenas mapeado.
A classificação (quem ultrapassou filtro, quem foi provido etc.) vem em passo 2,
com regras explícitas construídas sobre a árvore real.
"""
import duckdb, html, re
from pathlib import Path

ROOT = Path("C:/stf/stf_decisoes_fatias")
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados")
DATA = "2026-04-19"

con = duckdb.connect(':memory:')

print("[load] stf_decisoes_fatias/ (26 CSVs + 1 XLSX)...", flush=True)
con.execute(f"""
CREATE TABLE raw AS
SELECT * FROM read_csv_auto('{ROOT.as_posix()}/decisoes_*.csv',
  header=true, sample_size=100000, ignore_errors=true, union_by_name=true);
""")
n_csv = con.execute("SELECT COUNT(*) FROM raw").fetchone()[0]
try:
    con.execute(f"INSERT INTO raw BY NAME SELECT * FROM read_xlsx('{ROOT.as_posix()}/decisoes_2026.xlsx');")
except Exception as e:
    print(f"  [aviso] xlsx: {e}", flush=True)
n_tot = con.execute("SELECT COUNT(*) FROM raw").fetchone()[0]
print(f"  total: {n_tot:,} decisões ({n_csv:,} dos CSVs)", flush=True)

# Filtra AI/ARE/RE ≥2000 (corpus operacional — decisão #27)
con.execute("""
CREATE TABLE f AS
SELECT *,
  regexp_extract("Processo", '^(\\S+)\\s+(.+)$', 1) AS classe,
  CASE
    WHEN "Órgão julgador"='MONOCRÁTICA' AND (
      UPPER("Relator atual") LIKE '%MINISTRO PRESIDENTE%'
      OR UPPER("Relator atual") LIKE 'PRESIDENTE%'
      OR UPPER("Andamento decisão") LIKE 'DECISÃO DA PRESIDÊNCIA%'
      OR UPPER("Andamento decisão") LIKE 'DESPACHO DA PRESIDÊNCIA%'
    ) THEN 'PRESIDÊNCIA'
    ELSE "Órgão julgador"
  END AS orgao_corrigido
FROM raw
WHERE "Ano da decisão" IS NOT NULL AND TRY_CAST("Ano da decisão" AS INT) >= 2000
  AND UPPER(regexp_extract("Processo", '^(\\S+)', 1)) IN ('AI','ARE','RE')
""")
n_f = con.execute("SELECT COUNT(*) FROM f").fetchone()[0]
print(f"  AI/ARE/RE ≥2000: {n_f:,}\n", flush=True)

# ============================================================
# ÁRVORE COMPLETA — Tipo × Andamento × Observação (agregado + ano a ano)
# ============================================================
print("[arvore] construindo Tipo → Andamento → Observação (agregado)...", flush=True)
out_csv = OUT / f"{DATA}_arvore_tipo_andamento_obs.csv"
con.execute(f"""
CREATE TABLE arvore AS
SELECT
  "Tipo decisão" AS tipo,
  "Andamento decisão" AS andamento,
  "Observação do andamento" AS observacao,
  COUNT(*) AS n
FROM f
GROUP BY 1,2,3
""")
con.execute(f"COPY arvore TO '{out_csv.as_posix()}' (HEADER, DELIMITER ',');")
n_nos = con.execute("SELECT COUNT(*) FROM arvore").fetchone()[0]
print(f"  {n_nos:,} combinações únicas Tipo×Andamento×Observação", flush=True)

# Ano a ano — duas granularidades (com e sem observação)
print("[arvore] construindo ano a ano (Tipo×Andamento×Ano)...", flush=True)
out_csv_ano = OUT / f"{DATA}_arvore_ano_tipo_andamento.csv"
con.execute(f"""
CREATE TABLE arvore_ano AS
SELECT
  TRY_CAST("Ano da decisão" AS INT) AS ano,
  classe,
  "Tipo decisão" AS tipo,
  "Andamento decisão" AS andamento,
  orgao_corrigido AS orgao,
  COUNT(*) AS n
FROM f
GROUP BY 1,2,3,4,5
""")
con.execute(f"COPY arvore_ano TO '{out_csv_ano.as_posix()}' (HEADER, DELIMITER ',');")
n_ano = con.execute("SELECT COUNT(*) FROM arvore_ano").fetchone()[0]
print(f"  {n_ano:,} combinações Ano×Classe×Tipo×Andamento×Órgão", flush=True)

# Ano a ano FINO (com observação — para placares por ano)
print("[arvore] construindo ano a ano FINO (Tipo×Andamento×Obs×Ano)...", flush=True)
out_csv_ano_fino = OUT / f"{DATA}_arvore_ano_tipo_andamento_obs.csv"
con.execute(f"""
COPY (
  SELECT
    TRY_CAST("Ano da decisão" AS INT) AS ano,
    classe,
    "Tipo decisão" AS tipo,
    "Andamento decisão" AS andamento,
    "Observação do andamento" AS observacao,
    orgao_corrigido AS orgao,
    COUNT(*) AS n
  FROM f
  GROUP BY 1,2,3,4,5,6
) TO '{out_csv_ano_fino.as_posix()}' (HEADER, DELIMITER ',');
""")
print(f"  [ok] ano×classe×tipo×andamento×obs×órgão → {out_csv_ano_fino.name}", flush=True)

# Nível 1: Tipo
print("\n=== NÍVEL 1 — Tipo decisão ===", flush=True)
lvl1 = con.execute(f"""
  SELECT tipo, SUM(n) AS total, ROUND(100.0*SUM(n)/{n_f},2) AS pct
  FROM arvore GROUP BY 1 ORDER BY total DESC
""").fetchall()
for t, n, pct in lvl1:
    print(f"  {(t or '-'):<32s} {n:>10,}  {pct:>5.2f}%", flush=True)

# Nível 2: top Tipo × Andamento
print("\n=== NÍVEL 2 — Tipo × Andamento (top 40) ===", flush=True)
for r in con.execute("""
  SELECT tipo, andamento, SUM(n) AS total
  FROM arvore GROUP BY 1,2 ORDER BY total DESC LIMIT 40
""").fetchall():
    t, a, n = r
    print(f"  {(t or '-'):<30s} | {(a or '-')[:45]:<45s} {n:>10,}", flush=True)

# Nível 3: amostra de Observação para os andamentos mais frequentes
print("\n=== NÍVEL 3 — Amostra de Observação para top andamentos ===", flush=True)
top_andamentos = [r[1] for r in con.execute("""
  SELECT tipo, andamento, SUM(n) total FROM arvore WHERE andamento IS NOT NULL
  GROUP BY 1,2 ORDER BY total DESC LIMIT 10
""").fetchall()]
for and_ in top_andamentos:
    print(f"\n  Andamento: '{and_}'", flush=True)
    rows = con.execute(f"""
      SELECT observacao, SUM(n) n FROM arvore
      WHERE andamento = ? AND observacao IS NOT NULL
      GROUP BY 1 ORDER BY n DESC LIMIT 10
    """, [and_]).fetchall()
    for o, nn in rows:
        print(f"    {nn:>8,}  {(o or '')[:100]}", flush=True)

# ============================================================
# Análise específica da "Observação do andamento" — sinais extraíveis
# Extrair placar, unanimidade, voto vencido via regex
# ============================================================
print("\n[sinais] varrendo Observação do andamento por placar / unanimidade / voto vencido...", flush=True)

out_sinais = OUT / f"{DATA}_sinais_observacao.csv"
con.execute(f"""
CREATE TABLE sinais AS
SELECT
  TRY_CAST("Ano da decisão" AS INT) AS ano,
  classe,
  "Tipo decisão" AS tipo,
  "Andamento decisão" AS andamento,
  orgao_corrigido AS orgao,
  COUNT(*) AS total_decisoes,
  -- Sinais extraíveis da Observação
  SUM(CASE WHEN UPPER("Observação do andamento") LIKE '%UNANIM%' THEN 1 ELSE 0 END) AS n_unanime,
  SUM(CASE WHEN UPPER("Observação do andamento") LIKE '%MAIORIA%' THEN 1 ELSE 0 END) AS n_maioria,
  SUM(CASE WHEN UPPER("Observação do andamento") LIKE '%VOTO VENCIDO%' THEN 1 ELSE 0 END) AS n_voto_vencido,
  SUM(CASE WHEN UPPER("Observação do andamento") LIKE '%DIVERGÊNCIA%'
            OR UPPER("Observação do andamento") LIKE '%DIVERGIU%'
            THEN 1 ELSE 0 END) AS n_divergencia,
  SUM(CASE WHEN regexp_matches("Observação do andamento", '\\d+\\s*[xX×]\\s*\\d+') THEN 1 ELSE 0 END) AS n_tem_placar,
  SUM(CASE WHEN UPPER("Observação do andamento") LIKE '%NOS TERMOS DO VOTO%' THEN 1 ELSE 0 END) AS n_nos_termos_voto,
  SUM(CASE WHEN UPPER("Observação do andamento") LIKE '%VENCIDO%' THEN 1 ELSE 0 END) AS n_vencido
FROM f
GROUP BY 1,2,3,4,5
""")
con.execute(f"COPY sinais TO '{out_sinais.as_posix()}' (HEADER, DELIMITER ',');")

print("\n=== SINAIS — agregado geral (AI/ARE/RE) ===", flush=True)
for label, campo in [("unânime","n_unanime"),("maioria","n_maioria"),("voto vencido","n_voto_vencido"),
                     ("divergência","n_divergencia"),("placar nxn","n_tem_placar"),
                     ("'nos termos do voto'","n_nos_termos_voto"),("'vencido'","n_vencido")]:
    n = con.execute(f"SELECT SUM({campo}) FROM sinais").fetchone()[0] or 0
    pct = 100.0 * n / n_f if n_f else 0
    print(f"  {label:<22s} {n:>10,}  ({pct:>5.2f}%)", flush=True)

# Exemplos reais de placares detectados
print("\n=== EXEMPLOS — placares detectados (regex \\d+x\\d+) ===", flush=True)
for r in con.execute("""
  SELECT "Observação do andamento" obs, COUNT(*) n FROM f
  WHERE regexp_matches("Observação do andamento", '\\d+\\s*[xX×]\\s*\\d+')
  GROUP BY 1 ORDER BY n DESC LIMIT 15
""").fetchall():
    o, n = r
    print(f"  {n:>6,}  {(o or '')[:130]}", flush=True)

# ============================================================
# HTML NAVEGÁVEL — árvore dobrável
# ============================================================
print(f"\n[html] gerando dashboard navegável...", flush=True)

# Limita a 3 níveis visíveis, com top N por nó
lvl1_rows = con.execute(f"""
  SELECT tipo, SUM(n) AS total FROM arvore GROUP BY 1 ORDER BY total DESC
""").fetchall()

def esc(s): return html.escape(str(s) if s not in (None,'') else '(vazio)')

blocos = []
for tipo, tot1 in lvl1_rows:
    pct1 = 100.0 * tot1 / n_f
    lvl2 = con.execute("""
      SELECT andamento, SUM(n) t FROM arvore WHERE tipo IS NOT DISTINCT FROM ?
      GROUP BY 1 ORDER BY t DESC LIMIT 30
    """, [tipo]).fetchall()
    lvl2_html = ''
    for and_, tot2 in lvl2:
        pct2 = 100.0 * tot2 / tot1 if tot1 else 0
        lvl3 = con.execute("""
          SELECT observacao, SUM(n) t FROM arvore
          WHERE tipo IS NOT DISTINCT FROM ? AND andamento IS NOT DISTINCT FROM ?
          GROUP BY 1 ORDER BY t DESC LIMIT 20
        """, [tipo, and_]).fetchall()
        lvl3_html = ''.join(
            f'<li><span class="obs">{esc(o)[:200]}</span> <span class="n">{t:,}</span></li>'
            for o, t in lvl3
        )
        lvl2_html += (f'<li><details><summary>'
                      f'<span class="and">{esc(and_)}</span> '
                      f'<span class="n">{tot2:,}</span> '
                      f'<span class="pct">{pct2:.1f}%</span></summary>'
                      f'<ul class="lvl3">{lvl3_html}</ul></details></li>')
    blocos.append(f'<div class="tipo-card"><details open><summary class="tipo-h">'
                  f'<span class="tipo">{esc(tipo)}</span> '
                  f'<span class="n big">{tot1:,}</span> '
                  f'<span class="pct big">{pct1:.2f}%</span></summary>'
                  f'<ul class="lvl2">{lvl2_html}</ul></details></div>')

# Heatmap Andamento × Ano — construído em Python comum (sem lambdas dentro da f-string)
anos = [r[0] for r in con.execute("SELECT DISTINCT CAST(ano AS INT) FROM arvore_ano WHERE ano IS NOT NULL ORDER BY 1").fetchall()]
top_andamentos_hm = [r[0] for r in con.execute("""
  SELECT andamento, SUM(n) t FROM arvore_ano WHERE andamento IS NOT NULL
  GROUP BY 1 ORDER BY t DESC LIMIT 20
""").fetchall()]

linhas_hm = []
for and_ in top_andamentos_hm:
    pares = dict(con.execute("SELECT CAST(ano AS INT), SUM(n) FROM arvore_ano WHERE andamento=? GROUP BY 1", [and_]).fetchall())
    mv = max(pares.values()) if pares else 1
    cels = []
    for ano in anos:
        v = pares.get(ano, 0) or 0
        if v:
            op = min(0.9, v / mv) if mv else 0
            cels.append(f'<td style="padding:3px 6px;text-align:right;background:rgba(210,153,34,{op:.2f});font-variant-numeric:tabular-nums">{v:,}</td>')
        else:
            cels.append('<td style="padding:3px 6px;color:#30363d;text-align:right">·</td>')
    linhas_hm.append('<tr><td style="padding:3px 8px;max-width:320px">' + html.escape((and_ or '-')[:60]) + '</td>' + ''.join(cels) + '</tr>')

heatmap_html = (
    '<div style="overflow-x:auto"><table style="font-size:11px;border-collapse:collapse">'
    '<thead><tr><th style="text-align:left;padding:4px 8px;color:var(--muted)">Andamento</th>'
    + ''.join(f'<th style="padding:4px 6px;color:var(--muted)">{a}</th>' for a in anos)
    + '</tr></thead><tbody>' + ''.join(linhas_hm) + '</tbody></table></div>'
)

html_doc = f"""<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8">
<title>Árvore hierárquica — sinais decisórios (AI/ARE/RE STF ≥2000)</title>
<style>
:root{{--bg:#0d1117;--card:#161b22;--text:#e6edf3;--muted:#8b949e;--brand:#58a6ff;--warn:#d29922;--ok:#3fb950;--line:#30363d}}
*{{box-sizing:border-box}}body{{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:24px;line-height:1.5}}
.container{{max-width:1400px;margin:0 auto}}
h1{{margin:0;font-size:22px;color:var(--brand)}}
.sub{{color:var(--muted);font-size:13px;margin-top:4px;margin-bottom:16px}}
.tipo-card{{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:10px 14px;margin-bottom:12px}}
summary{{cursor:pointer;outline:none;padding:4px 0}}
summary:hover{{background:#1c2128;border-radius:3px}}
.tipo-h{{font-size:15px}}
.tipo{{font-weight:600;color:var(--brand)}}
.and{{color:var(--text)}}
.obs{{color:var(--muted);font-size:12px}}
.n{{color:var(--warn);font-variant-numeric:tabular-nums;margin-left:8px}}
.n.big{{font-size:16px;font-weight:600}}
.pct{{color:var(--muted);font-size:11px;margin-left:6px}}
.pct.big{{font-size:13px}}
ul{{list-style:none;padding-left:22px;margin:4px 0}}
ul.lvl3 li{{border-left:2px solid var(--line);padding:3px 8px;margin:2px 0;font-size:12px}}
ul.lvl2 > li{{margin:4px 0}}
.head-box{{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:12px 16px;margin-bottom:16px;font-size:13px}}
code{{background:#1c2128;padding:1px 5px;border-radius:3px;font-size:11px}}
</style></head><body><div class="container">
<h1>Árvore hierárquica — sinais decisórios do STF em AI/ARE/RE (≥2000)</h1>
<div class="sub">Fonte: stf_decisoes_fatias — {n_f:,} decisões em AI/ARE/RE de {n_tot:,} totais · Dobra para Tipo → Andamento → Observação</div>

<div class="head-box">
<strong>Como ler</strong>: cada nó mostra <code>volume</code> e <code>% dentro do pai</code>. Clique em um Tipo/Andamento para expandir. A <em>Observação do andamento</em> (nível 3) é onde moram os placares (ex: 3x2, unanimidade, voto vencido).
<br><br>
<strong>Sinais detectáveis via regex na Observação (agregado)</strong>:
<ul>
  <li>Unânime: {con.execute("SELECT SUM(n_unanime) FROM sinais").fetchone()[0] or 0:,}</li>
  <li>Maioria: {con.execute("SELECT SUM(n_maioria) FROM sinais").fetchone()[0] or 0:,}</li>
  <li>Voto vencido: {con.execute("SELECT SUM(n_voto_vencido) FROM sinais").fetchone()[0] or 0:,}</li>
  <li>Divergência: {con.execute("SELECT SUM(n_divergencia) FROM sinais").fetchone()[0] or 0:,}</li>
  <li>Placar numérico (NxN): {con.execute("SELECT SUM(n_tem_placar) FROM sinais").fetchone()[0] or 0:,}</li>
  <li>"Nos termos do voto": {con.execute("SELECT SUM(n_nos_termos_voto) FROM sinais").fetchone()[0] or 0:,}</li>
</ul>
</div>

{''.join(blocos)}

<h2 style="color:var(--brand);margin-top:30px">Heatmap ano a ano — Andamento × Ano (top 20 andamentos, AI/ARE/RE)</h2>
{heatmap_html}

</div></body></html>"""

out_html = OUT / "DASHBOARD_ARVORE_SINAIS.html"
out_html.write_text(html_doc, encoding='utf-8')

con.close()
print(f"\n[ok] CSV árvore: {out_csv}")
print(f"[ok] CSV sinais: {out_sinais}")
print(f"[ok] HTML: {out_html}")
