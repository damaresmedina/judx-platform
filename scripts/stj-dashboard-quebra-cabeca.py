"""stj-dashboard-quebra-cabeca.py

Varre os 3,38M raw STJ do Datajud e produz:
- CSVs cruzados por 5 dimensões (classe, relator, origem, resultado, assunto)
- Matriz classe × origem × resultado
- Dashboard HTML navegável com Chart.js (offline via CDN)

Saídas em Desktop\backup_judx\resultados\ com prefixo 2026-04-19_.
"""
import gzip, json, re, time, html
from collections import Counter, defaultdict
from pathlib import Path

RAW = Path("G:/datajud_raw/nivel_1_anteparos/STJ")
OUT_DIR = Path("C:/Users/medin/Desktop/backup_judx/resultados")
DATA = "2026-04-19"

# ====== classificação de resultado (prioridade) ======
PRIORIDADE = [
    ('merito_provido',          re.compile(r'^provimento$|^provimento\b|procedent|acolh|deferi|^deferimento$', re.I)),
    ('merito_provido_parcial',  re.compile(r'provimento em parte|parcialmente provid|provid.*parcial|parcialment|procedent.*parcial', re.I)),
    ('merito_desprovido',       re.compile(r'não[-\s]provim|nao[-\s]provim|desprovi|improvi|improced|indeferimento|negar provimento|nega.*provimento|não[-\s]acolh|nao[-\s]acolh|denega', re.I)),
    ('nao_conhecimento',        re.compile(r'não conhec|nao conhec|inadmis|intempest|deserto|conhec.*não conhec|conhec.*nao conhec', re.I)),
    ('extinto_sem_merito',      re.compile(r'extin|homolog', re.I)),
    ('prejudicado',             re.compile(r'prejudic|perda de objeto', re.I)),
    ('desistencia',             re.compile(r'desist|renúnc|renunc|abandono', re.I)),
]

def classificar_mov(nome):
    for cat, pat in PRIORIDADE:
        if pat.search(nome):
            return cat
    return None

def resultado_do_processo(movs_nomes):
    """Dada lista de nomes de movimentos, retorna a categoria de maior gravidade."""
    encontradas = set()
    for mn in movs_nomes:
        c = classificar_mov(mn)
        if c:
            encontradas.add(c)
    # prioridade top-down
    for cat, _ in PRIORIDADE:
        if cat in encontradas:
            return cat
    # se nenhum decisório mas tem trânsito em julgado → "encerrou sem decisão classificável"
    if any('trânsito em julgado' in (mn or '').lower() for mn in movs_nomes):
        return 'transito_sem_classif'
    return 'sem_decisao_mapeada'

# ====== relator do gabinete ======
RE_GABINETE = re.compile(r'GABINETE (?:DA|DO)\s+MINISTR[AO]\s+(.+?)\s*$', re.I)
RE_PRESIDENCIA = re.compile(r'PRESID[EÊË]NCIA|PRESIDENTE\s+', re.I)
RE_VICE = re.compile(r'VICE[-\s]?PRESID', re.I)

def extrair_relator(oj_nome):
    if not oj_nome: return ('(vazio)', 'OUTRO')
    m = RE_GABINETE.search(oj_nome)
    if m:
        rel = re.sub(r'\s+', ' ', m.group(1).strip())
        return (rel, 'GABINETE')
    if RE_VICE.search(oj_nome): return ('(vice-presidência)', 'VICE')
    if RE_PRESIDENCIA.search(oj_nome): return ('(presidência)', 'PRESIDENCIA')
    if 'Superior Tribunal' in oj_nome: return ('(STJ genérico)', 'GENERICO')
    if 'NUCLEO' in oj_nome.upper() or 'NÚCLEO' in oj_nome.upper(): return ('(NUGEP)', 'NUCLEO')
    if 'DESEMB' in oj_nome.upper(): return (oj_nome.strip(), 'DESEMBARGADOR')
    return (oj_nome[:60], 'OUTRO')

# ====== classe → processo_curto + interpenetração ======
# Seed expandido: top 30 + classes interpenetrantes marcadas
CLASSE_META = {
    # codigo: (processo_curto, posicao_trilha, interpenetra)
    11881: ('AREsp',         'brota_inadmissao',     False),
    1720:  ('HC',            'string_autonoma',      False),
    1032:  ('REsp',          'filha_direta_acordao', False),
    1722:  ('ROHC',          'filha_direta_acordao', False),
    1054:  ('CC',            'administrativa',       True),
    1721:  ('ROMS',          'filha_direta_acordao', False),
    1040:  ('RPV',           'execucao',             False),
    1030:  ('Rcl',           'corretiva',            True),
    11956: ('EDvAREsp',      'refratao_no',          False),
    1677:  ('Precatorio',    'execucao',             False),
    1137:  ('EDvREsp',       'refratao_no',          False),
    1029:  ('MS',            'string_autonoma',      False),
    1047:  ('CR',            'string_autonoma',      False),
    11791: ('PU-Crim',       'uniformizacao',        True),
    12134: ('TCA',           'cautelar',             False),
    1057:  ('Pet',           'variada',              True),
    1023:  ('ExeMS',         'execucao',             False),
    1669:  ('AR',            'rescisoria',           False),
    1678:  ('RvCr',          'rescisoria',           False),
    1044:  ('AI',            'brota_inadmissao',     False),
    1036:  ('SLS',           'cautelar',             True),
    1017:  ('EmbExeMS',      'execucao',             False),
    12135: ('TAA',           'cautelar',             False),
    1026:  ('SEC',           'string_autonoma',      False),
    1679:  ('SS',            'cautelar',             True),
    1062:  ('MC',            'cautelar',             False),
    1020:  ('ExeAR',         'execucao',             False),
    1049:  ('HD',            'string_autonoma',      False),
    1033:  ('APn',           'criminal_origem',      False),
    1673:  ('ExcSusp',       'administrativa',       False),
    1675:  ('MI',            'string_autonoma',      False),
    1031:  ('RO',            'filha_direta_acordao', False),
}
def classe_info(cod, nome):
    if cod in CLASSE_META:
        pc, pt, ip = CLASSE_META[cod]
        return pc, pt, ip
    # fallback pelo nome
    n = (nome or '').lower()
    if 'agravo' in n and 'recurso especial' in n: return ('AREsp-like', 'brota_inadmissao', False)
    if 'recurso especial' in n: return ('REsp-like', 'filha_direta_acordao', False)
    if 'habeas corpus' in n: return ('HC-like', 'string_autonoma', False)
    if 'mandado de seguran' in n: return ('MS-like', 'string_autonoma', False)
    if 'embargos' in n: return ('Emb-like', 'refratao_no', False)
    if 'conflito' in n: return ('CC-like', 'administrativa', True)
    return ('OUTRO', '(a classificar)', False)

# ====== TR → sigla ======
TR_MAP = {
    '300': ('STJ',    'Superiores'),
    '401': ('TRF1',   'Federal'),  '402': ('TRF2',   'Federal'),
    '403': ('TRF3',   'Federal'),  '404': ('TRF4',   'Federal'),
    '405': ('TRF5',   'Federal'),  '406': ('TRF6',   'Federal'),
    '802': ('TJAC',   'Estadual'), '803': ('TJAL',   'Estadual'),
    '804': ('TJAP',   'Estadual'), '805': ('TJAM',   'Estadual'),
    '806': ('TJBA',   'Estadual'), '807': ('TJCE',   'Estadual'),
    '808': ('TJDFT',  'Estadual'), '809': ('TJES',   'Estadual'),
    '810': ('TJGO',   'Estadual'), '811': ('TJMA',   'Estadual'),
    '812': ('TJMT',   'Estadual'), '813': ('TJMS',   'Estadual'),
    '814': ('TJMG',   'Estadual'), '815': ('TJPA',   'Estadual'),
    '816': ('TJPB',   'Estadual'), '817': ('TJPR',   'Estadual'),
    '818': ('TJPE',   'Estadual'), '819': ('TJPI',   'Estadual'),
    '820': ('TJRJ',   'Estadual'), '821': ('TJRN',   'Estadual'),
    '822': ('TJRS',   'Estadual'), '823': ('TJRO',   'Estadual'),
    '824': ('TJRR',   'Estadual'), '825': ('TJSC',   'Estadual'),
    '826': ('TJSP',   'Estadual'), '827': ('TJSE',   'Estadual'),
    '828': ('TJTO',   'Estadual'),
    '913': ('TJMSP',  'Militar Estadual'),
    '921': ('TJMMG',  'Militar Estadual'),
    '926': ('TJMRS',  'Militar Estadual'),
}
def origem_de(np):
    if not np or len(np) != 20 or not np.isdigit():
        return ('(?)', '(?)', '(?)')
    jtr = np[13:16]
    if jtr in TR_MAP:
        sig, seg = TR_MAP[jtr]
        return (jtr, sig, seg)
    return (jtr, f'?{jtr}', 'outros')

# ====== acumuladores ======
c_classe_origem_resultado = Counter()     # (processo_curto, sigla_origem, resultado) -> n
c_relator_total           = Counter()     # relator -> n
c_relator_resultado       = Counter()     # (relator, resultado) -> n
c_origem_total            = Counter()     # sigla_origem -> n
c_origem_segmento         = Counter()     # segmento -> n
c_resultado_total         = Counter()     # resultado -> n
c_classe_total            = Counter()     # processo_curto -> n
c_posicao_trilha          = Counter()     # posicao -> n
c_interpenetracoes        = Counter()     # (processo_curto, sigla_origem) -> n  (só interpenetra=True)
c_assunto_top             = Counter()     # (codigo, nome) -> n
c_classe_por_origem       = defaultdict(Counter)  # sigla_origem -> Counter(processo_curto)

parts = sorted(p for p in RAW.glob("part-*.ndjson.gz"))
total_parts = len(parts)
print(f"[dashboard] {total_parts} parts em {RAW}", flush=True)

t0 = time.time()
docs_total = 0

for i, p in enumerate(parts):
    try:
        with gzip.open(p, 'rt', encoding='utf-8') as f:
            for line in f:
                docs_total += 1
                try: doc = json.loads(line)
                except: continue
                s = doc.get('_source', doc)
                if not isinstance(s, dict): continue

                cl = s.get('classe') or {}
                ccod = cl.get('codigo'); cnome = cl.get('nome', '')
                pc, pt, ip = classe_info(ccod, cnome)

                oj = s.get('orgaoJulgador') or {}
                ojn = oj.get('nome', '') if isinstance(oj, dict) else ''
                rel, rel_bucket = extrair_relator(ojn)

                np_ = s.get('numeroProcesso') or ''
                jtr, sig_origem, seg_origem = origem_de(np_)

                movs = s.get('movimentos') or []
                nomes_mov = [(m.get('nome') or '') for m in movs if isinstance(m, dict)]
                res = resultado_do_processo(nomes_mov)

                c_classe_origem_resultado[(pc, sig_origem, res)] += 1
                c_relator_total[rel] += 1
                c_relator_resultado[(rel, res)] += 1
                c_origem_total[sig_origem] += 1
                c_origem_segmento[seg_origem] += 1
                c_resultado_total[res] += 1
                c_classe_total[pc] += 1
                c_posicao_trilha[pt] += 1
                if ip:
                    c_interpenetracoes[(pc, sig_origem)] += 1

                ass = s.get('assuntos') or []
                if ass and isinstance(ass[0], dict):
                    a = ass[0]
                    c_assunto_top[(a.get('codigo'), a.get('nome',''))] += 1

                c_classe_por_origem[sig_origem][pc] += 1
    except Exception as e:
        print(f"[erro] {p.name}: {e}", flush=True)
        continue

    if (i+1) % 200 == 0 or (i+1) == total_parts:
        el = time.time() - t0
        pct_ = 100*(i+1)/total_parts
        print(f"[{el:.0f}s] part {i+1}/{total_parts} ({pct_:.1f}%) — docs={docs_total:,}", flush=True)

elapsed = time.time() - t0
print(f"\n[fim] {docs_total:,} docs em {elapsed:.0f}s", flush=True)

# ====== CSVs ======
import csv

def write_csv(name, header, rows):
    fp = OUT_DIR / f"{DATA}_{name}.csv"
    with fp.open('w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(header)
        for r in rows: w.writerow(r)
    print(f"  csv: {fp.name} ({fp.stat().st_size/1024:.1f} KB)")

# 1. por classe
write_csv('stj_dash_classe',
    ['processo_curto', 'ocorrencias', 'pct'],
    [(k, v, round(100*v/docs_total, 3)) for k, v in c_classe_total.most_common()])

# 2. por relator (só gabinetes de ministros)
write_csv('stj_dash_relator',
    ['relator', 'ocorrencias', 'pct'],
    [(k, v, round(100*v/docs_total, 3)) for k, v in c_relator_total.most_common(80)])

# 3. por origem
write_csv('stj_dash_origem',
    ['sigla_origem', 'ocorrencias', 'pct'],
    [(k, v, round(100*v/docs_total, 3)) for k, v in c_origem_total.most_common()])

# 4. por segmento (ramo de origem)
write_csv('stj_dash_segmento',
    ['segmento', 'ocorrencias', 'pct'],
    [(k, v, round(100*v/docs_total, 3)) for k, v in c_origem_segmento.most_common()])

# 5. por resultado
write_csv('stj_dash_resultado',
    ['resultado', 'ocorrencias', 'pct'],
    [(k, v, round(100*v/docs_total, 3)) for k, v in c_resultado_total.most_common()])

# 6. cruzada classe × origem × resultado (tabelão)
write_csv('stj_dash_crossab_classe_origem_resultado',
    ['processo_curto', 'sigla_origem', 'resultado', 'ocorrencias'],
    [(k[0], k[1], k[2], v) for k, v in c_classe_origem_resultado.most_common()])

# 7. relator × resultado
write_csv('stj_dash_relator_x_resultado',
    ['relator', 'resultado', 'ocorrencias'],
    [(k[0], k[1], v) for k, v in c_relator_resultado.most_common(2000)])

# 8. posição na trilha
write_csv('stj_dash_posicao_trilha',
    ['posicao_trilha', 'ocorrencias', 'pct'],
    [(k, v, round(100*v/docs_total, 3)) for k, v in c_posicao_trilha.most_common()])

# 9. interpenetrações
write_csv('stj_dash_interpenetracoes',
    ['processo_curto', 'sigla_origem', 'ocorrencias'],
    [(k[0], k[1], v) for k, v in c_interpenetracoes.most_common()])

# 10. assuntos top
write_csv('stj_dash_assuntos',
    ['codigo_tpu', 'nome', 'ocorrencias', 'pct'],
    [(k[0], k[1], v, round(100*v/docs_total, 3)) for k, v in c_assunto_top.most_common(100)])

# ====== HTML Dashboard ======

def lbl(s): return html.escape(str(s))

classes_top = c_classe_total.most_common(15)
relator_top = [(r, v) for (r, v) in c_relator_total.most_common(30) if not r.startswith('(')][:25]
origem_top = c_origem_total.most_common(20)
resultado_all = c_resultado_total.most_common()
segmento_all = c_origem_segmento.most_common()
posicao_all = c_posicao_trilha.most_common()

# matriz TOP classes × TOP origens
top_classes = [c for c, _ in classes_top[:8]]
top_origens = [o for o, _ in origem_top[:12]]
matriz = []
for cl in top_classes:
    linha = [cl] + [c_classe_origem_resultado.get((cl, o, r), 0) for o in top_origens for r in ('merito_provido','merito_provido_parcial','merito_desprovido','nao_conhecimento','prejudicado','desistencia','extinto_sem_merito','transito_sem_classif','sem_decisao_mapeada')]
    matriz.append(linha)

# tabela de relator × resultado (top 20 relatores, principais resultados)
rels = [r for r, _ in c_relator_total.most_common(30) if not r.startswith('(')][:20]
resultados_cols = ['merito_provido','merito_provido_parcial','merito_desprovido','nao_conhecimento','prejudicado','desistencia']

def tds(row): return ''.join(f'<td>{lbl(v)}</td>' for v in row)

html_doc = f"""<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<title>JudX — Dashboard STJ: quebra-cabeça do universo</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js"></script>
<style>
  :root{{--bg:#0d1117;--card:#161b22;--text:#e6edf3;--muted:#8b949e;--brand:#58a6ff;--ok:#3fb950;--warn:#d29922;--err:#f85149;--line:#30363d}}
  *{{box-sizing:border-box}}
  body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:24px;line-height:1.5}}
  h1{{margin:0 0 4px 0;font-size:24px;color:var(--brand)}}
  h2{{margin-top:40px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--line);font-size:18px}}
  .sub{{color:var(--muted);margin-bottom:16px}}
  .grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(350px,1fr));gap:16px;margin-bottom:24px}}
  .card{{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:16px}}
  .kpi{{font-size:28px;font-weight:600;color:var(--brand)}}
  .kpi-label{{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.5px}}
  table{{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}}
  th,td{{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}}
  th{{color:var(--muted);font-weight:500;font-size:11px;text-transform:uppercase}}
  td.n{{text-align:right;font-variant-numeric:tabular-nums;color:var(--text)}}
  tr:hover td{{background:#1c2128}}
  .bar{{display:inline-block;height:10px;background:var(--brand);border-radius:2px;vertical-align:middle;margin-right:6px}}
  .chip{{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;margin-right:4px}}
  .chip-brand{{background:rgba(88,166,255,.15);color:var(--brand)}}
  .chip-ok{{background:rgba(63,185,80,.15);color:var(--ok)}}
  .chip-warn{{background:rgba(210,153,34,.15);color:var(--warn)}}
  .chip-err{{background:rgba(248,81,73,.15);color:var(--err)}}
  canvas{{max-height:300px}}
  .note{{font-size:12px;color:var(--muted);margin-top:8px}}
  .two{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}
  @media(max-width:900px){{.two{{grid-template-columns:1fr}}}}
</style>
</head>
<body>

<h1>Quebra-cabeça STJ — universo Datajud</h1>
<div class="sub">Fonte: <code>G:/datajud_raw/nivel_1_anteparos/STJ</code> · {docs_total:,} processos · varredura de {elapsed:.0f}s · {DATA}</div>

<div class="grid">
  <div class="card"><div class="kpi-label">Processos (strings)</div><div class="kpi">{docs_total:,}</div></div>
  <div class="card"><div class="kpi-label">Classes distintas</div><div class="kpi">{len(c_classe_total)}</div></div>
  <div class="card"><div class="kpi-label">Tribunais de origem</div><div class="kpi">{len(c_origem_total)}</div></div>
  <div class="card"><div class="kpi-label">Ministros (gabinetes)</div><div class="kpi">{sum(1 for r,_ in c_relator_total.items() if not r.startswith('('))}</div></div>
  <div class="card"><div class="kpi-label">Interpenetrações de ramo</div><div class="kpi">{sum(c_interpenetracoes.values()):,}</div></div>
</div>

<h2>1 · Estrutura decisória — classes</h2>
<div class="two">
  <div class="card">
    <canvas id="chartClasses"></canvas>
  </div>
  <div class="card">
    <table><thead><tr><th>processo_curto</th><th class="n">ocorrências</th><th class="n">%</th></tr></thead><tbody>
    {''.join(f'<tr><td>{lbl(k)}</td><td class="n">{v:,}</td><td class="n">{100*v/docs_total:.2f}%</td></tr>' for k, v in classes_top)}
    </tbody></table>
  </div>
</div>

<h2>2 · Origem — quanto cada tribunal alimenta o STJ</h2>
<div class="two">
  <div class="card"><canvas id="chartOrigem"></canvas></div>
  <div class="card">
    <table><thead><tr><th>segmento</th><th class="n">processos</th><th class="n">%</th></tr></thead><tbody>
    {''.join(f'<tr><td>{lbl(k)}</td><td class="n">{v:,}</td><td class="n">{100*v/docs_total:.2f}%</td></tr>' for k, v in segmento_all)}
    </tbody></table>
    <div class="note">Top 20 siglas na tabela ao lado; lista completa em <code>{DATA}_stj_dash_origem.csv</code>.</div>
  </div>
</div>

<h2>3 · Resultado por processo (classificação priorizada dos movimentos)</h2>
<div class="two">
  <div class="card"><canvas id="chartResultado"></canvas></div>
  <div class="card">
    <table><thead><tr><th>resultado</th><th class="n">processos</th><th class="n">%</th></tr></thead><tbody>
    {''.join(f'<tr><td>{lbl(k)}</td><td class="n">{v:,}</td><td class="n">{100*v/docs_total:.2f}%</td></tr>' for k, v in resultado_all)}
    </tbody></table>
    <div class="note">Priorização: mérito_provido &gt; parcial &gt; desprovido &gt; não_conhec &gt; extinto &gt; prejudicado &gt; desistência. Processos sem pulso decisório classificável vão para <code>transito_sem_classif</code> ou <code>sem_decisao_mapeada</code>.</div>
  </div>
</div>

<h2>4 · Relator — distribuição entre gabinetes</h2>
<div class="card">
  <canvas id="chartRelator"></canvas>
  <div class="note">Só ministros com gabinete identificado; presidência, vice e NUGEP agrupados separadamente. CSV completo em <code>{DATA}_stj_dash_relator.csv</code>.</div>
</div>

<h2>5 · Posição na trilha</h2>
<div class="two">
  <div class="card"><canvas id="chartTrilha"></canvas></div>
  <div class="card">
    <table><thead><tr><th>posição</th><th class="n">processos</th><th class="n">%</th></tr></thead><tbody>
    {''.join(f'<tr><td>{lbl(k)}</td><td class="n">{v:,}</td><td class="n">{100*v/docs_total:.2f}%</td></tr>' for k, v in posicao_all)}
    </tbody></table>
  </div>
</div>

<h2>6 · Interpenetrações de ramo (exceções ao feixe paralelo)</h2>
<div class="card">
  <table><thead><tr><th>processo_curto</th><th>origem</th><th class="n">ocorrências</th></tr></thead><tbody>
  {''.join(f'<tr><td>{lbl(k[0])}</td><td>{lbl(k[1])}</td><td class="n">{v:,}</td></tr>' for k, v in c_interpenetracoes.most_common(30))}
  </tbody></table>
  <div class="note">Classes que atravessam ramos por natureza (CC, Rcl, Pet, SLS, PU, SS). Lista completa em <code>{DATA}_stj_dash_interpenetracoes.csv</code>.</div>
</div>

<h2>7 · Assuntos TPU — top 30</h2>
<div class="card">
  <table><thead><tr><th>código</th><th>assunto</th><th class="n">ocorrências</th><th class="n">%</th></tr></thead><tbody>
  {''.join(f'<tr><td class="n">{lbl(k[0])}</td><td>{lbl(k[1])}</td><td class="n">{v:,}</td><td class="n">{100*v/docs_total:.2f}%</td></tr>' for k, v in c_assunto_top.most_common(30))}
  </tbody></table>
</div>

<h2>8 · CSVs gerados (para Excel / Qlik / pandas)</h2>
<div class="card">
<ul>
<li><code>{DATA}_stj_dash_classe.csv</code></li>
<li><code>{DATA}_stj_dash_relator.csv</code></li>
<li><code>{DATA}_stj_dash_origem.csv</code></li>
<li><code>{DATA}_stj_dash_segmento.csv</code></li>
<li><code>{DATA}_stj_dash_resultado.csv</code></li>
<li><code>{DATA}_stj_dash_crossab_classe_origem_resultado.csv</code> — matriz completa</li>
<li><code>{DATA}_stj_dash_relator_x_resultado.csv</code></li>
<li><code>{DATA}_stj_dash_posicao_trilha.csv</code></li>
<li><code>{DATA}_stj_dash_interpenetracoes.csv</code></li>
<li><code>{DATA}_stj_dash_assuntos.csv</code></li>
</ul>
</div>

<script>
const BRAND = '#58a6ff';
const palette = ['#58a6ff','#3fb950','#d29922','#f85149','#a371f7','#ff7b72','#6e7681','#1f6feb','#56d364','#e3b341'];
Chart.defaults.color = '#e6edf3';
Chart.defaults.borderColor = '#30363d';
Chart.defaults.font.family = "-apple-system, 'Segoe UI', Roboto, sans-serif";

new Chart(document.getElementById('chartClasses'), {{
  type:'bar',
  data:{{labels:{[c for c,_ in classes_top]!r}, datasets:[{{label:'processos', data:{[v for _,v in classes_top]!r}, backgroundColor:BRAND}}]}},
  options:{{plugins:{{legend:{{display:false}}}}, indexAxis:'y'}}
}});
new Chart(document.getElementById('chartOrigem'), {{
  type:'bar',
  data:{{labels:{[o for o,_ in origem_top]!r}, datasets:[{{label:'processos', data:{[v for _,v in origem_top]!r}, backgroundColor:palette}}]}},
  options:{{plugins:{{legend:{{display:false}}}}, indexAxis:'y'}}
}});
new Chart(document.getElementById('chartResultado'), {{
  type:'doughnut',
  data:{{labels:{[k for k,_ in resultado_all]!r}, datasets:[{{data:{[v for _,v in resultado_all]!r}, backgroundColor:palette}}]}},
  options:{{plugins:{{legend:{{position:'right'}}}}}}
}});
new Chart(document.getElementById('chartRelator'), {{
  type:'bar',
  data:{{labels:{[r for r,_ in relator_top]!r}, datasets:[{{label:'processos', data:{[v for _,v in relator_top]!r}, backgroundColor:BRAND}}]}},
  options:{{plugins:{{legend:{{display:false}}}}, indexAxis:'y'}}
}});
new Chart(document.getElementById('chartTrilha'), {{
  type:'pie',
  data:{{labels:{[k for k,_ in posicao_all]!r}, datasets:[{{data:{[v for _,v in posicao_all]!r}, backgroundColor:palette}}]}},
  options:{{plugins:{{legend:{{position:'right'}}}}}}
}});
</script>

</body>
</html>
"""

html_path = OUT_DIR / f"{DATA}_DASHBOARD_STJ.html"
html_path.write_text(html_doc, encoding='utf-8')
print(f"\n[dashboard] {html_path}")
print(f"  tamanho: {html_path.stat().st_size/1024:.1f} KB")
print(f"\nAbra: start \"\" \"{html_path}\"")
