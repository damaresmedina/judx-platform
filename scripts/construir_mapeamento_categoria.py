"""Constrói o mapeamento determinístico (tipo, andamento, is_colegiado) → categoria.

Lê o RAW agregado gerado por agregar_tipo_andamento.py, aplica lookup Python
(determinístico, sem regex genérico), e produz:
  - mapeamento_categoria_CLASSIFICADO.csv  — tabela com categoria + justificativa
  - resumo na tela: volume por categoria e resíduo OUTRO pra revisar
"""
import csv
from pathlib import Path

RAW = Path("C:/Users/medin/Desktop/backup_judx/resultados/2026-04-19_mapeamento_categoria_RAW.csv")
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados/2026-04-19_mapeamento_categoria_CLASSIFICADO.csv")

# ============================================================
# LOOKUP DETERMINÍSTICO — cada par (andamento, is_colegiado) tem categoria fixa.
# Construído a partir da inspeção das top-368 combinações do corpus.
# Justificativa em cada entrada: por que essa categoria.
# ============================================================

# Chave: andamento normalizado (UPPER e strip espaços/trailing punct) → (categoria, justificativa)
# is_colegiado=None: qualquer; True: só colegiado; False: só monocrática
# Em caso de múltiplas regras aplicáveis, a MAIS específica (is_colegiado definido) ganha

LOOKUP = [
    # === FILTRO_INADMITE (negativas de admissão preliminar) ===
    ("NEGADO SEGUIMENTO", None, "FILTRO_INADMITE", "inadmissão preliminar — não conheço/nego seguimento"),
    ("DECISÃO DO(A) RELATOR(A) - NEGADO SEGUIMENTO", None, "FILTRO_INADMITE", "formato antigo: relator inadmitiu"),
    ("JULG. POR DESPACHO - NEGADO SEGUIMENTO", None, "FILTRO_INADMITE", "formato antigo via despacho"),
    ("NEGADO SEGUIMENTO AO RECURSO.", None, "FILTRO_INADMITE", "variante maiúscula"),
    ("NEGO SEGUIMENTO AO RECURSO.", None, "FILTRO_INADMITE", "variante 1ª pessoa"),
    ("NÃO CONHECIDO(S)", None, "FILTRO_INADMITE", "não conhecimento = inadmissão"),
    ("DECISÃO DO(A) RELATOR(A) - NÃO CONHECIDO", None, "FILTRO_INADMITE", "não conheço"),
    ("JULG. POR DESPACHO - NAO CONHECIDO", None, "FILTRO_INADMITE", "não conheço antigo"),
    ("NEGADO SEGUIMENTO POR AUSÊNCIA DE PRELIMINAR, ART. 327 DO RISTF", None, "FILTRO_INADMITE", "art. 327 = inadmissão RG"),
    ("DECISÃO DO RELATOR - NÃO CONHECIDO", None, "FILTRO_INADMITE", "variante"),

    # === FILTRO_ADMITE_AI (Agravo de Instrumento — deu provimento para subir) ===
    ("AI PROVIDO E DETERMINADA A CONVERSÃO EM RE", None, "FILTRO_ADMITE_AI", "converte AI em RE: admite"),

    # === ADMITIU_AI_INADMITIU_RE (duplo ato) ===
    ("AGRAVO PROVIDO E DESDE LOGO NEGADO SEGUIMENTO AO RE", None, "ADMITIU_AI_INADMITIU_RE", "AI provido mas RE inadmitido — duplo ato"),
    ("AGRAVO PROVIDO E DETERMINADA A DEVOLUÇÃO, ART. 543-B DO CPC", None, "ADMITIU_AI_DEVOLVIDO_RG", "AI provido + devolve por RG"),

    # === MERITO_IMPROVIDO ===
    ("NÃO PROVIDO", None, "MERITO_IMPROVIDO", "mérito negado"),
    ("AGRAVO NÃO PROVIDO", None, "MERITO_IMPROVIDO", "agravo monocrático improvido = mérito negado"),
    ("DECISÃO DO(A) RELATOR(A) - NÃO PROVIDO", None, "MERITO_IMPROVIDO", "formato antigo: mérito negado"),
    ("JULGAMENTO POR DESPACHO - NAO PROVIDO", None, "MERITO_IMPROVIDO", "despacho antigo: mérito negado"),
    ("CONHECIDO E NEGADO PROVIMENTO", None, "MERITO_IMPROVIDO", "conheceu E julgou mérito negado"),
    ("JULG. POR DESPACHO - NEGADO PROVIMENTO", None, "MERITO_IMPROVIDO", "despacho antigo: mérito negado"),
    ("CONHECIDO EM PARTE E NESSA PARTE IMPROVIDO", None, "MERITO_IMPROVIDO_PARCIAL", "admitiu parcial + improvido"),

    # === MERITO_PROVIDO ===
    ("PROVIDO", None, "MERITO_PROVIDO", "mérito provido"),
    ("DECISÃO DO(A) RELATOR(A) - PROVIDO", None, "MERITO_PROVIDO", "relator deu provimento"),
    ("JULGAMENTO POR DESPACHO - PROVIDO", None, "MERITO_PROVIDO", "despacho antigo provido"),
    ("DECISÃO DO(A) RELATOR(A) - CONHECIDO E PROVIDO", None, "MERITO_PROVIDO", "admitiu + provido"),
    ("JULG. POR DESPACHO - CONHECIDO E PROVIDO", None, "MERITO_PROVIDO", "despacho admitiu+provido"),
    ("PROCEDENTE", None, "MERITO_PROVIDO", "ação originária procedente"),
    ("CONHECIDO, EM PARTE, DO RE E PROVIDO", None, "MERITO_PROVIDO_PARCIAL", "admitiu parcial + provido"),
    ("CONHECIDO E PROVIDO", None, "MERITO_PROVIDO", "admitiu e proveu"),

    # === MERITO_PROVIDO_PARCIAL ===
    ("PROVIDO EM PARTE", None, "MERITO_PROVIDO_PARCIAL", "parcial"),
    ("PROCEDENTE EM PARTE", None, "MERITO_PROVIDO_PARCIAL", "parcial"),
    ("DECISÃO DO(A) RELATOR(A) - PARCIAL PROVIMENTO", None, "MERITO_PROVIDO_PARCIAL", "parcial"),
    ("PARCIAL PROVIMENTO", None, "MERITO_PROVIDO_PARCIAL", "parcial"),
    ("CONHECIDO EM PARTE E NESSA PARTE PROVIDO", None, "MERITO_PROVIDO_PARCIAL", "parcial"),
    ("CONHECIDO EM PARTE E NESTA PARTE PROVIDO.", None, "MERITO_PROVIDO_PARCIAL", "parcial"),
    ("AGRAVO CONVERTIDO EM RE. PARCIAL PROVIMENTO", None, "MERITO_PROVIDO_PARCIAL", "AI convertido + parcial"),

    # === MERITO_IMPROCEDENTE (ações originárias) ===
    ("IMPROCEDENTE", None, "MERITO_IMPROCEDENTE", "ação improcedente"),

    # === COLEGIADO — Agravo Regimental ===
    ("AGRAVO REGIMENTAL NÃO PROVIDO", None, "COLEGIADO_REFERENDO_INADMISSAO", "turma referenda decisão anterior"),
    ("AGRAVO REGIMENTAL NÃO CONHECIDO", None, "COLEGIADO_REFERENDO_INADMISSAO", "AgRg não conhecido = filtro mantido"),
    ("AGRAVO REGIMENTAL PROVIDO", None, "COLEGIADO_REVERSAO_INADMISSAO", "turma reverteu monocrática — OUTLIER"),

    # === COLEGIADO — Embargos ===
    ("EMBARGOS REJEITADOS", None, "COLEGIADO_EMBARGOS_REJEITADOS", "embargos rejeitados"),
    ("EMBARGOS NÃO CONHECIDOS", None, "COLEGIADO_EMBARGOS_REJEITADOS", "embargos não conhecidos"),
    ("EMBARGOS RECEBIDOS COMO AGRAVO REGIMENTAL DESDE LOGO NÃO PROVIDO", None, "COLEGIADO_REFERENDO_INADMISSAO", "convertido em AgRg improvido"),
    ("EMBARGOS RECEBIDOS", None, "COLEGIADO_EMBARGOS_ACOLHIDOS", "embargos acolhidos"),

    # === COLEGIADO — mérito das Turmas/Pleno ===
    ("JULGAMENTO DA SEGUNDA TURMA - NEGADO PROVIMENTO", None, "MERITO_IMPROVIDO", "2ª turma julgou mérito negativo"),
    ("JULGAMENTO DA PRIMEIRA TURMA - NEGADO PROVIMENTO", None, "MERITO_IMPROVIDO", "1ª turma julgou mérito negativo"),
    ("JULGAMENTO DA SEGUNDA TURMA - PROVIDO", None, "MERITO_PROVIDO", "2ª turma julgou mérito provido"),
    ("JULGAMENTO DA PRIMEIRA TURMA - PROVIDO", None, "MERITO_PROVIDO", "1ª turma julgou mérito provido"),

    # === RG — devolução automática ===
    ("DETERMINADA A DEVOLUÇÃO PELO REGIME DA REPERCUSSÃO GERAL", None, "RG_DEVOLUCAO_AUTO", "devolvido por RG — não é filtro nem mérito"),
    ("DETERMINADA A DEVOLUÇÃO, ART. 543-B DO CPC", None, "RG_DEVOLUCAO_AUTO", "devolvido 543-B"),
    ("DETERMINADA A DEVOLUÇÃO EM RAZÃO DE REPRESENTATIVO DA CONTROVÉRSIA", None, "RG_DEVOLUCAO_AUTO", "devolvido por representativo"),
    ("DETERMINADA A DEVOLUÇÃO", None, "RG_DEVOLUCAO_AUTO", "devolvido (genérico)"),
    ("RECONSIDERO E DEVOLVO PELO REGIME DA REPERCUSSÃO GERAL", None, "RG_DEVOLUCAO_AUTO", "reconsidera + devolve RG"),
    ("RECONSIDERO E DETERMINO A DISTRIBUIÇÃO", None, "RECONSIDERACAO_DISTRIBUI", "volta à distribuição"),
    ("RECONSIDERAÇÃO", None, "RECONSIDERACAO_OUTRA", "genérico"),

    # === SOBRESTAMENTO ===
    ("SOBRESTADO", None, "SOBRESTAMENTO", "suspenso"),
    ("SOBRESTADO, AGUARDANDO DECISÃO DO STJ", None, "SOBRESTAMENTO_STJ", "suspenso até STJ"),
    ("SOBRESTADO ATÉ DECISÃO DO STJ", None, "SOBRESTAMENTO_STJ", "suspenso até STJ"),
    ("PROCESSO ESPERANDO DECISÃO DO STJ", None, "SOBRESTAMENTO_STJ", "variante"),

    # === LATERAL ===
    ("PREJUDICADO", None, "LATERAL_PREJUDICADA", "perda de objeto"),
    ("DECISÃO DO(A) RELATOR(A) - PREJUDICADO", None, "LATERAL_PREJUDICADA", "prejudicado (formato antigo)"),
    ("JULGAMENTO POR DESPACHO - PREJUDICADO", None, "LATERAL_PREJUDICADA", "prejudicado despacho"),
    ("HOMOLOGADA A DESISTÊNCIA", None, "LATERAL_HOMOLOGACAO", "desistência homologada"),
    ("EXTINTO O PROCESSO", None, "LATERAL_HOMOLOGACAO", "extinção"),
    ("HOMOLOGAÇÃO DE ACORDO DE NÃO PERSECUÇÃO PENAL - ART.28-A DO CPP", None, "LATERAL_HOMOLOGACAO", "ANPP"),
    ("ARQUIVADO", None, "LATERAL_HOMOLOGACAO", "arquivamento"),

    # === HABEAS CORPUS ===
    ("CONCEDIDA A ORDEM", None, "HABEAS_CONCEDIDO", "HC concedido"),
    ("DENEGADA A ORDEM", None, "HABEAS_DENEGADO", "HC denegado"),
    ("CONCEDIDA A ORDEM DE OFÍCIO", None, "HABEAS_CONCEDIDO_OFICIO", "HC de ofício"),

    # === LIMINARES ===
    ("LIMINAR DEFERIDA", None, "LIMINAR_DEFERIDA", "cautelar concedida"),
    ("LIMINAR INDEFERIDA", None, "LIMINAR_INDEFERIDA", "cautelar negada"),
    ("DEFERIDO", None, "DEFERIMENTO", "deferimento (variado)"),
    ("INDEFERIDO", None, "INDEFERIMENTO", "indeferimento (variado)"),

    # === INTERLOCUTÓRIAS ===
    ("À SECRETARIA, PARA O REGULAR TRÂMITE", None, "INTERLOCUTORIA_SECRETARIA", "interlocutória administrativa"),

    # === DECISÃO DA PRESIDÊNCIA (rotuladas) ===
    ("DECISÃO DA PRESIDÊNCIA - HOMOLOGADA A DESISTÊNCIA", None, "LATERAL_HOMOLOGACAO", "Presidência homologou desistência"),
    ("DECISÃO DA PRESIDÊNCIA - PREJUDICADO", None, "LATERAL_PREJUDICADA", "Presidência julgou prejudicado"),
    ("DECISÃO DA PRESIDÊNCIA - NEGADO SEGUIMENTO", None, "FILTRO_INADMITE", "Presidência inadmitiu"),
    ("DECISÃO DA PRESIDÊNCIA - NÃO CONHECIDO", None, "FILTRO_INADMITE", "Presidência não conheceu"),
    ("DECISÃO DA PRESIDÊNCIA", None, "DECISAO_PRESIDENCIA_GENERICA", "Presidência sem qualificador — precisa Observação"),
    ("DESPACHO DA PRESIDÊNCIA", None, "DECISAO_PRESIDENCIA_GENERICA", "despacho Presid genérico"),

    # === RELATOR GENÉRICO (precisa Observação) ===
    ("DECISÃO DO RELATOR", None, "RELATOR_GENERICO", "sem qualificador — usar Observação"),
    ("DECISÃO DA RELATORA", None, "RELATOR_GENERICO", "feminino"),

    # === OUTROS ESPECÍFICOS ===
    ("DECISÃO (SEGREDO DE JUSTIÇA)", None, "SEGREDO_JUSTICA", "segredo"),
    ("RECEBIDA DENÚNCIA", None, "PROCESSUAL_PENAL_RECEBIDA", "recebimento denúncia"),
    ("REJEITADA A DENÚNCIA", None, "PROCESSUAL_PENAL_REJEITADA", "denúncia rejeitada"),
    ("AUSENTE", None, "OUTRO_AUSENTE", "campo ausente"),
    ("REVOGAÇÃO DE PRISÃO PROVISÓRIA", None, "PENAL_REVOGAR_PRISAO", "revogação"),

    # === ADICIONAIS (rodada 2 — resíduo OUTRO) ===
    # Julgamentos colegiados completos
    ("JULGAMENTO DO PLENO - PROVIDO", None, "MERITO_PROVIDO", "Pleno proveu"),
    ("JULGAMENTO DO PLENO - NEGOU PROVIMENTO", None, "MERITO_IMPROVIDO", "Pleno negou"),
    ("JULGAMENTO DO PLENO - INDEFERIDO", None, "INDEFERIMENTO", "Pleno indeferiu"),
    ("JULGAMENTO DO PLENO - CONHECIDO E PROVIDO", None, "MERITO_PROVIDO", "Pleno admitiu+proveu"),
    ("JULGAMENTO DA PRIMEIRA TURMA - CONHECIDO E PROVIDO", None, "MERITO_PROVIDO", "1ª Turma admitiu+proveu"),
    ("JULGAMENTO DA SEGUNDA TURMA - CONHECIDO E PROVIDO", None, "MERITO_PROVIDO", "2ª Turma admitiu+proveu"),
    ("JULGAMENTO DA PRIMEIRA TURMA - REJEITADOS", None, "COLEGIADO_EMBARGOS_REJEITADOS", "embargos rejeitados 1ª Turma"),
    ("JULGAMENTO DA SEGUNDA TURMA - REJEITADOS", None, "COLEGIADO_EMBARGOS_REJEITADOS", "embargos rejeitados 2ª Turma"),
    ("JULGAMENTO DA SEGUNDA TURMA - INDEFERIDO", None, "INDEFERIMENTO", "2ª Turma indeferiu"),
    ("JULG. DA PRIMEIRA TURMA - NAO CONHECIDO", None, "FILTRO_INADMITE", "1ª Turma não conheceu"),
    ("JULG. DA 2. TURMA - QUESTAO DE ORDEM", None, "QUESTAO_DE_ORDEM", "QO colegiada"),
    ("JULGAMENTO POR DESPACHO", None, "RELATOR_GENERICO", "despacho sem qualificador — Observação"),

    # AI/RE — movimentos específicos
    ("AGRAVO PROVIDO E DESDE LOGO PROVIDO O RE", None, "ADMITIU_AI_PROVIDO_RE", "AI+RE providos"),
    ("AI PROVIDO E DETERMINADA A SUBIDA DO RE", None, "FILTRO_ADMITE_AI", "AI provido, RE subiu"),
    ("DECISÃO DO(A) RELATOR(A) - CONHECER DO AGRAVO E DAR PROVIMENTO", None, "FILTRO_ADMITE_AI", "AI provido"),

    # Reconsiderações e devoluções residuais
    ("RECONSIDERO E DEVOLVO PELO ART. 543-B DO CPC", None, "RG_DEVOLUCAO_AUTO", "reconsidera + devolve 543-B"),
    ("RECONSIDERO E JULGO PREJUDICADO O RECURSO INTERNO", None, "LATERAL_PREJUDICADA", "reconsidera + prejudicado"),

    # Homologações residuais
    ("DECISÃO DO(A) RELATOR(A) - HOMOLOGADA A DESISTÊNCIA", None, "LATERAL_HOMOLOGACAO", "relator homologou"),
    ("JULG. POR DESPACHO -HOMOL. A DESISTENCIA", None, "LATERAL_HOMOLOGACAO", "despacho homol"),
    ("DETERMINADO ARQUIVAMENTO", None, "LATERAL_HOMOLOGACAO", "arquivado"),

    # Presidência específica
    ("DECISÃO DO PRESIDENTE - CONCED. EXEQUATUR", None, "EXEQUATUR_CONCEDIDO", "Presid concede exequatur"),
    ("DECISÃO DO PRESIDENTE - HOMOL. A SENTENÇA", None, "HOMOL_SENT_ESTRANGEIRA", "Presid homologa sentença estrangeira"),

    # Embargos residuais
    ("INADMITIDOS OS EMBARGOS DE DIVERGÊNCIA", None, "COLEGIADO_EMBARGOS_REJEITADOS", "embargos divergência inadmitidos"),

    # Relator formato antigo — parcial / conhecimentos
    ("JULG. POR DESPACHO-CONHECE EM PARTE E NESSA PARTE DÁ PROVIMENTO", None, "MERITO_PROVIDO_PARCIAL", "parcial despacho"),
    ("DECISÃO DO(A) RELATOR(A) - CONHECE EM PARTE E NESSA PARTE DÁ PROVIMENTO", None, "MERITO_PROVIDO_PARCIAL", "parcial"),
    ("DECISÃO DO(A) RELATOR(A) - CONHECIDO E PROVIDO EM PARTE", None, "MERITO_PROVIDO_PARCIAL", "parcial"),

    # Competência
    ("DECLINADA A COMPETÊNCIA", None, "INCOMPETENCIA_DECLINADA", "declinou competência"),
    ("DECISÃO DO(A) RELATOR(A) - DECLINANDO DA COMPETÊNCIA", None, "INCOMPETENCIA_DECLINADA", "declinou"),

    # Mandado de segurança / ordem
    ("DENEGADA A SEGURANÇA", None, "MS_DENEGADO", "MS denegado"),
    ("CONCEDIDA A SEGURANÇA", None, "MS_CONCEDIDO", "MS concedido"),
    ("CONCEDIDA EM PARTE A ORDEM", None, "HABEAS_CONCEDIDO_PARCIAL", "HC parcial"),
    ("CONCEDIDA A SUSPENSÃO", None, "LIMINAR_DEFERIDA", "suspensão concedida"),

    # === RODADA 3 (resíduo OUTRO final) ===
    ("DECISÃO DO(A) RELATOR(A) - CONHECER DO AGRAVO E DAR PROVIMENTO", None, "FILTRO_ADMITE_AI", "AI conhecido e provido"),
    ("DECISÃO DO(A) RELATOR(A) - CONHECER DO AGRAVO E DAR PARCIAL PROVIMENTO", None, "FILTRO_ADMITE_AI", "AI conhecido e provido parcial"),
    ("EMBARGOS RECEBIDOS EM PARTE", None, "COLEGIADO_EMBARGOS_ACOLHIDOS", "embargos parciais"),
    ("JULG. DA SEGUNDA TURMA - NAO CONHECIDO", None, "FILTRO_INADMITE", "2ª Turma não conheceu"),
    ("JULGAMENTO DA PRIMEIRA TURMA - INDEFERIDO", None, "INDEFERIMENTO", "1ª Turma indeferiu"),
    ("AGRAVO PROVIDO E DESDE LOGO PROVIDO PARCIALMENTE O RE", None, "ADMITIU_AI_PROVIDO_RE", "AI+RE providos parcial"),
    ("DECLARADA A EXTINÇÃO DA PUNIBILIDADE", None, "PENAL_EXT_PUNIBILIDADE", "extinção punibilidade"),
    ("JULGAMENTO DA PRIMEIRA TURMA - RECEBIDOS", None, "COLEGIADO_EMBARGOS_ACOLHIDOS", "embargos recebidos 1ª Turma"),
    ("JULGAMENTO DA SEGUNDA TURMA - RECEBIDOS", None, "COLEGIADO_EMBARGOS_ACOLHIDOS", "embargos recebidos 2ª Turma"),
    ("JULGAMENTO DO PLENO - PROCEDENTE", None, "MERITO_PROVIDO", "Pleno procedente"),
    ("JULGAMENTO DO PLENO - IMPROCEDENTE", None, "MERITO_IMPROVIDO", "Pleno improcedente"),
    ("JULGAMENTO DO PLENO - NAO CONHECIDO", None, "FILTRO_INADMITE", "Pleno não conheceu"),
    ("JULGAMENTO DO PLENO - DEFERIDO", None, "DEFERIMENTO", "Pleno deferiu"),
    ("REJEITADOS", None, "COLEGIADO_EMBARGOS_REJEITADOS", "rejeitados (embargos/revisão)"),
    ("ADMITIDOS EMBARGOS DE DIVERGÊNCIA", None, "COLEGIADO_EMBARGOS_ACOLHIDOS", "embargos divergência admitidos"),
    ("JULGAMENTO DA PRIMEIRA TURMA - DEFERIDO", None, "DEFERIMENTO", "1ª Turma deferiu"),
    ("JULGAMENTO DA SEGUNDA TURMA - DEFERIDO", None, "DEFERIMENTO", "2ª Turma deferiu"),
    ("QUESTÃO DE ORDEM", None, "QUESTAO_DE_ORDEM", "QO"),
    ("AGRAVO REGIMENTAL PROVIDO EM PARTE", None, "COLEGIADO_REVERSAO_INADMISSAO", "AgRg parcialmente provido"),
    ("JULGAMENTO DA PRIMEIRA TURMA - CONHECIDO EM PARTE E PROVIDO", None, "MERITO_PROVIDO_PARCIAL", "parcial 1ª T"),
    ("JULGAMENTO DA SEGUNDA TURMA - CONHECIDO EM PARTE E PROVIDO", None, "MERITO_PROVIDO_PARCIAL", "parcial 2ª T"),
    ("JULGAMENTO DA SEGUNDA TURMA - CONHECIDO E PROVIDO EM PARTE", None, "MERITO_PROVIDO_PARCIAL", "parcial 2ª T variante"),
    ("JULGAMENTO DA PRIMEIRA TURMA - NÃO CONHECIDOS", None, "FILTRO_INADMITE", "1ª Turma não conheceu (plural)"),
    ("DECISÃO (SIGILOSO)", None, "SEGREDO_JUSTICA", "sigiloso variante"),
    ("CONHECIDO E PROVIDO EM PARTE", None, "MERITO_PROVIDO_PARCIAL", "parcial"),
    ("CONHECIDO EM PARTE E NESSA PARTE NEGADO PROVIMENTO", None, "MERITO_IMPROVIDO", "improvido parcial"),
    ("DENEGADA A SUSPENSÃO", None, "LIMINAR_INDEFERIDA", "suspensão negada"),
    ("CONCEDIDA EM PARTE A SEGURANÇA", None, "MS_CONCEDIDO", "MS parcial"),
    ("DECISÃO DA PRESIDÊNCIA - EXTINTO O PROCESSO", None, "LATERAL_HOMOLOGACAO", "Presid extinguiu"),
    ("JULG. P/DESPACHO-DECLINACAO COMPETENCIA", None, "INCOMPETENCIA_DECLINADA", "declinou competência antigo"),
    ("AGRAVO PROVIDO E RE PENDENTE DE JULGAMENTO", None, "FILTRO_ADMITE_AI", "AI provido, RE segue"),
]

# Normaliza
def norm(s):
    if s is None: return None
    return ' '.join(str(s).upper().strip().split())

# Indexa
lookup_dict = {}
for and_, col, cat, just in LOOKUP:
    k = (norm(and_), col)
    lookup_dict[k] = (cat, just)

# Aplica no RAW
rows = []
with open(RAW, 'r', encoding='utf-8', newline='') as f:
    reader = csv.DictReader(f)
    for r in reader:
        tipo = r['tipo']
        and_ = r['andamento']
        col_str = r['is_colegiado']
        is_col = True if col_str.strip().lower() == 'true' else (False if col_str.strip().lower() == 'false' else None)
        n = int(r['n'])
        pct = float(r['pct'])

        k_specific = (norm(and_), is_col)
        k_any = (norm(and_), None)

        if k_specific in lookup_dict:
            cat, just = lookup_dict[k_specific]
        elif k_any in lookup_dict:
            cat, just = lookup_dict[k_any]
        else:
            # tipos estruturais (fallback baseado em tipo_decisao)
            t = (tipo or '').upper()
            if 'INTERLOCUTÓRIA' in t or 'INTERLOCUTORIA' in t:
                cat, just = 'INTERLOCUTORIA', 'por tipo=Interlocutória'
            elif 'SOBRESTAMENTO' in t:
                cat, just = 'SOBRESTAMENTO', 'por tipo=Sobrestamento'
            elif 'REP. GERAL' in t or 'REP.GERAL' in t:
                cat, just = 'RG_JULGAMENTO', 'por tipo=Rep.Geral'
            elif 'LIMINAR' in t:
                cat, just = 'LIMINAR_OUTRA', 'por tipo=Liminar sem qualificador'
            else:
                cat, just = 'OUTRO', 'sem regra — revisar'

        rows.append({
            'tipo': tipo, 'andamento': and_, 'is_colegiado': col_str,
            'n': n, 'pct': pct, 'categoria': cat, 'justificativa': just
        })

# Export
with open(OUT, 'w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, fieldnames=['tipo','andamento','is_colegiado','n','pct','categoria','justificativa'])
    w.writeheader()
    for r in rows: w.writerow(r)

print(f"[ok] {OUT}\n")

# Sumário por categoria
from collections import Counter
vol = Counter()
for r in rows:
    vol[r['categoria']] += r['n']
total = sum(vol.values())
print(f"=== VOLUME POR CATEGORIA (total = {total:,}) ===")
for cat, v in vol.most_common():
    print(f"  {cat:<40s} {v:>10,}  ({100*v/total:>5.2f}%)")

# Resíduo OUTRO para revisar
print(f"\n=== RESÍDUO 'OUTRO' — linhas sem regra (precisa revisar) ===")
outros = sorted([r for r in rows if r['categoria']=='OUTRO'], key=lambda x: -x['n'])[:30]
for r in outros:
    tipo = (r['tipo'] or '-')[:25]
    and_ = (r['andamento'] or '-')[:55]
    print(f"  {r['n']:>7,}  [{tipo:<25s}] {and_}")
