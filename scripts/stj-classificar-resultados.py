"""
stj-classificar-resultados.py -- classifica 3,39M docs STJ por resultado final.

Lê stj_datajud_core em chunks, extrai movimentos via regex (formato DuckDB-struct),
classifica cada movimento em categoria, agrega por processo (numero_cnj) e determina
resultado final via priorização por gravidade (mérito > não_conhec > prejudicado > desist).

Grava:
- G:/staging_local/stj_consolidado.duckdb :: stj_resultado_por_processo
- G:/staging_local/stj_resultado_por_processo.csv (amostra + sumário)
- G:/staging_local/stj_tese_sem_merito.md (sumário narrativo)
"""
import duckdb, re, sys, csv, time
from collections import Counter, defaultdict
from datetime import datetime

DB = 'G:/staging_local/stj_consolidado.duckdb'
OUT_CSV = 'G:/staging_local/stj_resultado_por_processo.csv'
OUT_MD = 'G:/staging_local/stj_tese_sem_merito.md'
CHUNK = 100_000

# Regex de movimentos top-level (formato DuckDB-struct)
PAT = re.compile(r"'codigo':\s*(\d+),\s*'nome':\s*(?:'([^']+)'|([^,]+?)),\s*'dataHora'")

def classificar(nome):
    n = nome.lower()
    # Trajeto (não decisório) -- ampliado com Disponibilização, Petição, Definitivo, Mandado
    if re.search(r'publica[cçs]|conclus|distribui|recebimento|remessa|document|expedi|protocolo|ato ordinat|mero expedi|inclus.o em pauta|^mandado|requisi|mudan|^liminar|redistri|^baixa|tr.nsito|devolu|retifica|disponibiliza|peti..o\b|defini[tç]', n):
        return 'nao_decisorio'
    if re.search(r'não conhec|nao conhec|inadmis|intempest|deserto', n):
        return 'nao_conhecimento'
    if re.search(r'prejudicad|perda de objeto', n):
        return 'prejudicado'
    if re.search(r'desist.ncia|ren.ncia|abandono|homologa', n):
        return 'desistencia'
    if re.search(r'extin.*(sem|resolu)', n):
        return 'extinto_sem_merito'
    if re.search(r'não.provim|nao.provim|desprovi|improvi|improced|indeferimento|negar provimento|nega.*provimento|não.acolh|nao.acolh|denega', n):
        return 'merito_desprovido'
    if re.search(r'provimento em parte|parcialmente provid|provid.*parcial|parcialment|procedent.*parcial', n):
        return 'merito_provido_parcial'
    if re.search(r'provimento|procedent|\bacolh|\bdeferi', n):
        return 'merito_provido'
    if re.search(r'conflito|exce..o|habeas corpus de of.cio|conhecimento', n):
        return 'outros_decisorios'
    return 'indefinido'

# Priorização por gravidade -- qual categoria prevalece por processo
# A ordem é: se processo tem categoria X, classifica como X (top-down)
PRIORIDADE = [
    'merito_provido',
    'merito_provido_parcial',
    'merito_desprovido',
    'nao_conhecimento',
    'extinto_sem_merito',
    'prejudicado',
    'desistencia',
    'outros_decisorios',
    'indefinido',
]

con = duckdb.connect(DB, read_only=True)
total = con.execute("SELECT COUNT(*) FROM stj_datajud_core").fetchone()[0]
print(f'[{datetime.now().isoformat(timespec="seconds")}] total docs STJ: {total:,}', flush=True)

t0 = time.time()
# Streaming read: processa chunk por chunk
cur = con.execute("SELECT numero_cnj, movimentos_json FROM stj_datajud_core WHERE movimentos_json IS NOT NULL")

proc_result = {}  # numero_cnj -> categoria_final
stats_cat = Counter()  # contagem de movimentos por categoria
processados = 0

while True:
    rows = cur.fetchmany(CHUNK)
    if not rows:
        break
    for cnj, j in rows:
        cats_encontradas = set()
        for m in PAT.finditer(j):
            nome = (m.group(2) or m.group(3) or '').strip()
            cat = classificar(nome)
            stats_cat[cat] += 1
            if cat != 'nao_decisorio':
                cats_encontradas.add(cat)
        # Escolhe a categoria final conforme prioridade
        categoria_final = None
        for p in PRIORIDADE:
            if p in cats_encontradas:
                categoria_final = p
                break
        if categoria_final is None:
            categoria_final = 'sem_pulso'
        proc_result[cnj] = categoria_final
    processados += len(rows)
    elapsed = time.time() - t0
    rate = processados/elapsed if elapsed else 0
    print(f'[{datetime.now().strftime("%H:%M:%S")}] +{len(rows):>7,} -> {processados:>9,}/{total:,} ({100*processados/total:.1f}%) -- {rate:.0f} docs/s', flush=True)

print(f'\n[FINAL] {processados:,} docs em {(time.time()-t0)/60:.1f} min', flush=True)

# Agrega resultados por processo
agg = Counter(proc_result.values())
print(f'\n=== resultado final por processo (n={len(proc_result):,}) ===', flush=True)
for cat, n in agg.most_common():
    pct = 100*n/len(proc_result)
    print(f'  {cat:30} {n:>10,} ({pct:5.2f}%)')

nao_merito = agg['nao_conhecimento'] + agg['prejudicado'] + agg['desistencia'] + agg['extinto_sem_merito'] + agg['sem_pulso']
merito = agg['merito_provido'] + agg['merito_provido_parcial'] + agg['merito_desprovido']
outros = agg['outros_decisorios'] + agg['indefinido']
total_proc = sum(agg.values())
print(f'\n=== TESE 90% sem mérito (por processo único) ===', flush=True)
print(f'  NÃO apreciou mérito: {nao_merito:>10,} ({100*nao_merito/total_proc:.2f}%)', flush=True)
print(f'  APRECIOU mérito:     {merito:>10,} ({100*merito/total_proc:.2f}%)', flush=True)
print(f'  outros/indef:        {outros:>10,} ({100*outros/total_proc:.2f}%)', flush=True)

# Salva tabela no DuckDB
print('\n[persist] gravando stj_resultado_por_processo...', flush=True)
con.close()
con = duckdb.connect(DB)
con.execute("CREATE OR REPLACE TABLE stj_resultado_por_processo (numero_cnj VARCHAR PRIMARY KEY, categoria_final VARCHAR, calculado_em TIMESTAMP)")
con.executemany(
    "INSERT INTO stj_resultado_por_processo VALUES (?, ?, current_timestamp)",
    [(cnj, cat) for cnj, cat in proc_result.items()]
)
con.commit()
print(f'  tabela gravada: {len(proc_result):,} rows', flush=True)

# Salva CSV sumário
with open(OUT_CSV, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f, delimiter=';')
    w.writerow(['categoria_final','processos','percentual'])
    for cat, n in agg.most_common():
        w.writerow([cat, n, f'{100*n/len(proc_result):.3f}'])

# Nota narrativa
with open(OUT_MD, 'w', encoding='utf-8') as f:
    f.write(f'''# STJ -- Taxa de Apreciação de Mérito (18/abr/2026)

**Corpus**: 3.379.100 processos STJ do Datajud (baixado em 18/abr/2026, `stj_datajud_core`).

**Método**: regex sobre `movimentos[]` de cada processo, classificação em 9 categorias via nome do movimento,
agregação por `numero_cnj` com priorização de gravidade (mérito apreciado prevalece sobre não-conhecimento,
que prevalece sobre trajeto puro).

## Distribuição por resultado final

| Categoria | Processos | % |
|---|---:|---:|
''')
    for cat, n in agg.most_common():
        f.write(f'| {cat} | {n:,} | {100*n/len(proc_result):.2f}% |\n')
    f.write(f'''

## Tese "STJ ~90% não aprecia mérito"

- **NÃO apreciou mérito** (não_conhec + prejudicado + desistência + extinto_sem_merito + sem pulso): **{nao_merito:,} ({100*nao_merito/total_proc:.2f}%)**
- **APRECIOU mérito** (provido + parcial + desprovido): {merito:,} ({100*merito/total_proc:.2f}%)
- Outros/indefinido: {outros:,} ({100*outros/total_proc:.2f}%)

## Limitações

- Priorização por gravidade (não temporal -- a última decisão antes do trânsito não foi identificada como final).
- Categoria "indefinido" engloba códigos TPU ainda não mapeados; próxima iteração reduz esse resíduo.
- Amostra = corpus integral Datajud STJ; não inclui processos fora do Datajud (pré-1988, fora de indexação).

Gerado em {datetime.now().isoformat(timespec="seconds")}.
''')
print(f'\n[OK] CSV: {OUT_CSV}', flush=True)
print(f'[OK] MD:  {OUT_MD}', flush=True)
