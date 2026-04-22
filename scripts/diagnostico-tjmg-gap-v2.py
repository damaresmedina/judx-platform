"""
Diagnóstico TJMG gap — v2 (Python, robusto a IO errors)
Estratégia:
  1. Varre 35.394 arquivos em ordem
  2. Extrai _source.id de cada linha
  3. Escreve IDs em arquivo texto (append) — evita OOM
  4. Ao fim, DuckDB conta COUNT(DISTINCT) do arquivo texto
  5. Retry com sleep em erros de IO
  6. Checkpoint a cada 500 arquivos (pode retomar)
"""
import gzip, json, sys, time, os
from pathlib import Path
import subprocess

sys.stdout.reconfigure(encoding='utf-8')

RAW = Path(r"G:/datajud_raw/nivel_2_regionais/estadual/TJMG")
OUT_IDS = Path(r"C:/Users/medin/tmp_duck/tjmg_all_ids.txt")
CHK = Path(r"C:/Users/medin/tmp_duck/tjmg_audit_chk.txt")
OUT_IDS.parent.mkdir(parents=True, exist_ok=True)

files = sorted(RAW.glob("part-*.ndjson.gz"))
print(f"Total de arquivos: {len(files)}")

# Checkpoint — retomar a partir do último processado
start_idx = 0
if CHK.exists():
    start_idx = int(CHK.read_text().strip() or 0)
    print(f"Retomando de arquivo {start_idx}")

if start_idx == 0 and OUT_IDS.exists():
    OUT_IDS.unlink()
    print("Reset do arquivo de IDs")

mode = 'a' if start_idx > 0 else 'w'
t0 = time.time()
total_lines = 0
last_report = time.time()
erros_arquivos = []

with open(OUT_IDS, mode, encoding='utf-8', buffering=8*1024*1024) as out:
    for i in range(start_idx, len(files)):
        f = files[i]
        for attempt in range(3):
            try:
                with gzip.open(f, 'rt', encoding='utf-8') as g:
                    for line in g:
                        try:
                            d = json.loads(line)
                            src = d.get('_source', d)
                            iid = src.get('id') or d.get('_id')
                            if iid:
                                out.write(iid + '\n')
                                total_lines += 1
                        except json.JSONDecodeError:
                            pass
                break
            except Exception as e:
                if attempt == 2:
                    erros_arquivos.append((f.name, str(e)))
                    break
                time.sleep(1.5 * (attempt + 1))
        # checkpoint
        if (i + 1) % 500 == 0 or (i + 1) == len(files):
            CHK.write_text(str(i + 1))
            out.flush()
        if time.time() - last_report > 10:
            pct = (i + 1) / len(files) * 100
            rate = (i + 1 - start_idx) / (time.time() - t0)
            eta = (len(files) - i - 1) / max(rate, 0.1)
            print(f"  [{i+1}/{len(files)}] {pct:.1f}%  lines:{total_lines:,}  rate:{rate:.1f} arq/s  eta:{eta/60:.1f}min  err:{len(erros_arquivos)}")
            last_report = time.time()

print(f"\nConcluido. Total linhas escritas: {total_lines:,}")
print(f"Erros de leitura: {len(erros_arquivos)}")
if erros_arquivos[:5]:
    for name, err in erros_arquivos[:5]:
        print(f"  {name}: {err[:120]}")

print(f"\nContando uniques via DuckDB...")
# DuckDB read_csv do arquivo texto (1 coluna) e count distinct
cmd = [
    r"C:/Users/medin/tools/duckdb/duckdb.exe",
    "-c",
    f"SELECT COUNT(*) AS linhas, COUNT(DISTINCT column0) AS unicos FROM read_csv_auto('{OUT_IDS.as_posix()}', header=false);"
]
r = subprocess.run(cmd, capture_output=True, text=True)
print(r.stdout)
if r.returncode != 0:
    print(f"Erro DuckDB: {r.stderr}")

print(f"Duração total: {(time.time()-t0)/60:.1f} min")
