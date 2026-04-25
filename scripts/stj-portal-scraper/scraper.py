"""
STJ Portal Scraper — download massivo dos 3,39M processos.

Fluxo:
1. Usa FlareSolverr UMA VEZ por sessao para pegar cf_clearance (cookies) e UA.
2. Faz requests diretos (aiohttp) com esses cookies — rapido, sem browser.
3. Parseia HTML on-the-fly (parser.py) e grava em 4 CSVs (cabecalho, fases, decisoes, partes).
4. Checkpoint SQLite — resume transparente.
5. Se cookie expira (403), renova via FlareSolverr.

Uso:
  python scraper.py                 # roda producao
  python scraper.py --test N        # processa N CNJs aleatorios
  python scraper.py --workers 30
"""
import os, sys, asyncio, aiohttp, time, json, csv, sqlite3, argparse, random, re
from pathlib import Path
from datetime import datetime

try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parser import parse_all

# ==================== CONFIG ====================
CNJ_LIST     = r'G:\stj_portal_raw\_cnjs_todos.csv'
CKPT_DB      = r'G:\stj_portal_raw\_checkpoint.sqlite'
PARSED_DIR   = r'G:\stj_portal_parsed'
LOGS_DIR     = r'G:\stj_portal_raw\_logs'
FS_URL       = 'http://localhost:8191/v1'
BASE_URL     = 'https://processo.stj.jus.br/processo/pesquisa/?termo={cnj}&aplicacao=processos.ea&tipoPesquisa=tipoPesquisaGenerica&chkordem=DESC&chkMorto=MORTO'
BATCH_FLUSH  = 100   # flush CSV a cada N processos
STATUS_EVERY = 200
TIMEOUT_REQ  = 60

Path(PARSED_DIR).mkdir(parents=True, exist_ok=True)
Path(LOGS_DIR).mkdir(parents=True, exist_ok=True)

# CSVs de saida
CSV_CAB = os.path.join(PARSED_DIR, 'cabecalho.csv')
CSV_FAS = os.path.join(PARSED_DIR, 'fases.csv')
CSV_DEC = os.path.join(PARSED_DIR, 'decisoes.csv')
CSV_PAR = os.path.join(PARSED_DIR, 'partes.csv')

CAB_COLS = ['cnj','processo_txt','registro','relator','ramo_direito','assuntos','tribunal_origem','autuacao','localizacao','tipo','numero_unico','numeros_origem','ultima_fase','scraped_at']
FAS_COLS = ['cnj','seq','data','hora','texto','codigo_cnj']
DEC_COLS = ['cnj','seq','tipo','processo_classe','registro','data','ministro','documentos']
PAR_COLS = ['cnj','papel','nome','oab','polo']

def init_csv(path, cols):
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        with open(path, 'w', encoding='utf-8', newline='') as f:
            csv.writer(f).writerow(cols)

def init_ckpt():
    con = sqlite3.connect(CKPT_DB, timeout=30, isolation_level=None)
    con.execute('PRAGMA journal_mode=WAL')
    con.execute('''CREATE TABLE IF NOT EXISTS ckpt(
        cnj TEXT PRIMARY KEY,
        status TEXT,   -- ok / err / notfound
        fases INT, decisoes INT, partes INT, err_msg TEXT,
        ts REAL
    )''')
    con.execute('CREATE INDEX IF NOT EXISTS idx_status ON ckpt(status)')
    return con

# ==================== SESSAO FLARESOLVERR ====================
_session_data = {'cookies': {}, 'ua': '', 'session_id': None, 'fetched_at': 0}

async def fs_create_session(aio):
    """Pede ao FlareSolverr criar sessao e resolver Cloudflare. Retorna (cookies, ua)."""
    # Primeiro pega cookies com 1 request ao portal (funciona de inicio)
    payload = {
        "cmd": "request.get",
        "url": BASE_URL.format(cnj="94140156020088130024"),
        "maxTimeout": 60000,
    }
    async with aio.post(FS_URL, json=payload, timeout=90) as r:
        data = await r.json()
    if data.get('status') != 'ok':
        raise RuntimeError(f"FlareSolverr falhou: {data.get('message')}")
    sol = data['solution']
    _session_data['cookies'] = {c['name']: c['value'] for c in sol.get('cookies', [])}
    _session_data['ua'] = sol.get('userAgent', '')
    _session_data['fetched_at'] = time.time()
    return _session_data

async def refresh_if_needed(aio, lock):
    """Renova cookies se nunca pegou ou se passou muito tempo."""
    if _session_data['fetched_at'] and (time.time() - _session_data['fetched_at']) < 3600:
        return
    async with lock:
        if _session_data['fetched_at'] and (time.time() - _session_data['fetched_at']) < 3600:
            return
        await fs_create_session(aio)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] sessao FlareSolverr renovada ({len(_session_data['cookies'])} cookies)", flush=True)

# ==================== WORKER ====================
async def fetch_and_parse(aio, cnj, ckpt_con, writers_lock, writers, refresh_lock):
    url = BASE_URL.format(cnj=cnj)
    headers = {
        'User-Agent': _session_data['ua'],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Referer': 'https://processo.stj.jus.br/',
    }
    try:
        async with aio.get(url, cookies=_session_data['cookies'], headers=headers, timeout=TIMEOUT_REQ, allow_redirects=True) as r:
            status = r.status
            raw = await r.read()
            # Detectar challenge Cloudflare renovado
            if status == 403 or b'cf-chl' in raw[:5000] or b'Just a moment' in raw[:5000]:
                # renova e re-tenta
                await refresh_if_needed(aio, refresh_lock)
                # sempre força renovação pois detectou challenge
                async with refresh_lock:
                    await fs_create_session(aio)
                headers['User-Agent'] = _session_data['ua']
                async with aio.get(url, cookies=_session_data['cookies'], headers=headers, timeout=TIMEOUT_REQ) as r2:
                    status = r2.status
                    raw = await r2.read()
        if status != 200:
            return ('err', f'http_{status}', {})
        html = raw.decode('ISO-8859-1', errors='replace')
        # Detectar "processo nao encontrado"
        if 'idSpanClasseDescricao' not in html and 'idDetalhesPartesAdvogadosProcuradores' not in html:
            return ('notfound', 'no_processo', {})
        parsed = parse_all(html)
        return ('ok', '', parsed)
    except asyncio.TimeoutError:
        return ('err', 'timeout', {})
    except Exception as e:
        return ('err', str(e)[:200], {})

class CSVWriters:
    def __init__(self):
        self.buf_cab = []; self.buf_fas = []; self.buf_dec = []; self.buf_par = []
    def append(self, cnj, parsed):
        cab = parsed.get('cabecalho') or {}
        row_cab = [cnj] + [cab.get(c, '') for c in CAB_COLS[1:-1]] + [datetime.now().isoformat()]
        self.buf_cab.append(row_cab)
        for f in parsed.get('fases') or []:
            self.buf_fas.append([cnj, f.get('seq',''), f.get('data',''), f.get('hora',''), f.get('texto',''), f.get('codigo_cnj','')])
        for d in parsed.get('decisoes') or []:
            self.buf_dec.append([cnj, d.get('seq',''), d.get('tipo',''), d.get('processo_classe',''), d.get('registro',''), d.get('data',''), d.get('ministro',''), d.get('documentos','')])
        for p in parsed.get('partes') or []:
            self.buf_par.append([cnj, p.get('papel',''), p.get('nome',''), p.get('oab',''), p.get('polo','')])
    def flush(self):
        def _write(path, buf):
            if not buf: return
            with open(path, 'a', encoding='utf-8', newline='') as f:
                csv.writer(f).writerows(buf)
            buf.clear()
        _write(CSV_CAB, self.buf_cab)
        _write(CSV_FAS, self.buf_fas)
        _write(CSV_DEC, self.buf_dec)
        _write(CSV_PAR, self.buf_par)

# ==================== ORQUESTRADOR ====================
async def run(cnjs, n_workers):
    init_csv(CSV_CAB, CAB_COLS)
    init_csv(CSV_FAS, FAS_COLS)
    init_csv(CSV_DEC, DEC_COLS)
    init_csv(CSV_PAR, PAR_COLS)
    ckpt_con = init_ckpt()
    done = set(r[0] for r in ckpt_con.execute("SELECT cnj FROM ckpt WHERE status IN ('ok','notfound')").fetchall())
    print(f"[{datetime.now().strftime('%H:%M:%S')}] ja processados (checkpoint): {len(done):,}", flush=True)

    todo = [c for c in cnjs if c not in done]
    print(f"[{datetime.now().strftime('%H:%M:%S')}] a processar: {len(todo):,}  workers={n_workers}", flush=True)

    queue = asyncio.Queue()
    for c in todo: queue.put_nowait(c)

    conn = aiohttp.TCPConnector(limit=n_workers*2, limit_per_host=n_workers*2, ssl=False)
    timeout = aiohttp.ClientTimeout(total=TIMEOUT_REQ)
    writers = CSVWriters()
    writers_lock = asyncio.Lock()
    refresh_lock = asyncio.Lock()
    stats = {'ok':0, 'err':0, 'notfound':0, 'started': time.time()}

    async with aiohttp.ClientSession(connector=conn, timeout=timeout) as aio:
        await fs_create_session(aio)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] sessao FS inicial OK ({len(_session_data['cookies'])} cookies)", flush=True)

        async def worker(wid):
            batch_processed = 0
            while True:
                try:
                    cnj = queue.get_nowait()
                except asyncio.QueueEmpty:
                    return
                status, err, parsed = await fetch_and_parse(aio, cnj, ckpt_con, writers_lock, writers, refresh_lock)
                stats[status] += 1
                fases = len(parsed.get('fases') or [])
                decs = len(parsed.get('decisoes') or [])
                parts = len(parsed.get('partes') or [])
                async with writers_lock:
                    if status == 'ok':
                        writers.append(cnj, parsed)
                    ckpt_con.execute("INSERT OR REPLACE INTO ckpt VALUES (?,?,?,?,?,?,?)",
                                     (cnj, status, fases, decs, parts, err, time.time()))
                    batch_processed += 1
                    total = stats['ok']+stats['err']+stats['notfound']
                    if batch_processed >= BATCH_FLUSH:
                        writers.flush()
                        batch_processed = 0
                    if total % STATUS_EVERY == 0:
                        elapsed = time.time()-stats['started']
                        rate = total/elapsed if elapsed>0 else 0
                        eta_min = (len(todo)-total)/rate/60 if rate>0 else 0
                        print(f"[{datetime.now().strftime('%H:%M:%S')}] {total:,}/{len(todo):,} ok={stats['ok']:,} err={stats['err']} nf={stats['notfound']} rate={rate:.1f}/s ETA={eta_min:.0f}min", flush=True)
                queue.task_done()

        tasks = [asyncio.create_task(worker(i)) for i in range(n_workers)]
        await queue.join()
        for t in tasks: t.cancel()
        writers.flush()
        elapsed = time.time()-stats['started']
        print(f"\n=== FIM em {elapsed/60:.1f} min ===", flush=True)
        print(f"  ok: {stats['ok']:,}", flush=True)
        print(f"  err: {stats['err']:,}", flush=True)
        print(f"  notfound: {stats['notfound']:,}", flush=True)
        print(f"  rate: {(stats['ok']+stats['err']+stats['notfound'])/elapsed:.1f} req/s", flush=True)

def load_cnjs(test_n=None):
    with open(CNJ_LIST, 'r', encoding='utf-8') as f:
        next(f)  # header
        cnjs = [line.strip() for line in f if line.strip()]
    if test_n:
        random.seed(42)
        return random.sample(cnjs, min(test_n, len(cnjs)))
    return cnjs

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--test', type=int, default=0, help='N cnjs aleatorios (teste)')
    ap.add_argument('--workers', type=int, default=30, help='workers paralelos')
    args = ap.parse_args()
    cnjs = load_cnjs(args.test if args.test else None)
    print(f"[{datetime.now().strftime('%H:%M:%S')}] carregados {len(cnjs):,} CNJs", flush=True)
    asyncio.run(run(cnjs, args.workers))

if __name__ == '__main__':
    main()
