"""
inventario-nacional.py — gera G:/staging_local/datajud_nacional.duckdb
com tabela inventario_endpoints (uma linha por endpoint + shard).

Lê checkpoints em G:/datajud_raw/**/checkpoint.json e complementa com
manifest.json quando existe. Sem ler os part-*.ndjson.gz (rápido).
"""
import json, os, glob, csv, subprocess
from datetime import datetime

BASE = 'G:/datajud_raw'
OUT_DB = 'G:/staging_local/datajud_nacional.duckdb'
OUT_CSV = 'G:/staging_local/inventario_endpoints.csv'
DUCKDB_CLI = r'C:\Users\medin\tools\duckdb\duckdb.exe'

os.makedirs('G:/staging_local', exist_ok=True)

# Carrega inventario arqueologico complementar (se houver)
arq_inv = {}
arq_path = r'C:\Users\medin\Desktop\backup_judx\resultados\2026-04-18_INVENTARIO_ARQUEOLOGICO_raw.json'
if os.path.exists(arq_path):
    with open(arq_path, encoding='utf-8') as f:
        arq_inv = json.load(f).get('endpoints', {})

rows = []
for chk_path in sorted(glob.glob(f'{BASE}/**/checkpoint.json', recursive=True)):
    parts = chk_path.replace(os.sep, '/').split('/')
    try:
        idx = parts.index('datajud_raw')
        after = parts[idx+1:]
        is_shard = 'shards' in after
        if is_shard:
            sigla = after[-3] + '-' + after[-2]
            categoria = 'shard_tjsp'
            parent = after[-3]
        else:
            sigla = after[-2]
            # categoria vem do path
            if after[0] == 'nivel_1_anteparos':
                categoria = 'superior'
            elif after[0] == 'nivel_2_regionais':
                categoria = after[1]  # federal/estadual/trabalho/eleitoral/militar
            else:
                categoria = 'outro'
            parent = None
    except Exception:
        continue

    try:
        with open(chk_path, encoding='utf-8') as f:
            c = json.load(f)
    except:
        continue

    # conta arquivos
    dir_ = os.path.dirname(chk_path)
    n_part    = len(glob.glob(os.path.join(dir_, 'part-*.ndjson.gz')))
    n_orphan  = len(glob.glob(os.path.join(dir_, 'orphans-*.ndjson.gz')))
    n_ghost   = len(glob.glob(os.path.join(dir_, 'ghosts-*.ndjson.gz')))
    tamanho_bytes = sum(
        os.path.getsize(f)
        for pat in ['part-*.ndjson.gz','orphans-*.ndjson.gz','ghosts-*.ndjson.gz']
        for f in glob.glob(os.path.join(dir_, pat))
    )

    # metadados do inventário arqueológico (se houver — só para endpoints não-shard)
    arq = arq_inv.get(sigla, {})

    row = {
        'sigla': sigla,
        'parent': parent or '',
        'categoria': categoria,
        'pasta': dir_.replace(os.sep,'/'),
        'done': bool(c.get('done', False)),
        'primary_done': bool(c.get('primary_done', False)),
        'secondary_done': bool(c.get('secondary_done', False)),
        'pass_atual': c.get('pass', 'primary'),
        'total_fetched': c.get('total_fetched', 0),
        'total_fetched_secondary': c.get('total_fetched_secondary', 0),
        'total_fetched_ghosts': c.get('total_fetched_ghosts', 0),
        'total_combined': c.get('total_fetched',0) + c.get('total_fetched_secondary',0) + c.get('total_fetched_ghosts',0),
        'n_arquivos_part': n_part,
        'n_arquivos_orphans': n_orphan,
        'n_arquivos_ghosts': n_ghost,
        'tamanho_bytes_disco': tamanho_bytes,
        'paused_manual': c.get('_paused_real_done') is False,
        'checkpoint_mtime': datetime.fromtimestamp(os.path.getmtime(chk_path)).isoformat(timespec='seconds'),
        # do inventário arqueológico
        'id_patterns': ' | '.join(arq.get('id_patterns', []))[:200],
        'graus_observados': '/'.join(arq.get('graus_observados', [])),
        'dataAjuiz_formato': ' | '.join(arq.get('dataAjuizamento_formato', []))[:120],
        'dataAjuiz_min_observada': arq.get('dataAjuizamento_min_observada') or '',
        'dataAjuiz_max_observada': arq.get('dataAjuizamento_max_observada') or '',
        'sistemas_processuais': '/'.join(arq.get('sistemas_processuais', [])),
        'formatos_processo': '/'.join(arq.get('formatos_processo', [])),
        'n_movimentos_range': str(arq.get('n_movimentos_range') or ''),
        'rompe_padrao_cnj': 'SIM' if any(f != 'YYYYMMDDHHmmss (CNJ padrão)' for f in arq.get('dataAjuizamento_formato',[])) else 'NAO' if arq.get('dataAjuizamento_formato') else '',
    }
    rows.append(row)

# Salva CSV com todas as colunas
if rows:
    with open(OUT_CSV, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), delimiter=';')
        w.writeheader()
        w.writerows(rows)
    print(f'[inventario] CSV: {OUT_CSV} ({len(rows)} rows)')

# Carrega no DuckDB
sql = f"""
CREATE OR REPLACE TABLE inventario_endpoints AS
SELECT * FROM read_csv_auto('{OUT_CSV.replace(os.sep,'/')}', delim=';', header=true);

-- Log de proveniência
CREATE TABLE IF NOT EXISTS _carga_log (
  tabela VARCHAR, fonte VARCHAR, carregado_em TIMESTAMP, rows_carregados BIGINT
);
INSERT INTO _carga_log VALUES (
  'inventario_endpoints', 'G:/datajud_raw/**/checkpoint.json + inventário arqueológico',
  current_timestamp, (SELECT COUNT(*) FROM inventario_endpoints)
);

-- Relatório rápido
SELECT categoria, COUNT(*) AS endpoints, SUM(total_combined) AS total_docs, SUM(tamanho_bytes_disco)/1024/1024 AS MB_disco
FROM inventario_endpoints
GROUP BY categoria ORDER BY total_docs DESC;

SELECT '---' AS _;
SELECT done, COUNT(*) AS n, SUM(total_combined) AS docs FROM inventario_endpoints GROUP BY done ORDER BY done DESC;
"""
result = subprocess.run([DUCKDB_CLI, OUT_DB, '-c', sql], capture_output=True, text=True, encoding='utf-8', errors='replace')
print(result.stdout)
if result.stderr:
    print('STDERR:', result.stderr[:500])
