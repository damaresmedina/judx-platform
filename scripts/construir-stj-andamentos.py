"""
JudX - Banco de andamentos traduzidos do STJ
=============================================

Gera C:\\stj_raw\\stj_andamentos.duckdb com duas tabelas:

  tpu_movimentos     - dicionario 229 codigos + TPU v7 (categoria consolidada)
  stj_andamentos     - 1 linha por movimento de cada processo, com nome traduzido

Fonte: 4.058 arquivos .ndjson.gz
  - C:\\stj_raw\\              (3.380 arquivos, extracao 17/abr)
  - C:\\Users\\medin\\staging_local_copia\\raw_stj_23abr\\   (678 arquivos, 23/abr c/ tiebreak)

De-duplicacao por datajud_id ao iterar os dois conjuntos.

Regra de preservacao absoluta: nome_raw (como veio do Datajud) e nome_tpu (tradicao
canonica pelo dicionario CNJ) gravados lado a lado; nenhum descartado.
"""
import duckdb, gzip, json, os, glob, time, csv, re, sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

OUT = r'C:\stj_raw\stj_andamentos.duckdb'
RAW_A = r'C:\stj_raw'
RAW_B = r'C:\Users\medin\staging_local_copia\raw_stj_23abr'
DIC_CSV = r'C:\Users\medin\Desktop\backup_judx\resultados\2026-04-19_stj_movimentos_canonico.csv'

# ================================================================
# TPU v7 - 59 codigos decisorios (reference_tpu_cnj_movimentos_dicionario.md)
# tupla: (nome_canonico, categoria, consolidado)
# ================================================================
TPU_DECISORIOS = {
    237:   ("Provimento",                                      "provido",                  "provido"),
    239:   ("Nao-Provimento",                                  "nao_provido",              "nao_provido"),
    238:   ("Provimento em Parte",                             "parcial",                  "parcial"),
    235:   ("Nao Conhecimento de recurso",                     "nao_conhecido",            "nao_conhecido"),
    236:   ("Conhecimento",                                    "conhecido",                "conhecido"),
    230:   ("Recurso prejudicado",                             "prejudicado",              "prejudicado"),
    220:   ("Improcedencia",                                   "improcedencia",            "nao_provido"),
    221:   ("Procedencia em Parte",                            "procedencia_parcial",      "parcial"),
    240:   ("Conhec Parte e Provimento",                       "parcial_provido",          "provido"),
    241:   ("Conhec Parte e Provim Parte",                     "parcial_parcial",          "parcial"),
    242:   ("Conhec Parte e Nao-Provimento",                   "parcial_nao_provido",      "parcial"),
    454:   ("Indeferimento peticao inicial",                   "indeferido",               "indeferido"),
    466:   ("Homologacao Transacao",                           "transacao",                "transacao"),
    901:   ("Negacao de seguimento",                           "negado_seguimento",        "nao_conhecido"),
    941:   ("Incompetencia",                                   "incompetencia",            "incompetencia"),
    972:   ("Provimento art 557/932 CPC",                      "provido_monocratico",      "provido"),
    198:   ("Acolhim Embargos Decl",                           "embargos_acolhidos",       "embargos_acolhidos"),
    200:   ("Nao-Acolhim Embargos Decl",                       "embargos_rejeitados",      "embargos_rejeitados"),
    871:   ("Acolhim parte Embargos Decl",                     "embargos_parcial",         "embargos_acolhidos"),
    463:   ("Desistencia",                                     "desistencia",              "desistencia"),
    944:   ("Desistencia de Recurso",                          "desistencia_recurso",      "desistencia"),
    12467: ("Desistencia de pedido",                           "desistencia_pedido",       "desistencia"),
    12444: ("Deferimento",                                     "deferido",                 "provido"),
    12455: ("Indeferimento generico",                          "indeferido_generico",      "indeferido"),
    12434: ("Provimento REsp",                                 "REsp_provido",             "provido"),
    12435: ("Nao-provim REsp",                                 "REsp_nao_provido",         "nao_provido"),
    12436: ("Nao conhec REsp",                                 "REsp_nao_conhecido",       "nao_conhecido"),
    12438: ("Parcial provim REsp",                             "REsp_parcial",             "parcial"),
    12440: ("Conhec parte REsp e neg provim",                  "REsp_parcial_nao_provido", "parcial"),
    12458: ("Nao conhec HC",                                   "HC_nao_conhecido",         "nao_conhecido"),
    12475: ("HC de oficio",                                    "HC_concedido",             "provido"),
    12319: ("Nao conhec pedido",                               "nao_conhecido_pedido",     "nao_conhecido"),
    12459: ("Prejudicado STJ",                                 "prejudicado_stj",          "prejudicado"),
}

# Grupos funcionais de tramitacao (ver reference_tpu_cnj_movimentos_dicionario.md)
TRAMITACAO_GRUPOS = {
    22:"baixa", 26:"distribuicao", 36:"redistribuicao", 51:"conclusao",
    60:"expediente", 85:"peticao", 92:"publicacao", 106:"expediente",
    118:"protocolo", 123:"remessa", 132:"recebimento", 219:"julgamento",
    246:"marcador", 269:"impedimento", 272:"sobrestamento",
    339:"cautelar", 417:"pauta", 443:"classe", 581:"anexo",
    792:"cautelar", 848:"transito", 892:"cautelar", 897:"retirada_pauta",
    898:"ref_decisao", 928:"publicacao", 945:"ref_decisao",
    982:"remessa", 1051:"prazo", 1061:"publicacao",
    10966:"reclassificacao", 11010:"expediente", 11013:"acordo",
    11020:"expediente", 11024:"gratuidade", 11383:"expediente",
    11796:"competencia", 11975:"repetitivo", 12092:"afetacao",
    12106:"adiamento", 12109:"admissao_repetitivo", 12309:"retirada",
    12318:"prevencao", 12427:"classe", 12437:"reclassificacao",
    12472:"devolucao", 12474:"distribuicao", 14961:"erro",
}

TS_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})")
def safe_ts(s):
    if not s: return None, None
    m = TS_RE.match(str(s))
    if not m: return None, None
    y, mo, d, h, mi, se = map(int, m.groups())
    if not (1988 <= y <= 2030 and 1 <= mo <= 12 and 1 <= d <= 31): return None, None
    return f"{y:04d}-{mo:02d}-{d:02d} {h:02d}:{mi:02d}:{se:02d}", y

t0 = time.time()
print(f"[{time.strftime('%H:%M:%S')}] start construir-stj-andamentos", flush=True)

# ================================================================
# 1) DICIONARIO tpu_movimentos
# ================================================================
print("\n[1/3] Construindo dicionario tpu_movimentos (empirico 229 + TPU v7 + tramitacao)...", flush=True)

dic = {}
with open(DIC_CSV, 'r', encoding='utf-8') as f:
    for r in csv.DictReader(f):
        cod = int(r['codigo'])
        nome_obs = r['nome']
        ocorr = int(r['ocorrencias'])
        if cod in TPU_DECISORIOS:
            nome_tpu, cat, cons = TPU_DECISORIOS[cod]
            eh_dec = True
        elif cod in TRAMITACAO_GRUPOS:
            nome_tpu = nome_obs
            cat = TRAMITACAO_GRUPOS[cod]; cons = cat
            eh_dec = False
        else:
            nome_tpu = nome_obs
            cat = 'outros'; cons = 'outros'
            eh_dec = False
        dic[cod] = (nome_tpu, cat, cons, eh_dec, ocorr)

# Garantir que TODO codigo do TPU v7 e TRAMITACAO_GRUPOS esteja no dic (mesmo se CSV nao tiver)
for cod, (nt, c, co) in TPU_DECISORIOS.items():
    if cod not in dic: dic[cod] = (nt, c, co, True, 0)
for cod, c in TRAMITACAO_GRUPOS.items():
    if cod not in dic: dic[cod] = (f"(tramitacao {cod})", c, c, False, 0)

con = duckdb.connect(OUT)
con.execute("DROP TABLE IF EXISTS tpu_movimentos")
con.execute("""
CREATE TABLE tpu_movimentos (
    codigo INTEGER PRIMARY KEY,
    nome_tpu VARCHAR,
    categoria VARCHAR,
    consolidado VARCHAR,
    eh_decisao BOOLEAN,
    ocorrencias_stj INTEGER
)""")
for cod, (n, c, co, d, o) in sorted(dic.items()):
    con.execute("INSERT INTO tpu_movimentos VALUES (?,?,?,?,?,?)", (cod, n, c, co, d, o))
print(f"   tpu_movimentos: {len(dic)} codigos", flush=True)
print(f"   decisorios: {sum(1 for v in dic.values() if v[3])}", flush=True)
print(f"   tramitacao catalogada: {sum(1 for v in dic.values() if not v[3] and v[1] != 'outros')}", flush=True)
print(f"   outros (nao catalogados): {sum(1 for v in dic.values() if v[1] == 'outros')}", flush=True)

# ================================================================
# 2) TABELA stj_andamentos - 1 linha por movimento
# ================================================================
print("\n[2/3] Construindo stj_andamentos (iterando 4.058 .ndjson.gz)...", flush=True)
con.execute("DROP TABLE IF EXISTS stj_andamentos")
con.execute("""
CREATE TABLE stj_andamentos (
    datajud_id VARCHAR,
    numero_cnj VARCHAR,
    seq INTEGER,
    codigo_mov INTEGER,
    nome_raw VARCHAR,
    nome_tpu VARCHAR,
    categoria VARCHAR,
    consolidado VARCHAR,
    eh_decisao BOOLEAN,
    data_hora TIMESTAMP,
    ano INTEGER,
    orgao_codigo_mov VARCHAR,
    complementos_json VARCHAR
)""")

arq_a = sorted(glob.glob(os.path.join(RAW_A, 'part-*.ndjson.gz')))
arq_b = sorted(glob.glob(os.path.join(RAW_B, 'part-*.ndjson.gz')))
print(f"   arquivos: {len(arq_a)} orig + {len(arq_b)} re-extracao = {len(arq_a)+len(arq_b)}", flush=True)

vistos = set()
batch = []
BATCH_SIZE = 50000
proc_ok = 0; proc_dup = 0; mov_ins = 0; rej = 0; lin_err = 0

def flush():
    global mov_ins, rej
    if not batch: return
    try:
        con.executemany(
            "INSERT INTO stj_andamentos VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", batch)
        mov_ins += len(batch)
    except Exception:
        # fallback linha a linha (raro)
        for row in batch:
            try:
                con.execute(
                    "INSERT INTO stj_andamentos VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", row)
                mov_ins += 1
            except: rej += 1
    batch.clear()

for tag, arquivos in [('A', arq_a), ('B', arq_b)]:
    for i, path in enumerate(arquivos):
        try:
            with gzip.open(path, 'rt', encoding='utf-8') as f:
                for linha in f:
                    try:
                        doc = json.loads(linha)
                        did = doc.get('_id', '')
                        if not did:
                            lin_err += 1; continue
                        if did in vistos:
                            proc_dup += 1; continue
                        vistos.add(did)
                        src = doc.get('_source', doc) or {}
                        cnj = src.get('numeroProcesso', '') or ''
                        movs = src.get('movimentos') or []
                        if not isinstance(movs, list):
                            proc_ok += 1; continue
                        for seq, m in enumerate(movs, 1):
                            if not isinstance(m, dict): continue
                            cod = m.get('codigo')
                            if cod is None: continue
                            try: cod = int(cod)
                            except (TypeError, ValueError): continue
                            nome_raw = (m.get('nome') or '')[:500]
                            dt, ano = safe_ts(m.get('dataHora'))
                            oj = m.get('orgaoJulgador') or {}
                            orgao_mov = str(oj.get('codigoOrgao', '') if isinstance(oj, dict) else '')
                            comps = m.get('complementosTabelados')
                            comps_json = json.dumps(comps, ensure_ascii=False)[:2000] if comps else None
                            t = dic.get(cod)
                            if t:
                                nome_tpu, cat, cons, eh_dec, _ = t
                            else:
                                nome_tpu = nome_raw or f"(cod {cod})"
                                cat = 'nao_catalogado'
                                cons = 'nao_catalogado'
                                eh_dec = False
                            batch.append((did, cnj, seq, cod, nome_raw, nome_tpu,
                                          cat, cons, eh_dec, dt, ano, orgao_mov, comps_json))
                            if len(batch) >= BATCH_SIZE:
                                flush()
                        proc_ok += 1
                    except Exception:
                        lin_err += 1
        except Exception as e:
            print(f"  ERRO arq {path}: {e}", flush=True)
        if (i+1) % 100 == 0:
            dt_min = (time.time()-t0)/60
            print(f"  [{tag}][{i+1}/{len(arquivos)}] ok={proc_ok:,} dup={proc_dup:,} movs={mov_ins:,} "
                  f"rej={rej} lin_err={lin_err} t={dt_min:.1f}m", flush=True)

flush()

# ================================================================
# 3) INDICES + ESTATISTICAS
# ================================================================
print("\n[3/3] Criando indices...", flush=True)
for col in ['datajud_id','numero_cnj','codigo_mov','categoria','consolidado','eh_decisao','ano']:
    try:
        con.execute(f"CREATE INDEX idx_and_{col} ON stj_andamentos({col})")
        print(f"   indice {col} ok", flush=True)
    except Exception as e:
        print(f"   warn {col}: {e}", flush=True)

total_and = con.execute("SELECT COUNT(*) FROM stj_andamentos").fetchone()[0]
total_proc = con.execute("SELECT COUNT(DISTINCT datajud_id) FROM stj_andamentos").fetchone()[0]
total_cnj = con.execute("SELECT COUNT(DISTINCT numero_cnj) FROM stj_andamentos").fetchone()[0]
media_mov = total_and / total_proc if total_proc else 0

print(f"\n=== DONE em {(time.time()-t0)/60:.2f} min ===", flush=True)
print(f"stj_andamentos: {total_and:,} movimentos", flush=True)
print(f"processos distintos (datajud_id): {total_proc:,}", flush=True)
print(f"numeroCNJ distintos: {total_cnj:,}", flush=True)
print(f"media de movimentos por processo: {media_mov:.1f}", flush=True)
print(f"rejeitadas: {rej}  lin_err: {lin_err}  dup: {proc_dup:,}", flush=True)

print("\n=== Top 15 categorias ===", flush=True)
for r in con.execute("""
    SELECT categoria, COUNT(*) FROM stj_andamentos GROUP BY 1 ORDER BY 2 DESC LIMIT 15
""").fetchall():
    pct = r[1]/total_and*100
    print(f"  {r[1]:>14,}  ({pct:5.2f}%)  {r[0]}", flush=True)

print("\n=== Top 15 codigos (mais frequentes) ===", flush=True)
for r in con.execute("""
    SELECT a.codigo_mov, m.nome_tpu, COUNT(*) AS n
    FROM stj_andamentos a
    LEFT JOIN tpu_movimentos m ON a.codigo_mov = m.codigo
    GROUP BY 1,2 ORDER BY 3 DESC LIMIT 15
""").fetchall():
    pct = r[2]/total_and*100
    print(f"  cod {r[0]:>6}  {r[2]:>14,}  ({pct:5.2f}%)  {r[1]}", flush=True)

print("\n=== Cobertura (decisorios vs tramitacao vs nao_catalogado) ===", flush=True)
for r in con.execute("""
    SELECT
      CASE WHEN eh_decisao THEN 'decisorio'
           WHEN categoria='nao_catalogado' THEN 'nao_catalogado'
           ELSE 'tramitacao' END AS tipo,
      COUNT(*) AS n
    FROM stj_andamentos GROUP BY 1 ORDER BY 2 DESC
""").fetchall():
    pct = r[1]/total_and*100
    print(f"  {r[1]:>14,}  ({pct:5.2f}%)  {r[0]}", flush=True)

con.close()
print(f"\nPronto: {OUT}\n", flush=True)
