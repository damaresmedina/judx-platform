"""Inventário completo de códigos do raw STJ que precisam tradução antes do build:
1. Movimentos: 228 códigos → quais são CNJ canônicos vs STJ próprios
2. complementoTabelado: todos os pares (descricao, codigo, valor) com contagem
3. orgaoJulgador: codigo → nome → ministro_canonical mapping
4. Classes e assuntos: identificar códigos STJ próprios fora da árvore TPU
Saída: 4 CSVs + relatório consolidado.
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
import duckdb
from pathlib import Path

DIR = Path(r'C:\Users\medin\Desktop\backup_judx\flat_stj_20260424\exports')
con = duckdb.connect(r'G:/staging_local/stj_flat.duckdb', read_only=True)

# === 1. MOVIMENTOS — separar TPU canônico (cnj_classes_arvore tem códigos canônicos) ===
print('='*70)
print('1. MOVIMENTOS — varrendo stj_pulsos')
print('='*70)
mov = con.execute("""
SELECT codigo_tpu, nome_cnj, COUNT(*) AS ocorrencias,
       AVG(CASE WHEN eh_resultado THEN 1 ELSE 0 END) AS pct_resultado,
       COUNT(DISTINCT datajud_id) AS docs_distintos
FROM stj_pulsos
WHERE codigo_tpu IS NOT NULL
GROUP BY 1, 2
ORDER BY ocorrencias DESC
""").fetchdf()
print(f'  {len(mov)} códigos de movimento únicos')
mov.to_csv(DIR/'inventario_movimentos.csv', index=False, encoding='utf-8-sig')
print(f'  >>> {DIR/"inventario_movimentos.csv"}')

# === 2. COMPLEMENTOS TABELADOS ===
print('\n'+'='*70)
print('2. COMPLEMENTOS TABELADOS')
print('='*70)
comp = con.execute("""
SELECT complemento_desc, complemento_codigo, complemento_nome, complemento_valor,
       COUNT(*) AS ocorrencias,
       COUNT(DISTINCT datajud_id) AS docs_distintos
FROM stj_pulsos
WHERE complemento_codigo IS NOT NULL
GROUP BY 1, 2, 3, 4
ORDER BY ocorrencias DESC
""").fetchdf()
print(f'  {len(comp)} pares únicos (desc, codigo, nome, valor)')
comp.to_csv(DIR/'inventario_complementos_tabelados.csv', index=False, encoding='utf-8-sig')
print(f'  >>> {DIR/"inventario_complementos_tabelados.csv"}')

# Distintos por descricao
print('\n=== Distintos por descricao ===')
dist_desc = con.execute("""
SELECT complemento_desc, COUNT(DISTINCT complemento_codigo) AS n_codigos,
       COUNT(*) AS ocorrencias
FROM stj_pulsos
WHERE complemento_desc IS NOT NULL
GROUP BY 1 ORDER BY ocorrencias DESC
""").fetchdf()
print(dist_desc.to_string(index=False))

# === 3. ÓRGÃOS JULGADORES ===
print('\n'+'='*70)
print('3. ÓRGÃOS JULGADORES')
print('='*70)
orgaos = con.execute("""
SELECT orgao_codigo, orgao_nome, ministro_canonical, turma_secao, secao, categoria_orgao,
       COUNT(*) AS docs
FROM stj_processos
WHERE orgao_codigo IS NOT NULL
GROUP BY 1,2,3,4,5,6
ORDER BY docs DESC
""").fetchdf()
print(f'  {len(orgaos)} órgãos únicos')
orgaos.to_csv(DIR/'inventario_orgaos_julgadores.csv', index=False, encoding='utf-8-sig')
print(f'  >>> {DIR/"inventario_orgaos_julgadores.csv"}')

# Sem ministro_canonical
sem_ministro = con.execute("""
SELECT orgao_codigo, orgao_nome, categoria_orgao, COUNT(*) AS docs
FROM stj_processos
WHERE ministro_canonical IS NULL
GROUP BY 1,2,3 ORDER BY docs DESC
""").fetchdf()
print(f'\n  {len(sem_ministro)} órgãos SEM ministro_canonical mapeado:')
print(sem_ministro.head(20).to_string(index=False))

# === 4. CLASSES PROCESSUAIS — fora da árvore TPU ===
print('\n'+'='*70)
print('4. CLASSES — códigos no raw que não estão em cnj_classes_arvore')
print('='*70)
gap_classes = con.execute("""
SELECT p.classe_codigo, p.classe_nome, COUNT(*) AS docs
FROM stj_processos p
LEFT JOIN cnj_classes_arvore c ON c.codigo = p.classe_codigo
WHERE p.classe_codigo IS NOT NULL AND c.codigo IS NULL
GROUP BY 1,2 ORDER BY docs DESC
""").fetchdf()
print(f'  {len(gap_classes)} classes sem TPU')
if len(gap_classes) > 0:
    print(gap_classes.head(20).to_string(index=False))
gap_classes.to_csv(DIR/'inventario_gap_classes.csv', index=False, encoding='utf-8-sig')

# === 5. ASSUNTOS — fora da árvore TPU ===
print('\n'+'='*70)
print('5. ASSUNTOS — códigos no raw que não estão em cnj_assuntos_arvore')
print('='*70)
gap_assuntos = con.execute("""
SELECT p.assunto_principal_cod, p.assunto_principal_nome, COUNT(*) AS docs
FROM stj_processos p
LEFT JOIN cnj_assuntos_arvore a ON a.codigo_num = p.assunto_principal_cod
WHERE p.assunto_principal_cod IS NOT NULL AND a.codigo_num IS NULL
GROUP BY 1,2 ORDER BY docs DESC
""").fetchdf()
print(f'  {len(gap_assuntos)} assuntos sem TPU')
if len(gap_assuntos) > 0:
    print(gap_assuntos.head(20).to_string(index=False))
gap_assuntos.to_csv(DIR/'inventario_gap_assuntos.csv', index=False, encoding='utf-8-sig')

# === RELATÓRIO CONSOLIDADO ===
print('\n'+'='*70)
print('RESUMO INVENTÁRIO')
print('='*70)
print(f'  Movimentos: {len(mov)} códigos únicos no raw')
print(f'  Complementos: {len(comp)} pares (desc, codigo, valor) únicos')
print(f'  Órgãos: {len(orgaos)} órgãos × ministro únicos | {len(sem_ministro)} sem mapeamento')
print(f'  Classes gap TPU: {len(gap_classes)}')
print(f'  Assuntos gap TPU: {len(gap_assuntos)}')

con.close()
print('\nOK')
