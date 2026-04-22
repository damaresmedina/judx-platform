"""gerar-indice-consolidacao.py
Percorre a pasta de consolidação + os paths originais e gera INDICE.md com:
- Metadados (tamanho, data, SHA256 truncado) de cada cópia consolidada
- Link para o arquivo original
- Flag de duplicata quando há mesmo conteúdo em múltiplos paths
- Agrupamento por categoria (pasta)
"""
import os, hashlib
from pathlib import Path
from datetime import datetime
from collections import defaultdict

CONS = Path("C:/Users/medin/Desktop/backup_judx/resultados/_CONSOLIDACAO_19abr")
INDICE = CONS / "INDICE.md"

# Map path consolidado -> path original (inferido do nome)
ORIGEM = {
    # ontologias
    'ontologias/modelo_ontologico_completo_DESKTOP.sql':            'C:/Users/medin/Desktop/modelo_ontologico_completo.sql',
    'ontologias/MODELO_ONTOLOGICO_ICONS_JUDX_RAIZ.sql':             'C:/Users/medin/projetos/judx-platform/MODELO_ONTOLOGICO_ICONS.sql',
    'ontologias/MODELO_ONTOLOGICO_ICONS_JUDX_DOCS.sql':             'C:/Users/medin/projetos/judx-platform/docs/MODELO_ONTOLOGICO_ICONS.sql',
    'ontologias/MINISTRO_DNA_DECISORIO.sql':                        'C:/Users/medin/projetos/judx-platform/docs/MINISTRO_DNA_DECISORIO.sql',
    'ontologias/modelo_ontologico_completo_JUDX_DOCUMENTACAO.sql':  'C:/Users/medin/projetos/judx-platform/documentação/modelo_ontologico_completo.sql',
    'ontologias/20260327_stf_schema_v2.sql':                        'C:/Users/medin/Downloads/20260327000000_stf_schema_v2.sql',
    # memorias
    'memorias/MEMORIA_PROJUS_Cprojetos.md':          'C:/projetos/MEMORIA_PROJUS.md',
    'memorias/MEMORIA_DESKTOP.md':                   'C:/Users/medin/Desktop/MEMORIA.md',
    'memorias/MEMORIA_AMEDINA_DESKTOP.md':           'C:/Users/medin/Desktop/MEMORIA_AMEDINA.md',
    'memorias/MEMORIA_JUDX_ICONS_PROJUS.md':         'C:/Users/medin/Desktop/MEMORIA_JUDX_ICONS_PROJUS.md',
    'memorias/MEMORIA_PROJUS_a.md':                  'C:/Users/medin/Desktop/MEMORIA_PROJUS a.md',
    'memorias/memoria_01_04_2026.docx':              'C:/Users/medin/Desktop/memoria 01_04_2026.docx',
    'memorias/memoria_02_04_2026.docx':              'C:/Users/medin/Desktop/memoria 02_04_2026.docx',
    'memorias/memoria_sessao_11abr2026.md':          'C:/Users/medin/Desktop/memoria_sessao_11abr2026.md',
    'memorias/MEMORIA_01_04_2026_JUDX.md':           'C:/Users/medin/projetos/judx-platform/MEMORIA_01_04_2026.md',
    'memorias/MEMORIA_AMEDINA_JUDX.md':              'C:/Users/medin/projetos/judx-platform/MEMORIA_AMEDINA.md',
    'memorias/MEMORIA_SESSAO_31mar_01abr.txt':       'C:/Users/medin/projetos/judx-platform/MEMÓRIA DA SESSÃO — 31mar a 01abr20.txt',
    'memorias/MEMORIA_IMPORTANTE_Documents.docx':    'C:/Users/medin/Documents/MEMORIA IMPORTANTE.docx',
    # docs_projeto
    'docs_projeto/JUDX_INDEX.md':                    'C:/Users/medin/Desktop/JUDX_INDEX.md',
    'docs_projeto/JUDX_NEGOCIO.md':                  'C:/Users/medin/Desktop/JUDX_NEGOCIO.md',
    'docs_projeto/JUDX_ICONS_CARTA_FUNDANTE.md':     'C:/Users/medin/Desktop/JUDX_ICONS_CARTA_FUNDANTE.md',
    'docs_projeto/COMPOSICAO_STF_2026.md':           'C:/Users/medin/Desktop/COMPOSICAO_STF_2026.md',
    'docs_projeto/PROJETO_RAIZ.md':                  'C:/Users/medin/Desktop/PROJETO_RAIZ.md',
    'docs_projeto/ARQUITETURA_JUDX.docx':            'C:/Users/medin/Desktop/ARQUITETURA JUDX.docx',
    'docs_projeto/Fronteiras_banco_judx.pdf':        'C:/Users/medin/Desktop/Fronteiras banco judx.pdf',
    'docs_projeto/nota_tecnica_judx_metodologia_1.docx': 'C:/Users/medin/Desktop/nota_tecnica_judx_metodologia_1.docx',
    'docs_projeto/relatorio_incidente_JudX_Anthropic_2026-04-16.docx': 'C:/Users/medin/Desktop/relatorio_incidente_JudX_Anthropic_2026-04-16.docx',
    'docs_projeto/PROTOCOLO_JUDX_antigo_26mar.md':   'C:/projetos/judx-plataform/PROTOCOLO_JUDX.md',
    'docs_projeto/PROTOCOLO_JUDX_txt_26mar.txt':     'C:/projetos/judx-plataform/PROTOCOLO_JUDX.txt',
    'docs_projeto/DIARIO_ACHADOS_antigo_28mar.md':   'C:/projetos/judx-plataform/DIARIO_ACHADOS.md',
    'docs_projeto/CLAUDE_antigo_28mar.md':           'C:/projetos/judx-plataform/CLAUDE.md',
    'docs_projeto/DOCUMENTACAO_25mar.md':            'C:/projetos/judx-plataform/DOCUMENTACAO.md',
    'docs_projeto/PROMPT_CODE_taxa_provimento.md':   'C:/projetos/PROMPT_CODE_taxa_provimento.md',
    # propostas
    'propostas_deck/JudX_Proposal_2026.pdf':         'C:/Users/medin/Desktop/JudX_Proposal_2026.pdf',
    'propostas_deck/JudX_Proposal_2026_v2.pdf':      'C:/Users/medin/Desktop/JudX_Proposal_2026_v2.pdf',
    'propostas_deck/2026-04-13_JudX_CEF.pdf':        'C:/Users/medin/Desktop/2026-04-13_JudX_CEF.pdf',
    'propostas_deck/2026-04-13_JudX_CEF_Deck.pdf':   'C:/Users/medin/Desktop/2026-04-13_JudX_CEF_Deck.pdf',
    'propostas_deck/2022.06.23_JUDX_pacto_social_ORIGEM.pdf': 'C:/Users/medin/Downloads/2022.06.23 - JUDX pacto social.pdf',
    # html
    'html_rascunhos/judx_damares_preview.html':      'C:/Users/medin/Desktop/judx_damares_preview.html',
    'html_rascunhos/judx_landing_antigo_26mar.html': 'C:/projetos/judx-plataform/judx_landing.html',
    'html_rascunhos/judx_landing_en_antigo_26mar.html': 'C:/projetos/judx-plataform/judx_landing_en.html',
    'html_rascunhos/judx_investor_v2_antigo_11abr.html': 'C:/projetos/judx-plataform/judx_investor_v2.html',
    'html_rascunhos/linhas_decisorias_stf.html':     'C:/Users/medin/Documents/linhas_decisorias_stf.html',
    # icons-cartografia (outro repo)
    'repos_alternativos/icons-cartografia/cartografia_stf.html':            'C:/projetos/icons-cartografia/cartografia_stf.html',
    'repos_alternativos/icons-cartografia/alem_controle_constitucionalidade.html': 'C:/projetos/icons-cartografia/alem_controle_constitucionalidade.html',
    'repos_alternativos/icons-cartografia/beyond_judicial_review.html':     'C:/projetos/icons-cartografia/beyond_judicial_review.html',
    # scripts
    'scripts_dispersos/analise_ambiente_stf.py':     'C:/Users/medin/Downloads/analise_ambiente_stf.py',
    # material autoral
    'material_autoral/2023.07.14 - Memorial EDcl no AREsp 1.675.705-DF.pdf': 'C:/Users/medin/Documents/2023.07.14 - Memorial EDcl no AREsp 1.675.705-DF.pdf',
    'material_autoral/rascunho temas 1320, 801 stf e 1079 stj.docx':        'C:/Users/medin/Documents/rascunho temas 1320, 801 stf e 1079 stj.docx',

    # ICONS docs/protocolos evolutivos
    'repos_alternativos/icons-docs/PROTOCOLO_v1_25mar.md':      'C:/projetos/icons/PROTOCOLO.md',
    'repos_alternativos/icons-docs/PROTOCOLO_v2.md':            'C:/projetos/icons/PROTOCOLO_v2.md',
    'repos_alternativos/icons-docs/PROTOCOLO_v3.md':            'C:/projetos/icons/PROTOCOLO_v3.md',
    'repos_alternativos/icons-docs/PROTOCOLO_v4.md':            'C:/projetos/icons/PROTOCOLO_v4.md',
    'repos_alternativos/icons-docs/PROTOCOLO_v5.md':            'C:/projetos/icons/PROTOCOLO_v5.md',
    'repos_alternativos/icons-docs/protocolo_v2.html':          'C:/projetos/icons/protocolo_v2.html',
    'repos_alternativos/icons-docs/protocolo_v3.html':          'C:/projetos/icons/protocolo_v3.html',
    'repos_alternativos/icons-docs/CONSTITUICAO_ONTOLOGICA.md': 'C:/projetos/icons/CONSTITUICAO_ONTOLOGICA.md',
    'repos_alternativos/icons-docs/DATA_CONTRACT.md':           'C:/projetos/icons/DATA_CONTRACT.md',
    'repos_alternativos/icons-docs/DOCUMENTO_EXECUTIVO.md':     'C:/projetos/icons/DOCUMENTO_EXECUTIVO.md',
    'repos_alternativos/icons-docs/EMENDA_CONSTITUCIONAL_01_DUPLA_ANCORAGEM.md': 'C:/projetos/icons/EMENDA_CONSTITUCIONAL_01_DUPLA_ANCORAGEM.md',
    'repos_alternativos/icons-docs/HANDOFF_JudX_ICONS_27mar.pdf': 'C:/projetos/icons/HANDOFF_JudX_ICONS.md.pdf',
    'repos_alternativos/icons-docs/CLAUDE_icons_28mar.md':       'C:/projetos/icons/CLAUDE.md',

    # ICONS HTMLs
    'repos_alternativos/icons-html/alem_controle_constitucionalidade.html': 'C:/projetos/icons/alem_controle_constitucionalidade.html',
    'repos_alternativos/icons-html/beyond_judicial_review.html':   'C:/projetos/icons/beyond_judicial_review.html',
    'repos_alternativos/icons-html/cartografia_sistema.html':      'C:/projetos/icons/cartografia_sistema.html',
    'repos_alternativos/icons-html/cartografia_stf.html':          'C:/projetos/icons/cartografia_stf.html',
    'repos_alternativos/icons-html/icons_landing.html':            'C:/projetos/icons/icons_landing.html',
    'repos_alternativos/icons-html/index_atual.html':              'C:/projetos/icons/index.html',
    'repos_alternativos/icons-html/index_old.html':                'C:/projetos/icons/index_old.html',
    'repos_alternativos/icons-html/ontologia.html':                'C:/projetos/icons/ontologia.html',
    'repos_alternativos/icons-html/ontologia_original.html':       'C:/projetos/icons/ontologia_original.html',
    'repos_alternativos/icons-html/ontologia_v9.html':             'C:/projetos/icons/ontologia_v9.html',
    'repos_alternativos/icons-html/oscilacao_jurisprudencial.html': 'C:/projetos/icons/oscilacao_jurisprudencial.html',

    # ICONS dados
    'repos_alternativos/icons-dados/data.json':                    'C:/projetos/icons/data.json',
    'repos_alternativos/icons-dados/cf_comentada.db':              'C:/projetos/icons/cf_comentada (1).db',

    # Icons-db export
    'repos_alternativos/icons-db-export/artigos_adct.json':        'C:/projetos/icons-db/export/artigos_adct.json',
    'repos_alternativos/icons-db-export/artigos_cf.json':          'C:/projetos/icons-db/export/artigos_cf.json',
    'repos_alternativos/icons-db-export/decisoes_stf.json':        'C:/projetos/icons-db/export/decisoes_stf.json',
    'repos_alternativos/icons-db-export/metadata_confirmada.tsv':  'C:/projetos/icons-db/export/metadata_confirmada.tsv',
    'repos_alternativos/icons-db-export/README_icons-db.md':       'C:/projetos/icons-db/README.md',

    # Scripts/dados de normalização (onda 2)
    'scripts_dispersos/normalizacao/normalizar_master4_DESKTOP.py':          'C:/Users/medin/Desktop/backup_judx/resultados/normalizar_master4.py',
    'scripts_dispersos/normalizacao/normatized_max_abbr_partes_ativo_passivo.xlsx':  'C:/Users/medin/Downloads/normatized_max_abbr_partes_ativo_passivo.xlsx',
    'scripts_dispersos/normalizacao/normatized_new_partes_ativo_passivo.xlsx':       'C:/Users/medin/Downloads/normatized_new_partes_ativo_passivo.xlsx',
    'scripts_dispersos/normalizacao/normatized_preserved_order_partes_ativo_passivo.xlsx': 'C:/Users/medin/Downloads/normatized_preserved_order_partes_ativo_passivo.xlsx',

    # Legado FIESP (material autoral)
    'material_autoral/fiesp_normalizacao/FIESP_normalizacao_decisoes.xlsx':          'C:/Users/medin/Desktop/fiesp/pessoal/assessores/normalizacao decisoes.xlsx',
    'material_autoral/fiesp_normalizacao/FIESP_normatizando_advogados_polos.xlsx':   'C:/Users/medin/Desktop/fiesp/pessoal/assessores/normatizando advogados polos ativo e passivo.xlsx',
}

def sha256_short(p, n=12):
    try:
        h = hashlib.sha256()
        with open(p, 'rb') as f:
            for chunk in iter(lambda: f.read(65536), b''): h.update(chunk)
        return h.hexdigest()[:n]
    except:
        return 'ERRO'

def size_fmt(b):
    for u in ('B','KB','MB','GB'):
        if b < 1024: return f"{b:.1f} {u}"
        b /= 1024
    return f"{b:.1f} TB"

def fmt_data(ts):
    return datetime.fromtimestamp(ts).strftime('%d/%m/%Y %H:%M')

# Percorrer arquivos da consolidação e gerar metadados
arquivos = []
for cat_dir in sorted(CONS.iterdir()):
    if not cat_dir.is_dir(): continue
    cat = cat_dir.name
    for root, dirs, files in os.walk(cat_dir):
        for f in files:
            if f == 'INDICE.md': continue
            p = Path(root) / f
            rel = p.relative_to(CONS).as_posix()
            origem = ORIGEM.get(rel, '(origem não mapeada)')
            st = p.stat()
            arquivos.append({
                'cat': cat,
                'rel': rel,
                'nome': p.name,
                'size': st.st_size,
                'mtime': st.st_mtime,
                'sha': sha256_short(p),
                'origem': origem,
            })

# Detectar duplicatas por hash
hashes = defaultdict(list)
for a in arquivos:
    hashes[a['sha']].append(a)

# Gerar INDICE
linhas = []
linhas.append('# INDICE — Consolidação de arquivos do projeto JudX/ICONS')
linhas.append(f"\n**Data**: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
linhas.append(f"**Pasta**: `{CONS}`")
linhas.append(f"**Total arquivos**: {len(arquivos)}")
linhas.append(f"**Total bytes**: {size_fmt(sum(a['size'] for a in arquivos))}")
linhas.append(f"\n---\n")
linhas.append("## Regra\n")
linhas.append("- Arquivos **copiados** (nunca movidos) para esta pasta.")
linhas.append("- Os **originais permanecem intactos** nos caminhos mostrados em `origem`.")
linhas.append("- **Duplicatas** são identificadas por SHA-256 — mesmas 12 chars = mesmo conteúdo.")
linhas.append("- **Sempre consultar esta consolidação antes de procurar nos paths originais.**")
linhas.append("")

# Duplicatas detectadas
dup_count = 0
linhas.append("## Duplicatas detectadas\n")
for sha, lista in hashes.items():
    if len(lista) > 1:
        dup_count += 1
        linhas.append(f"- `{sha}` ({size_fmt(lista[0]['size'])}) → {len(lista)} cópias:")
        for a in lista:
            linhas.append(f"  - `{a['rel']}`")
if dup_count == 0:
    linhas.append("Nenhuma duplicata detectada.")
linhas.append(f"\n**Total grupos com duplicata**: {dup_count}")
linhas.append("")

# Por categoria
categorias_ordem = ['ontologias','memorias','docs_projeto','propostas_deck','html_rascunhos','material_autoral','scripts_dispersos','repos_alternativos']
arquivos_por_cat = defaultdict(list)
for a in arquivos: arquivos_por_cat[a['cat']].append(a)

for cat in categorias_ordem:
    lista = arquivos_por_cat.get(cat, [])
    if not lista: continue
    linhas.append(f"\n## {cat}\n")
    linhas.append(f"| Arquivo consolidado | Tamanho | Data | SHA-256 | Origem |")
    linhas.append("|---|---:|---|---|---|")
    for a in sorted(lista, key=lambda x: x['rel']):
        linhas.append(f"| `{a['rel']}` | {size_fmt(a['size'])} | {fmt_data(a['mtime'])} | `{a['sha']}` | `{a['origem']}` |")

INDICE.write_text('\n'.join(linhas), encoding='utf-8')
print(f'[ok] {INDICE}')
print(f'  {len(arquivos)} arquivos · {size_fmt(sum(a["size"] for a in arquivos))} total · {dup_count} grupos duplicados')
