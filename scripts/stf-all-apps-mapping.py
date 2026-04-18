#!/usr/bin/env python3
"""Mapeamento numerico em TODOS os 14 apps Qlik do transparencia.stf.jus.br.
Para cada app: descobre campos, agrega por todos, salva CSV por dimensao.
"""
import requests, urllib3, websocket, ssl, json, time, sys, io, re, os
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
urllib3.disable_warnings()

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
BASE = 'https://transparencia.stf.jus.br'
OUT = Path(r'G:\datajud_raw\_mapeamento_numerico\transparencia_stf')
OUT.mkdir(parents=True, exist_ok=True)

APPS = [
    ('decisoes', '023307ab-d927-4144-aabb-831b360515bb', 'corte_aberta_decisoes'),
    ('acervo', 'd271b5dd-2cdc-4b22-8545-66ef26744c2e', 'corte_aberta_acervo'),
    ('controle_concentrado', 'c47ea922-dbfe-4c3e-9d21-77cd2fed770d', 'corte_aberta_controle_concentrado'),
    ('reclamacoes', '2b3c4258-97bb-4376-88a2-78ac73767214', 'corte_aberta_reclamacoes'),
    ('informacao_a_sociedade', '3a17c6b0-cd6c-4e86-a9d4-8530d39f26b1', 'corte_aberta_informacao_a_sociedade'),
    ('repercussao_geral', 'd00163a8-3179-4450-8084-c0e1ca3daf49', 'corte_aberta_repercussao_geral'),
    ('plenario_virtual', 'ffe3adc6-1714-4231-8853-aa4de23fc499', 'corte_aberta_plenario_virtual'),
    ('distribuido', 'b1424a14-452b-423e-8491-6afb9e464a76', 'corte_aberta_distribuido'),
    ('acoes_covid19', '2fd7dd60-8662-4b26-b02c-6231b32f59b3', 'corte_aberta_acoes_covid19'),
    ('pauta_turmas', '6be1db70-1a69-4d11-a820-00c85d30a580', 'corte_aberta_pauta_turmas'),
    ('omissao_inconstitucional', '794c5574-7295-43e1-a83e-0751c4f2a355', 'corte_aberta_omissao_inconstitucional'),
    ('pauta_plenario', '838158f4-ffe2-404b-87b9-6329ae8f10db', 'corte_aberta_pauta_plenario'),
    ('recebidos_baixados', '98f0041d-5db4-4294-8933-be092bd797f5', 'corte_aberta_recebidos_baixados'),
    ('taxa_provimento', 'ca45dc5b-0684-4d3d-9f49-7ce39dfa6123', 'corte_aberta_taxa_provimento'),
]

class Q:
    def __init__(self, ext_name):
        self.ext_name = ext_name
        self.session = requests.Session()
        self.msg_id = 0
        self.handle = None
        self.ws = None

    def connect_and_open(self, app_id):
        self.session.get(f'{BASE}/extensions/{self.ext_name}/{self.ext_name}.html',
                         headers={'User-Agent': UA}, verify=False, timeout=15)
        cookie = dict(self.session.cookies).get('X-Qlik-Session','')
        self.ws = websocket.create_connection(
            f'wss://transparencia.stf.jus.br/app/{app_id}',
            sslopt={'cert_reqs': ssl.CERT_NONE},
            header={'User-Agent': UA, 'Cookie': f'X-Qlik-Session={cookie}', 'Origin': BASE},
            timeout=60
        )
        json.loads(self.ws.recv())
        r = self.send('OpenDoc', -1, [app_id])
        self.handle = r.get('qReturn',{}).get('qHandle', 1)

    def send(self, method, handle=-1, params=None):
        self.msg_id += 1
        self.ws.send(json.dumps({'jsonrpc':'2.0','id':self.msg_id,'method':method,'handle':handle,'params':params or []}))
        while True:
            resp = json.loads(self.ws.recv())
            if resp.get('id') == self.msg_id:
                if 'error' in resp: raise Exception(resp['error'])
                return resp.get('result', resp)

    def list_fields(self):
        cube = {'qInfo':{'qType':'FieldList'},'qFieldListDef':{'qShowSystem':False,'qShowHidden':False}}
        r = self.send('CreateSessionObject', self.handle, [cube])
        oh = r.get('qReturn',{}).get('qHandle')
        layout = self.send('GetLayout', oh, [])
        items = layout.get('qLayout',{}).get('qFieldList',{}).get('qItems',[])
        return [(it.get('qName'), it.get('qCardinal',0)) for it in items if it.get('qName') and not it.get('qName').startswith('$') and not it.get('qName').startswith('%')]

    def agg(self, field, limit=2000):
        measure = 'Count(1)'  # sem campo processo em todos apps, uso contagem de linhas
        # tentar com Processo primeiro se existir
        cube = {
            'qInfo': {'qType': 'table'},
            'qHyperCubeDef': {
                'qDimensions': [{'qDef': {'qFieldDefs': [field]}, 'qNullSuppression': True}],
                'qMeasures': [{'qDef': {'qDef': measure, 'qLabel': 'count'}}],
                'qInitialDataFetch': [{'qTop':0,'qLeft':0,'qHeight':limit,'qWidth':2}],
            }
        }
        r = self.send('CreateSessionObject', self.handle, [cube])
        oh = r.get('qReturn',{}).get('qHandle')
        layout = self.send('GetLayout', oh, [])
        cube_res = layout.get('qLayout',{}).get('qHyperCube',{})
        matrix = cube_res.get('qDataPages',[{}])[0].get('qMatrix',[])
        total_unique = cube_res.get('qSize',{}).get('qcy',0)
        buckets = []
        for row in matrix:
            if len(row) < 2: continue
            key = row[0].get('qText','')
            val = row[1].get('qNum',0)
            if key == '' and val == 0: continue
            buckets.append({'key': key, 'count': int(val) if val else 0})
        return {'total_unique': total_unique, 'buckets': buckets}

    def close(self):
        if self.ws:
            try: self.ws.close()
            except: pass


def safe(s):
    return re.sub(r'[<>:"/\\|?*]', '_', s)[:40] if s else 'unknown'

resumo_global = {}
for ext_name, app_id, title in APPS:
    print(f'\n=== {title} ({app_id}) ===', flush=True)
    app_dir = OUT / title
    app_dir.mkdir(exist_ok=True)

    q = Q(ext_name)
    try:
        q.connect_and_open(app_id)
        fields = q.list_fields()
        print(f'  {len(fields)} campos disponiveis', flush=True)
        # salvar lista
        (app_dir / 'fields_list.json').write_text(json.dumps(fields, ensure_ascii=False, indent=2), encoding='utf-8')

        # Agregar só campos de baixa/média cardinalidade (entre 2 e 5000 únicos)
        ALVO = [(n,c) for n,c in fields if 2 <= c <= 5000]
        print(f'  {len(ALVO)} campos serao agregados (card 2-5000)', flush=True)

        app_resumo = {'title': title, 'app_id': app_id, 'total_campos': len(fields), 'agregacoes': {}}
        for i, (field_name, card) in enumerate(ALVO):
            try:
                res = q.agg(field_name)
                buckets = res['buckets']
                # CSV
                csv_path = app_dir / f'{safe(field_name)}.csv'
                with open(csv_path, 'w', encoding='utf-8', newline='') as fh:
                    fh.write('key,doc_count\n')
                    for b in buckets:
                        k = str(b['key']).replace('"','""')
                        fh.write(f'"{k}",{b["count"]}\n')
                app_resumo['agregacoes'][field_name] = {'cardinality': card, 'buckets_retornados': len(buckets)}
                if i % 10 == 0:
                    print(f'    [{i+1}/{len(ALVO)}] "{field_name}" -> {len(buckets)} buckets', flush=True)
                time.sleep(0.2)
            except Exception as e:
                app_resumo['agregacoes'][field_name] = {'erro': str(e)[:100]}

        (app_dir / 'resumo.json').write_text(json.dumps(app_resumo, ensure_ascii=False, indent=2), encoding='utf-8')
        resumo_global[title] = {'app_id': app_id, 'campos': len(fields), 'agregados': len(ALVO)}
    except Exception as e:
        print(f'  ERRO: {e}', flush=True)
        resumo_global[title] = {'app_id': app_id, 'erro': str(e)[:200]}
    finally:
        q.close()

(OUT / 'resumo_global.json').write_text(json.dumps(resumo_global, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'\n[OK] resumo_global em {OUT}', flush=True)
