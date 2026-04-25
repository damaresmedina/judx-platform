"""Popula 9 tabelas canônicas no Supabase via REST API em batches."""
import sys, csv, json, time
sys.stdout.reconfigure(encoding='utf-8')
import requests
from pathlib import Path

URL = "https://ejwyguskoiraredinqmb.supabase.co/rest/v1"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqd3lndXNrb2lyYXJlZGlucW1iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDAyMjk2NywiZXhwIjoyMDg5NTk4OTY3fQ.EpS4OHMuwWvcgqAB5BwnAj7FJCQgIodUZRC9xm0Z1XU"
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
     "Content-Type": "application/json", "Prefer": "return=minimal"}

DIR = Path(r'C:/Users/medin/Desktop/backup_judx/flat_stj_20260424/exports/upload_supabase')

UPLOADS = [
    ('stj_composicao_temporal_v7', 'stj_composicao_temporal_v7.csv'),
    ('stj_alias_ministros', 'stj_alias_ministros.csv'),
    ('stj_dicionario_movimentos', 'stj_dicionario_movimentos.csv'),
    ('stj_eventos_ministros', 'stj_eventos_ministros.csv'),
    ('stj_composicao_gaps_canonical', 'stj_composicao_gaps.csv'),
    ('stj_taxa_anual_v2', 'stj_taxa_anual.csv'),
    ('stj_ministros_metricas_v2', 'stj_ministros_metricas.csv'),
    ('stj_tribunal_origem_resultado_v2', 'stj_tribunal_origem_resultado.csv'),
    ('stj_matriz_ministro_macro_v2', 'stj_matriz_ministro_macro.csv'),
]

def to_records(csv_path):
    rows = []
    with open(csv_path, encoding='utf-8') as f:
        for r in csv.DictReader(f):
            # Normalizar empty → None
            rec = {}
            for k, v in r.items():
                if v == '' or v is None:
                    rec[k] = None
                # Tentativa de cast int/float/bool
                elif v.lower() in ('true','false'):
                    rec[k] = (v.lower() == 'true')
                elif v.replace('.','').replace('-','').isdigit() and '.' in v:
                    try: rec[k] = float(v)
                    except: rec[k] = v
                elif v.lstrip('-').isdigit():
                    try: rec[k] = int(v)
                    except: rec[k] = v
                else:
                    rec[k] = v
            rows.append(rec)
    return rows

def upload(table, records, batch=2000):
    total = len(records)
    sent = 0
    fails = 0
    for i in range(0, total, batch):
        chunk = records[i:i+batch]
        try:
            r = requests.post(f"{URL}/{table}", headers=H, data=json.dumps(chunk), timeout=120)
            if r.status_code in (200,201,204):
                sent += len(chunk)
            else:
                fails += 1
                print(f'    [batch {i}-{i+len(chunk)}] HTTP {r.status_code}: {r.text[:200]}')
        except Exception as e:
            fails += 1
            print(f'    [batch {i}-{i+len(chunk)}] EXC: {e}')
    return sent, fails

t0 = time.time()
def log(m): print(f'[{time.time()-t0:>5.1f}s] {m}', flush=True)

for table, fname in UPLOADS:
    csv_path = DIR / fname
    log(f'>>> {table}')
    recs = to_records(csv_path)
    log(f'   carregados {len(recs)} registros')
    sent, fails = upload(table, recs)
    log(f'   enviados {sent}/{len(recs)} (fails: {fails})')

    # Verificar contagem no Supabase
    r = requests.get(f"{URL}/{table}?select=count", headers={**H, "Prefer": "count=exact"}, timeout=30)
    n = r.headers.get('content-range', '0/0').split('/')[-1]
    log(f'   Supabase agora: {n} linhas')

log('OK')
