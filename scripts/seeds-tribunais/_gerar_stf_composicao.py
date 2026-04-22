"""Converte stf_composicao_temporal (backup local) para o formato do seed composicao_ministerial.csv."""
import duckdb, csv
from pathlib import Path

SEED = Path("C:/Users/medin/projetos/judx-platform/scripts/seeds-tribunais/composicao_ministerial.csv")
BACKUP = "G:/supabase_backup/judx_17abr.duckdb"

con = duckdb.connect(BACKUP, read_only=True)
rows = con.execute("""
    SELECT
      'STF' AS tribunal_sigla,
      UPPER(ministro) AS ministro_nome_canonico,
      CASE
        WHEN cargo = 'Presidente STF' THEN 'PRESIDENCIA'
        WHEN cargo = 'Vice-Presidente STF' THEN 'VICE_PRESIDENCIA'
        WHEN cargo = 'Presidente 1ª Turma' THEN 'TURMA_1_PRESID'
        WHEN cargo = 'Presidente 2ª Turma' THEN 'TURMA_2_PRESID'
        WHEN turma = '1ª Turma' THEN 'TURMA_1'
        WHEN turma = '2ª Turma' THEN 'TURMA_2'
        ELSE 'PLENARIO'
      END AS codigo_orgao,
      data_inicio AS valid_from,
      data_fim AS valid_to,
      ROW_NUMBER() OVER (PARTITION BY ministro ORDER BY data_inicio) AS ordem_historico,
      CASE
        WHEN cargo LIKE 'Presidente%' THEN 'presidencia'
        WHEN cargo = 'Vice-Presidente STF' THEN 'vice_presidencia'
        WHEN data_fim IS NULL THEN 'em_exercicio'
        ELSE 'saiu'
      END AS tipo_ancoragem,
      COALESCE(observacao, '') AS motivo_mudanca,
      'stf_composicao_temporal (backup G:/supabase_backup/judx_17abr.duckdb)' AS fonte,
      'validado_backup_stf_composicao_temporal' AS validado
    FROM stf_composicao_temporal
    ORDER BY ministro, data_inicio
""").fetchall()
con.close()

# Carregar seed existente
texto = SEED.read_text(encoding='utf-8')
linhas = texto.split('\n')

# Localizar header e bloco STJ (manter), remover bloco STF antigo
# Bloco STF começa em "# --- STF" e vai até o fim do arquivo
novo = []
pulando_stf = False
for l in linhas:
    if l.startswith('# --- STF'):
        pulando_stf = True
        continue
    if pulando_stf:
        if l.startswith('STF,'):
            continue
        if l.startswith('# ') and 'STF' in l:
            continue
        if l.strip() == '':
            continue
        if l.startswith('STJ,') or l.startswith('#'):
            pulando_stf = False
            novo.append(l)
            continue
        # fim — chegou em algo que não é STF, parar de pular
        pulando_stf = False
        novo.append(l)
    else:
        novo.append(l)

# Apendar bloco STF novo
saida = '\n'.join(novo).rstrip() + '\n'
saida += '# --- STF — composição temporal completa (122 linhas) extraída de stf_composicao_temporal (backup 17/abr)\n'
saida += '# Fonte: STF Portal Histórico. Inclui Presidentes, Vice-Presidentes, Presidentes de Turma e Ministros em Turma\n'
saida += '# valid_to NULL = em exercício. Cada ministro tem N linhas se trocou de cargo/turma durante o mandato\n'
for r in rows:
    # r = (tribunal, nome, orgao, valid_from, valid_to, ordem, tipo, motivo, fonte, validado)
    def esc(x):
        if x is None: return ''
        s = str(x)
        if ',' in s or '"' in s or '\n' in s:
            return '"' + s.replace('"', '""') + '"'
        return s
    saida += ','.join(esc(v) for v in r) + '\n'

SEED.write_text(saida, encoding='utf-8')
print(f'[ok] {SEED}')
print(f'  122 linhas STF apendadas')
# Resumo por orgao
from collections import Counter
c = Counter(r[2] for r in rows)
for k, v in c.most_common(): print(f'    {k}: {v}')
