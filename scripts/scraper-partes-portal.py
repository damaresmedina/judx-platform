#!/usr/bin/env python3
"""
scraper-partes-portal.py — Recupera dados completos do portal STF por incidente
Varre faixas de incidentes e extrai: partes + informações processuais.
Salva HTML bruto como fallback.

Usa 2 endpoints leves por incidente (~3KB cada):
  - abaPartes.asp      → polo ativo, polo passivo, advogados
  - abaInformacoes.asp → assunto, data protocolo, orgao origem, UF, numero origem

Uso:
  python scraper-partes-portal.py [START] [END] [--throttle DELAY]
  Default: 5.059.030 a 7.600.000
  Pre-2000: python scraper-partes-portal.py 1 1405086

Criado: 31/mar/2026 — Claude Code — Projeto JudX
"""

import requests, urllib3, re, csv, time, os, sys, gzip
urllib3.disable_warnings()

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
BASE_DIR = r"C:\Users\medin\Desktop\backup_judx\resultados"
OUT_FILE = os.path.join(BASE_DIR, "partes_recuperadas_portal.csv")
CHECKPOINT = os.path.join(BASE_DIR, "scraper_checkpoint.txt")
HTML_DIR = os.path.join(BASE_DIR, "html_raw_partes")

DEFAULT_START = 5059030
DEFAULT_END = 7600000
DEFAULT_THROTTLE = 0.3

PORTAL = 'https://portal.stf.jus.br/processos'

# Classes processuais do STF para regex
CLASSES_RE = r'(?:ARE|RE|HC|Rcl|ADI|ADPF|AP|AR|MS|RHC|Pet|ACO|MI|STP|SL|SS|RMS|Ext|AO|AImp|ADC|ADO|Inq|AC|EP|CC|RvC|PSV|HD|PPE|TPA|IF|AOE|EI|RMI|RC|SIRDR|RHD)'


def parse_partes(html):
    """Extrai polo ativo, polo passivo e advogados do HTML de abaPartes.asp"""
    text = re.sub(r'&nbsp;?', ' ', html)
    text = re.sub(r'<[^>]+>', '|', text)
    tokens = [t.strip() for t in text.split('|') if t.strip()]

    ATIVOS = ['REQTE.','IMPTE.','RECLTE.','PACTE.','AUTOR','RECTE.','BENEF.',
              'AGTE.','EXEQTE.','SUSTE.','EMBARGTE.']
    PASSIVOS = ['REQDO.','IMPDO.','RECLDO.','COATOR','RÉU','REU','RECDO.',
                'INTDO.','AGDO.','EXEDO.','AM. CURIAE','A.M. CURIAE','ASSIST.',
                'EMBARGDO.','LITISCONSORTE']
    ADVS = ['ADV.','PROC.','ADVOGADO','PROCURADOR','DEFENSOR','MIN. RELATOR']

    polo_ativo, polo_passivo, advogados = [], [], []
    current_type = None

    for t in tokens:
        tu = t.upper().strip()
        if not tu:
            continue
        matched = False
        for p in ATIVOS:
            if tu.startswith(p.upper()):
                current_type = 'ativo'; matched = True; break
        if not matched:
            for p in PASSIVOS:
                if tu.startswith(p.upper()):
                    current_type = 'passivo'; matched = True; break
        if not matched:
            for p in ADVS:
                if tu.startswith(p.upper()):
                    current_type = 'adv'; matched = True; break
        if not matched and current_type and len(t) > 2:
            clean = t.strip()
            if clean.startswith('E OUTRO') or clean.startswith('(') or len(clean) < 3:
                continue
            if current_type == 'ativo' and clean not in polo_ativo:
                polo_ativo.append(clean)
            elif current_type == 'passivo' and clean not in polo_passivo:
                polo_passivo.append(clean)
            elif current_type == 'adv' and clean not in advogados:
                advogados.append(clean)

    return ' | '.join(polo_ativo), ' | '.join(polo_passivo), ' | '.join(advogados)


def parse_informacoes(html):
    """Extrai metadados de abaInformacoes.asp"""
    text = re.sub(r'<[^>]+>', '|', html)
    tokens = [t.strip() for t in text.split('|') if t.strip()]

    info = {
        'assunto': '',
        'data_protocolo': '',
        'orgao_origem': '',
        'uf_origem': '',
        'numero_origem': '',
        'procedencia': '',
    }

    for i, t in enumerate(tokens):
        tl = t.lower().strip().rstrip(':')
        if tl == 'assunto' and i + 1 < len(tokens):
            # Pegar todos os tokens até o próximo label
            assuntos = []
            for j in range(i + 1, min(i + 6, len(tokens))):
                if tokens[j].lower().rstrip(':') in ('procedência', 'data de protocolo', 'órgão de origem', 'origem'):
                    break
                assuntos.append(tokens[j])
            info['assunto'] = ' > '.join(assuntos)
        elif tl == 'data de protocolo' and i + 1 < len(tokens):
            info['data_protocolo'] = tokens[i + 1]
        elif tl in ('órgão de origem', 'orgão de origem') and i + 1 < len(tokens):
            info['orgao_origem'] = tokens[i + 1]
        elif tl == 'origem' and i + 1 < len(tokens):
            info['uf_origem'] = tokens[i + 1]
        elif tl in ('número de origem', 'numero de origem') and i + 1 < len(tokens):
            info['numero_origem'] = tokens[i + 1]
        elif tl == 'procedência' and i + 1 < len(tokens):
            info['procedencia'] = tokens[i + 1]

    return info


def extrair_processo(html_info, numero_origem):
    """Tenta inferir classe+número do processo a partir de abaInformacoes"""
    # O numero_origem contém o número do processo (ex: "6180, 00249121120191000000")
    if numero_origem:
        num = numero_origem.split(',')[0].strip()
        if num.isdigit():
            return num  # só o número, sem classe
    return ''


def salvar_html(inc, html_partes, html_info, html_dir):
    """Salva HTML bruto compactado"""
    subdir = os.path.join(html_dir, str(inc // 100000))
    os.makedirs(subdir, exist_ok=True)
    with gzip.open(os.path.join(subdir, f"{inc}_partes.html.gz"), 'wt', encoding='utf-8') as f:
        f.write(html_partes)
    if html_info:
        with gzip.open(os.path.join(subdir, f"{inc}_info.html.gz"), 'wt', encoding='utf-8') as f:
            f.write(html_info)


def main():
    args = sys.argv[1:]
    throttle = DEFAULT_THROTTLE
    positional = []
    i = 0
    while i < len(args):
        if args[i] == '--throttle':
            throttle = float(args[i + 1])
            i += 2
        else:
            positional.append(args[i])
            i += 1

    START = int(positional[0]) if len(positional) > 0 else DEFAULT_START
    END = int(positional[1]) if len(positional) > 1 else DEFAULT_END
    total_range = END - START

    print(f"Range: {START:,} a {END:,} ({total_range:,} incidentes)")
    print(f"Throttle: {throttle}s | HTML cache: {HTML_DIR}")
    os.makedirs(HTML_DIR, exist_ok=True)

    # Checkpoint
    start_from = START
    if os.path.exists(CHECKPOINT):
        with open(CHECKPOINT, 'r') as f:
            cp = int(f.read().strip())
            if START <= cp <= END:
                start_from = cp
                print(f"Retomando de: {start_from:,}")

    # Sessão HTTP
    session = requests.Session()
    session.headers.update({
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
    })
    session.verify = False

    # CSV header
    HEADER = [
        'incidente', 'numero_origem',
        'polo_ativo', 'polo_passivo', 'advogados',
        'assunto', 'data_protocolo', 'orgao_origem', 'uf_origem', 'procedencia',
    ]

    file_exists = os.path.exists(OUT_FILE) and os.path.getsize(OUT_FILE) > 0
    mode = 'a' if start_from > START and file_exists else 'w'
    fout = open(OUT_FILE, mode, encoding='utf-8', newline='')
    writer = csv.writer(fout, delimiter=';')
    if mode == 'w':
        writer.writerow(HEADER)

    found = 0
    errors_consecutive = 0
    total_errors = 0
    batch_size = 500
    t0 = time.time()

    for batch_start in range(start_from, END, batch_size):
        batch_end = min(batch_start + batch_size, END)
        batch_found = 0

        for inc in range(batch_start, batch_end):
            try:
                # Request 1: abaPartes (leve, ~3KB)
                r1 = session.get(f'{PORTAL}/abaPartes.asp?incidente={inc}', timeout=10)
                html_partes = r1.content.decode('utf-8', errors='replace')

                if r1.status_code == 403:
                    errors_consecutive += 1
                    total_errors += 1
                    if errors_consecutive >= 5:
                        print(f"  BLOQUEADO (5x 403). Pausando 120s...")
                        time.sleep(120)
                        session.close()
                        session = requests.Session()
                        session.headers.update({'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'pt-BR'})
                        session.verify = False
                        errors_consecutive = 0
                        r_test = session.get(f'{PORTAL}/abaPartes.asp?incidente=5724154', timeout=10)
                        if r_test.status_code == 403:
                            print("  Ainda bloqueado. +300s...")
                            time.sleep(300)
                    continue

                errors_consecutive = 0

                # Incidente existe?
                if len(html_partes) <= 200 or '403 Forbidden' in html_partes:
                    continue

                # Request 2: abaInformacoes (leve, ~3KB)
                time.sleep(throttle / 2)  # meio throttle entre os 2 requests do mesmo incidente
                r2 = session.get(f'{PORTAL}/abaInformacoes.asp?incidente={inc}', timeout=10)
                html_info = r2.content.decode('utf-8', errors='replace')

                # Salvar HTML bruto
                salvar_html(inc, html_partes, html_info, HTML_DIR)

                # Parsear
                pa, pp, adv = parse_partes(html_partes)
                info = parse_informacoes(html_info) if len(html_info) > 200 else {}

                writer.writerow([
                    inc,
                    info.get('numero_origem', ''),
                    pa, pp, adv,
                    info.get('assunto', ''),
                    info.get('data_protocolo', ''),
                    info.get('orgao_origem', ''),
                    info.get('uf_origem', ''),
                    info.get('procedencia', ''),
                ])
                found += 1
                batch_found += 1

            except requests.exceptions.Timeout:
                total_errors += 1
            except requests.exceptions.ConnectionError:
                total_errors += 1
                errors_consecutive += 1
                if errors_consecutive >= 3:
                    print(f"  Erro conexão (3x). Pausando 60s...")
                    time.sleep(60)
                    session.close()
                    session = requests.Session()
                    session.headers.update({'User-Agent': UA})
                    session.verify = False
                    errors_consecutive = 0
            except Exception:
                total_errors += 1

            time.sleep(throttle)

        # Checkpoint + flush
        with open(CHECKPOINT, 'w') as f:
            f.write(str(batch_end))
        fout.flush()

        elapsed = time.time() - t0
        speed = (batch_end - start_from) / elapsed if elapsed > 0 else 0
        remaining = (END - batch_end) / speed if speed > 0 else 0
        pct = (batch_end - START) / total_range * 100

        print(f"[{batch_end:,}/{END:,}] {pct:.1f}% | {found:,} ok | +{batch_found} | {speed:.1f}/s | err:{total_errors} | ETA:{remaining/3600:.1f}h")

    fout.close()
    elapsed = time.time() - t0
    print(f"\nFINALIZADO: {found:,} processos em {elapsed/60:.1f} min")
    print(f"Erros: {total_errors:,} | CSV: {OUT_FILE} | HTML: {HTML_DIR}")


if __name__ == '__main__':
    main()
