#!/usr/bin/env python3
"""
normalizar_partes_local.py — Segunda volta da normalizacao de partes (LOCAL, sem tocar Supabase)

Le o backup CSV de 16/abr, aplica split + normalizacao para TODOS os 7 slots,
cruza com judx_litigant existente, e gera:
  - litigants_novos.csv       — nomes que nao existem em judx_litigant
  - case_litigants_pendentes.csv — vinculos que nao existem em judx_case_litigant
  - relatorio_normalizacao.txt — contagens e amostras

Regra definitiva: ZERO escrita no Supabase. Tudo em HD.
"""
import csv, re, sys, json, os
from pathlib import Path
from collections import defaultdict, Counter

csv.field_size_limit(10 * 1024 * 1024)  # 10 MB per field

BACKUP = Path(r"C:\Users\medin\Desktop\backup_judx\relatorios\2026-04-16_backup_completo")
OUTDIR = Path(r"C:\Users\medin\Desktop\backup_judx\resultados\2026-04-17_normalizacao_partes")
OUTDIR.mkdir(parents=True, exist_ok=True)

# -- Regex de split (mesma usada no Supabase antes do read-only) -------------
SPLIT_RE = re.compile(r'\s*\|\s*|\s+E\s+OUTR[OA]S?(?:\s*\(A/S\))?', re.IGNORECASE)

# -- Padrao de state_entity (reforcado vs o inicial de 07/abr) ---------------
STATE_PATTERNS = re.compile(
    r'\b(?:UNI[AÃ]O(?:\s+FEDERAL)?|ESTADO\s+D[EOA]\s|MUNIC[IÍ]PIO\s+D[EOA]\s|DISTRITO\s+FEDERAL'
    r'|GOVERNADOR(?:A)?\s+D[EOA]\s|PRESIDENTE\s+D[AO]\s|SENADO\s+FEDERAL|C[AÂ]MARA\s+DOS?\s+DEPUTADOS?'
    r'|CONGRESSO\s+NACIONAL|TRIBUNAL\s+DE\s+CONTAS|CONSELHO\s+NACIONAL'
    r'|MINIST[EÉ]RIO\s+P[UÚ]BLICO|MPF|MPE|MPT|MPM|MPDFT|DEFENSORIA\s+P[UÚ]BLICA'
    r'|ADVOCACIA[-\s]GERAL|PROCURADORIA[-\s]GERAL|PROCURADOR(?:A)?(?:ES)?\s+D[EOA]\s'
    r'|INSS|IBAMA|INCRA|FUNAI|ANATEL|ANEEL|ANVISA|ANS|ANP|ANCINE|ANA\b|ANAC|ANTT|ANTAQ|ANM'
    r'|RECEITA\s+FEDERAL|FAZENDA\s+(?:NACIONAL|P[UÚ]BLICA|D[EOA])'
    r'|BANCO\s+CENTRAL|BACEN|CVM|SUSEP'
    r'|CAIXA\s+ECON[OÔ]MICA|BANCO\s+DO\s+BRASIL|BNDES|CEF\b'
    r'|FUNDA[CÇ][AÃ]O\s+NACIONAL|AUTARQUIA|EMPRESA\s+P[UÚ]BLICA|SOCIEDADE\s+DE\s+ECONOMIA\s+MISTA'
    r'|PETROBRAS|ELETROBRAS|CORREIOS|ECT\b|DATAPREV|SERPRO|EMBRAPA|FIOCRUZ|FUNASA'
    r')\b',
    re.IGNORECASE
)

# -- Padrao de state_entity_kind (refinamento que faltou em 07/abr) ----------
def detect_state_kind(name_upper: str) -> str | None:
    if not STATE_PATTERNS.search(name_upper):
        return None
    n = name_upper
    if re.search(r'\bUNI[AÃ]O\b|\bFAZENDA\s+NACIONAL\b|\bRECEITA\s+FEDERAL\b|\bAGU\b|\bADVOCACIA[-\s]GERAL\s+DA\s+UNI', n):
        return 'uniao_federal'
    if re.search(r'\bMPF\b|MINIST[EÉ]RIO\s+P[UÚ]BLICO\s+FEDERAL', n):
        return 'mp_federal'
    if re.search(r'\bMPE\b|MINIST[EÉ]RIO\s+P[UÚ]BLICO\s+D[EOA]\s', n):
        return 'mp_estadual'
    if re.search(r'\bMPT\b|MINIST[EÉ]RIO\s+P[UÚ]BLICO\s+DO\s+TRABALHO', n):
        return 'mp_trabalho'
    if re.search(r'MINIST[EÉ]RIO\s+P[UÚ]BLICO', n):
        return 'ministerio_publico'
    if re.search(r'\bDEFENSORIA\s+P[UÚ]BLICA', n):
        return 'defensoria_publica'
    if re.search(r'\bINSS\b|\bIBAMA\b|\bINCRA\b|\bFUNAI\b|\bANVISA\b|\bANATEL\b|\bANEEL\b|\bANS\b|\bANP\b|\bANA\b|\bANAC\b|\bANTT\b|\bANTAQ\b|\bANM\b|\bANCINE\b|AUTARQUIA\s+FEDERAL', n):
        return 'autarquia_federal'
    if re.search(r'\bBACEN\b|\bBANCO\s+CENTRAL\b|\bCVM\b|\bSUSEP\b', n):
        return 'autarquia_federal'
    if re.search(r'\bCEF\b|CAIXA\s+ECON[OÔ]MICA|\bBNDES\b|\bBANCO\s+DO\s+BRASIL\b|\bPETROBRAS\b|\bELETROBRAS\b|\bCORREIOS\b|\bECT\b|\bDATAPREV\b|\bSERPRO\b|EMPRESA\s+P[UÚ]BLICA|SOCIEDADE\s+DE\s+ECONOMIA\s+MISTA', n):
        return 'estatal_empresarial'
    if re.search(r'\bESTADO\s+D[EOA]\s|\bGOVERNADOR(?:A)?\s+D[EOA]\s|FAZENDA\s+P[UÚ]BLICA\s+ESTADUAL|PROCURADORIA[-\s]GERAL\s+DO\s+ESTADO', n):
        return 'estado'
    if re.search(r'\bMUNIC[IÍ]PIO\s+D[EOA]\s|PREFEITURA|PROCURADORIA[-\s]GERAL\s+DO\s+MUNIC', n):
        return 'municipio'
    if re.search(r'\bDISTRITO\s+FEDERAL\b', n):
        return 'distrito_federal'
    if re.search(r'\bSENADO\b|\bC[AÂ]MARA\s+DOS?\s+DEPUTADOS?\b|\bCONGRESSO\s+NACIONAL\b', n):
        return 'legislativo_federal'
    if re.search(r'\bTRIBUNAL\s+DE\s+CONTAS\b|\bCONSELHO\s+NACIONAL\b', n):
        return 'orgao_controle'
    return 'outro_estatal'

# -- Classificacao de litigant_type ------------------------------------------
def classify_type(name_upper: str, is_state: bool) -> str:
    if is_state:
        return 'pessoa_juridica_publica'
    if re.search(r'\b(?:S/A|S\.A\.|LTDA|EIRELI|ME\.?$|EPP\b|COMPANHIA|SOCIEDADE|ASSOCIA[CÇ][AÃ]O|FUNDA[CÇ][AÃ]O|SINDICATO|FEDERA[CÇ][AÃ]O|CONFEDERA[CÇ][AÃ]O|INSTITUTO|COOPERATIVA|PARTIDO|COLIGA[CÇ][AÃ]O|IGREJA|CONSELHO|ORDEM)\b', name_upper):
        return 'pessoa_juridica_privada'
    return 'pessoa_fisica'

# -- Normalizacao de nome (mesma do 07/abr: lower + trim) --------------------
def norm(name: str) -> str:
    return name.strip().lower()

def split_field(value: str) -> list[str]:
    if not value:
        return []
    parts = [p.strip() for p in SPLIT_RE.split(value)]
    return [p for p in parts if p and len(p) >= 2]

# ===========================================================================
# ETAPA 1: carregar judx_litigant existente (para saber o que nao precisa inserir)
# ===========================================================================
print(f"[{os.popen('time /t').read().strip()}] Carregando judx_litigant.csv...", flush=True)
existing_litigants: dict[str, str] = {}  # normalized_name -> id
with open(BACKUP / "judx_litigant.csv", encoding='utf-8', errors='replace') as fh:
    r = csv.DictReader(fh)
    for row in r:
        existing_litigants[row['normalized_name']] = row['id']
print(f"  -> {len(existing_litigants):,} litigants ja existentes", flush=True)

# ===========================================================================
# ETAPA 2: carregar judx_case metadata->>incidente (para mapear incidente -> case_id)
# ===========================================================================
print(f"Carregando judx_case.csv (metadata com incidente)...", flush=True)
incidente_to_case: dict[str, str] = {}  # incidente -> case_id
with open(BACKUP / "judx_case.csv", encoding='utf-8', errors='replace') as fh:
    r = csv.DictReader(fh)
    for row in r:
        try:
            meta = json.loads(row['metadata']) if row['metadata'] else {}
            inc = meta.get('incidente')
            if inc is not None:
                incidente_to_case[str(inc)] = row['id']
        except (json.JSONDecodeError, KeyError):
            continue
print(f"  -> {len(incidente_to_case):,} cases com incidente mapeado", flush=True)

# ===========================================================================
# ETAPA 3: carregar judx_case_litigant existente (vinculos para nao duplicar)
# ===========================================================================
print(f"Carregando judx_case_litigant.csv...", flush=True)
existing_links: set[tuple[str, str, str]] = set()
with open(BACKUP / "judx_case_litigant.csv", encoding='utf-8', errors='replace') as fh:
    r = csv.DictReader(fh)
    for row in r:
        existing_links.add((row['case_id'], row['litigant_id'], row['procedural_position']))
print(f"  -> {len(existing_links):,} vinculos ja existentes", flush=True)

# ===========================================================================
# ETAPA 4: processar stf_partes_completo.csv (streaming)
# ===========================================================================
print(f"Processando stf_partes_completo.csv (streaming)...", flush=True)

# novos_litigants: normalized_name -> (nome_original, state_entity, state_entity_kind, litigant_type)
novos_litigants: dict[str, tuple[str, bool, str | None, str]] = {}

# vinculos_pendentes: lista de (incidente, normalized_name, slot, is_state_side)
vinculos_pendentes: list[tuple[str, str, str, bool]] = []

stats = Counter()

SLOTS = [
    ('polo_ativo', 'polo_ativo'),
    ('polo_passivo', 'polo_passivo'),
    ('adv_ativo', 'advogado_ativo'),
    ('adv_passivo', 'advogado_passivo'),
    ('interessados_ativo', 'interessado_ativo'),
    ('interessados_passivo', 'interessado_passivo'),
    ('min_relator', 'min_relator'),
]

with open(BACKUP / "stf_partes_completo.csv", encoding='utf-8', errors='replace') as fh:
    r = csv.DictReader(fh)
    processed = 0
    for row in r:
        processed += 1
        if processed % 200000 == 0:
            print(f"  [{processed:,}] lidos | novos_litigants={len(novos_litigants):,} | vinculos={len(vinculos_pendentes):,}", flush=True)

        incidente = row.get('incidente', '').strip()
        if not incidente:
            continue

        for csv_col, slot_name in SLOTS:
            val = row.get(csv_col, '')
            if not val:
                continue
            for name in split_field(val):
                nm = norm(name)
                if not nm or len(nm) < 2:
                    continue
                stats[f'slot:{slot_name}'] += 1

                name_upper = name.upper()
                is_state = bool(STATE_PATTERNS.search(name_upper))
                kind = detect_state_kind(name_upper) if is_state else None
                ltype = classify_type(name_upper, is_state)

                if nm not in existing_litigants and nm not in novos_litigants:
                    novos_litigants[nm] = (name, is_state, kind, ltype)
                    stats['litigant_novo'] += 1
                else:
                    stats['litigant_existente'] += 1

                vinculos_pendentes.append((incidente, nm, slot_name, is_state))

print(f"  -> {processed:,} rows de stf_partes_completo processadas", flush=True)

# ===========================================================================
# ETAPA 5: filtrar vinculos que ja existem (precisa do case_id + litigant_id)
# ===========================================================================
print(f"Filtrando vinculos ja existentes...", flush=True)

# mapeamento normalized_name -> id (existentes + novos gerarao ids futuros)
vinculos_novos = []
vinculos_sem_case = 0
vinculos_duplicados = 0
vinculos_prontos = 0

for incidente, norm_name, slot, is_state in vinculos_pendentes:
    case_id = incidente_to_case.get(incidente)
    if not case_id:
        vinculos_sem_case += 1
        continue
    # Se o litigant ja existe no backup, podemos checar duplicata
    lit_id = existing_litigants.get(norm_name)
    if lit_id and (case_id, lit_id, slot) in existing_links:
        vinculos_duplicados += 1
        continue
    vinculos_novos.append((incidente, case_id, norm_name, slot, is_state))
    vinculos_prontos += 1

print(f"  -> {vinculos_prontos:,} vinculos novos a inserir", flush=True)
print(f"  -> {vinculos_duplicados:,} ja existentes (puladas)", flush=True)
print(f"  -> {vinculos_sem_case:,} sem case correspondente (incidente sem decisao no corpus)", flush=True)

# ===========================================================================
# ETAPA 6: escrever outputs CSV
# ===========================================================================
print(f"Escrevendo CSVs...", flush=True)

out_lit = OUTDIR / "2026-04-17_litigants_novos.csv"
with open(out_lit, 'w', encoding='utf-8', newline='') as fh:
    w = csv.writer(fh)
    w.writerow(['name', 'normalized_name', 'litigant_type', 'state_entity', 'state_entity_kind'])
    for nm, (orig, is_state, kind, ltype) in novos_litigants.items():
        w.writerow([orig, nm, ltype, 't' if is_state else 'f', kind or ''])
print(f"  -> {out_lit.name}: {len(novos_litigants):,} litigants novos", flush=True)

out_link = OUTDIR / "2026-04-17_case_litigants_pendentes.csv"
with open(out_link, 'w', encoding='utf-8', newline='') as fh:
    w = csv.writer(fh)
    w.writerow(['incidente', 'case_id', 'normalized_name', 'procedural_position', 'is_state_side'])
    for incidente, case_id, norm_name, slot, is_state in vinculos_novos:
        w.writerow([incidente, case_id, norm_name, slot, 't' if is_state else 'f'])
print(f"  -> {out_link.name}: {len(vinculos_novos):,} vinculos pendentes", flush=True)

# ===========================================================================
# ETAPA 7: relatorio
# ===========================================================================
relatorio = OUTDIR / "2026-04-17_relatorio_normalizacao.txt"
with open(relatorio, 'w', encoding='utf-8') as fh:
    fh.write(f"NORMALIZACAO DE PARTES — 17/abr/2026 (LOCAL, sem tocar Supabase)\n")
    fh.write(f"================================================================\n\n")
    fh.write(f"INPUTS (de {BACKUP.name}):\n")
    fh.write(f"  stf_partes_completo.csv: {processed:,} rows\n")
    fh.write(f"  judx_litigant.csv: {len(existing_litigants):,} rows\n")
    fh.write(f"  judx_case.csv (incidente mapeado): {len(incidente_to_case):,}\n")
    fh.write(f"  judx_case_litigant.csv: {len(existing_links):,} rows\n\n")
    fh.write(f"SPLITS POR SLOT:\n")
    for slot in ['polo_ativo','polo_passivo','advogado_ativo','advogado_passivo','interessado_ativo','interessado_passivo','min_relator']:
        fh.write(f"  {slot}: {stats['slot:'+slot]:,}\n")
    fh.write(f"\nENTIDADES:\n")
    fh.write(f"  ja existentes em judx_litigant: {stats['litigant_existente']:,}\n")
    fh.write(f"  NOVAS (a inserir): {stats['litigant_novo']:,}\n\n")
    fh.write(f"VINCULOS (judx_case_litigant):\n")
    fh.write(f"  novos a inserir: {vinculos_prontos:,}\n")
    fh.write(f"  ja existentes (pulados): {vinculos_duplicados:,}\n")
    fh.write(f"  sem case mapeado: {vinculos_sem_case:,}\n\n")
    fh.write(f"OUTPUTS em {OUTDIR}:\n")
    fh.write(f"  - {out_lit.name}\n")
    fh.write(f"  - {out_link.name}\n")
    fh.write(f"  - {relatorio.name}\n\n")
    fh.write(f"PROXIMO PASSO: subir ao Supabase em lotes controlados, so apos upgrade do plano ou autorizacao explicita.\n")
print(f"  -> {relatorio.name}", flush=True)

print(f"\n[OK] concluido.", flush=True)
