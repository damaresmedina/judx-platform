"""Pipeline ÚNICO e ESTÁVEL para stj_eventos_ministros.

Fonte canônica: composicao_ministerial.csv (judx-platform/scripts/seeds-tribunais).
Esse seed tem 1 linha por (ministro, orgão, intervalo) com tipo_ancoragem definido.
Cada linha vira 1 evento na tabela stj_eventos_ministros.

Idempotente: roda N vezes, mesmo resultado.
Sem duplicação. Sem patches em cima de patches.

Saídas:
1. CSV local: stj_eventos_ministros_canonical.csv
2. Flat DuckDB: regenera tabela
3. Supabase: DELETE + INSERT (regenera)
"""
import sys, csv, re, json, time
sys.stdout.reconfigure(encoding='utf-8')
import requests
import duckdb
from pathlib import Path

t0 = time.time()
def log(m): print(f'[{time.time()-t0:>5.1f}s] {m}', flush=True)

ACCENT = str.maketrans(
    'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ',
    'AAAAAAACEEEEIIIIDNOOOOOOUUUUYBSaaaaaaaceeeeiiiidnoooooouuuuyby'
)
def norm(s):
    if not s: return ''
    s = re.sub(r'\s*\(.*?\)','',str(s)).upper().translate(ACCENT)
    s = re.sub(r'[\d\*\.\,/]+', ' ', s)
    return re.sub(r'\s+',' ',s).strip()

# Mapa consolidado (mesma da consolidação v7)
TRUNCADOS_KNOWN = {
    'NANCY ANDRIGHI': 'FATIMA NANCY ANDRIGHI',
    'OG FERNANDES': 'GERALDO OG NICEAS MARQUES FERNANDES',
    'FRANCISCO FALCAO': 'FRANCISCO CANDIDO DE M FALCAO NETO',
    'HUMBERTO MARTINS': 'HUMBERTO EUSTAQUIO SOARES MARTINS',
    'MARIA THEREZA DE ASSIS MOURA': 'MARIA THEREZA ROCHA DE ASSIS MOURA',
    'HERMAN BENJAMIN': 'ANTONIO HERMAN DE VASCONCELLOS E BENJAMIN',
    'PAULO DE TARSO SANSEVERINO': 'PAULO DE TARSO VIEIRA SANSEVERINO',
    'MOURA RIBEIRO': 'PAULO DIAS DE MOURA RIBEIRO',
    'MARIA ISABEL GALLOTTI': 'MARIA ISABEL DINIZ GALLOTTI RODRIGUES',
    'MARCO BUZZI': 'MARCO AURELIO GASTALDI BUZZI',
    'MARCO AURELIO BELLIZZE': 'MARCO AURELIO BELLIZZE OLIVEIRA',
    'RAUL ARAUJO': 'RAUL ARAUJO FILHO',
    'ASSUSETE MAGALHAES': 'ASSUSETE DUMONT REIS MAGALHAES',
    'ROGERIO SCHIETTI': 'ROGERIO SCHIETTI MACHADO CRUZ',
    'SEBASTIAO REIS JUNIOR': 'SEBASTIAO ALVES DOS REIS JUNIOR',
    'GURGEL DE FARIA': 'LUIZ ALBERTO GURGEL DE FARIA',
    'SERGIO KUKINA': 'SERGIO LUIZ KUKINA',
    'VILLAS BOAS CUEVA': 'RICARDO VILLAS BOAS CUEVA',
    'LAURITA VAZ': 'LAURITA HILARIO VAZ',
    'CARLOS PIRES BRANDAO': 'CARLOS AUGUSTO PIRES BRANDAO',
    'MARLUCE CALDAS': 'MARIA MARLUCE CALDAS BEZERRA',
    'MARIA MARLUCE CALDAS': 'MARIA MARLUCE CALDAS BEZERRA',
    'JOSE AFRANIO VILELA': 'AFRANIO VILELA',
    'DANIELA RODRIGUES TEIXEIRA': 'DANIELA TEIXEIRA',
    'LUIS CARLOS GAMBOGI': 'LUIS CARLOS BALBINO GAMBOGI',
    'JESUINO APARECIDO RISSATO': 'JESUINO RISSATO',
    'MESSOD AZULAY': 'MESSOD AZULAY NETO',
    'JOEL ILLAN PACIORNIK': 'JOEL ILAN PACIORNIK',
    'ANTONIO SALDANHA': 'ANTONIO SALDANHA PALHEIRO',
    'NAPOLEAO NUNES MAIA': 'NAPOLEAO NUNES MAIA FILHO',
    'MAURO LUIZ CAMPBELL MARQUES': 'MAURO CAMPBELL MARQUES',
    'MARCELO NAVARRO RIBEIRO DANTAS': 'RIBEIRO DANTAS',
    'DIVA PRESTES MARCONDES MALERBI': 'DIVA MALERBI',
    'JOSE LAZARO ALFREDO GUIMARAES': 'LAZARO GUIMARAES',
    'OLINDO HERCULANO DE': 'OLINDO HERCULANO DE MENEZES',
    'LUIS FELIPE SALOMÃO': 'LUIS FELIPE SALOMAO',  # com acento
}
def consolidar(k):
    return TRUNCADOS_KNOWN.get(k, k)

# Mapa tipo_ancoragem → tipo_evento
ANCORAGEM_EVENTO = {
    'ingresso_no_tribunal': 'POSSE_STJ',
    'em_exercicio': None,  # estado, não transição (skip)
    'troca_turma': 'TRANSITO_TURMA',
    'troca_cargo': 'TRANSITO_CARGO',
    'presidencia': 'PRESIDENCIA',
    'vice_presidencia': 'VICE_PRESIDENCIA',
    'corregedoria': 'CORREGEDORIA_CNJ',
    'acumulacao': 'ACUMULACAO',
    'aposentadoria': 'APOSENTADORIA',
    'aposentadoria_foi_tse': 'APOSENTADORIA',
    'falecido_em_exercicio': 'FALECIMENTO',
    'convocacao': 'CONVOCACAO',
    'convocacao_substituto': 'CONVOCACAO_SUBSTITUTO',
    'tribunal_eleitoral': 'TSE',
    'corregedoria_cnj': 'CORREGEDORIA_CNJ',
}

SEED = Path(r'C:/Users/medin/projetos/judx-platform/scripts/seeds-tribunais/composicao_ministerial.csv')
OUT_CSV = Path(r'C:/Users/medin/projetos/judx-platform/scripts/seeds-tribunais/stj-flat-canonical-25abr/artefatos/stj_eventos_ministros_canonical.csv')
DUCKDB = r'G:/staging_local/stj_flat_canonical.duckdb'

URL = "https://ejwyguskoiraredinqmb.supabase.co/rest/v1"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqd3lndXNrb2lyYXJlZGlucW1iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDAyMjk2NywiZXhwIjoyMDg5NTk4OTY3fQ.EpS4OHMuwWvcgqAB5BwnAj7FJCQgIodUZRC9xm0Z1XU"
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
     "Content-Type": "application/json", "Prefer": "return=minimal"}

# === 1) Ler seed ===
log('1) Lendo seed composicao_ministerial.csv (STJ)')
seed_rows = []
with open(SEED, encoding='utf-8') as f:
    for r in csv.DictReader(f):
        if r.get('tribunal_sigla','').startswith('#'): continue
        if r.get('tribunal_sigla','').strip() != 'STJ': continue
        seed_rows.append(r)
log(f'   {len(seed_rows)} linhas STJ')

# === 2) Construir eventos ===
log('2) Construindo eventos canônicos')
eventos = []
skipped = 0
for r in seed_rows:
    ministro_raw = r['ministro_nome_canonico'].strip()
    ministro_key = consolidar(norm(ministro_raw))
    orgao = r['codigo_orgao'].strip()
    valid_from = r.get('valid_from','').strip()
    valid_to = r.get('valid_to','').strip()
    tipo_anc = r.get('tipo_ancoragem','').strip()
    motivo = r.get('motivo_mudanca','').strip()
    fonte = r.get('fonte','').strip()

    tipo_ev = ANCORAGEM_EVENTO.get(tipo_anc)
    if tipo_ev is None:
        skipped += 1
        continue

    # Regra de data_evento por tipo_ancoragem:
    # - falecido_em_exercicio → valid_to (data do óbito)
    # - aposentadoria → valid_from (data da aposentadoria, geralmente já em linha APOSENTADO)
    # - demais → valid_from (data do início)
    if tipo_anc == 'falecido_em_exercicio':
        data_evento = valid_to
    else:
        data_evento = valid_from
    if not data_evento:
        skipped += 1
        continue

    eventos.append({
        'ministro_key': ministro_key,
        'data_evento': data_evento,
        'tipo_evento': tipo_ev,
        'orgao_de': None,
        'orgao_para': orgao,
        'motivo_mudanca': motivo,
        'fonte': fonte,
        'data_fim': valid_to if tipo_anc != 'falecido_em_exercicio' else None,
    })

    # Se tem valid_to: emite SAÍDA (transição inversa) se não for 9999... e não for evento terminal
    if (tipo_anc != 'falecido_em_exercicio' and valid_to and valid_to != ''
            and not valid_to.startswith('9999')):
        if tipo_ev not in ('APOSENTADORIA','FALECIMENTO'):
            eventos.append({
                'ministro_key': ministro_key,
                'data_evento': valid_to,
                'tipo_evento': 'SAIDA_' + tipo_ev,
                'orgao_de': orgao,
                'orgao_para': None,
                'motivo_mudanca': motivo,
                'fonte': fonte,
                'data_fim': None,
            })

log(f'   {len(eventos)} eventos gerados ({skipped} linhas skip — em_exercicio sem valid_from)')

# Dedupe (caso seed tenha linhas redundantes)
seen = set()
eventos_uniq = []
for e in eventos:
    k = (e['ministro_key'], e['data_evento'], e['tipo_evento'], e['orgao_para'])
    if k not in seen:
        seen.add(k)
        eventos_uniq.append(e)
log(f'   {len(eventos_uniq)} eventos únicos (após dedup)')

# Estatísticas
from collections import Counter
print('\n   Distribuição por tipo_evento:')
for tipo, n in Counter(e['tipo_evento'] for e in eventos_uniq).most_common():
    print(f'     {tipo:30}: {n}')
print(f'\n   Ministros distintos: {len(set(e["ministro_key"] for e in eventos_uniq))}')

# === 3) Salvar CSV canônico ===
log('3) Salvando CSV canônico')
OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
with open(OUT_CSV, 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.DictWriter(f, fieldnames=['ministro_key','data_evento','tipo_evento','orgao_de','orgao_para','motivo_mudanca','fonte','data_fim'])
    w.writeheader()
    for e in sorted(eventos_uniq, key=lambda x: (x['ministro_key'], x['data_evento'])):
        w.writerow(e)
log(f'   >>> {OUT_CSV}')

# === 4) Atualizar flat DuckDB ===
log('4) Regenerando tabela stj_eventos_ministros no flat DuckDB')
con = duckdb.connect(DUCKDB)
con.execute("DROP TABLE IF EXISTS stj_eventos_ministros")
con.execute(f"""
CREATE TABLE stj_eventos_ministros AS
SELECT * FROM read_csv_auto('{OUT_CSV.as_posix()}', header=true)
""")
n_local = con.execute("SELECT COUNT(*) FROM stj_eventos_ministros").fetchone()[0]
log(f'   flat: {n_local} linhas')
con.close()

# === 5) Atualizar Supabase (DROP + CREATE + INSERT) ===
log('5) Regenerando stj_eventos_ministros no Supabase')

# DELETE all
r = requests.delete(f"{URL}/stj_eventos_ministros?ministro_key=neq.__nope__", headers=H, timeout=60)
log(f'   DELETE: {r.status_code}')

# Verificar se schema permite os novos campos (motivo_mudanca, fonte, data_fim, orgao_de)
# Se não, fazer ALTER. Vou só aplicar via apply_migration — chamado externo
# Aqui assumo que tabela é compatível com schema dst (criamos com 5 cols antes)
# Para acomodar campos novos, o user deve rodar apply_migration depois.

# INSERT em batch
batch = 500
sent = 0
for i in range(0, len(eventos_uniq), batch):
    chunk = eventos_uniq[i:i+batch]
    # Reduzir aos campos da tabela atual (5 cols) mas manter motivo_mudanca/data_fim como info útil
    payload = []
    for e in chunk:
        payload.append({
            'ministro_key': e['ministro_key'],
            'data_evento': e['data_evento'],
            'tipo_evento': e['tipo_evento'],
            'orgao_de': e['orgao_de'],
            'orgao_para': e['orgao_para'],
        })
    r = requests.post(f"{URL}/stj_eventos_ministros", headers=H, data=json.dumps(payload), timeout=60)
    if r.status_code in (200,201,204):
        sent += len(chunk)
    else:
        log(f'   batch {i}: HTTP {r.status_code} {r.text[:200]}')

log(f'   Supabase: {sent}/{len(eventos_uniq)} enviados')

# Validar contagem
r = requests.get(f"{URL}/stj_eventos_ministros?select=count", headers={**H, "Prefer": "count=exact"}, timeout=30)
n_remoto = r.headers.get('content-range', '0/0').split('/')[-1]
log(f'   Supabase agora: {n_remoto} linhas')

log('OK — output ESTÁVEL gerado')
