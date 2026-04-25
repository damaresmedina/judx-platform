"""Exporta 8 tabelas-resultado do flat canônico para CSVs prontos para upload Supabase."""
import sys, time
sys.stdout.reconfigure(encoding='utf-8')
import duckdb
from pathlib import Path

t0 = time.time()
def log(m): print(f'[{time.time()-t0:>5.1f}s] {m}', flush=True)

DST = r'G:/staging_local/stj_flat_canonical.duckdb'
OUT_DIR = Path(r'C:/Users/medin/Desktop/backup_judx/flat_stj_20260424/exports/upload_supabase')
OUT_DIR.mkdir(exist_ok=True)

con = duckdb.connect(DST, read_only=True)

EXPORTS = [
    'stj_composicao_temporal_v7',
    'stj_alias_ministros',
    'stj_dicionario_movimentos',
    'stj_eventos_ministros',
    'stj_matriz_ministro_macro',
    'stj_ministros_metricas',
    'stj_taxa_anual',
    'stj_tribunal_origem_resultado',
    'stj_composicao_gaps',
]

for t in EXPORTS:
    out = OUT_DIR / f'{t}.csv'
    n = con.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
    con.execute(f"COPY {t} TO '{out.as_posix()}' (HEADER, DELIMITER ',', QUOTE '\"')")
    sz = out.stat().st_size / 1024
    log(f'  {t}: {n:,} linhas → {out.name} ({sz:.0f} KB)')

con.close()
log(f'\n>>> {OUT_DIR}')
