import pandas as pd
import time, os

t0 = time.time()

# LEITURA
print('Lendo CSV...')
df = pd.read_csv(
    r"C:\Users\medin\Downloads\stf_decisoes_universo.csv",
    encoding="latin-1",
    sep=",",
    dtype=str,
    low_memory=False,
    usecols=["idFatoDecisao", "Processo"]
)
print(f'Lido: {len(df):,} linhas em {time.time()-t0:.1f}s')

# RENOMEAR
df.rename(columns={"idFatoDecisao": "id_fato_decisao", "Processo": "processo"}, inplace=True)

# LIMPAR
df["processo"] = df["processo"].str.strip()

# EXTRAIR CLASSE E NÚMERO
split = df["processo"].str.split(" ", n=1)
df["classe_processo"] = split.str[0].fillna(df["processo"])
df["numero_processo"] = split.str[1].fillna("")

# CHAVE CANÔNICA
df["processo_key"] = df["classe_processo"] + " " + df["numero_processo"]
df["processo_key"] = df["processo_key"].str.strip()

# ===== DIAGNÓSTICO =====
print(f'\n===== DIAGNÓSTICO =====')
print(f'Total de linhas: {len(df):,}')
print(f'Processos únicos (processo_key): {df["processo_key"].nunique():,}')

print(f'\nTop 20 classes por frequência:')
top = df["classe_processo"].value_counts().head(20)
for cls, cnt in top.items():
    print(f'  {cls:>8s}: {cnt:>10,} ({cnt/len(df)*100:.1f}%)')

print(f'\nDecisões por processo:')
dec_per = df.groupby("processo_key").size()
print(f'  1 decisão:   {(dec_per==1).sum():,}')
print(f'  2 decisões:  {(dec_per==2).sum():,}')
print(f'  3-9:         {((dec_per>=3)&(dec_per<10)).sum():,}')
print(f'  10-99:       {((dec_per>=10)&(dec_per<100)).sum():,}')
print(f'  100+:        {(dec_per>=100).sum():,}')
print(f'  Max:         {dec_per.max():,} ({dec_per.idxmax()})')

sem_espaco = df[~df["processo"].str.contains(" ", na=False)]
print(f'\nLinhas sem espaço (mal formadas): {len(sem_espaco):,}')
if len(sem_espaco) > 0:
    print(f'  Exemplos: {sem_espaco["processo"].head(10).tolist()}')

nulos = df["id_fato_decisao"].isna().sum()
dups = df["id_fato_decisao"].duplicated().sum()
print(f'\nid_fato_decisao nulos: {nulos:,}')
print(f'id_fato_decisao duplicados: {dups:,}')

# SALVAR
out = r"C:\Users\medin\Downloads\stf_chave_processos.csv"
df[["id_fato_decisao","processo","classe_processo","numero_processo","processo_key"]].to_csv(
    out, encoding="utf-8-sig", sep=";", index=False
)

sz = os.path.getsize(out) / (1024*1024)
print(f'\n===== OUTPUT =====')
print(f'Shape: {df.shape}')
print(f'Arquivo: {out}')
print(f'Tamanho: {sz:.1f} MB')
print(f'Tempo total: {time.time()-t0:.1f}s')
