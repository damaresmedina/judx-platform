"""Identifica a virada do perfil da Presidência STF ao longo do tempo.

Fonte: stf_judx_norm.csv (canônica). O campo orgao_julgador agrupou PRESIDÊNCIA em MONOCRÁTICA,
mas dá pra DERIVAR PRESIDÊNCIA de dentro do próprio arquivo via sinais:
  - relator = 'MINISTRO PRESIDENTE' → PRESIDÊNCIA
  - andamento_decisao ILIKE 'DECISÃO DA PRESIDÊNCIA%' → PRESIDÊNCIA

Método:
1. Derivar orgao_julgador_corrigido (desfaz o agrupamento)
2. Série temporal anual
3. Razão PRESIDÊNCIA / (MONOCRÁTICA + PRESIDÊNCIA) — virada institucional
4. Pontos de inflexão
"""
import duckdb
from pathlib import Path

SRC = "C:/Users/medin/Desktop/backup_judx/resultados/stf_judx_norm.csv"
OUT_DIR = Path("C:/Users/medin/Desktop/backup_judx/resultados")
OUT_CSV = OUT_DIR / "2026-04-19_perfil_presidencia_anual.csv"
OUT_HTML = OUT_DIR / "DASHBOARD_PERFIL_PRESIDENCIA.html"

con = duckdb.connect(':memory:')
print("[load] stf_judx_norm.csv...", flush=True)
con.execute(f"CREATE TABLE m AS SELECT * FROM read_csv_auto('{SRC}', header=true, sample_size=100000, ignore_errors=true);")
n = con.execute("SELECT COUNT(*) FROM m").fetchone()[0]
print(f"  {n:,} linhas", flush=True)

# Derivação: desfaz o agrupamento PRESIDÊNCIA↔MONOCRÁTICA
print("\n[derivar] orgao_julgador_corrigido a partir de sinais internos...", flush=True)
con.execute("""
CREATE TABLE m2 AS
SELECT *,
  CASE
    WHEN orgao_julgador = 'MONOCRÁTICA' AND (
           UPPER(relator) LIKE '%MINISTRO PRESIDENTE%'
        OR UPPER(relator) LIKE 'PRESIDENTE%'
        OR UPPER(andamento_decisao) LIKE 'DECISÃO DA PRESIDÊNCIA%'
        OR UPPER(andamento_decisao) LIKE 'DESPACHO DA PRESIDÊNCIA%'
    ) THEN 'PRESIDÊNCIA'
    ELSE orgao_julgador
  END AS orgao_julgador_corrigido
FROM m
""")

# Distribuição derivada
print("=== orgao_julgador_corrigido (após desfazer agrupamento) ===", flush=True)
for r in con.execute("SELECT orgao_julgador_corrigido, COUNT(*) n, ROUND(100.0*COUNT(*)/(SELECT COUNT(*) FROM m2),2) pct FROM m2 GROUP BY 1 ORDER BY n DESC").fetchall():
    print(f"  {r[0]:30s} {r[1]:>10,}  ({r[2]:>5.2f}%)", flush=True)

# Série anual (CTE com nome não-reservado)
print("\n[export] série anual...", flush=True)
con.execute(f"""
CREATE TABLE serie AS
WITH base AS (
  SELECT ano_decisao AS ano, orgao_julgador_corrigido AS oj, COUNT(*) AS n
  FROM m2
  WHERE ano_decisao IS NOT NULL
  GROUP BY ano_decisao, orgao_julgador_corrigido
),
pvt AS (
  SELECT ano,
    SUM(CASE WHEN oj='MONOCRÁTICA' THEN n ELSE 0 END) AS monocratica,
    SUM(CASE WHEN oj='PRESIDÊNCIA' THEN n ELSE 0 END) AS presidencia,
    SUM(CASE WHEN oj='1ª TURMA' THEN n ELSE 0 END) AS turma_1,
    SUM(CASE WHEN oj='2ª TURMA' THEN n ELSE 0 END) AS turma_2,
    SUM(CASE WHEN oj='TRIBUNAL PLENO' THEN n ELSE 0 END) AS pleno,
    SUM(CASE WHEN oj='PLENÁRIO VIRTUAL - RG' THEN n ELSE 0 END) AS pleno_virt_rg,
    SUM(n) AS total
  FROM base GROUP BY ano
)
SELECT ano, total, monocratica, presidencia, turma_1, turma_2, pleno, pleno_virt_rg,
  ROUND(100.0*presidencia/NULLIF(monocratica+presidencia,0),2) AS pct_presidencia_na_triagem,
  ROUND(100.0*presidencia/NULLIF(total,0),2) AS pct_presidencia_total,
  ROUND(100.0*(monocratica+presidencia)/NULLIF(total,0),2) AS pct_nao_colegiado,
  ROUND(100.0*(turma_1+turma_2+pleno+pleno_virt_rg)/NULLIF(total,0),2) AS pct_colegiado
FROM pvt ORDER BY ano
""")
con.execute(f"COPY serie TO '{OUT_CSV}' (HEADER, DELIMITER ',');")

# Exibir série
print(f"\n=== SÉRIE ANUAL — orgao_julgador_corrigido ===", flush=True)
print(f"  {'Ano':<5} {'Total':>10} {'Monoc':>10} {'Presid':>10} {'%Pres/Triag':>12} {'T1':>8} {'T2':>8} {'Pleno':>8}", flush=True)
for r in con.execute("SELECT ano,total,monocratica,presidencia,pct_presidencia_na_triagem,turma_1,turma_2,pleno FROM serie ORDER BY ano").fetchall():
    ano,tot,mon,pres,pct,t1,t2,pl = r
    print(f"  {ano:<5} {tot:>10,} {mon:>10,} {pres:>10,} {pct or 0:>11.2f}% {t1:>8,} {t2:>8,} {pl:>8,}", flush=True)

# Pontos de inflexão
print("\n=== PONTOS DE INFLEXÃO (top 10 por variação anual da %Pres/Triag) ===", flush=True)
for ano, pct, pct_ant, delta in con.execute("""
  WITH c AS (
    SELECT ano, pct_presidencia_na_triagem AS pct,
           LAG(pct_presidencia_na_triagem) OVER (ORDER BY ano) AS pct_ant
    FROM serie
  )
  SELECT ano, pct, pct_ant, (pct-pct_ant) AS delta
  FROM c WHERE pct_ant IS NOT NULL
  ORDER BY ABS(pct-pct_ant) DESC LIMIT 10
""").fetchall():
    direcao = '⬆' if delta > 0 else '⬇'
    print(f"  {ano}: {pct_ant:.2f}% → {pct:.2f}%  ({direcao} {delta:+.2f} p.p.)", flush=True)

# Presidente em exercício por ano (pelo relator quando orgao_julgador_corrigido=PRESIDÊNCIA)
print("\n=== Presidente dominante por ano (quem mais assinou decisões da Presidência) ===", flush=True)
for ano, rel, n in con.execute("""
  SELECT ano_decisao, relator, COUNT(*) n
  FROM m2
  WHERE orgao_julgador_corrigido='PRESIDÊNCIA' AND ano_decisao IS NOT NULL
  GROUP BY ano_decisao, relator
  QUALIFY ROW_NUMBER() OVER (PARTITION BY ano_decisao ORDER BY COUNT(*) DESC) = 1
  ORDER BY ano_decisao
""").fetchall():
    print(f"  {ano}: {(rel or '(vazio)')[:40]:40s} ({n:,})", flush=True)

# HTML
dados = con.execute("SELECT * FROM serie ORDER BY ano").fetchall()
cols = [d[0] for d in con.execute("DESCRIBE serie").fetchall()]
max_pct = max((r[cols.index('pct_presidencia_na_triagem')] or 0) for r in dados) or 100

linhas = ''
for r in dados:
    d = dict(zip(cols, r))
    bw = (d['pct_presidencia_na_triagem'] or 0)/max_pct*100
    linhas += (f"<tr><td><strong>{d['ano']}</strong></td>"
               f"<td class='n'>{d['total'] or 0:,}</td>"
               f"<td class='n'>{d['monocratica'] or 0:,}</td>"
               f"<td class='n' style='color:#d29922'><strong>{d['presidencia'] or 0:,}</strong></td>"
               f"<td class='n'>{d['turma_1'] or 0:,}</td>"
               f"<td class='n'>{d['turma_2'] or 0:,}</td>"
               f"<td class='n'>{d['pleno'] or 0:,}</td>"
               f"<td class='n'>{d['pct_presidencia_na_triagem'] or 0:.2f}%</td>"
               f"<td><div style='background:#d29922;height:14px;width:{bw:.0f}%;min-width:2px;border-radius:2px'></div></td>"
               f"</tr>")

html_doc = f"""<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8"><title>Perfil da Presidência STF — série temporal</title>
<style>
:root{{--bg:#0d1117;--card:#161b22;--text:#e6edf3;--muted:#8b949e;--brand:#58a6ff;--warn:#d29922;--line:#30363d}}
*{{box-sizing:border-box}}body{{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:24px;line-height:1.5}}
.container{{max-width:1400px;margin:0 auto}}h1{{margin:0;font-size:24px;color:var(--brand)}}
.sub{{color:var(--muted);font-size:13px;margin-top:4px;margin-bottom:20px}}
table{{width:100%;border-collapse:collapse;font-size:12px;background:var(--card);border:1px solid var(--line);border-radius:6px;overflow:hidden}}
th,td{{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line)}}
th{{color:var(--muted);font-size:11px;text-transform:uppercase;background:#0f141a}}
td.n{{text-align:right;font-variant-numeric:tabular-nums}}tr:hover td{{background:#1c2128}}
.aviso{{background:rgba(210,153,34,.1);border-left:3px solid var(--warn);padding:12px 16px;border-radius:4px;margin-bottom:16px;font-size:13px}}
</style></head><body><div class="container">
<h1>Perfil da Presidência STF — Série temporal</h1>
<div class="sub">Fonte: stf_judx_norm.csv ({n:,} decisões) · PRESIDÊNCIA derivada de sinais internos (relator='MINISTRO PRESIDENTE' OU andamento_decisao começa com 'DECISÃO DA PRESIDÊNCIA')</div>
<div class="aviso">
<strong>Pergunta empírica</strong>: em que ano(s) a Presidência deixou de ser <em>distribuidora</em> (onde o relator decidia)
e passou a <em>filtrar/inadmitir em massa</em>? A razão <strong>%Pres/Triag</strong> = PRESIDÊNCIA ÷ (MONOCRÁTICA + PRESIDÊNCIA)
mostra quanto da triagem é formalmente feita pela Presidência vs deixada ao relator.
</div>
<table><thead><tr>
<th>Ano</th><th class="n">Total</th><th class="n">Monocrática</th><th class="n">Presidência</th>
<th class="n">T1</th><th class="n">T2</th><th class="n">Pleno</th>
<th class="n">%Pres/Triag</th><th>Barra</th>
</tr></thead><tbody>{linhas}</tbody></table>
</div></body></html>"""
OUT_HTML.write_text(html_doc, encoding='utf-8')
con.close()
print(f"\n[ok] {OUT_CSV}")
print(f"[ok] {OUT_HTML}")
