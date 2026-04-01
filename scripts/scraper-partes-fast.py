#!/usr/bin/env python3
"""
scraper-partes-fast.py — Passe 1: recupera partes do portal STF (rápido)
2 workers paralelos, throttle reduzido, só abaPartes.
Passe 2 (abaInformacoes) roda depois só nos encontrados.

Uso: python scraper-partes-fast.py [--throttle 0.15] [--workers 2]
"""

import requests, urllib3, re, csv, time, os, sys, gzip, threading
from queue import Queue, Empty
urllib3.disable_warnings()

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
BASE_DIR = r"C:\Users\medin\Desktop\backup_judx\resultados"
OUT_FILE = os.path.join(BASE_DIR, "partes_recuperadas_portal.csv")
CHECKPOINT_DIR = os.path.join(BASE_DIR, "scraper_checkpoints")
HTML_DIR = os.path.join(BASE_DIR, "html_raw_partes")
PORTAL = 'https://portal.stf.jus.br/processos'

START = 5072030  # retomar de onde parou
END = 7600000
THROTTLE = 0.15
NUM_WORKERS = 2


def parse_partes(html):
    text = re.sub(r'&nbsp;?', ' ', html)
    text = re.sub(r'<[^>]+>', '|', text)
    tokens = [t.strip() for t in text.split('|') if t.strip()]
    ATIVOS = ['REQTE.','IMPTE.','RECLTE.','PACTE.','AUTOR','RECTE.','BENEF.',
              'AGTE.','EXEQTE.','SUSTE.','EMBARGTE.']
    PASSIVOS = ['REQDO.','IMPDO.','RECLDO.','COATOR','RÉU','REU','RECDO.',
                'INTDO.','AGDO.','EXEDO.','AM. CURIAE','A.M. CURIAE','ASSIST.',
                'EMBARGDO.','LITISCONSORTE']
    ADVS = ['ADV.','PROC.','ADVOGADO','PROCURADOR','DEFENSOR','MIN. RELATOR']
    pa, pp, adv = [], [], []
    ct = None
    for t in tokens:
        tu = t.upper().strip()
        if not tu: continue
        matched = False
        for p in ATIVOS:
            if tu.startswith(p.upper()): ct = 'a'; matched = True; break
        if not matched:
            for p in PASSIVOS:
                if tu.startswith(p.upper()): ct = 'p'; matched = True; break
        if not matched:
            for p in ADVS:
                if tu.startswith(p.upper()): ct = 'd'; matched = True; break
        if not matched and ct and len(t) > 2:
            c = t.strip()
            if c.startswith('E OUTRO') or c.startswith('(') or len(c) < 3: continue
            if ct == 'a' and c not in pa: pa.append(c)
            elif ct == 'p' and c not in pp: pp.append(c)
            elif ct == 'd' and c not in adv: adv.append(c)
    return ' | '.join(pa), ' | '.join(pp), ' | '.join(adv)


# Thread-safe writer
write_lock = threading.Lock()
stats_lock = threading.Lock()
stats = {'found': 0, 'errors': 0, 'empty': 0}


def salvar_html(inc, html):
    subdir = os.path.join(HTML_DIR, str(inc // 100000))
    os.makedirs(subdir, exist_ok=True)
    with gzip.open(os.path.join(subdir, f"{inc}.html.gz"), 'wt', encoding='utf-8') as f:
        f.write(html)


def worker(worker_id, inc_start, inc_end, writer, fout, throttle):
    session = requests.Session()
    session.headers.update({
        'User-Agent': UA,
        'Accept': 'text/html',
        'Accept-Language': 'pt-BR,pt;q=0.9',
    })
    session.verify = False

    cp_file = os.path.join(CHECKPOINT_DIR, f"worker_{worker_id}.txt")

    # Retomar de checkpoint
    if os.path.exists(cp_file):
        with open(cp_file, 'r') as f:
            saved = int(f.read().strip())
            if inc_start <= saved <= inc_end:
                inc_start = saved

    local_found = 0
    local_errors = 0
    consecutive_403 = 0
    batch = 0

    for inc in range(inc_start, inc_end):
        try:
            r = session.get(f'{PORTAL}/abaPartes.asp?incidente={inc}', timeout=10)
            content = r.content.decode('utf-8', errors='replace')

            if r.status_code == 403:
                consecutive_403 += 1
                local_errors += 1
                if consecutive_403 >= 5:
                    print(f"  W{worker_id}: BLOQUEADO. Pausando 180s...")
                    time.sleep(180)
                    session.close()
                    session = requests.Session()
                    session.headers.update({'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'pt-BR'})
                    session.verify = False
                    consecutive_403 = 0
                    # Teste
                    rt = session.get(f'{PORTAL}/abaPartes.asp?incidente=5724154', timeout=10)
                    if rt.status_code == 403:
                        print(f"  W{worker_id}: Ainda bloqueado. +300s...")
                        time.sleep(300)
                continue

            consecutive_403 = 0

            if len(content) > 200 and '403 Forbidden' not in content:
                salvar_html(inc, content)
                pa, pp, adv = parse_partes(content)
                with write_lock:
                    writer.writerow([inc, pa, pp, adv])
                local_found += 1
            else:
                with stats_lock:
                    stats['empty'] += 1

        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
            local_errors += 1
            consecutive_403 += 1
            if consecutive_403 >= 3:
                time.sleep(60)
                session.close()
                session = requests.Session()
                session.headers.update({'User-Agent': UA})
                session.verify = False
                consecutive_403 = 0
        except Exception:
            local_errors += 1

        batch += 1
        if batch % 500 == 0:
            with open(cp_file, 'w') as f:
                f.write(str(inc))
            with stats_lock:
                stats['found'] += local_found
                stats['errors'] += local_errors
            local_found = 0
            local_errors = 0
            with write_lock:
                fout.flush()

        time.sleep(throttle)

    # Final
    with open(cp_file, 'w') as f:
        f.write(str(inc_end))
    with stats_lock:
        stats['found'] += local_found
        stats['errors'] += local_errors
    print(f"  W{worker_id}: FINALIZADO ({inc_start:,}-{inc_end:,})")


def main():
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)
    os.makedirs(HTML_DIR, exist_ok=True)

    total = END - START
    print(f"Range: {START:,} a {END:,} ({total:,} incidentes)")
    print(f"Workers: {NUM_WORKERS} | Throttle: {THROTTLE}s | Passe 1: só abaPartes")

    # Dividir range entre workers
    chunk = total // NUM_WORKERS
    ranges = []
    for i in range(NUM_WORKERS):
        s = START + i * chunk
        e = START + (i + 1) * chunk if i < NUM_WORKERS - 1 else END
        ranges.append((s, e))
        print(f"  W{i}: {s:,} - {e:,} ({e-s:,})")

    # Abrir CSV (append do que já existe)
    file_exists = os.path.exists(OUT_FILE) and os.path.getsize(OUT_FILE) > 0
    fout = open(OUT_FILE, 'a' if file_exists else 'w', encoding='utf-8', newline='')
    writer = csv.writer(fout, delimiter=';')
    if not file_exists:
        writer.writerow(['incidente', 'polo_ativo', 'polo_passivo', 'advogados'])

    t0 = time.time()

    # Lançar workers
    threads = []
    for i, (s, e) in enumerate(ranges):
        t = threading.Thread(target=worker, args=(i, s, e, writer, fout, THROTTLE))
        t.start()
        threads.append(t)
        time.sleep(1)  # stagger para não fazer burst

    # Monitor
    while any(t.is_alive() for t in threads):
        time.sleep(30)
        elapsed = time.time() - t0
        with stats_lock:
            f = stats['found']
            err = stats['errors']
        speed = f / elapsed if elapsed > 0 else 0
        eta = (total * 0.4 - f) / speed / 3600 if speed > 0 else 0  # ~40% densidade
        print(f"[{elapsed/60:.0f}min] encontrados: {f:,} | erros: {err} | {speed:.1f}/s | ETA: {eta:.1f}h")

    fout.close()
    elapsed = time.time() - t0
    print(f"\nFINALIZADO: {stats['found']:,} processos em {elapsed/60:.1f} min")
    print(f"CSV: {OUT_FILE}")


if __name__ == '__main__':
    main()
