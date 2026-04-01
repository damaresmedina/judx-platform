"""
fetch-stj-2026-selenium.py
Extrai processos STJ autuados em 2026 via Selenium
Busca por número de registro sequencial (2026/0000001-0 em diante)
Salva em CSV local

Uso: python scripts/fetch-stj-2026-selenium.py [--resume]
"""

import sys, os, re, time, csv
from datetime import datetime

CSV_DIR = r'C:\Users\medin\Desktop\backup_judx\resultados\stj_datajud'
LOG_FILE = os.path.join('logs', 'stj-2026-selenium.log')
COLS = ['numero_processo','classe','data_autuacao','relator','orgao_julgador','ramo_direito','assuntos','tribunal_origem','numeros_origem','tipo_processo','numero_unico','ultima_fase','localizacao']
DELAY = 2

def log(msg):
    line = f"[{datetime.now().isoformat()}] {msg}"
    print(line)
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(line + '\n')

def setup_driver():
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.common.by import By

    opts = Options()
    opts.add_argument('--headless=new')
    opts.add_argument('--no-sandbox')
    opts.add_argument('--disable-dev-shm-usage')
    opts.add_argument('--disable-blink-features=AutomationControlled')
    opts.add_argument('--window-size=1920,1080')
    opts.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36')
    driver = webdriver.Chrome(options=opts)
    driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
        'source': 'Object.defineProperty(navigator, "webdriver", {get: () => undefined})'
    })
    driver.set_page_load_timeout(45)
    return driver

def parse_detalhes(html):
    d = {}
    start = html.find('id="idDivDetalhes"')
    if start == -1:
        return d

    end = html.find('id="idDivFases"', start)
    if end == -1:
        end = start + 30000
    section = html[start:end]

    pattern = r'classSpanDetalhesLabel">([^<]*)</span>\s*[\s\S]*?classSpanDetalhesTexto">([\s\S]*?)</span>'
    METADATA = ['PROCESSO','LOCALIZAÇÃO','LOCALIZAÇ','TIPO','AUTUAÇÃO','AUTUAÇ',
                'NÚMERO ÚNICO','NÚMEROS DE ORIGEM','RAMO DO DIREITO','ASSUNTO',
                'RELATOR','ÚLTIMA FASE','TRIBUNAL DE ORIGEM','&NBSP;','\xa0']

    current_polo = None
    for m in re.finditer(pattern, section):
        raw_label = m.group(1).strip().rstrip(':')
        label = raw_label.upper().strip()
        text = re.sub(r'<!--[\s\S]*?-->', '', m.group(2))
        text = re.sub(r'<[^>]*>', '', text)
        text = re.sub(r'\s+', ' ', text).strip()
        if not text:
            continue

        if label.startswith('RELATOR'):
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
            d['data_autuacao'] = text
        elif label == 'TIPO':
            d['tipo_processo'] = text
        elif 'NICO' in label or 'NÚMERO ÚNICO' in label:
            d['numero_unico'] = text
        elif 'LTIMA FASE' in label or 'ÚLTIMA FASE' in label:
            d['ultima_fase'] = text

    # Extrair classe do processo
    proc_match = re.search(r'idSpanClasseDescricao[\s\S]*?>([\s\S]*?)</span', html)
    if proc_match:
        proc_id = re.sub(r'<[^>]*>', '', proc_match.group(1))
        proc_id = re.sub(r'\s+', ' ', proc_id).strip()
        proc_id = re.sub(r'\s*nº\s*', ' ', proc_id, flags=re.IGNORECASE)
        proc_id = re.sub(r'\s*/\s*\w+$', '', proc_id).strip()
        d['processo'] = proc_id
        parts = re.match(r'^(.+?)\s+(\d+)$', proc_id)
        if parts:
            d['classe'] = parts.group(1)

    return d

def main():
    resume = '--resume' in sys.argv
    os.makedirs('logs', exist_ok=True)
    os.makedirs(CSV_DIR, exist_ok=True)

    csv_file = os.path.join(CSV_DIR, 'stj_datajud_2026.csv')

    # Carregar existentes
    existentes = set()
    if os.path.exists(csv_file):
        with open(csv_file, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            next(reader, None)  # skip header
            for row in reader:
                if row:
                    existentes.add(row[0])
        log(f"Resume: {len(existentes)} processos já extraídos")
    else:
        with open(csv_file, 'w', newline='', encoding='utf-8') as f:
            csv.writer(f).writerow(COLS)

    log("Iniciando Chrome headless...")
    driver = setup_driver()
    log("Chrome OK")

    # Estratégia: buscar por número de registro sequencial 2026/NNNNNNN
    # O STJ numera sequencialmente: 2026/0000001-0, 2026/0000002-8, etc.
    # Vamos iterar e buscar processo por processo

    # Primeiro: descobrir o range de registros de 2026
    # Testar um registro alto para achar o limite
    success = 0
    errors = 0
    error_streak = 0
    MAX_ERRORS = 20

    # Buscar processos recentes — começar do mais recente
    # Usar busca genérica com ordenação descendente
    start_reg = 400000  # começar alto e ir descendo
    step = -1

    for reg_num in range(start_reg, 0, step):
        if error_streak >= MAX_ERRORS:
            log(f">> {MAX_ERRORS} erros seguidos — parando")
            break

        reg = f"2026{reg_num:07d}"
        url = f"https://processo.stj.jus.br/processo/pesquisa/?aplicacao=processos.ea&tipoPesquisa=tipoPesquisaNumeroRegistro&num_registro={reg}"

        try:
            driver.get(url)
            time.sleep(1)

            # Esperar Angular renderizar
            for _ in range(5):
                html = driver.page_source
                if 'idDivDetalhes' in html or 'Nenhum registro' in html or 'nenhum processo' in html.lower():
                    break
                time.sleep(1)

            html = driver.page_source

            if 'idDivDetalhes' in html:
                det = parse_detalhes(html)
                numero = det.get('numero_unico', '').replace('-', '').replace('.', '')
                if not numero:
                    numero = reg

                if numero not in existentes:
                    row = [
                        numero,
                        det.get('classe', ''),
                        det.get('data_autuacao', ''),
                        det.get('relator', ''),
                        det.get('orgao_julgador', ''),
                        det.get('ramo_direito', ''),
                        det.get('assuntos', ''),
                        det.get('tribunal_origem', ''),
                        det.get('numeros_origem', ''),
                        det.get('tipo_processo', ''),
                        det.get('numero_unico', ''),
                        det.get('ultima_fase', ''),
                        det.get('localizacao', '')
                    ]
                    with open(csv_file, 'a', newline='', encoding='utf-8') as f:
                        csv.writer(f).writerow(row)
                    existentes.add(numero)
                    success += 1
                    error_streak = 0

                    if success % 10 == 0:
                        log(f"[{success}] reg {reg} | {det.get('processo','-')} | {det.get('relator','-')}")
                else:
                    error_streak = 0  # processo existe mas já temos

            elif 'challenge' in html.lower() or 'cloudflare' in html.lower():
                errors += 1
                error_streak += 1
                log(f"BLOQUEADO em reg {reg} — esperando 30s")
                time.sleep(30)
                # Reiniciar driver
                if error_streak >= 5:
                    driver.quit()
                    time.sleep(5)
                    driver = setup_driver()
                    error_streak = 0
                    log("Chrome reiniciado")
            else:
                # Nenhum resultado — processo não existe com esse registro
                error_streak += 1

        except Exception as e:
            errors += 1
            error_streak += 1
            log(f"ERRO reg {reg}: {e}")

        time.sleep(DELAY)

    log(f"\n=== COMPLETO — {success} processos, {errors} erros ===")
    driver.quit()

if __name__ == '__main__':
    main()
