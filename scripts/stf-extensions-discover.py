#!/usr/bin/env python3
"""Descobre APP_ID Qlik e objetos em cada extension do transparencia.stf.jus.br"""
import requests, urllib3, re, json, sys
from pathlib import Path
urllib3.disable_warnings()

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
BASE = 'https://transparencia.stf.jus.br'
EXT = ['decisoes','acervo','controle_concentrado','corte_aberta','repercussao_geral','Informacao_A_Sociedade','reclamacoes','distribuidos','plenario_virtual']
OUT = Path(r'G:\datajud_raw\_mapeamento_numerico\transparencia_stf')
OUT.mkdir(parents=True, exist_ok=True)

PAT_UUID = re.compile(r'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', re.I)
PAT_OBJ_ID = re.compile(r"[\"']([A-Za-z]{5,9})[\"']")  # objetos Qlik geralmente 5-9 chars

discover = {}
for ext in EXT:
    url = f'{BASE}/extensions/{ext}/{ext}.html'
    try:
        r = requests.get(url, headers={'User-Agent': UA}, verify=False, timeout=20)
        html = r.text
        # Buscar todos scripts inline + externos
        scripts_external = re.findall(r'<script[^>]+src=["\']([^"\']+)', html)
        scripts_inline = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
        all_text = html + '\n'.join(scripts_inline)

        uuids = sorted(set(PAT_UUID.findall(all_text)))

        # Ler JS externos também (limite 5)
        for s in scripts_external[:15]:
            s_url = s if s.startswith('http') else BASE + ('/extensions/' + ext + '/' + s.lstrip('./'))
            try:
                r2 = requests.get(s_url, headers={'User-Agent': UA}, verify=False, timeout=10)
                all_text += '\n' + r2.text
                uuids = sorted(set(PAT_UUID.findall(all_text)))
            except Exception:
                pass

        # Filtrar UUIDs: geralmente appId aparece perto de 'openDoc'
        # Pegar trechos "openDoc(...)" com o hash próximo
        opendoc_ctx = re.findall(r'openDoc\s*\([^)]*["\']([0-9a-f\-]{36})[\"\']', all_text, re.I)

        # Objetos: procurar por "getObject" e padrões similares
        getobj = re.findall(r'getObject\s*\(\s*["\']([A-Za-z]{4,10})[\"\']', all_text)
        ext_save = {
            'url': url,
            'status': r.status_code,
            'html_size': len(html),
            'scripts_external': scripts_external[:20],
            'uuids_found': uuids,
            'opendoc_app_ids': sorted(set(opendoc_ctx)),
            'object_ids_via_getObject': sorted(set(getobj)),
        }
        discover[ext] = ext_save
        print(f'{ext}: UUIDs={len(uuids)} | openDoc apps={len(set(opendoc_ctx))} | objetos={len(set(getobj))}', flush=True)
        for a in sorted(set(opendoc_ctx)): print(f'    APP {a}', flush=True)
        for o in sorted(set(getobj))[:10]: print(f'    OBJ {o}', flush=True)
    except Exception as e:
        discover[ext] = {'erro': str(e), 'url': url}
        print(f'{ext}: ERRO {e}', flush=True)

(OUT / 'descoberta_extensions.json').write_text(json.dumps(discover, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'\n[OK] {OUT}/descoberta_extensions.json', flush=True)
