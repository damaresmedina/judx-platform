"""
etnografia-raw-inventario.py — arqueologia heurística dos metadados Datajud.

Para cada endpoint baixado:
- amostragem temporal (1º, meio, último docs por arquivo)
- extrai: _id, numeroProcesso, dataAjuizamento, @timestamp, classe, formato, sistema,
          grau, orgãoJulgador, movimentos, assuntos, nivelSigilo
- identifica rupturas do padrão CNJ (Res. 46/2007 + Res. 65/2008)
- range temporal observado (dataAjuizamento min/max amostrado)
- integridade: orphans/ghosts presentes

Gera:
  Desktop/backup_judx/resultados/2026-04-18_INVENTARIO_ARQUEOLOGICO_raw.json
  (JSON estruturado, utf-8)
"""
import json, gzip, glob, os, sys, re
from datetime import datetime

BASE = 'G:/datajud_raw'
OUT = r'C:\Users\medin\Desktop\backup_judx\resultados\2026-04-18_INVENTARIO_ARQUEOLOGICO_raw.json'

def safe_read_ndjson_gz(path, max_docs=None):
    """Lê NDJSON gzipado e retorna lista de dicts."""
    out = []
    try:
        with gzip.open(path, 'rt', encoding='utf-8') as f:
            for i, line in enumerate(f):
                if max_docs and i >= max_docs: break
                try: out.append(json.loads(line))
                except: pass
    except Exception as e:
        pass
    return out

def sample_endpoint(dir_):
    """Amostra docs de um endpoint (1º arquivo, arquivo do meio, último arquivo)."""
    part_files = sorted(glob.glob(os.path.join(dir_, 'part-*.ndjson.gz')))
    if not part_files: return [], 0
    total = len(part_files)
    indices = sorted({0, total//2, total-1}) if total > 1 else [0]
    docs = []
    for i in indices:
        batch = safe_read_ndjson_gz(part_files[i], max_docs=3)
        for d in batch:
            d['_source_file'] = os.path.basename(part_files[i])
            docs.append(d)
    return docs, total

def extract_profile(sigla, docs, part_count, orphan_count, ghost_count, orphan_samples, ghost_samples):
    """Extrai perfil arqueológico a partir das amostras."""
    if not docs:
        return None

    # formatos de dataAjuizamento observados
    datas_ajuiz = []
    ids = []
    numeros = []
    classes = set()
    classes_nomes = {}
    formatos = set()
    sistemas = set()
    graus = set()
    tribunais_field = set()
    orgaos = set()
    n_movs = []
    n_assuntos = []
    niveis_sigilo = set()
    campos_presentes = set()
    timestamps = []

    for d in docs:
        src = d.get('_source', {}) or {}
        ids.append(d.get('_id'))
        if src.get('numeroProcesso'):
            numeros.append(src['numeroProcesso'])
        if src.get('dataAjuizamento') is not None:
            datas_ajuiz.append(src['dataAjuizamento'])
        if src.get('@timestamp'):
            timestamps.append(src['@timestamp'])
        if isinstance(src.get('classe'), dict):
            c = src['classe'].get('codigo')
            n = src['classe'].get('nome')
            if c is not None:
                classes.add(c)
                if n: classes_nomes[c] = n
        fmt = src.get('formato')
        if isinstance(fmt, dict): fmt = fmt.get('nome')
        if fmt: formatos.add(fmt)
        sis = src.get('sistema')
        if isinstance(sis, dict): sis = sis.get('nome')
        if sis: sistemas.add(sis)
        if src.get('grau'): graus.add(src['grau'])
        if src.get('tribunal') is not None:
            tribunais_field.add(str(src['tribunal']))
        oj = src.get('orgaoJulgador')
        if isinstance(oj, dict):
            c = oj.get('codigo')
            n = oj.get('nome')
            if c and n: orgaos.add(f'{c}::{n}')
        n_movs.append(len(src.get('movimentos') or []))
        n_assuntos.append(len(src.get('assuntos') or []))
        if src.get('nivelSigilo') is not None:
            niveis_sigilo.add(src['nivelSigilo'])
        campos_presentes.update(src.keys())

    # classifica formato de dataAjuizamento
    da_formato_set = set()
    for da in datas_ajuiz:
        if da is None: continue
        s = str(da)
        if re.match(r'^\d{14}$', s): da_formato_set.add('YYYYMMDDHHmmss (CNJ padrão)')
        elif re.match(r'^\d{4}-\d{2}-\d{2}T', s): da_formato_set.add('ISO 8601')
        elif re.match(r'^\d{8}$', s): da_formato_set.add('YYYYMMDD')
        else: da_formato_set.add(f'desconhecido: {s[:30]}')

    # range temporal observado (apenas formato CNJ)
    cnj_datas = [d for d in datas_ajuiz if isinstance(d,str) and re.match(r'^\d{14}$', d)]
    iso_datas = [d for d in datas_ajuiz if isinstance(d,str) and re.match(r'^\d{4}-\d{2}-\d{2}', d)]
    da_min = da_max = None
    if cnj_datas:
        da_min = min(cnj_datas); da_max = max(cnj_datas)
    elif iso_datas:
        da_min = min(iso_datas); da_max = max(iso_datas)

    # padrão de _id
    id_patterns = set()
    for i in ids:
        if not i: continue
        # substitui dígitos por N para extrair padrão
        pat = re.sub(r'\d+', 'N', i)
        id_patterns.add(pat)

    profile = {
        'sigla': sigla,
        'parts_baixados': part_count,
        'orphans_arquivos': orphan_count,
        'ghosts_arquivos': ghost_count,
        'amostragem_docs': len(docs),
        'id_patterns': sorted(id_patterns),
        'id_exemplos': ids[:3],
        'numeroProcesso_exemplos': numeros[:3],
        'numeroProcesso_20digitos': all(len(str(n))==20 and str(n).isdigit() for n in numeros) if numeros else None,
        'tribunais_field_valores': sorted(tribunais_field),
        'graus_observados': sorted(graus),
        'dataAjuizamento_formato': sorted(da_formato_set),
        'dataAjuizamento_exemplos': [str(d) for d in datas_ajuiz[:3]],
        'dataAjuizamento_min_observada': da_min,
        'dataAjuizamento_max_observada': da_max,
        'timestamp_exemplos': timestamps[:3],
        'classes_unicas_amostra': sorted([c for c in classes if c is not None])[:10],
        'classes_amostra_nomeadas': {str(k):v for k,v in list(classes_nomes.items())[:10]},
        'formatos_processo': sorted(formatos),
        'sistemas_processuais': sorted(sistemas),
        'n_movimentos_range': [min(n_movs), max(n_movs)] if n_movs else None,
        'n_movimentos_media': sum(n_movs)//len(n_movs) if n_movs else None,
        'n_assuntos_range': [min(n_assuntos), max(n_assuntos)] if n_assuntos else None,
        'niveis_sigilo_observados': sorted(niveis_sigilo),
        'orgaos_amostra_count': len(orgaos),
        'campos_source_observados': sorted(campos_presentes),
        'orphan_sample_exemplo': orphan_samples[0].get('_id') if orphan_samples else None,
        'ghost_sample_exemplo': ghost_samples[0].get('_id') if ghost_samples else None,
        'ghost_sample_campos': sorted(list((ghost_samples[0].get('_source') or {}).keys())) if ghost_samples else None,
    }
    return profile

def main():
    inventory = {}
    for chk_path in glob.glob(f'{BASE}/**/checkpoint.json', recursive=True):
        parts = chk_path.replace('\\','/').split('/')
        try:
            idx = parts.index('datajud_raw')
            after = parts[idx+1:]
            if 'shards' in after: continue
            sigla = after[-2]
        except: continue
        dir_ = os.path.dirname(chk_path)
        docs, part_count = sample_endpoint(dir_)
        orphan_files = sorted(glob.glob(os.path.join(dir_, 'orphans-*.ndjson.gz')))
        ghost_files = sorted(glob.glob(os.path.join(dir_, 'ghosts-*.ndjson.gz')))
        orphan_samples = safe_read_ndjson_gz(orphan_files[0], max_docs=2) if orphan_files else []
        ghost_samples = safe_read_ndjson_gz(ghost_files[0], max_docs=2) if ghost_files else []
        profile = extract_profile(sigla, docs, part_count, len(orphan_files), len(ghost_files), orphan_samples, ghost_samples)
        if profile:
            inventory[sigla] = profile
            print(f'{sigla}: {part_count} parts | {len(docs)} docs amostrados', file=sys.stderr, flush=True)

    # metadata do inventário
    inventory_wrapped = {
        'gerado_em': datetime.now().isoformat(),
        'metodologia': 'Amostragem temporal por endpoint: 1º arquivo, arquivo do meio, último arquivo. 3 docs por arquivo. Total ~9 docs por endpoint. Amostra indicativa, não exaustiva.',
        'escopo': 'Fase 1 + Fase 2 (pós-incidente 18/abr/2026) — endpoints com checkpoint existente.',
        'fonte': 'G:/datajud_raw (NDJSON gzipado, pipeline Datajud CNJ)',
        'endpoints_inventariados': len(inventory),
        'endpoints': inventory,
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(inventory_wrapped, f, indent=2, ensure_ascii=False, default=str)
    print(f'\n=== Inventário salvo em: {OUT} ===', file=sys.stderr)
    print(f'Endpoints inventariados: {len(inventory)}', file=sys.stderr)

if __name__ == '__main__':
    main()
