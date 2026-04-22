#!/usr/bin/env python3
"""
corte-aberta-mapping-realtime.py
Mapeamento numerico do STF via Qlik Engine API em tempo real.
NAO le arquivos locais. Todas as agregacoes vem dos endpoints do Corte Aberta
(https://transparencia.stf.jus.br) via WebSocket.

Output: G:/datajud_raw/_mapeamento_numerico/stf_corte_aberta_api/
"""

import requests, urllib3, websocket, ssl, json, time, os
from pathlib import Path

urllib3.disable_warnings()

BASE = 'https://transparencia.stf.jus.br'
APP_ID = '023307ab-d927-4144-aabb-831b360515bb'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

OUT = Path(r'G:\datajud_raw\_mapeamento_numerico\stf_corte_aberta_api')
OUT.mkdir(parents=True, exist_ok=True)

class QlikEngine:
    def __init__(self):
        self.ws = None
        self.msg_id = 0
        self.session = requests.Session()
        self.handle = None

    def connect(self):
        print('Conectando ao Qlik do Corte Aberta STF...', flush=True)
        self.session.get(f'{BASE}/extensions/decisoes/decisoes.html',
                         headers={'User-Agent': UA}, verify=False, timeout=15)
        cookie = dict(self.session.cookies).get('X-Qlik-Session', '')
        print(f'  X-Qlik-Session cookie: {cookie[:24]}...', flush=True)
        self.ws = websocket.create_connection(
            f'wss://transparencia.stf.jus.br/app/{APP_ID}',
            sslopt={'cert_reqs': ssl.CERT_NONE},
            header={'User-Agent': UA, 'Cookie': f'X-Qlik-Session={cookie}', 'Origin': BASE},
            timeout=60
        )
        json.loads(self.ws.recv())  # handshake

    def send(self, method, handle=-1, params=None):
        self.msg_id += 1
        self.ws.send(json.dumps({'jsonrpc':'2.0','id':self.msg_id,'method':method,'handle':handle,'params':params or []}))
        while True:
            resp = json.loads(self.ws.recv())
            if resp.get('id') == self.msg_id:
                if 'error' in resp: raise Exception(f"Engine error: {resp['error']}")
                return resp.get('result', resp)

    def open_doc(self):
        r = self.send('OpenDoc', -1, [APP_ID])
        self.handle = r.get('qReturn', {}).get('qHandle', 1)
        print(f'  Doc aberto, handle={self.handle}', flush=True)

    def clear_all(self):
        self.send('ClearAll', self.handle, [False])

    def list_fields(self):
        """Tenta descobrir campos via FieldList session object (GetFieldList não existe nesta versão)."""
        cube_def = {
            'qInfo': {'qType': 'FieldList'},
            'qFieldListDef': {'qShowSystem': False, 'qShowHidden': False, 'qShowSrcTables': True}
        }
        r = self.send('CreateSessionObject', self.handle, [cube_def])
        oh = r.get('qReturn', {}).get('qHandle')
        layout = self.send('GetLayout', oh, [])
        items = layout.get('qLayout', {}).get('qFieldList', {}).get('qItems', [])
        return [(it.get('qName'), it.get('qCardinal', 0), it.get('qTags', [])) for it in items]

    def aggregate_by(self, dimension, measure_expr='Count(DISTINCT [Processo])', limit=2000):
        """Cria hypercube com dim+medida, extrai todos os buckets."""
        cube_def = {
            'qInfo': {'qType': 'table'},
            'qHyperCubeDef': {
                'qDimensions': [{'qDef': {'qFieldDefs': [dimension]}, 'qNullSuppression': True}],
                'qMeasures': [{'qDef': {'qDef': measure_expr, 'qLabel': 'count'}}],
                'qInitialDataFetch': [{'qTop': 0, 'qLeft': 0, 'qHeight': limit, 'qWidth': 2}],
            }
        }
        r = self.send('CreateSessionObject', self.handle, [cube_def])
        obj_handle = r.get('qReturn', {}).get('qHandle')
        layout = self.send('GetLayout', obj_handle, [])
        cube = layout.get('qLayout', {}).get('qHyperCube', {})
        matrix = cube.get('qDataPages', [{}])[0].get('qMatrix', [])
        total_rows = cube.get('qSize', {}).get('qcy', 0)

        # Se tem mais do que o initial fetch, paginar
        all_rows = list(matrix)
        if total_rows > limit:
            print(f'    [{dimension}] {total_rows} valores únicos, paginando...', flush=True)
            offset = len(all_rows)
            while offset < total_rows:
                page = self.send('GetHyperCubeData', obj_handle, ['/qHyperCubeDef',
                    [{'qTop': offset, 'qLeft': 0, 'qHeight': limit, 'qWidth': 2}]])
                extra = page.get('qDataPages', [{}])[0].get('qMatrix', [])
                if not extra: break
                all_rows.extend(extra)
                offset += len(extra)

        buckets = []
        for row in all_rows:
            if len(row) < 2: continue
            key = row[0].get('qText', '')
            val = row[1].get('qNum', 0)
            if key == '' and val == 0: continue
            buckets.append({'key': key, 'count': int(val) if val else 0})
        return {'dimension': dimension, 'measure': measure_expr, 'total_unique': total_rows, 'buckets': buckets}

    def close(self):
        if self.ws: self.ws.close()


def write_csv(path, buckets, col):
    with open(path, 'w', encoding='utf-8', newline='') as fh:
        fh.write(f'{col},doc_count\n')
        for b in buckets:
            k = str(b['key']).replace('"','""')
            fh.write(f'"{k}",{b["count"]}\n')


def main():
    engine = QlikEngine()
    engine.connect()
    engine.open_doc()
    engine.clear_all()
    time.sleep(1)

    # Descobrir campos disponíveis
    try:
        print('\nCampos disponiveis no doc Qlik:', flush=True)
        fields = engine.list_fields()
        for n, c, t in fields[:80]:
            if not n.startswith('$') and not n.startswith('%'):
                print(f'  "{n}": {c} valores unicos', flush=True)
        with open(OUT / 'fields_list.json', 'w', encoding='utf-8') as fh:
            json.dump([{'name':n,'cardinality':c,'tags':t} for n,c,t in fields], fh, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f'  [WARN] nao conseguiu listar fields: {e}', flush=True)
        fields = []

    # Campos a agregar (nomes conforme Corte Aberta STF)
    DIMENSIONS = [
        ('classe_processo', 'Classe Processo'),                      # 47 valores
        ('orgao_julgador', 'Órgão julgador'),                        # 5 valores (nível macro)
        ('relator_decisao', 'Relator decisão'),                      # 37 ministros históricos
        ('relator_atual', 'Mininstro Relator Último Andamento'),     # 35 (typo original do Qlik)
        ('ano_decisao', 'Ano decisão'),                              # 27
        ('ramo_direito', 'Ramo Direito'),                            # 293
        ('origem_decisao', 'Origem decisão'),                        # 8
        ('tipo_decisao', 'Tipo decisão'),                            # 7
        ('assunto_concatenado', 'Assunto Concatenado'),              # 11891
        ('meio_processo', 'Meio Processo'),                          # 2
        ('ambiente_julgamento', 'Ambiente julgamento'),              # 2
        ('sigla_orgao_origem', 'Sigla Órgão Origem'),                # 6 tribunais origem
        ('descricao_orgao_origem', 'Descrição Órgão Origem'),        # 1037 órgãos origem detalhados
        ('sigla_classe_origem', 'Sigla Classe Origem'),              # 2212 classes na origem
        ('tempo_decisao_agregado', 'Tempo decisão agregado'),        # 7 faixas
        ('andamento_decisao', 'Andamento decisão'),                  # 293
        ('tipo_recebimento', 'Tipo Recebimento Processo'),           # 8
        ('preliminar_rg', 'Preliminar RG em Julgamento'),            # 2
        ('merito_julgado', 'Mérito Julgado'),                        # 2
        ('repercussao_geral', 'Repercussão Geral'),                  # 2
        ('preferencia_criminal', 'Preferência Criminal'),            # 2
        ('regiao', 'Região'),                                         # 37 (UF/região)
        ('classificacao_justica', 'Classificação Justiça'),           # 9 (ramo da justiça origem)
        ('localizacao_agrupada', 'Localização atual agrupada'),       # 6
        ('grupo_ultimo_andamento', 'Grupo último andamento'),         # 27
        ('subgrupo_ultimo_andamento', 'Subgrupo último andamento'),   # 44
        ('relator_atual_nome', 'Relator atual'),                      # 35
    ]

    resumo = {
        'fonte': 'Corte Aberta STF via Qlik Engine API (transparencia.stf.jus.br)',
        'app_id': APP_ID,
        'coletado_em': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'medida': 'Count(DISTINCT [Processo])',
        'agregacoes': {},
    }

    for slug, field in DIMENSIONS:
        try:
            print(f'\n[{slug}] campo Qlik: "{field}"', flush=True)
            result = engine.aggregate_by(field)
            csv_path = OUT / f'stf_{slug}.csv'
            write_csv(csv_path, result['buckets'], slug)
            resumo['agregacoes'][slug] = {
                'field': field,
                'total_unique': result['total_unique'],
                'top20': result['buckets'][:20],
            }
            print(f'  -> {csv_path.name}: {len(result["buckets"])} buckets', flush=True)
            time.sleep(1)
        except Exception as e:
            print(f'  ERRO em {slug}: {e}', flush=True)
            resumo['agregacoes'][slug] = {'erro': str(e)}

    # Total de decisões
    try:
        print('\n[TOTAL] contagem global...', flush=True)
        total_result = engine.aggregate_by('Ano decisão', 'Count(DISTINCT [Processo])', limit=100)
        total_decisoes = sum(b['count'] for b in total_result['buckets'])
        resumo['total_decisoes'] = total_decisoes
        print(f'  Total STF decisões: {total_decisoes:,}', flush=True)
    except Exception as e:
        print(f'  ERRO total: {e}', flush=True)

    with open(OUT / 'stf_corte_aberta_resumo.json', 'w', encoding='utf-8') as fh:
        json.dump(resumo, fh, ensure_ascii=False, indent=2)

    engine.close()
    print(f'\n[OK] mapeamento em {OUT}', flush=True)


if __name__ == '__main__':
    main()
