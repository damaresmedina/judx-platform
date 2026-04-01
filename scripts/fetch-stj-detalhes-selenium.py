"""
fetch-stj-detalhes-selenium.py
FASE 1: Extrai APENAS metadados da aba Detalhes de cada processo STJ
Usa Selenium (Chrome headless) — sem FlareSolverr

Campos: relator, órgão julgador, ramo do direito, assuntos, tribunal de origem,
        números de origem, localização, autuação, tipo, número único, última fase

Uso: python scripts/fetch-stj-detalhes-selenium.py [--resume] [--limit N]
"""

import sys, os, re, time, csv, json
from datetime import datetime

# DB
import psycopg2  # need to check

DB_URL = 'postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres'
LOG_FILE = os.path.join('logs', 'stj-detalhes-selenium.log')
BACKUP_DIR = r'C:\Users\medin\Desktop\backup_judx\resultados'
DELAY = 1.5  # seconds between requests

def log(msg):
    line = f"[{datetime.utcnow().isoformat()}] {msg}"
    print(line)
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(line + '\n')

def setup_driver():
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    opts = Options()
    opts.add_argument('--headless=new')
    opts.add_argument('--no-sandbox')
    opts.add_argument('--disable-dev-shm-usage')
    opts.add_argument('--disable-gpu')
    opts.add_argument('--window-size=1920,1080')
    opts.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36')
    driver = webdriver.Chrome(options=opts)
    driver.set_page_load_timeout(45)
    return driver

def parse_detalhes(html):
    """Extrai campos da aba Detalhes via regex no HTML"""
    d = {}

    # Encontrar seção de detalhes
    start = html.find('id="idDivDetalhes"')
    if start == -1:
        return d

    # Pegar até a seção de fases (não precisamos dela)
    end = html.find('id="idDivFases"', start)
    if end == -1:
        end = start + 30000
    section = html[start:end]

    # Extrair pares label:texto
    pattern = r'classSpanDetalhesLabel">([^<]*)</span>\s*[\s\S]*?classSpanDetalhesTexto">([\s\S]*?)</span>'

    for m in re.finditer(pattern, section):
        raw_label = m.group(1).strip().rstrip(':')
        label = raw_label.upper().strip()
        text = m.group(2)
        # Limpar HTML
        text = re.sub(r'<!--[\s\S]*?-->', '', text)
        text = re.sub(r'<[^>]*>', '', text)
        text = re.sub(r'\s+', ' ', text).strip()
        if not text:
            continue

        if label.startswith('RELATOR'):
            # "Min. MARIA ISABEL GALLOTTI - QUARTA TURMA"
            rel = re.match(r'^(?:Min\.\s*)?(.+?)\s*-\s*(.+)$', text)
            if rel:
                d['relator'] = rel.group(1).strip()
                d['orgao_julgador'] = rel.group(2).strip()
            else:
                d['relator'] = text
        elif label.startswith('RAMO DO DIREITO'):
            d['ramo_direito'] = text
        elif label.startswith('ASSUNTO'):
            d['assuntos'] = text
        elif label.startswith('TRIBUNAL DE ORIGEM'):
            d['tribunal_origem'] = text
        elif 'MEROS DE ORIGEM' in label or 'NÚMEROS DE ORIGEM' in label:
            d['numeros_origem'] = text
        elif label.startswith('LOCALIZA'):
            d['localizacao'] = text
        elif label.startswith('AUTUA'):
            d['autuacao'] = text
        elif label == 'TIPO':
            d['tipo_processo'] = text
        elif 'NICO' in label or 'NÚMERO ÚNICO' in label:
            d['numero_unico'] = text
        elif 'LTIMA FASE' in label or 'ÚLTIMA FASE' in label:
            d['ultima_fase'] = text

        # Partes — capturar para identificar polo
        # AGRAVANTE, AGRAVADO, RECORRENTE, RECORRIDO, etc.
        POLO_ATIVO = ['AGRAVANTE', 'RECORRENTE', 'IMPETRANTE', 'AUTOR', 'REQUERENTE', 'EMBARGANTE', 'EXEQUENTE', 'APELANTE']
        POLO_PASSIVO = ['AGRAVADO', 'RECORRIDO', 'IMPETRADO', 'REU', 'REQUERIDO', 'EMBARGADO', 'EXECUTADO', 'APELADO']

        for p in POLO_ATIVO:
            if label.startswith(p):
                if 'partes' not in d:
                    d['partes'] = []
                d['partes'].append({'papel': raw_label, 'nome': text, 'polo': 'ativo'})
                break
        for p in POLO_PASSIVO:
            if label.startswith(p):
                if 'partes' not in d:
                    d['partes'] = []
                d['partes'].append({'papel': raw_label, 'nome': text, 'polo': 'passivo'})
                break

    return d

def get_processo_id(html, classe, numero):
    """Extrai o nome do processo da página"""
    m = re.search(r'idSpanClasseDescricao[\s\S]*?>([\s\S]*?)</span', html)
    if m:
        proc_id = re.sub(r'<[^>]*>', '', m.group(1))
        proc_id = re.sub(r'\s+', ' ', proc_id).strip()
        proc_id = re.sub(r'\s*nº\s*', ' ', proc_id, flags=re.IGNORECASE)
        proc_id = re.sub(r'\s*/\s*\w+$', '', proc_id).strip()
        return proc_id
    return f"{classe} {numero}"

def main():
    args = sys.argv[1:]
    resume = '--resume' in args
    limit = None
    if '--limit' in args:
        idx = args.index('--limit')
        limit = int(args[idx + 1])

    os.makedirs('logs', exist_ok=True)

    # Conectar banco
    try:
        import psycopg2
    except ImportError:
        log("Instalando psycopg2...")
        os.system(f'"{sys.executable}" -m pip install psycopg2-binary --quiet')
        import psycopg2

    conn = psycopg2.connect(DB_URL, sslmode='require')
    conn.autocommit = True
    cur = conn.cursor()
    log('Conectado ao banco JudX')

    # Buscar todos os processos
    cur.execute("SELECT DISTINCT ON (numero) numero, classe FROM stj_contramostra ORDER BY numero DESC")
    contramostra = cur.fetchall()
    cur.execute("SELECT DISTINCT ON (numero) numero, classe FROM stj_processos_semente ORDER BY numero DESC")
    sementes = cur.fetchall()

    seen = set()
    processos = []
    for numero, classe in contramostra:
        if numero not in seen:
            seen.add(numero)
            processos.append((numero, classe))
    for numero, classe in sementes:
        if numero not in seen:
            seen.add(numero)
            processos.append((numero, classe))

    log(f"Total: {len(processos)} processos")

    # Resume
    if resume:
        cur.execute("SELECT processo FROM stj_processo_detalhes")
        done = set(r[0] for r in cur.fetchall())
        before = len(processos)
        processos = [(n, c) for n, c in processos if f"{c} {n}".replace(' nº ', ' ').strip() not in done]
        log(f"Resume: {before - len(processos)} já feitos, {len(processos)} restantes")

    if limit:
        processos = processos[:limit]
        log(f"Limitado a {limit}")

    # Setup Selenium
    log("Iniciando Chrome headless...")
    driver = setup_driver()
    log("Chrome OK")

    success = 0
    errors = 0
    error_streak = 0
    MAX_ERROR_STREAK = 10

    det_fields = ['relator', 'orgao_julgador', 'ramo_direito', 'assuntos', 'tribunal_origem',
                  'numeros_origem', 'localizacao', 'autuacao', 'tipo_processo', 'numero_unico', 'ultima_fase']

    for i, (numero, classe) in enumerate(processos):
        termo = f"{classe} {numero}"
        url = f"https://processo.stj.jus.br/processo/pesquisa/?termo={termo}&aplicacao=processos.ea&tipoPesquisa=tipoPesquisaGenerica&chkordem=DESC&chkMorto=MORTO"

        try:
            driver.get(url)
            time.sleep(0.5)  # esperar render
            html = driver.page_source

            # Verificar se foi bloqueado
            if 'Acesso negado' in html or len(html) < 500:
                raise Exception("Bloqueado ou página vazia")

            proc_id = get_processo_id(html, classe, numero)
            det = parse_detalhes(html)

            if det and any(det.get(f) for f in det_fields):
                cols = ['processo', 'numero', 'classe']
                vals = [proc_id, numero, classe]
                for f in det_fields:
                    if det.get(f):
                        cols.append(f)
                        vals.append(det[f])

                placeholders = ', '.join([f'%s'] * len(vals))
                update_set = ', '.join([f"{c} = %s" for c in cols[1:]])
                update_vals = vals[1:]

                cur.execute(
                    f"INSERT INTO stj_processo_detalhes ({', '.join(cols)}) VALUES ({placeholders}) "
                    f"ON CONFLICT (processo) DO UPDATE SET {update_set}",
                    vals + update_vals
                )

                success += 1
                error_streak = 0

                if (i + 1) % 10 == 0 or i == 0:
                    pct = (i + 1) / len(processos) * 100
                    log(f"[{pct:.1f}%] {i+1}/{len(processos)} | {proc_id} | relator: {det.get('relator', '-')} | turma: {det.get('orgao_julgador', '-')} | ok: {success} erros: {errors}")
            else:
                success += 1
                error_streak = 0
                if (i + 1) % 10 == 0:
                    pct = (i + 1) / len(processos) * 100
                    log(f"[{pct:.1f}%] {i+1}/{len(processos)} | {proc_id} | sem detalhes | ok: {success} erros: {errors}")

        except Exception as e:
            errors += 1
            error_streak += 1
            log(f"ERRO {termo}: {e}")

            # Se muitos erros seguidos, reiniciar Chrome
            if error_streak >= MAX_ERROR_STREAK:
                log(f">> {MAX_ERROR_STREAK} erros seguidos — reiniciando Chrome...")
                try:
                    driver.quit()
                except:
                    pass
                time.sleep(5)
                driver = setup_driver()
                error_streak = 0
                log("Chrome reiniciado")

        # Backup CSV a cada 500
        if (i + 1) % 500 == 0:
            today = datetime.utcnow().strftime('%Y-%m-%d')
            csv_file = os.path.join(BACKUP_DIR, f'stj_detalhes_{today}.csv')
            cur.execute("SELECT * FROM stj_processo_detalhes ORDER BY id")
            rows = cur.fetchall()
            colnames = [desc[0] for desc in cur.description]
            with open(csv_file, 'w', newline='', encoding='utf-8') as f:
                w = csv.writer(f)
                w.writerow(colnames)
                w.writerows(rows)
            log(f"CSV backup: {csv_file} ({len(rows)} rows)")

        if i < len(processos) - 1:
            time.sleep(DELAY)

    # Final
    log(f"\n=== FASE 1 COMPLETA ===")
    log(f"Sucesso: {success} | Erros: {errors}")

    # CSV final
    today = datetime.utcnow().strftime('%Y-%m-%d')
    csv_file = os.path.join(BACKUP_DIR, f'stj_detalhes_{today}.csv')
    cur.execute("SELECT * FROM stj_processo_detalhes ORDER BY id")
    rows = cur.fetchall()
    colnames = [desc[0] for desc in cur.description]
    with open(csv_file, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(colnames)
        w.writerows(rows)
    log(f"CSV final: {csv_file} ({len(rows)} rows)")

    cur.execute("SELECT count(*) FROM stj_processo_detalhes")
    log(f"stj_processo_detalhes: {cur.fetchone()[0]} registros no banco")

    driver.quit()
    cur.close()
    conn.close()

if __name__ == '__main__':
    main()
