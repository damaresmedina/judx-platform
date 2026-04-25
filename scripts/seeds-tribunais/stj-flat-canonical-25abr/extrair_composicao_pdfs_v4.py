"""Parser v4 — definitivo. Detecta colunas DINAMICAMENTE pelos cabeçalhos.
Cobre todos os 14 PDFs datados (3 layouts: 792x612, 842x595, infográfico 2024-11).
Não depende de bounds X fixos.
"""
import sys, re
sys.stdout.reconfigure(encoding='utf-8')
import pdfplumber
from pathlib import Path
import pandas as pd

PDF_DIR = Path(r'C:\Users\medin\Desktop\backup_judx\flat_stj_20260424\exports\composicao_pdfs')
OUT = Path(r'C:\Users\medin\Desktop\backup_judx\flat_stj_20260424\exports\composicao_stj_canonical_v4.csv')

ACCENT = str.maketrans(
    'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ',
    'AAAAAAACEEEEIIIIDNOOOOOOUUUUYBSaaaaaaaceeeeiiiidnoooooouuuuyby'
)
def norm(s):
    if not s: return ''
    s = re.sub(r'\s*\(.*?\)','',str(s)).upper().translate(ACCENT)
    s = re.sub(r'\d+', '', s)
    return re.sub(r'\s+',' ',s).strip()

# Mapa fname → data (extrai do nome ou hardcoded para os outliers)
def parse_data(fname):
    m = re.search(r'(\d{8})', fname)
    if m:
        s = m.group(1)
        return f'{s[:4]}-{s[4:6]}-{s[6:8]}'
    return None

RE_NUM_NOME = re.compile(r'^(\d{1,2})\.\s*(.+)$')
RE_DATA = re.compile(r'(\d{1,2})/\s*(\d{1,2})\s*/\s*(\d{4})')
RE_INGRESSO = re.compile(r'Ingresso:?\s*(\d{1,2})\s*[ºo°]?\s*/\s*(\d{1,2})\s*/\s*(\d{4})', re.IGNORECASE)
RE_TURMA_HEADER = re.compile(r'(PRIMEIRA|SEGUNDA|TERCEIRA|QUARTA|QUINTA|SEXTA)\s+TURMA', re.IGNORECASE)
TURMA_NUM = {'PRIMEIRA':1,'SEGUNDA':2,'TERCEIRA':3,'QUARTA':4,'QUINTA':5,'SEXTA':6}

def detect_column_bounds(page):
    """Detecta bounds X das colunas pelos cabeçalhos PLENÁRIO/CORTE ESPECIAL/PRIMEIRA SEÇÃO/SEGUNDA SEÇÃO/TERCEIRA SEÇÃO/CONSELHO.
    Os cabeçalhos no PDF são CENTRALIZADOS acima de cada coluna, então o bound de cada coluna
    é o ponto médio entre cabeçalhos consecutivos. Para a primeira, x_left=0.
    Retorna dict orgao_codigo → (x_left, x_right)."""
    words = page.extract_words(x_tolerance=2, y_tolerance=3)

    headers = []  # lista (x_center, label)

    # PLENÁRIO (palavra única)
    for w in words:
        t = w['text'].upper().translate(ACCENT)
        if t == 'PLENARIO':
            headers.append(((w['x0']+w['x1'])/2, 'PLENARIO'))
            break
    # CORTE ESPECIAL (CORTE seguido de ESPECIAL logo à direita, mesma linha)
    cortes = [w for w in words if w['text'].upper().translate(ACCENT) == 'CORTE']
    for c in cortes:
        for w in words:
            if (abs(w['top']-c['top']) < 4
                and w['text'].upper().translate(ACCENT) == 'ESPECIAL'
                and w['x0'] > c['x1'] and w['x0'] - c['x1'] < 30):
                x_center = (c['x0'] + w['x1']) / 2
                if not any(lbl == 'CORTE_ESPECIAL' for _, lbl in headers):
                    headers.append((x_center, 'CORTE_ESPECIAL'))
                break
        if any(lbl == 'CORTE_ESPECIAL' for _, lbl in headers): break
    # PRIMEIRA/SEGUNDA/TERCEIRA SEÇÃO (SEÇÃO logo à direita do prefixo, mesma linha)
    for prefixo, nome in [('PRIMEIRA','SECAO_1'), ('SEGUNDA','SECAO_2'), ('TERCEIRA','SECAO_3')]:
        candidatos = [w for w in words if w['text'].upper().translate(ACCENT) == prefixo]
        for c in candidatos:
            for w in words:
                if (abs(w['top']-c['top']) < 4
                    and w['text'].upper().translate(ACCENT).startswith('SECAO')
                    and w['x0'] > c['x1'] and w['x0'] - c['x1'] < 30):
                    x_center = (c['x0'] + w['x1']) / 2
                    if not any(lbl == nome for _, lbl in headers):
                        headers.append((x_center, nome))
                    break
            if any(lbl == nome for _, lbl in headers): break
    # CONSELHO DA JUSTIÇA FEDERAL
    for w in words:
        if w['text'].upper().translate(ACCENT) == 'CONSELHO':
            if not any(lbl == 'CJF' for _, lbl in headers):
                headers.append(((w['x0']+w['x1'])/2, 'CJF'))
            break

    # Ordenar por x_center e calcular bounds = ponto médio entre cabeçalhos consecutivos
    headers.sort()
    bounds = {}
    for i, (xc, label) in enumerate(headers):
        x_left = 0 if i == 0 else (headers[i-1][0] + xc) / 2
        x_right = page.width if i == len(headers)-1 else (xc + headers[i+1][0]) / 2
        bounds[label] = (x_left, x_right)
    return bounds, headers

def extract_per_column(page, x_left, x_right):
    words = [w for w in page.extract_words(x_tolerance=2, y_tolerance=3)
             if x_left <= (w['x0']+w['x1'])/2 < x_right]
    by_y = {}
    for w in words:
        y = round(w['top'])
        for k in list(by_y.keys()):
            if abs(k - y) <= 4:
                by_y[k].append(w); break
        else:
            by_y[y] = [w]
    out = []
    for y in sorted(by_y):
        ws = sorted(by_y[y], key=lambda w: w['x0'])
        out.append((y, ' '.join(w['text'] for w in ws)))
    return out

def parse_plenario(lines, fname, data_ref):
    rows = []
    for y, line in lines:
        m = RE_NUM_NOME.match(line)
        if m:
            ordem = int(m.group(1))
            resto = m.group(2)
            dt = RE_DATA.search(resto)
            nome = RE_DATA.sub('', resto).strip()
            nome = re.sub(r'\(.*?\)', '', nome).strip()
            nome = re.sub(r'[\d\*]+$', '', nome).strip()
            if 1 <= ordem <= 50 and len(nome) > 5:
                rows.append({
                    'fonte_pdf': fname, 'data_referencia': data_ref,
                    'orgao_codigo': 'PLENARIO', 'ordem': float(ordem),
                    'nome_raw': nome, 'nome_key': norm(nome),
                    'data_ingresso_orgao': f'{dt.group(3)}-{dt.group(2).zfill(2)}-{dt.group(1).zfill(2)}' if dt else '',
                    'presidente_bienio_inicio': '', 'presidente_bienio_fim': '',
                    'tipo_registro': 'snapshot_historico', 'observacao': '',
                })
    return rows

RE_DATA_PREFIX = re.compile(r'^[\d\s/ºo°]+?(?=\d{1,2}\.\s)')

def parse_corte_especial(lines, fname, data_ref):
    rows = []
    for y, line in lines:
        line_clean = RE_DATA_PREFIX.sub('', line)  # remove data do PLENARIO que invade
        m = RE_NUM_NOME.match(line_clean)
        if m:
            ordem = int(m.group(1))
            nome = re.sub(r'\(.*?\)', '', m.group(2)).strip()
            nome = re.sub(r'[\d\*]+$', '', nome).strip()
            if 1 <= ordem <= 20 and len(nome) > 5:
                rows.append({
                    'fonte_pdf': fname, 'data_referencia': data_ref,
                    'orgao_codigo': 'CORTE_ESPECIAL', 'ordem': float(ordem),
                    'nome_raw': nome, 'nome_key': norm(nome),
                    'data_ingresso_orgao': '',
                    'presidente_bienio_inicio': '', 'presidente_bienio_fim': '',
                    'tipo_registro': 'snapshot_historico', 'observacao': '',
                })
    return rows

def parse_secao(lines, sec_idx, fname, data_ref):
    """sec_idx: 0=SECAO_1 (turmas 1+2), 1=SECAO_2 (turmas 3+4), 2=SECAO_3 (turmas 5+6)"""
    rows = []
    turma_par = (sec_idx*2 + 1, sec_idx*2 + 2)
    turma_atual = None
    pendentes = []
    for y, line in lines:
        m_turma = RE_TURMA_HEADER.search(line)
        if m_turma:
            new_turma = TURMA_NUM[m_turma.group(1).upper()]
            if new_turma in turma_par:
                turma_atual = new_turma
                pendentes = []
            continue
        if turma_atual is None: continue
        ingressos = list(RE_INGRESSO.finditer(line))
        if ingressos and pendentes:
            for ing, nome in zip(ingressos, pendentes):
                d, m_, a = ing.group(1), ing.group(2).zfill(2), ing.group(3)
                rows.append({
                    'fonte_pdf': fname, 'data_referencia': data_ref,
                    'orgao_codigo': f'TURMA_{turma_atual}', 'ordem': None,
                    'nome_raw': nome, 'nome_key': norm(nome),
                    'data_ingresso_orgao': f'{a}-{m_}-{d.zfill(2)}',
                    'presidente_bienio_inicio': '', 'presidente_bienio_fim': '',
                    'tipo_registro': 'snapshot_historico', 'observacao': '',
                })
            pendentes = []
            continue
        m = RE_NUM_NOME.match(line)
        if m:
            nome = re.sub(r'\(.*?\)','',m.group(2)).strip()
            nome = re.sub(r'[\d\*]+$','',nome).strip()
            if len(nome) > 5:
                pendentes.append(nome)
    return rows

def parse_2024_infografico(path, fname, data_ref):
    """Parser dedicado para 2024-11 (infográfico vertical Mattos Filho)."""
    rows = []
    with pdfplumber.open(path) as pdf:
        page = pdf.pages[0]
        words = page.extract_words(x_tolerance=2, y_tolerance=3)

        # Localizar TODOS os cabeçalhos "X turma:" e mapear seu x0/top
        ordinals = {'Primeira':1, 'Segunda':2, 'Terceira':3, 'Quarta':4, 'Quinta':5, 'Sexta':6,
                    'PRIMEIRA':1, 'SEGUNDA':2, 'TERCEIRA':3, 'QUARTA':4, 'QUINTA':5, 'SEXTA':6}
        turma_headers = []
        for i, w in enumerate(words):
            if w['text'] in ordinals:
                # próximo word deve ser "turma:" ou "turma"
                if i+1 < len(words) and words[i+1]['text'].lower().startswith('turma'):
                    turma_headers.append({
                        'turma_n': ordinals[w['text']], 'x0': w['x0'], 'top': w['top'],
                    })

        # Para cada turma, coletar bullets até a próxima turma (em qualquer coluna)
        # Definir região retangular: x ∈ [x0-10, x0+220], top ∈ [top+15, top_próximo_na_mesma_coluna]
        for i, t in enumerate(turma_headers):
            # Próxima turma na mesma coluna (x0 próximo)
            mesma_col = [tt for tt in turma_headers if abs(tt['x0']-t['x0'])<30 and tt['top'] > t['top']]
            top_max = mesma_col[0]['top'] - 5 if mesma_col else page.height
            # Coletar palavras nessa região
            region_words = [w for w in words
                            if t['x0']-15 <= w['x0'] < t['x0']+250
                            and t['top']+15 < w['top'] < top_max]
            # Reagrupar por linha y
            by_y = {}
            for w in region_words:
                y = round(w['top'])
                for k in list(by_y.keys()):
                    if abs(k - y) <= 4:
                        by_y[k].append(w); break
                else:
                    by_y[y] = [w]
            for y in sorted(by_y):
                ws = sorted(by_y[y], key=lambda w: w['x0'])
                line = ' '.join(w['text'] for w in ws)
                # bullet começa com • ou linha tem nome próprio
                line_clean = line.lstrip('•').strip()
                if not line_clean: continue
                if 'turma:' in line_clean.lower() or 'sessão' in line_clean.lower() or 'sessão' in line_clean.lower(): continue
                if line_clean.lower().startswith(('duas cadeiras','o stj','aguardam','presidente da')): continue
                is_pres = '(Presidente)' in line_clean
                is_conv = 'Convocado' in line_clean or 'Des.' in line_clean
                nome = re.sub(r'\(.*?\)', '', line_clean).strip()
                if len(nome) < 4: continue
                rows.append({
                    'fonte_pdf': fname, 'data_referencia': data_ref,
                    'orgao_codigo': f'TURMA_{t["turma_n"]}', 'ordem': None,
                    'nome_raw': nome, 'nome_key': norm(nome),
                    'data_ingresso_orgao': '',
                    'presidente_bienio_inicio': '', 'presidente_bienio_fim': '',
                    'tipo_registro': 'guia_membro',
                    'observacao': ('presidente_turma' if is_pres else ('convocado' if is_conv else '')),
                })
                if is_pres:
                    rows.append({
                        'fonte_pdf': fname, 'data_referencia': data_ref,
                        'orgao_codigo': f'TURMA_{t["turma_n"]}_PRESID', 'ordem': None,
                        'nome_raw': nome, 'nome_key': norm(nome),
                        'data_ingresso_orgao': '',
                        'presidente_bienio_inicio': '', 'presidente_bienio_fim': '',
                        'tipo_registro': 'guia_presidencia', 'observacao': 'PDF 2024-11-01 (Mattos Filho)',
                    })
        # Presidência STJ
        txt = page.extract_text() or ''
        m_pres = re.search(r'Presidente:\s*([^\n]+)', txt)
        m_vice = re.search(r'Vice-Presidente:\s*([^\n]+)', txt)
        if m_pres:
            nome = m_pres.group(1).strip()
            rows.append({'fonte_pdf':fname,'data_referencia':data_ref,'orgao_codigo':'PRESIDENCIA','ordem':None,
                         'nome_raw':nome,'nome_key':norm(nome),'data_ingresso_orgao':'',
                         'presidente_bienio_inicio':'2024-08-22','presidente_bienio_fim':'2026-08-22',
                         'tipo_registro':'guia_presidencia','observacao':'PDF 2024-11-01'})
        if m_vice:
            nome = m_vice.group(1).strip()
            rows.append({'fonte_pdf':fname,'data_referencia':data_ref,'orgao_codigo':'VICE_PRESIDENCIA','ordem':None,
                         'nome_raw':nome,'nome_key':norm(nome),'data_ingresso_orgao':'',
                         'presidente_bienio_inicio':'2024-08-22','presidente_bienio_fim':'2026-08-22',
                         'tipo_registro':'guia_presidencia','observacao':'PDF 2024-11-01'})
    return rows

# === MAIN ===
all_rows = []
log = []

for path in sorted(PDF_DIR.glob('composicao_stj_*.pdf')):
    fname = path.name
    data_ref = parse_data(fname)
    if not data_ref:
        log.append((fname, 'sem data', 0))
        continue

    try:
        # Layout específico 2024-11 (infográfico)
        if data_ref == '2024-11-01':
            rows = parse_2024_infografico(path, fname, data_ref)
            all_rows.extend(rows)
            log.append((fname, '2024-11-infografico', len(rows)))
            continue

        # Layout tabular A/B
        with pdfplumber.open(path) as pdf:
            for p_i, page in enumerate(pdf.pages):
                bounds, sorted_h = detect_column_bounds(page)
                if not bounds:
                    log.append((fname, 'sem cabeçalhos', 0))
                    continue
                pdf_rows = []
                for orgao_codigo, (x_left, x_right) in bounds.items():
                    lines = extract_per_column(page, x_left, x_right)
                    if orgao_codigo == 'PLENARIO':
                        pdf_rows.extend(parse_plenario(lines, fname, data_ref))
                    elif orgao_codigo == 'CORTE_ESPECIAL':
                        pdf_rows.extend(parse_corte_especial(lines, fname, data_ref))
                    elif orgao_codigo in ('SECAO_1','SECAO_2','SECAO_3'):
                        sec_idx = int(orgao_codigo[-1]) - 1
                        pdf_rows.extend(parse_secao(lines, sec_idx, fname, data_ref))
                all_rows.extend(pdf_rows)
                log.append((fname, f'{page.width:.0f}x{page.height:.0f} bounds={list(bounds.keys())}', len(pdf_rows)))
    except Exception as e:
        log.append((fname, f'ERRO: {e}', 0))

# === Consolida ===
df = pd.DataFrame(all_rows)
df = df.drop_duplicates(subset=['data_referencia','orgao_codigo','nome_key','data_ingresso_orgao'])
df.to_csv(OUT, index=False, encoding='utf-8-sig')

print(f'\n=== LOG ===')
for fname, info, n in log:
    print(f'  {fname}: {info} → {n} linhas')

print(f'\nTotal v4: {len(df)} linhas → {OUT}')
print(f'\n=== Distribuição por snapshot ===')
print(df.groupby('data_referencia').size().to_string())
print(f'\n=== Distribuição por orgao_codigo ===')
print(df.groupby('orgao_codigo').size().sort_values(ascending=False).to_string())
print(f'\n=== Por snapshot x orgao (matriz) ===')
print(df.groupby(['data_referencia','orgao_codigo']).size().unstack(fill_value=0).to_string())
