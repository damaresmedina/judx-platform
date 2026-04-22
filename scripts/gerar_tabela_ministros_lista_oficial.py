"""Gera tabela 1 linha por ministro usando a LISTA OFICIAL passada pela Damares
(ordem decrescente de antiguidade, 172 nomes + Rezek com 2 passagens).

Colunas (pedidas): nome, nascimento, indicacao, nomeacao, posse_stf, turma,
data_inicio_pres_turma, data_fim_pres_turma, vice_from, vice_to,
data_inicio_pres_stf, data_fim_pres_stf, aposentadoria, falecimento.
"""
import csv, json, re, unicodedata
from pathlib import Path
from collections import defaultdict

BIO = "C:/Users/medin/Desktop/backup_judx/resultados/stf_todos_ministros_consolidado.json"
SEED = "C:/Users/medin/projetos/judx-platform/scripts/seeds-tribunais/composicao_ministerial.csv"
OUT = Path("C:/Users/medin/Desktop/backup_judx/resultados/stf_175_ministros.csv")

# Lista oficial exata (ordem decrescente de antiguidade — mais novo primeiro)
LISTA = """Flavio Dino
Cristiano Zanin
André Mendonça
Kassio Nunes Marques
Alexandre de Moraes
Luiz Edson Fachin
Luís Roberto Barroso
Teori Albino Zavascki
Rosa Maria Weber Candiota da Rosa
Luiz Fux
José Antonio Dias Toffoli
Carlos Alberto Menezes Direito
Cármen Lúcia Antunes Rocha
Enrique Ricardo Lewandowski
Eros Roberto Grau
Joaquim Benedito Barbosa Gomes
Carlos Augusto Ayres de Freitas Britto
Antônio Cezar Peluso
Gilmar Ferreira Mendes
Ellen Gracie Northfleet
Nelson Azevedo Jobim
Maurício José Corrêa
José Francisco Rezek (2ª passagem)
Ilmar Nascimento Galvão
Marco Aurélio Mendes de Farias Mello
Carlos Mário da Silva Velloso
Paulo Brossard de Souza Pinto
José Celso de Mello Filho
José Paulo Sepúlveda Pertence
Célio de Oliveira Borja
Carlos Alberto Madeira
Luiz Octavio Pires e Albuquerque Gallotti
Sydney Sanches
José Francisco Rezek (1ª passagem)
Aldir Guimarães Passarinho
Oscar Dias Corrêa
Alfredo Buzaid
José Néri da Silveira
Firmino Ferreira Paz
Clovis Ramalhete Maia
Luiz Rafael Mayer
Decio Meirelles de Miranda
Pedro Soares Muñoz
Carlos Fulgêncio da Cunha Peixoto
José Carlos Moreira Alves
João Baptista Cordeiro Guerra
João Leitão de Abreu
José Geraldo Rodrigues de Alckmin
Francisco Manoel Xavier de Albuquerque
Antonio Neder
Olavo Bilac Pinto
Carlos Thompson Flores
Moacyr Amaral Santos
Themistocles Brandão Cavalcanti
Raphael de Barros Monteiro
Adaucto Lucio Cardoso
Djaci Alves Falcão
Eloy José da Rocha
Carlos Medeiros Silva
Aliomar de Andrade Baleeiro
Oswaldo Trigueiro de Albuquerque Mello
José Eduardo do Prado Kelly
Adalício Coelho Nogueira
Evandro Cavalcanti Lins e Silva
Hermes Lima
Pedro Rodovalho Marcondes Chaves
Victor Nunes Leal
Antonio Gonçalves de Oliveira
Antônio Martins Vilas Boas
Candido Motta Filho
Ary de Azevedo Franco
Nelson Hungria Hoffbauer
Mario Guimarães
Francisco de Paula Rocha Lagôa
Luiz Gallotti
Hahnemann Guimarães
Alvaro Moutinho Ribeiro da Costa
Edgard Costa
Antonio Carlos Lafayette de Andrada
José Philadelpho de Barros e Azevedo
Alvaro Goulart de Oliveira
Waldemar Cromwell do Rego Falcão
Orozimbo Nonato da Silva
José de Castro Nunes
Annibal Freire da Fonseca
Frederico de Barros Barreto
Washington Osório de Oliveira
José Linhares
Francisco Tavares da Cunha Mello
Armando de Alencar
Carlos Maximiliano Pereira dos Santos
Ataulpho Napoles de Paiva
Octavio Kelly
Manoel da Costa Manso
Laudo Ferreira de Camargo
João Martins de Carvalho Mourão
Plínio de Castro Casado
Eduardo Espinola
Rodrigo Octavio de Langgaard Menezes
Firmino Antonio da Silva Whitaker Filho
Francisco Cardoso Ribeiro
José Soriano de Souza Filho
Heitor de Sousa
Uladislau Herculano de Freitas
Antonio Bento de Faria
João Luiz Alves
Arthur Ribeiro de Oliveira
Geminiano da Franca
Alfredo Pinto Vieira de Mello
Pedro Joaquim dos Santos
Hermenegildo Rodrigues de Barros
Edmundo Pereira Lins
Antonio Joaquim Pires de Carvalho e Albuquerque
João Mendes de Almeida Júnior
Augusto Olympio Viveiros de Castro
José Luiz Coelho e Campos
Sebastião Eurico Gonçalves de Lacerda
Pedro Affonso Mibieli
Enéas Galvão
Carlos Augusto de Oliveira Figueiredo
Edmundo Muniz Barreto
Carolino de Leoni Ramos
Godofredo Xavier da Cunha
Canuto José Saraiva
Pedro Augusto Carneiro Lessa
Manoel José Espínola
Amaro Cavalcanti
Antonio Augusto Cardoso de Castro
Joaquim Xavier Guimarães Natal
Pedro Antonio de Oliveira Ribeiro
Epitacio da Silva Pessôa
Alberto de Seixas Martins Torres
Antônio Gonçalves de Carvalho
Adolpho Augusto Olyntho
André Cavalcanti d'Albuquerque
Manoel José Murtinho
João Pedro Belfort Vieira
João Barbalho Uchôa Cavalcanti
Antonio Augusto Ribeiro de Almeida
Joaquim Antunes de Figueiredo Junior
Lucio de Mendonça
Ubaldino do Amaral Fontoura
Americo Lobo Leite Pereira
Fernando Luiz Osorio
Americo Braziliense de Almeida e Mello
Herminio Francisco do Espirito Santo
Bernardino Ferreira da Silva
Antônio de Souza Martins
Eduardo Pindahiba de Mattos
Candido Barata Ribeiro
Francisco de Paula Ferreira de Resende
José Hygino Duarte Pereira
Bento Luiz de Oliveira Lisboa
Francisco de Faria Lemos
Amphilophio Botelho Freire de Carvalho
Antonio Joaquim Macedo Soares
Esperidião Eloy de Barros Pimentel
Joaquim de Toledo Piza e Almeida
José Julio de Albuquerque Barros (Barão de Sobral)
Henrique Pereira de Lucena (Barão de Lucena)
Luiz Antonio Pereira Franco (Barão de Pereira Franco)
Joaquim da Costa Barradas
Ovidio Fernandes Trigo de Loureiro
Antonio de Souza Mendes
Luiz Correa de Queiroz Barros
Ignacio José de Mendonça Uchôa
Joaquim Francisco de Faria
Olegario Herculano d' Aquino e Castro
João José de Andrade Pinto
Tristão de Alencar Araripe
João Antonio de Araujo Freitas Henriques
João Evangelista de Negreiros Sayão Lobato (Visconde de Sabará)"""

def sa(s):
    if not s: return ''
    return ''.join(c for c in unicodedata.normalize('NFKD', str(s)) if not unicodedata.combining(c)).upper().strip()

def dmY(s):
    if not s: return ''
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})', str(s).strip())
    return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}" if m else (str(s) if s else '')

def first_date(s):
    if not s: return ''
    return dmY(str(s).split(',')[0].strip())

# ============================================================
# Carrega bio e indexa por múltiplas chaves
# ============================================================
with open(BIO, encoding='utf-8') as f:
    bio_list = json.load(f)

bio_idx = {}
for m in bio_list:
    for n in (m.get('nome'), m.get('nome_completo')):
        if n:
            bio_idx[sa(n)] = m

ALIAS_EXPLICITO = {
    'ROSA MARIA WEBER CANDIOTA DA ROSA': 'ROSA WEBER',
}

def find_bio(nome_oficial):
    """Tenta casar por nome completo, curto, tokens, e títulos entre parênteses."""
    k = sa(nome_oficial)
    if k in ALIAS_EXPLICITO and ALIAS_EXPLICITO[k] in bio_idx:
        return bio_idx[ALIAS_EXPLICITO[k]]
    if k in bio_idx: return bio_idx[k]
    # Título entre parênteses (ex: "Barão de Sobral", "Visconde de Sabará")
    m_par = re.search(r'\(([^)]*)\)', nome_oficial)
    if m_par:
        titulo = sa(m_par.group(1))
        if titulo in bio_idx: return bio_idx[titulo]
    # Sem parênteses
    k2 = sa(re.sub(r'\([^)]*\)', '', nome_oficial).strip())
    if k2 in bio_idx: return bio_idx[k2]
    # Primeiro + último (ex: "Rosa Maria Weber Candiota da Rosa" → "ROSA WEBER")
    palavras = k.split()
    if len(palavras) >= 2:
        primeiro_ultimo = palavras[0] + ' ' + palavras[-1]
        if primeiro_ultimo in bio_idx: return bio_idx[primeiro_ultimo]
    # Palavras-chave específicas
    for chave_nome in list(bio_idx.keys()):
        # d'Albuquerque / d&rsquo; variantes
        if 'ANDRE CAVALCANTI' in k and 'ANDRE CAVALCANTI' in chave_nome:
            return bio_idx[chave_nome]
    # Últimas 2-3 palavras
    for n in (2, 3):
        if len(palavras) >= n:
            chave = ' '.join(palavras[-n:])
            if chave in bio_idx: return bio_idx[chave]
    # Sobrenome final com primeiro nome também
    if palavras:
        sobr = palavras[-1]
        for kb, mb in bio_idx.items():
            if kb.endswith(' ' + sobr) or kb == sobr:
                primeiros = palavras[0] if palavras else ''
                if primeiros and primeiros in kb:
                    return mb
    return None

# ============================================================
# Carrega seed para turma / presidência
# ============================================================
import io
with open(SEED, encoding='utf-8') as f:
    raw = f.read()
lines = [l for l in raw.splitlines() if not l.startswith('#')]
reader = csv.DictReader(io.StringIO('\n'.join(lines)))
seed_rows = [r for r in reader if r.get('tribunal_sigla')=='STF' and r.get('ministro_nome_canonico')]

seed_idx = defaultdict(list)
for r in seed_rows:
    seed_idx[sa(r['ministro_nome_canonico'])].append(r)

def find_seed(nome_oficial, bio_m):
    """Tenta casar com seed por várias chaves."""
    chaves = [sa(nome_oficial), sa(re.sub(r'\([^)]*\)', '', nome_oficial))]
    if bio_m:
        chaves.append(sa(bio_m.get('nome','')))
        chaves.append(sa(bio_m.get('nome_completo','')))
    for k in chaves:
        if k and k in seed_idx: return seed_idx[k]
    # tenta por sobrenome final
    palavras = sa(nome_oficial).split()
    if palavras:
        sobr = palavras[-1]
        for k, rows in seed_idx.items():
            if k.endswith(' ' + sobr) and sa(nome_oficial).split()[0] in k:
                return rows
    return []

# ============================================================
# Processa lista oficial
# ============================================================
nomes = [n.strip() for n in LISTA.split('\n') if n.strip()]
print(f"nomes na lista oficial: {len(nomes)}")

linhas = []
antiguidade = len(nomes)  # mais antigo primeiro
for i, nome in enumerate(nomes):
    bio_m = find_bio(nome)
    seed_m = find_seed(nome, bio_m)

    # Filtros da seed
    turmas = sorted([r for r in seed_m if r['codigo_orgao'] in ('TURMA_1','TURMA_2')],
                    key=lambda r: r.get('valid_from','') or '9999')
    pres_turma = sorted([r for r in seed_m if r['codigo_orgao'] in ('TURMA_1_PRESID','TURMA_2_PRESID')],
                        key=lambda r: r.get('valid_from','') or '9999')
    vice = sorted([r for r in seed_m if r['codigo_orgao']=='VICE_PRESIDENCIA'],
                  key=lambda r: r.get('valid_from','') or '9999')
    pres = sorted([r for r in seed_m if r['codigo_orgao']=='PRESIDENCIA'],
                  key=lambda r: r.get('valid_from','') or '9999')

    linhas.append({
        'ordem_antiguidade': antiguidade - i,  # mais antigo = 1
        'nome_oficial': nome,
        'nome_completo_bio': bio_m.get('nome_completo','') if bio_m else '',
        'nome_curto_bio': bio_m.get('nome','') if bio_m else '',
        'nascimento': bio_m.get('nascimento','') if bio_m else '',
        'indicacao': dmY(bio_m.get('indicacao','')) if bio_m else '',
        'nomeacao': dmY(bio_m.get('nomeacao','')) if bio_m else '',
        'posse_stf': dmY(bio_m.get('posse_stf','')) if bio_m else '',
        'turma_inicial': turmas[0]['codigo_orgao'] if turmas else '',
        'turma_inicial_from': turmas[0].get('valid_from','') if turmas else '',
        'trocou_turma': 'SIM' if len(turmas)>1 else ('NAO' if turmas else ''),
        'turma_atual': turmas[-1]['codigo_orgao'] if len(turmas)>1 else '',
        'turma_atual_from': turmas[-1].get('valid_from','') if len(turmas)>1 else '',
        'foi_pres_turma': 'SIM' if pres_turma else 'NAO',
        'turma_presidida': pres_turma[0]['codigo_orgao'].replace('_PRESID','') if pres_turma else '',
        'pres_turma_from': pres_turma[0].get('valid_from','') if pres_turma else '',
        'pres_turma_to': pres_turma[-1].get('valid_to','') if pres_turma else '',
        'foi_vice_stf': 'SIM' if vice else 'NAO',
        'vice_from': vice[0].get('valid_from','') if vice else '',
        'vice_to': vice[-1].get('valid_to','') if vice else '',
        'foi_pres_stf': 'SIM' if pres else 'NAO',
        'pres_stf_from': pres[0].get('valid_from','') if pres else '',
        'pres_stf_to': pres[-1].get('valid_to','') if pres else '',
        'aposentadoria': dmY(bio_m.get('aposentadoria','')) if bio_m else '',
        'falecimento': first_date(bio_m.get('falecimento','')) if bio_m else '',
        'casou_bio': 'SIM' if bio_m else 'NAO',
    })

# Exporta
cols = ['ordem_antiguidade','nome_oficial','nome_completo_bio','nome_curto_bio',
        'nascimento','indicacao','nomeacao','posse_stf',
        'turma_inicial','turma_inicial_from','trocou_turma','turma_atual','turma_atual_from',
        'foi_pres_turma','turma_presidida','pres_turma_from','pres_turma_to',
        'foi_vice_stf','vice_from','vice_to',
        'foi_pres_stf','pres_stf_from','pres_stf_to',
        'aposentadoria','falecimento','casou_bio']
with open(OUT, 'w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for r in linhas: w.writerow(r)

# Sumário
sem_bio = [r['nome_oficial'] for r in linhas if r['casou_bio']=='NAO']
print(f"\n[ok] {OUT}")
print(f"total linhas: {len(linhas)}")
print(f"com match no bio: {sum(1 for r in linhas if r['casou_bio']=='SIM')}")
print(f"sem match no bio: {len(sem_bio)}")
if sem_bio:
    print("  não bateram com bio (preenchidos só com o nome da lista):")
    for n in sem_bio: print(f"    - {n}")
