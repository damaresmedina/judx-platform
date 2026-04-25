"""Importa seed antigo (judx-platform/composicao_ministerial.csv) para v6.
Operação segura: backup antes, try/except em cada etapa, validação no final.
"""
import sys, csv, re, shutil
sys.stdout.reconfigure(encoding='utf-8')
import pandas as pd
from pathlib import Path
from datetime import datetime

DIR = Path(r'C:\Users\medin\Desktop\backup_judx\flat_stj_20260424\exports')
SEED = Path(r'C:\Users\medin\projetos\judx-platform\scripts\seeds-tribunais\composicao_ministerial.csv')
V6 = DIR / 'composicao_stj_canonical_v6_limpa.csv'
ALIAS = DIR / 'stj_alias_ministros.csv'

V7_OUT = DIR / 'composicao_stj_canonical_v7.csv'
ALIAS_OUT = DIR / 'stj_alias_ministros.csv'

ACCENT = str.maketrans(
    'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ',
    'AAAAAAACEEEEIIIIDNOOOOOOUUUUYBSaaaaaaaceeeeiiiidnoooooouuuuyby'
)
def norm(s):
    if not s or pd.isna(s): return ''
    s = re.sub(r'\s*\(.*?\)','',str(s)).upper().translate(ACCENT)
    s = re.sub(r'[\d\*\.\,/]+', ' ', s)
    return re.sub(r'\s+',' ',s).strip()

# === Etapa 1: backup ===
print('=== 1. Backup ===')
try:
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    if V6.exists():
        shutil.copy2(V6, V6.with_suffix(f'.csv.bak_{ts}'))
        print(f'  ✓ {V6.name} → bak_{ts}')
    if ALIAS.exists():
        shutil.copy2(ALIAS, ALIAS.with_suffix(f'.csv.bak_{ts}'))
        print(f'  ✓ {ALIAS.name} → bak_{ts}')
except Exception as e:
    print(f'  ✗ ERRO no backup: {e}')
    sys.exit(1)

# === Etapa 2: ler seed antigo (com tolerância) ===
print('\n=== 2. Lendo seed antigo ===')
seed_rows = []
try:
    with open(SEED, encoding='utf-8') as f:
        for r in csv.DictReader(f):
            ts_field = r.get('tribunal_sigla','').strip()
            if not ts_field or ts_field.startswith('#'): continue
            if ts_field != 'STJ': continue
            try:
                ministro = r.get('ministro_nome_canonico','').strip()
                orgao = r.get('codigo_orgao','').strip()
                if not ministro or not orgao: continue
                seed_rows.append({
                    'ministro_nome_canonico': ministro,
                    'ministro_key': norm(ministro),
                    'codigo_orgao': orgao,
                    'valid_from': r.get('valid_from','').strip() or '',
                    'valid_to': r.get('valid_to','').strip() or '',
                    'tipo_ancoragem': r.get('tipo_ancoragem','').strip(),
                    'fonte': r.get('fonte','').strip(),
                    'motivo_mudanca': r.get('motivo_mudanca','').strip(),
                })
            except Exception as ex:
                print(f'  ⚠ linha pulada: {ex}')
                continue
    print(f'  ✓ {len(seed_rows)} linhas STJ lidas (sem erro fatal)')
except Exception as e:
    print(f'  ✗ ERRO leitura seed: {e}')
    sys.exit(1)

# === Etapa 3: ler v6 limpa ===
print('\n=== 3. Lendo v6 limpa ===')
try:
    v6 = pd.read_csv(V6)
    print(f'  ✓ v6 limpa: {len(v6)} linhas')
    keys_v6 = set(v6['ministro_key'].dropna().unique())
    print(f'  ministros únicos no v6: {len(keys_v6)}')
except Exception as e:
    print(f'  ✗ ERRO leitura v6: {e}')
    sys.exit(1)

# === Etapa 4: identificar entradas a importar ===
print('\n=== 4. Identificando entradas a importar ===')
seed_keys = {r['ministro_key'] for r in seed_rows}
faltantes_no_v6 = seed_keys - keys_v6
print(f'  ministros do seed antigo NÃO presentes no v6: {len(faltantes_no_v6)}')
for k in sorted(faltantes_no_v6):
    n = sum(1 for r in seed_rows if r['ministro_key']==k)
    print(f'    ({n}x) {k}')

novas_linhas = [r for r in seed_rows if r['ministro_key'] in faltantes_no_v6]
print(f'\n  Linhas históricas a adicionar: {len(novas_linhas)}')

# === Etapa 5: converter para schema v6 e concatenar ===
print('\n=== 5. Convertendo para schema v6 ===')
try:
    novos = []
    for r in novas_linhas:
        # data referência: usar valid_from se houver, senão 'historico'
        data_ref = r['valid_from'] if r['valid_from'] else 'historico_pre_2015'
        # mapear codigo_orgao do seed para v6 (manter como está, são compatíveis)
        novos.append({
            'fonte_pdf': 'seed_antigo_composicao_ministerial',
            'data_referencia': data_ref,
            'orgao_codigo': r['codigo_orgao'],
            'ordem': '',
            'nome_raw': r['ministro_nome_canonico'],
            'nome_key': r['ministro_key'],
            'data_ingresso_orgao': r['valid_from'],
            'presidente_bienio_inicio': '',
            'presidente_bienio_fim': '',
            'tipo_registro': 'seed_historico',
            'observacao': r.get('motivo_mudanca','') or r.get('tipo_ancoragem',''),
            'fonte_versao': 'seed_judx',
            'ministro_key': r['ministro_key'],
        })

    df_novos = pd.DataFrame(novos)
    # Garantir mesmas colunas
    for c in v6.columns:
        if c not in df_novos.columns:
            df_novos[c] = ''
    df_novos = df_novos[v6.columns]

    v7 = pd.concat([v6, df_novos], ignore_index=True)
    v7.to_csv(V7_OUT, index=False, encoding='utf-8-sig')
    print(f'  ✓ v7: {len(v7)} linhas → {V7_OUT.name}')
except Exception as e:
    print(f'  ✗ ERRO conversão: {e}')
    sys.exit(1)

# === Etapa 6: atualizar aliases ===
print('\n=== 6. Atualizando aliases ===')
try:
    alias = pd.read_csv(ALIAS)
    keys_alias = set(alias['ministro_key'].dropna().unique())
    novos_alias = []
    for k in faltantes_no_v6:
        if k in keys_alias: continue  # já existe
        # Pegar nome_raw representativo do seed
        nome_raw = next(r['ministro_nome_canonico'] for r in seed_rows if r['ministro_key']==k)
        novos_alias.append({
            'nome_raw': nome_raw,
            'ministro_key': k,
            'fonte_origem': 'seed_judx_historico',
            'n_docs_flat': 0,
            'validado': '25abr',
        })
    if novos_alias:
        df_a = pd.concat([alias, pd.DataFrame(novos_alias)], ignore_index=True)
        df_a.to_csv(ALIAS_OUT, index=False, encoding='utf-8-sig')
        print(f'  ✓ aliases: {len(alias)} → {len(df_a)} (+{len(novos_alias)} históricos)')
    else:
        print(f'  - nenhum alias adicionado (todos já existiam)')
except Exception as e:
    print(f'  ✗ ERRO aliases: {e}')

# === Etapa 7: validação final ===
print('\n=== 7. Validação ===')
try:
    v7 = pd.read_csv(V7_OUT)
    a = pd.read_csv(ALIAS_OUT)
    print(f'  v7 final: {len(v7)} linhas, {v7["ministro_key"].nunique()} ministros distintos')
    print(f'  alias final: {len(a)} linhas, {a["ministro_key"].nunique()} ministros distintos')
    print('\n  Distribuição v7 por fonte_versao:')
    print('    ', v7['fonte_versao'].value_counts().to_dict())
    print('\n  Distribuição alias por fonte:')
    print('    ', a['fonte_origem'].value_counts().to_dict())
except Exception as e:
    print(f'  ✗ ERRO validação: {e}')

print('\n✓ OK')
