#!/usr/bin/env python3
"""Testa cada UUID candidato via OpenDoc e identifica qual é o APP Qlik real de cada extension."""
import requests, urllib3, websocket, ssl, json, time
from pathlib import Path
urllib3.disable_warnings()

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
BASE = 'https://transparencia.stf.jus.br'
OUT = Path(r'G:\datajud_raw\_mapeamento_numerico\transparencia_stf')

with open(OUT / 'descoberta_extensions.json', encoding='utf-8') as fh:
    dd = json.load(fh)

def try_open_doc(ext_name, uuid):
    """Tenta abrir 1 UUID como doc Qlik. Retorna True se funcionar."""
    try:
        s = requests.Session()
        s.get(f'{BASE}/extensions/{ext_name}/{ext_name}.html',
              headers={'User-Agent': UA}, verify=False, timeout=15)
        cookie = dict(s.cookies).get('X-Qlik-Session', '')
        if not cookie: return None
        ws = websocket.create_connection(
            f'wss://transparencia.stf.jus.br/app/{uuid}',
            sslopt={'cert_reqs': ssl.CERT_NONE},
            header={'User-Agent': UA, 'Cookie': f'X-Qlik-Session={cookie}', 'Origin': BASE},
            timeout=20
        )
        # handshake
        json.loads(ws.recv())
        # OpenDoc
        msg = {'jsonrpc':'2.0','id':1,'method':'OpenDoc','handle':-1,'params':[uuid]}
        ws.send(json.dumps(msg))
        # Ler até ID 1
        doc_handle = None
        error = None
        title = None
        for _ in range(15):
            resp = json.loads(ws.recv())
            if resp.get('id') == 1:
                if 'error' in resp:
                    error = resp['error'].get('message','?')
                    break
                doc_handle = resp.get('result',{}).get('qReturn',{}).get('qHandle')
                break
        if doc_handle:
            # pegar título do doc via GetAppLayout
            msg = {'jsonrpc':'2.0','id':2,'method':'GetAppLayout','handle':doc_handle,'params':[]}
            ws.send(json.dumps(msg))
            for _ in range(10):
                resp = json.loads(ws.recv())
                if resp.get('id') == 2:
                    title = resp.get('result',{}).get('qLayout',{}).get('qTitle')
                    break
        ws.close()
        return {'ok': doc_handle is not None, 'error': error, 'title': title}
    except Exception as e:
        return {'ok': False, 'error': str(e)}

results = {}
for ext, info in dd.items():
    if 'uuids_found' not in info: continue
    results[ext] = []
    uuids = info['uuids_found']
    print(f'\n[{ext}] testando {len(uuids)} UUIDs...', flush=True)
    for uuid in uuids:
        r = try_open_doc(ext, uuid)
        if r is None:
            print(f'  {uuid[:8]}... sessão falhou', flush=True)
            continue
        ok = r.get('ok')
        title = r.get('title')
        error = r.get('error')
        if ok:
            print(f'  {uuid} [OK] OK  title=\"{title}\"', flush=True)
            results[ext].append({'uuid': uuid, 'title': title, 'ok': True})
        else:
            # não printar os rejeitados para não poluir
            if error and 'not found' in str(error).lower():
                pass
            else:
                print(f'  {uuid[:8]}... rejeitado ({error[:60] if error else "?"})', flush=True)
        time.sleep(0.3)

(OUT / 'apps_qlik_descobertos.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'\n[OK] {OUT}/apps_qlik_descobertos.json', flush=True)
print(f'\n=== RESUMO: APPs Qlik válidos por extension ===', flush=True)
for ext, apps in results.items():
    if apps:
        for a in apps:
            print(f'  {ext:30s} APP={a["uuid"]}  "{a["title"]}"', flush=True)
    else:
        print(f'  {ext:30s} (nenhum app válido encontrado)', flush=True)
