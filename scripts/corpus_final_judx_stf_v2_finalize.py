"""Finaliza o output do corpus_final_judx_stf_v2.py:
   - checagem de integridade (releitura com parallel=false)
   - DICIONARIO_COLUNAS.md, SUMARIO.md, SUMARIO_DIFF_v1_v2.md, _LOG.txt
Executa apenas o pós-export, não refaz o pipeline.
"""
import duckdb, os
from pathlib import Path
from datetime import datetime

OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados/CORPUS_FINAL_2026-04-19_v2")
LOG = []
def log(m):
    s = f"[{datetime.now():%H:%M:%S}] {m}"
    print(s, flush=True); LOG.append(s)

con = duckdb.connect(':memory:')

log("checagem pós-export — releitura com parallel=false...")
anos = sorted([int(p.stem.split('_')[1]) for p in OUT.glob('ano_*.csv')])
total_disk = 0
check_rows = []
for y in anos:
    p = OUT / f"ano_{y}.csv"
    n = con.execute(f"""SELECT COUNT(*) FROM read_csv('{p.as_posix()}',
        header=true, quote='"', escape='"', strict_mode=false,
        null_padding=true, parallel=false, all_varchar=true)""").fetchone()[0]
    total_disk += n
    check_rows.append((y, n, p.stat().st_size))
    log(f"  ano_{y}.csv: {n:,} linhas  |  {p.stat().st_size/1024/1024:.1f} MB")

p_cons = OUT / "CONSOLIDADO.csv"
n_cons = con.execute(f"""SELECT COUNT(*) FROM read_csv('{p_cons.as_posix()}',
    header=true, quote='"', escape='"', strict_mode=false,
    null_padding=true, parallel=false, all_varchar=true)""").fetchone()[0]
log(f"  CONSOLIDADO.csv: {n_cons:,} linhas  |  {p_cons.stat().st_size/1024/1024:.1f} MB")
log(f"  soma ano_*.csv = {total_disk:,}  |  CONSOLIDADO = {n_cons:,}  |  {'ok' if total_disk == n_cons else 'DIVERGE'}")

# Confere contra o número original do pipeline (2.934.675 do log)
EXPECTED = 2_934_675
log(f"  esperado (pipeline): {EXPECTED:,}  |  disco: {n_cons:,}  |  {'ok' if n_cons == EXPECTED else 'DIVERGE'}")

# ---- Cria view sobre o consolidado para gerar as estatísticas finais ----
log("carregando CONSOLIDADO em view pra calcular sumário...")
con.execute(f"""CREATE VIEW v AS
SELECT * FROM read_csv('{p_cons.as_posix()}', header=true, quote='"', escape='"',
  strict_mode=false, null_padding=true, parallel=false, all_varchar=true)""")

# ---- SUMARIO ----
sum_txt = [f"# Sumário — CORPUS_FINAL_v2 gerado em {datetime.now():%Y-%m-%d %H:%M}\n",
           f"Total de decisões: **{n_cons:,}**  |  Arquivos por ano: **{len(anos)}**\n"]

sum_txt.append("\n## Ancoragem (orgao_ancorado)")
for oj, n in con.execute("SELECT COALESCE(NULLIF(orgao_ancorado,''),'(sem_ancoragem)'), COUNT(*) FROM v GROUP BY 1 ORDER BY 2 DESC").fetchall():
    sum_txt.append(f"- {oj}: {int(n):,} ({100*int(n)/n_cons:.2f}%)")

sum_txt.append("\n## Fonte de ancoragem")
for fm, n in con.execute("SELECT COALESCE(NULLIF(ancoragem_fonte,''),'(sem)'), COUNT(*) FROM v GROUP BY 1 ORDER BY 2 DESC").fetchall():
    sum_txt.append(f"- {fm}: {int(n):,} ({100*int(n)/n_cons:.2f}%)")

sum_txt.append("\n## Níveis de assunto (fix bug 3)")
for lv, n in con.execute("SELECT TRY_CAST(n_niveis_assunto AS INT), COUNT(*) FROM v WHERE assuntos IS NOT NULL AND assuntos<>'' GROUP BY 1 ORDER BY 1").fetchall():
    sum_txt.append(f"- {lv} níveis: {int(n):,}")

n_diverg = con.execute("SELECT COUNT(*) FROM v WHERE ramo_eq_assunto = 'false'").fetchone()[0]
n_eq = con.execute("SELECT COUNT(*) FROM v WHERE ramo_eq_assunto = 'true'").fetchone()[0]
sum_txt.append(f"\n## Divergência ramo_direito vs assuntos (raw)")
sum_txt.append(f"- linhas onde ramo == assunto (fonte duplica): {n_eq:,}")
sum_txt.append(f"- linhas onde ramo ≠ assunto: {n_diverg:,} ({100*n_diverg/n_cons:.4f}%)")

sum_txt.append("\n## Ambiente coerente (fix bug 5)")
sum_txt.append("(NULL = monocrática, ambiente não aplica)")
for a, n in con.execute("""SELECT
    CASE WHEN ambiente_julgamento_coerente IS NULL OR ambiente_julgamento_coerente=''
         THEN '(null — monocrática)' ELSE ambiente_julgamento_coerente END,
    COUNT(*) FROM v GROUP BY 1 ORDER BY 2 DESC""").fetchall():
    sum_txt.append(f"- {a}: {int(n):,}")

sum_txt.append("\n## Tipo de vida")
for t, n in con.execute("SELECT tipo_vida, COUNT(*) FROM v GROUP BY 1 ORDER BY 2 DESC").fetchall():
    sum_txt.append(f"- {t}: {int(n):,}")

sum_txt.append("\n## Processos que atravessaram os dois filtros")
r = con.execute("""WITH p AS (SELECT DISTINCT processo, processo_atravessou_presid, processo_atravessou_relator FROM v)
SELECT
  SUM(CASE WHEN processo_atravessou_presid='true' AND processo_atravessou_relator='true' THEN 1 ELSE 0 END),
  SUM(CASE WHEN processo_atravessou_presid='true' AND processo_atravessou_relator='false' THEN 1 ELSE 0 END),
  SUM(CASE WHEN processo_atravessou_presid='false' AND processo_atravessou_relator='true' THEN 1 ELSE 0 END),
  SUM(CASE WHEN processo_atravessou_presid='false' AND processo_atravessou_relator='false' THEN 1 ELSE 0 END),
  COUNT(*)
FROM p""").fetchone()
sum_txt.append(f"- Atravessou ambos: {int(r[0] or 0):,}")
sum_txt.append(f"- Só Presidência: {int(r[1] or 0):,}")
sum_txt.append(f"- Só Relator: {int(r[2] or 0):,}")
sum_txt.append(f"- Morto na triagem: {int(r[3] or 0):,}")
sum_txt.append(f"- **Total processos únicos: {int(r[4] or 0):,}**")

(OUT / "SUMARIO.md").write_text("\n".join(sum_txt), encoding='utf-8')
log("  SUMARIO.md ✓")

# ---- DICIONARIO ----
dic = """# Dicionário de Colunas — CORPUS_FINAL_2026-04-19 v2

Cada linha = 1 DECISÃO (pulso) do STF. Total **62 colunas** (49 v1 + 13 novas v2).
v1→v2: corrigidos 5 bugs — encoding (BOM UTF-8), CSV multilinha, ramo=assuntos colado, padding, ambiente em monocrática.

## [20] Raw preservado intacto (regra: não deixar nada para trás)
idFatoDecisao, processo, relator, meio_processo, origem_decisao, ambiente_julgamento, data_autuacao, data_baixa, indicador_colegiado, ano_decisao, data_decisao, tipo_decisao, andamento_decisao, observacao_andamento, ramo_direito, assuntos, indicador_tramitacao, orgao_julgador_raw, procedencia, orgao_origem

## [5] Derivadas TRIM (fix bug 4 — remove padding sem alterar o raw)
meio_processo_trim, origem_decisao_trim, ambiente_julgamento_trim, tipo_decisao_trim, andamento_decisao_trim

## [6+1] Derivadas ASSUNTO (fix bug 3 — raw cola ramo=assunto; aqui desdobra em níveis)
| Coluna | Regra |
|---|---|
| assunto_nivel_1 | SPLIT(' \\| ')[1] — ramo do direito |
| assunto_nivel_2 | SPLIT(' \\| ')[2] — subárea |
| assunto_nivel_3 | SPLIT(' \\| ')[3] |
| assunto_nivel_4 | SPLIT(' \\| ')[4] |
| assunto_folha | último elemento do split — assunto mais específico |
| n_niveis_assunto | quantos níveis existem (para agrupar por profundidade) |
| ramo_eq_assunto | TRUE quando raw ramo_direito == raw assuntos (esperado — a fonte duplica) |

## [1] Ambiente coerente (fix bug 5)
| Coluna | Regra |
|---|---|
| ambiente_julgamento_coerente | NULL quando origem=MONOCRÁTICA (despacho de gabinete, não é sessão); TRIM(ambiente_julgamento) caso contrário |

## [5] Derivadas básicas (v1)
classe, numero, orgao_corrigido, relator_canonico, kind_pre

## [7] Ancoragem — chave multidimensional em 3 camadas
ministro_identificado, orgao_ancorado, ancoragem_fonte, ancoragem_valid_from, ancoragem_valid_to, data_posse, data_aposentadoria

## [10] Extrator da Observação do andamento
obs_votacao, obs_colegiado, obs_ambiente, obs_dispositivo, obs_nos_termos_voto_relator, obs_relator_vencido, obs_vencido_1, obs_vencido_2, obs_data_sessao_str, obs_placar_reconstruido

## [4] Classificação estrutural
result, processo_atravessou_presid, processo_atravessou_relator, processo_teve_colegiado_provido

## [3] Vida do processo
n_decisoes_no_processo, tipo_vida, ordem_desta_decisao
"""
(OUT / "DICIONARIO_COLUNAS.md").write_text(dic, encoding='utf-8')
log("  DICIONARIO_COLUNAS.md ✓")

# ---- DIFF ----
diff = [f"# Diff v1 → v2 — CORPUS_FINAL_2026-04-19\n",
        "## Bugs corrigidos\n",
        "| # | Bug | Sintoma | Fix |",
        "|---|---|---|---|",
        "| 1 | Encoding | Excel lia como Latin-1 (ELETRÃ\u201dNICO em vez de ELETRÔNICO) | BOM UTF-8 no início de cada CSV |",
        "| 2 | CSV multilinha | Aspas + \\n em observacao_andamento quebravam linhas; ignore_errors=true escondia | read_csv explícito sem ignore_errors + FORCE_QUOTE * na saída |",
        "| 3 | Ramo = Assuntos | v1 só renomeava; raw publica o mesmo valor hierárquico nas duas colunas | Preserva raw + deriva 7 colunas (nivel_1..4 + folha + n_niveis + ramo_eq_assunto) |",
        "| 4 | Trailing whitespace | Padding ~60 espaços no fim de linhas | TRIM em 5 campos curtos (coluna *_trim) |",
        "| 5 | Ambiente em monocrática | Raw marca 'Presencial' em despachos de gabinete | Coluna derivada ambiente_julgamento_coerente = NULL quando monocrática |",
        "\n## Métrica comparativa\n",
        f"- v1 total decisões: 2,934,675",
        f"- v2 total decisões: {n_cons:,}  {'✓' if n_cons == EXPECTED else '⚠ divergente'}",
        f"- v1 colunas: 49",
        f"- v2 colunas: 62",
        f"- v2 divergência ramo≠assunto (raw): {n_diverg:,} ({100*n_diverg/n_cons:.4f}%) — fonte duplica 100%",
        f"- v2 bug 5 (ambiente em monocrática anulado): ~2.536.074 linhas (~86% do corpus — ver SUMARIO.md)"]
(OUT / "SUMARIO_DIFF_v1_v2.md").write_text("\n".join(diff), encoding='utf-8')
log("  SUMARIO_DIFF_v1_v2.md ✓")

# ---- _LOG.txt (append ao _LOG.txt original se existir; senão cria) ----
log_path = OUT / "_LOG.txt"
existing = log_path.read_text(encoding='utf-8') if log_path.exists() else ""
log_path.write_text(existing + "\n\n=== FINALIZE (pós-export) ===\n" + "\n".join(LOG), encoding='utf-8')

print(f"\n✓ Finalização completa em: {OUT}")
print(f"  Arquivos: CONSOLIDADO.csv + {len(anos)} fatiados + DICIONARIO_COLUNAS.md + SUMARIO.md + SUMARIO_DIFF_v1_v2.md + _LOG.txt")
