"""
Parser HTML do portal processo.stj.jus.br (encoding ISO-8859-1).
Extrai: cabecalho, decisoes, fases, partes.
"""
import re
from html import unescape
from bs4 import BeautifulSoup

POLO_ATIVO = {'AGRAVANTE','RECORRENTE','IMPETRANTE','AUTOR','REQUERENTE','EMBARGANTE','SUSCITANTE','EXEQUENTE','HABILITANDO','PETICIONANTE','DENUNCIANTE','INVENTARIANTE'}
POLO_PASSIVO = {'AGRAVADO','RECORRIDO','IMPETRADO','REU','REQUERIDO','EMBARGADO','SUSCITADO','EXECUTADO','HABILITADO','DENUNCIADO'}
ADVOGADO_LABELS = {'ADVOGADO','PROCURADOR','DEFENSOR','DEFENSOR PUBLICO','DEFENSORA'}
METADATA_LABELS = {
    '', '&NBSP;', '\xa0', '-',
    'PROCESSO','LOCALIZACAO','TIPO','AUTUACAO','NUMERO UNICO','NUMEROS DE ORIGEM',
    'RAMO DO DIREITO','ASSUNTO','ASSUNTOS','RELATOR(A)','ULTIMA FASE','TRIBUNAL DE ORIGEM',
    'REGISTRO','CLASSE'
}

def _norm(s):
    return re.sub(r'\s+', ' ', unescape(s or '')).strip()

def _txt(el):
    return _norm(el.get_text(' ', strip=True)) if el else ''

def _ascii(s):
    """Uppercased + sem acentos para match de papel."""
    import unicodedata
    if not s: return ''
    s = unicodedata.normalize('NFKD', s.upper())
    return ''.join(c for c in s if not unicodedata.combining(c)).strip(' :')

def parse_cabecalho(soup):
    out = {}
    e = soup.find(id='idSpanClasseDescricao')
    if e: out['processo_txt'] = _txt(e)
    e = soup.find(id='idSpanNumeroRegistro')
    if e: out['registro'] = _txt(e).strip('()')
    for lin in soup.select('div.classDivLinhaDetalhes'):
        lab = _ascii(_txt(lin.select_one('.classSpanDetalhesLabel')))
        val = _txt(lin.select_one('.classSpanDetalhesTexto'))
        if 'RELATOR' in lab: out['relator'] = val
        elif lab == 'RAMO DO DIREITO': out['ramo_direito'] = val
        elif lab.startswith('ASSUNTO'): out['assuntos'] = val
        elif 'TRIBUNAL DE ORIGEM' in lab: out['tribunal_origem'] = val
        elif 'AUTUACAO' in lab: out['autuacao'] = val
        elif 'LOCALIZA' in lab: out['localizacao'] = val
        elif lab == 'TIPO': out['tipo'] = val
        elif 'NUMERO UNICO' in lab: out['numero_unico'] = val
        elif 'NUMEROS DE ORIGEM' in lab: out['numeros_origem'] = val
        elif lab == 'ULTIMA FASE': out['ultima_fase'] = val
    return out

def parse_fases(soup):
    fases = []
    div = soup.find(id='idDivFases')
    if not div: return fases
    for seq, linha in enumerate(div.select('div.classDivFaseLinha'), 1):
        data = _txt(linha.select_one('.classSpanFaseData'))
        hora = _txt(linha.select_one('.classSpanFaseHora'))
        txt_el = linha.select_one('.classSpanFaseTexto')
        texto = _txt(txt_el) if txt_el else ''
        cod_cnj = ''
        if txt_el:
            c = txt_el.select_one('.clsFaseCodigoConselhoNacionalJustica')
            if c:
                m = re.search(r'\((\d+)\)', c.get_text(strip=True))
                if m: cod_cnj = m.group(1)
                texto = re.sub(r'\s*\(\d+\)\s*$', '', texto).strip()
        fases.append({
            'seq': seq, 'data': data, 'hora': hora,
            'texto': texto, 'codigo_cnj': cod_cnj,
        })
    return fases

def parse_decisoes(soup):
    """
    Decisoes tem DUAS estruturas principais:
    - Acordaos: <div class=clsDecisoesIntTeorRevistaBloco>
    - Monocraticas: <div class=clsDecisoesMonocraticasBloco>
    """
    decs = []
    div = soup.find(id='idDivDecisoes')
    if not div: return decs
    seq = 0
    # Acordaos
    for bloco in div.select('div.clsDecisoesIntTeorRevistaBloco'):
        seq += 1
        proc_cls = _txt(bloco.select_one('.clsFaseDecisaoIntTeorRevistaLinhaTodosDocumentosPetClSgProc'))
        reg_data = _txt(bloco.select_one('.clsFaseDecisaoIntTeorRevistaLinhaTodosDocumentosRegistroData'))
        # reg_data ex: "(2015/0044677-6 de 04/02/2019)"
        reg, dt = '', ''
        m = re.match(r'\(\s*(\d{4}/\d{7}-\d)\s+de\s+(\d{2}/\d{2}/\d{4})\s*\)', reg_data)
        if m:
            reg, dt = m.group(1), m.group(2)
        ministro = _txt(bloco.select_one('.clsDecisoesIntTeorRevistaMinistroNome'))
        # links de documentos (ementa/acordao, relatorio, certidao)
        docs = []
        for a in bloco.select('a[onclick*=abrirDocumento]'):
            docs.append(_txt(a))
        decs.append({
            'seq': seq, 'tipo': 'acordao',
            'processo_classe': proc_cls,
            'registro': reg, 'data': dt,
            'ministro': ministro.lstrip('- ').strip(),
            'documentos': ' | '.join(docs)[:1000],
        })
    # Monocraticas
    for bloco in div.select('div.clsDecisoesMonocraticasBloco'):
        seq += 1
        # Link principal no topo tem a classe + data
        topo = bloco.select_one('a.clsDecisoesMonocraticasTopoLink')
        topo_txt = _txt(topo)
        # texto tipo: "AREsp 670089 (2015/0044677-6 - 20/05/2015)" ou "... de DD/MM/AAAA)"
        reg, dt = '', ''
        m = re.search(r'(\d{4}/\d{7}-\d)\s+(?:de|-)\s+(\d{2}/\d{2}/\d{4})', topo_txt)
        if m:
            reg, dt = m.group(1), m.group(2)
        ministro = _txt(bloco.select_one('.clsDecisoesMonocraticasMinistroNome, [class*=MonocraticaMinistroNome], [class*=MonocratMinistr]'))
        # documentos
        docs = []
        for a in bloco.select('a[onclick*=abrirDocumento]'):
            docs.append(_txt(a))
        decs.append({
            'seq': seq, 'tipo': 'monocratica',
            'processo_classe': topo_txt,
            'registro': reg, 'data': dt,
            'ministro': ministro.lstrip('- ').strip(),
            'documentos': ' | '.join(docs)[:1000],
        })
    return decs

def parse_partes(soup):
    """
    Sequencia: parte > advogados dela > parte > advogados dela...
    Advogados herdam o polo da parte que vem antes.
    """
    out = []
    div = soup.find(id='idDetalhesPartesAdvogadosProcuradores')
    if not div: return out
    polo_atual = ''
    for lin in div.select('div.classDivLinhaDetalhes'):
        lab_el = lin.select_one('.classSpanDetalhesLabel')
        txt_el = lin.select_one('.classSpanDetalhesTexto')
        lab = _ascii(_txt(lab_el))
        if not lab: continue
        val = _txt(txt_el)
        if not val or lab in METADATA_LABELS: continue

        # PRIORIDADE: advogado/procurador ANTES de qualquer endswith ADO
        if lab in ADVOGADO_LABELS or any(lab.startswith(x) for x in ('ADVOGAD','PROCURADOR','DEFENSOR')):
            # Advogado(s) — pode ser 1 ou N <a>
            anchors = txt_el.select('a') or [None]
            for a in anchors:
                nome = _norm(a.get_text()) if a is not None else val
                if not nome: continue
                oab = ''
                # OAB: " - <UF><digitos><letra?>" no final
                m = re.search(r'-\s*([A-Z]{2}\s*\d{4,7}[A-Z]{0,2})\s*(?:E\s+OUTRO.*)?$', nome)
                if m:
                    oab = re.sub(r'\s+', '', m.group(1))
                    nome = nome[:m.start()].rstrip(' -')
                # caso nome inteiro contenha OAB no meio
                if not oab:
                    m = re.search(r'\b([A-Z]{2}\d{4,7}[A-Z]{0,2})\b', nome)
                    if m:
                        oab = m.group(1)
                out.append({'papel': lab, 'nome': nome.strip(), 'oab': oab, 'polo': polo_atual})
            continue

        # Parte (nao advogado)
        if lab in POLO_ATIVO:
            polo_atual = 'ativo'
        elif lab in POLO_PASSIVO:
            polo_atual = 'passivo'
        elif lab.endswith('ANTE'):
            polo_atual = 'ativo'
        elif lab.endswith('ADO') or lab.endswith('IDO') or lab.endswith('EU'):
            polo_atual = 'passivo'
        else:
            polo_atual = polo_atual or 'terceiro'

        # Nome(s) da parte
        anchors = txt_el.select('a')
        if anchors:
            for a in anchors:
                nome = _norm(a.get_text())
                if nome:
                    out.append({'papel': lab, 'nome': nome, 'oab': '', 'polo': polo_atual})
        else:
            out.append({'papel': lab, 'nome': val, 'oab': '', 'polo': polo_atual})
    return out

def parse_all(html):
    soup = BeautifulSoup(html, 'html.parser')
    return {
        'cabecalho': parse_cabecalho(soup),
        'fases': parse_fases(soup),
        'decisoes': parse_decisoes(soup),
        'partes': parse_partes(soup),
    }

if __name__ == '__main__':
    import sys, json
    try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
    path = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\medin\AppData\Local\Temp\fs_cnj.json'
    if path.endswith('.json'):
        with open(path, 'r', encoding='utf-8') as f:
            html = (json.load(f).get('solution') or {}).get('response', '')
    elif path.endswith('.html'):
        # ler bytes e decodificar Latin-1
        with open(path, 'rb') as f:
            html = f.read().decode('ISO-8859-1')
    r = parse_all(html)
    print(f"=== CABECALHO ===")
    for k, v in r['cabecalho'].items():
        print(f"  {k}: {v[:120]}")
    print(f"\n=== FASES ({len(r['fases'])}) — top 5 ===")
    for f in r['fases'][:5]:
        print(f"  [{f['seq']}] {f['data']} {f['hora']} cod={f['codigo_cnj']} | {f['texto'][:80]}")
    print(f"\n=== DECISOES ({len(r['decisoes'])}) ===")
    for d in r['decisoes']:
        print(f"  [{d['seq']}] tipo={d['tipo']} reg={d['registro']} data={d['data']} min={d['ministro'][:40]} | docs={d['documentos'][:80]}")
    print(f"\n=== PARTES ({len(r['partes'])}) ===")
    for p in r['partes']:
        print(f"  {p['papel']:15s} polo={p['polo']:8s} oab={p['oab']:10s} | {p['nome'][:60]}")
