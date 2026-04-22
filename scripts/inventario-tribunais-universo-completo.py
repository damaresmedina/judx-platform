"""inventario-tribunais-universo-completo.py

Gera inventário consolidado de TODOS os tribunais do universo JudX:
- STF no topo (fonte Corte Aberta STF, não Datajud)
- 91 tribunais Datajud em seguida (superiores + federais + trabalho + eleitorais + estaduais + militares)

Adiciona coluna de número de processos (coletado / esperado / pct) por tribunal,
espelhando o que estava no manifest.json de cada pasta raw.

Saída: Desktop\backup_judx\resultados\2026-04-19_INVENTARIO_UNIVERSO_COMPLETO.csv
"""
import json, csv
from pathlib import Path

RAW = Path("G:/datajud_raw")
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados")
OLD = OUT / "2026-04-18_INVENTARIO_resumo_tribunais.csv"

# ========= Coleta contagens dos manifest.json / checkpoint.json =========
def buscar_manifest(sigla_target):
    """Busca recursivamente o manifest.json e checkpoint.json para uma sigla."""
    for root in RAW.rglob("*"):
        if root.is_dir() and root.name.upper() == sigla_target.upper():
            manifest = {}
            checkpoint = {}
            if (root / "manifest.json").exists():
                try: manifest = json.loads((root / "manifest.json").read_text(encoding='utf-8'))
                except: pass
            if (root / "checkpoint.json").exists():
                try: checkpoint = json.loads((root / "checkpoint.json").read_text(encoding='utf-8'))
                except: pass
            return root, manifest, checkpoint
    return None, {}, {}

# Listar todos os tribunais do CSV antigo
tribunais_ontem = []
with OLD.open('r', encoding='utf-8') as f:
    r = csv.DictReader(f, delimiter=';')
    for row in r:
        tribunais_ontem.append(row)

print(f"[lido] {len(tribunais_ontem)} tribunais no inventário de ontem")

# Enriquecer com contagens de processos
resultados = []
for t in tribunais_ontem:
    sigla = t['sigla']
    path, manifest, checkpoint = buscar_manifest(sigla)
    coletado = (manifest.get('total_coletado') or checkpoint.get('total_coletado')
                or manifest.get('processos') or checkpoint.get('processos') or '')
    esperado = (manifest.get('total_esperado') or checkpoint.get('total_esperado') or '')
    pct = ''
    if isinstance(coletado, (int, float)) and isinstance(esperado, (int, float)) and esperado > 0:
        pct = f"{100*coletado/esperado:.1f}%"
    elif isinstance(coletado, (int, float)) and coletado > 0:
        pct = 'OK' if not esperado else ''
    status = manifest.get('status', '') or checkpoint.get('status', '') or ('coletado' if coletado else '')
    caminho = str(path.relative_to(RAW)) if path else ''
    fonte = 'Datajud CNJ'
    t['fonte'] = fonte
    t['processos_coletados'] = coletado if coletado != '' else '—'
    t['processos_esperados'] = esperado if esperado != '' else '—'
    t['pct_completude'] = pct or '—'
    t['status'] = status or '—'
    t['caminho_raw'] = caminho or '—'
    resultados.append(t)
    print(f"  {sigla}: coletado={coletado} esperado={esperado} pct={pct}")

# ========= STF (Corte Aberta — não é Datajud) =========
# Dados conhecidos do stf_master.csv
stf_linha = {
    'sigla': 'STF',
    'parts': '27 CSVs anuais (2000-2026)',  # Downloads/stf_decisoes_fatias/
    'orphans_arq': '0',
    'ghosts_arq': '0',
    'id_patterns': 'CNJ + número interno STF (AR, RE, ARE, HC, ADI, ADC, ADPF, MS, etc.)',
    'graus': 'SUP',
    'dataAjuiz_formatos': 'YYYY-MM-DD (Corte Aberta export)',
    'dataAjuiz_min': '2000-01-01',
    'dataAjuiz_max': '2026-04-16',
    'sistemas': 'STF Digital/eSTF',
    'formatos_processo': 'Eletrônico/Físico',
    'niveis_sigilo_obs': '0',
    'n_movimentos_range': 'variável (andamentos no Corte Aberta)',
    'campos_source_count': '20 (stf_master core) + 2 (stf_master_premium)',
    'rompe_padrão_cnj': 'PARCIAL (números STF + CNJ coexistem)',
    'fonte': 'Corte Aberta STF (transparencia.stf.jus.br)',
    'processos_coletados': 2927525,
    'processos_esperados': 2927525,
    'pct_completude': 'OK',
    'status': 'completo — backup 16/abr/2026',
    'caminho_raw': 'Downloads/stf_decisoes_fatias/ + Desktop/backup_judx/relatorios/2026-04-16_backup_completo/stf_master.csv',
}

# Ordem canônica: STF primeiro, depois superiores, federais, trabalho, eleitorais, estaduais, militares
def ordem_canonica(t):
    sigla = t['sigla'].upper()
    if sigla == 'STF': return (0, 0, sigla)
    if sigla in ('STJ','TST','TSE','STM'): return (1, ['STJ','TST','TSE','STM'].index(sigla), sigla)
    if sigla.startswith('TRF'): return (2, int(sigla.replace('TRF','') or 0), sigla)
    if sigla.startswith('TRT'):
        n = sigla.replace('TRT','').lstrip('0') or '0'
        return (3, int(n) if n.isdigit() else 99, sigla)
    if sigla.startswith('TRE'): return (4, 0, sigla)
    if sigla.startswith('TJM'): return (6, 0, sigla)
    if sigla.startswith('TJ'): return (5, 0, sigla)
    return (9, 0, sigla)

todos = [stf_linha] + resultados
todos.sort(key=ordem_canonica)

# ========= Escrever CSV =========
# colunas do CSV antigo + novas
cols = [
    'sigla', 'fonte', 'processos_coletados', 'processos_esperados', 'pct_completude', 'status',
    'parts', 'orphans_arq', 'ghosts_arq', 'id_patterns', 'graus',
    'dataAjuiz_formatos', 'dataAjuiz_min', 'dataAjuiz_max',
    'sistemas', 'formatos_processo', 'niveis_sigilo_obs',
    'n_movimentos_range', 'campos_source_count', 'rompe_padrão_cnj',
    'caminho_raw',
]

fp = OUT / "2026-04-19_INVENTARIO_UNIVERSO_COMPLETO.csv"
with fp.open('w', newline='', encoding='utf-8') as f:
    w = csv.writer(f, delimiter=';')
    w.writerow(cols)
    for t in todos:
        w.writerow([t.get(c, '—') for c in cols])

print(f"\n[csv] {fp}")
print(f"  tamanho: {fp.stat().st_size/1024:.1f} KB")
print(f"  linhas: {len(todos)} (STF + {len(resultados)} Datajud)")
