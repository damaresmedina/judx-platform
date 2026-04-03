# Inspeção Completa do Banco JudX-Platform
**Data:** 03/04/2026 | **Projeto Supabase:** ejwyguskoiraredinqmb

---

## 1. stf_decisoes (194.165 registros, 39 colunas)

**O que é:** Cada linha é uma decisão do STF — colegiada ou monocrática. É a tabela-fonte bruta, importada do Corte Aberta.

### Primeiras 3 linhas

| Campo | Linha 1 | Linha 2 | Linha 3 |
|---|---|---|---|
| processo | RE 161742 | ACO 457 | RE 187744 |
| orgao_julgador | 1ª Turma | 1ª Turma | 1ª Turma |
| relator_decisao | MIN. DIAS TOFFOLI | MIN. ROSA WEBER | MIN. ALEXANDRE DE MORAES |
| classe | RE | ACO | RE |
| data_decisao | 13/10/2020 | 21/08/2017 | 12/11/2018 |
| descricao_andamento | Provido | Agravo regimental não provido | Embargos rejeitados |
| tipo_decisao | COLEGIADA | COLEGIADA | COLEGIADA |
| extrato_decisao | "A Turma, por maioria, deu provimento ao RE..." | "A Turma, por unanimidade, conheceu do agravo..." | "A Turma, por unanimidade, rejeitou os embargos..." |
| ambiente_unificado | Virtual | Virtual | Virtual |

### Significado das colunas principais

| Coluna | Tipo | O que é | Exemplo |
|---|---|---|---|
| id | bigint | Identificador sequencial | 1 |
| processo | text | Nome do processo (classe + número) | "RE 161742" |
| orgao_julgador | text | Órgão que julgou | "1ª Turma", "Tribunal Pleno", "MONOCRÁTICA" |
| relator_decisao | text | Ministro relator na decisão original | "MIN. DIAS TOFFOLI" |
| relator_atual | text | Relator atual (pode ter mudado) | "MIN. DIAS TOFFOLI" |
| ministro_real | text | Relator corrigido (100% preenchido) | "MIN. DIAS TOFFOLI" |
| data_autuacao | date | Data de entrada do processo | 1993-03-24 |
| data_decisao | text | Data da decisão (formato DD/MM/AAAA) | "13/10/2020" |
| data_baixa | date | Data de arquivamento | 2021-04-07 |
| classe | text | Classe processual | "RE", "ACO", "ARE", "Rcl" |
| tipo_classe | text | Categoria da classe | "Recursal", "Demais Originárias" |
| grupo_origem | text | Tipo de origem | "Recursal", "Originária" |
| ramo_direito | text | Ramo do direito | "DIREITO ADMINISTRATIVO E OUTRAS MATÉRIAS DE DIREITO PÚBLICO" |
| assunto | text | Assunto principal | "SERVIDOR PÚBLICO CIVIL \| REGIME ESTATUTÁRIO" |
| assunto_completo | text | Assunto com hierarquia completa | cadeia com separador \|\| |
| incidente | bigint | Número do incidente (chave do portal STF) | 1560078 |
| link_processo | text | URL do processo no portal | "https://portal.stf.jus.br/processos/detalhe.asp?incidente=1560078" |
| cod_andamento | text | Código numérico do andamento | "6.230" |
| subgrupo_andamento | text | Categoria do andamento | "Decisão Final", "Decisão em recurso interno" |
| descricao_andamento | text | Resultado textual | "Provido", "Agravo regimental não provido" |
| extrato_decisao | text | Íntegra da decisão (até ~4000 chars) | "Decisão: A Turma, por maioria..." |
| tipo_decisao | text | Colegiada ou monocrática | "COLEGIADA", "MONOCRÁTICA" |
| preferencia_covid19 | boolean | Tramitação preferencial COVID | false |
| preferencia_criminal | boolean | Se é criminal | false |
| sigla_ultimo_recurso | text | Último recurso interposto | "RE-AgR-ED" |
| recurso_interno_pendente | boolean | Se tem recurso pendente | false |
| em_tramitacao | boolean | Se ainda tramita | false |
| decisoes_virtual | boolean | Se foi em sessão virtual | true |
| ambiente_julgamento | text | Campo original de ambiente | null (85% nulo) |
| indicador_colegiado | text | Campo original de colegiado | null (85% nulo) |
| id_fato_decisao | bigint | ID interno do Corte Aberta | 36143625 |
| orgao_decisorio | text | Órgão normalizado | "1ª Turma" |
| ambiente_unificado | text | Ambiente calculado | "Virtual", "Presencial" |
| fonte_ambiente | text | De onde veio o ambiente | "campo_decisoes_virtual" |
| incidente_key | bigint | Chave de incidente (100% vazia) | null |
| incidente_no | bigint | Número do incidente (100% vazia) | null |
| seq_na_string | integer | Sequência na string (100% vazia) | null |
| raw_source | text | Identificador do lote de importação | "372e", "e7a4" |
| created_at | timestamptz | Data de criação no banco | 2026-03-26 21:14:28 |

### Nulos

| Coluna | Nulos | % | Observação |
|---|---|---|---|
| processo, ministro_real, data_decisao, cod_andamento, tipo_decisao, raw_source | 0 | 0% | Completos |
| ramo_direito, assunto | 64 | 0,04% | Quase completos |
| extrato_decisao | 11.121 | 6,5% | Decisões sem íntegra |
| incidente, classe, relator_decisao | 24.722 | 14,6% | Lote novo sem esses campos |
| ambiente_julgamento, indicador_colegiado | 145.129 | 85,4% | Campo não existia antes de 2020 |
| incidente_key | 169.851 | 100% | Coluna nunca populada |

---

## 2. stf_universal (170.302 registros, 40 colunas)

**O que é:** Tabela-mãe normalizada. Cada linha é uma decisão colegiada com campos enriquecidos: partes desnormalizadas, campos normalizados (_norm), classificação de assunto.

### Primeiras 3 linhas

| Campo | Linha 1 | Linha 2 | Linha 3 |
|---|---|---|---|
| processo | ARE 1478137 | AImp 165 | RE 1478158 |
| classe | ARE | AImp | RE |
| relator | MINISTRO PRESIDENTE | MINISTRO PRESIDENTE | MIN. CRISTIANO ZANIN |
| orgao_julgador | Tribunal Pleno | Tribunal Pleno | 1ª Turma |
| resultado | Agravo regimental não provido | Agravo regimental não conhecido | Embargos recebidos como agravo... |
| virtual | true | true | true |
| total_partes | 7 | 12 | 8 |

### Colunas exclusivas de stf_universal (não existem em stf_decisoes)

| Coluna | O que é | Exemplo |
|---|---|---|
| resultado | Texto do resultado da decisão | "Agravo regimental não provido" |
| tipo_andamento | Categoria do andamento | "Decisão em recurso interno" |
| virtual | boolean direto | true/false |
| tipo_decisao_norm | Tipo normalizado (enum) | null (não populado) |
| resultado_norm | Resultado normalizado (enum) | null (não populado) |
| ambiente_norm | Ambiente normalizado (enum) | null (não populado) |
| orgao_nome | Órgão normalizado snake_case | "tribunal_pleno", "1_turma" |
| classe_processual | Classe normalizada | "ARE" |
| assunto_principal | Assunto normalizado snake_case | "direito_tributario_taxas_municipais" |
| polo_ativo | Texto concatenado do polo ativo | null (79% nulo) |
| polo_passivo | Texto concatenado do polo passivo | null (86% nulo) |
| advogados | Texto concatenado dos advogados | "CLARO S.A. \| CLEBER ROGERIO..." |
| amicus_curiae | Amicus curiae | null |
| procuradores | Procuradores | "PROCURADOR-GERAL DO MUNICÍPIO..." |
| outras_partes | Outras partes | null |
| total_partes | Contagem de partes | 8 |

### Nulos

| Coluna | Nulos | % |
|---|---|---|
| processo, data_decisao, orgao_julgador, resultado | 0 | 0% |
| classe, incidente, relator | 24.722 | 15% |
| ambiente_julgamento | 145.129 | 85% |
| polo_ativo | 134.163 | 79% |
| polo_passivo | 145.594 | 86% |
| tipo_decisao_norm, resultado_norm, ambiente_norm | ~170K | ~100% — nunca populados |

---

## 3. stf_partes (1.281.524 registros, 9 colunas)

**O que é:** Uma linha por parte processual. Normalizada: cada pessoa/entidade tem sua própria linha com papel e tipo classificado.

### Primeiras 3 linhas

| Campo | Linha 1 | Linha 2 | Linha 3 |
|---|---|---|---|
| incidente | 11458 | 11458 | 11458 |
| processo | AI 597906 | AI 597906 | AI 597906 |
| papel | ADV | ADV | ADV |
| nome | PROCURADOR-GERAL DA FAZENDA NACIONAL | AGDO.(A/S) | ARNS DE OLIVEIRA, ANDREAZZA... |
| tipo | oab | oab | oab |
| oab | null | A/S | null |
| raw_source | portal_stf | portal_stf | portal_stf |

### Colunas

| Coluna | Tipo | O que é | Exemplo |
|---|---|---|---|
| id | bigint | Identificador | 1 |
| incidente | bigint | Chave do processo no portal | 11458 |
| processo | text | Nome do processo | "AI 597906" |
| papel | text | Papel processual | "POLO_ATIVO", "POLO_PASSIVO", "ADV" |
| nome | text | Nome da parte/advogado | "PROCURADOR-GERAL DA FAZENDA NACIONAL" |
| tipo | text | Classificação da entidade | "ente_publico", "pessoa_fisica", "pessoa_juridica", "oab" |
| oab | text | Número OAB (só advogados) | "79416/SP" |
| raw_source | text | Origem do dado | "portal_stf", "scraper_portal_2026" |
| created_at | timestamptz | Data de criação | 2026-03-26 |

### Nulos

| Coluna | Nulos | % | Observação |
|---|---|---|---|
| incidente, papel, nome, tipo, raw_source | 0 | 0% | Completos |
| oab | 727.679 | 57% | Normal — só advogados têm OAB |

---

## 4. stf_processos (21.181 registros, 28 colunas)

**O que é:** Metadados do processo (cabeçalho). Não tem decisão — tem situação processual, localização, último andamento.

### Primeiras 3 linhas

| Campo | Linha 1 | Linha 2 | Linha 3 |
|---|---|---|---|
| processo | AC 2031 | AC 2032 | AC 2156 |
| classe | AC | AC | AC |
| numero | 2031 | 2032 | 2156 |
| relator | MIN. EDSON FACHIN | MIN. NUNES MARQUES | MIN. NUNES MARQUES |
| situacao_processual | Relator Substituído | Relator Substituído | Relator Substituído |
| localizacao_atual | GABINETE MINISTRO EDSON FACHIN | GABINETE MINISTRO NUNES MARQUES | GABINETE MINISTRO NUNES MARQUES |
| processo_criminal | Cível | Cível | Cível |
| situacao_decisao_final | Sem decisão final | Com decisão final | Sem decisão final |

### Colunas exclusivas (não existem em stf_decisoes)

| Coluna | O que é | Exemplo |
|---|---|---|
| numero_unico | Número CNJ unificado | "00020260420081000000" |
| situacao_processual | Status atual | "Relator Substituído" |
| meio_processo | Físico ou eletrônico | "ELETRÔNICO" |
| data_autuacao_agregada | Faixa temporal | "mais de 5 anos de autuação" |
| data_ultima_decisao | Última decisão | null |
| data_ultimo_andamento | Último andamento | 2025-09-24 |
| grupo_ultimo_andamento | Tipo do último andamento | "Conclusão" |
| descricao_ultimo_andamento | Descrição | "Conclusos ao(à) Relator(a)" |
| localizacao_atual | Onde está o processo | "GABINETE MINISTRO EDSON FACHIN" |
| processo_criminal | Cível ou Criminal | "Cível" |
| situacao_decisao_final | Se tem decisão final | "Sem decisão final" |
| processo_sobrestado | Se está sobrestado | false |
| pedido_vista | Se tem vista pendente | false |

---

## 5. judx_decision (225.601 registros, 25 colunas)

**O que é:** Tentativa de modelo ontológico da decisão. Cada linha é uma decisão do STF transformada para um schema normalizado com UUIDs, enums tipados e campos para análise qualitativa (densidade argumentativa, fragmentação colegiada, visibilidade simbólica).

### Primeiras 3 linhas

| Campo | Linha 1 | Linha 2 | Linha 3 |
|---|---|---|---|
| case_id | eb1e080e-... | 5f1ff1ac-... | 4fd03c92-... |
| decision_date | 2022-09-05 | 2022-08-29 | 2022-08-08 |
| kind | acordao | acordao | acordao |
| result | prejudicado | improcedente | improcedente |
| technique | null | null | null |
| session_environment | nao_informado | nao_informado | nao_informado |
| effective_environment | null | null | null |
| unanimity_signal | null | null | null |
| argumentative_density | nao_informada | nao_informada | nao_informada |
| collegial_fragmentation | nao_informada | nao_informada | nao_informada |

### Colunas e significado

| Coluna | Tipo | O que é | Status |
|---|---|---|---|
| id | uuid | Identificador único | OK |
| case_id | uuid | FK para judx_case | OK — 100% preenchido |
| decision_date | date | Data da decisão | OK — 100% |
| kind | enum | Tipo: acordao, decisao_monocratica | OK — 100% |
| result | enum | Resultado normalizado | OK — 100% |
| technique | enum | Técnica decisória (distinguishing, overruling...) | **100% NULO** |
| practical_effect | text | Efeito prático da decisão | **100% nulo** |
| session_environment | enum | Ambiente da sessão | OK, mas quase tudo "nao_informado" |
| scheduled_environment | enum | Ambiente agendado | **~100% nulo** |
| effective_environment | enum | Ambiente efetivo | **100% NULO** |
| is_highlighted_decision | boolean | Se foi destaque | OK — quase tudo false |
| converted_from_virtual | boolean | Convertida de virtual | OK — quase tudo false |
| converted_from_presential | boolean | Convertida de presencial | OK — quase tudo false |
| oral_argument_present | boolean | Sustentação oral presente | **~100% nulo** |
| oral_argument_expected | boolean | Sustentação oral esperada | **~100% nulo** |
| argumentative_density | enum | Densidade argumentativa | Tudo "nao_informada" |
| collegial_fragmentation | enum | Fragmentação colegiada | Tudo "nao_informada" |
| symbolic_visibility | enum | Visibilidade simbólica | Tudo "nao_informada" |
| unanimity_signal | boolean | Sinal de unanimidade | **100% NULO** |
| metadata | jsonb | Dados originais da fonte | OK — contém source_id, cod_andamento etc. |
| latent_features | jsonb | Features latentes | Vazio {} |

---

## 6. judx_case (139.737 registros, 15 colunas)

**O que é:** Tentativa de modelo ontológico do processo. Cada linha é um processo do STF com referências a entidades normalizadas (court, organ, class, subject) via UUIDs.

### Primeiras 3 linhas

| Campo | Linha 1 | Linha 2 | Linha 3 |
|---|---|---|---|
| external_number | RE 1240599 | Rcl 18812 | RE 842803 |
| court_id | ff7f5ecd-... | ff7f5ecd-... | ff7f5ecd-... |
| organ_id | 69bc3c14-... | 69bc3c14-... | 69bc3c14-... |
| phase | outra | outra | outra |
| filed_at | null | null | null |
| decided_at | 2020-06-08 | 2018-04-20 | 2018-02-20 |
| state_involved | false | false | false |
| summary | "A Turma, por maioria, deu provimento..." | "A Turma, por unanimidade, conheceu..." | "A Turma, por unanimidade, negou provimento..." |

### Colunas

| Coluna | Tipo | O que é | Status |
|---|---|---|---|
| id | uuid | Identificador | OK |
| external_number | text | Nome do processo | OK — 100% |
| court_id | uuid | FK para judx_court (STF) | OK — 100%, mas só 1 valor (STF) |
| organ_id | uuid | FK para judx_organ | OK — 100% |
| procedural_class_id | uuid | FK para judx_procedural_class | OK — 100% |
| main_subject_id | uuid | FK para judx_subject | OK — 99,96% |
| phase | enum | Fase processual | OK — tudo "outra" |
| filed_at | date | Data de autuação | **100% NULO** |
| distributed_at | date | Data de distribuição | **100% nulo** |
| decided_at | date | Data da decisão | OK — 100% |
| state_involved | boolean | Se o Estado é parte | OK — tudo false |
| summary | text | Extrato da decisão | OK |
| metadata | jsonb | Dados originais completos | OK — contém tudo do stf_decisoes original |

---

## COMPARAÇÃO: judx_* vs stf_*

### O que judx_decision tem que stf_decisoes NÃO tem

| Campo exclusivo | Intenção | Realidade |
|---|---|---|
| kind (enum) | Tipificar: acordão vs monocrática | OK, funciona |
| result (enum) | Normalizar resultado | OK, funciona |
| technique | Técnica decisória (distinguishing, overruling) | **Nunca preenchido** |
| session/scheduled/effective_environment | Três camadas de ambiente | **Quase tudo nulo ou "nao_informado"** |
| is_highlighted_decision | Se a decisão foi destaque | OK, mas quase tudo false |
| converted_from_virtual/presential | Conversão de ambiente | OK, mas quase tudo false |
| oral_argument_present/expected | Sustentação oral | **Nunca preenchido** |
| argumentative_density | Densidade do debate | **Tudo "nao_informada"** |
| collegial_fragmentation | Grau de divergência | **Tudo "nao_informada"** |
| symbolic_visibility | Visibilidade pública | **Tudo "nao_informada"** |
| unanimity_signal | Se foi unânime | **Nunca preenchido** |
| latent_features (jsonb) | Features para ML | **Vazio {}** |

### O que judx_case tem que stf_decisoes/stf_processos NÃO têm

| Campo exclusivo | Intenção | Realidade |
|---|---|---|
| court_id (FK) | Referência normalizada ao tribunal | OK, mas só STF |
| organ_id (FK) | Referência normalizada ao órgão | OK |
| procedural_class_id (FK) | Referência normalizada à classe | OK |
| main_subject_id (FK) | Referência normalizada ao assunto | OK |
| phase (enum) | Fase processual tipificada | Tudo "outra" |
| state_involved | Se o Estado é parte | Tudo false — nunca calculado |
| filed_at | Data de autuação normalizada | **100% nulo** |

### O que o modelo judx_* tentou fazer diferente

O modelo judx_* foi uma tentativa de **redesenho ontológico** do corpus STF:

1. **UUIDs em vez de IDs sequenciais** — para permitir referências cruzadas entre tribunais
2. **Foreign keys normalizadas** — court, organ, class, subject como entidades separadas (judx_court, judx_organ, judx_procedural_class, judx_subject)
3. **Enums tipados** — kind, result, technique, environment como tipos controlados em vez de texto livre
4. **Campos qualitativos** — density, fragmentation, visibility para análise de comportamento decisório
5. **Separação caso/decisão** — judx_case (processo) vs judx_decision (cada decisão do processo)
6. **metadata/latent_features** — campos JSONB para dados originais e features de ML

### Diagnóstico: o que está vazio que deveria estar preenchido

| Campo | Deveria ter | Por que está vazio |
|---|---|---|
| technique | Sim — distinguishing, overruling etc. | Requer análise de NLP/leitura do extrato |
| effective_environment | Sim — Virtual ou Presencial | O dado existe em stf_decisoes.ambiente_unificado mas não foi migrado |
| unanimity_signal | Sim — extraível do extrato ("por unanimidade" vs "por maioria") | Requer parsing do extrato_decisao |
| oral_argument_present | Sim — extraível do extrato | Requer parsing |
| argumentative_density | Parcialmente — correlacionável com tamanho do extrato | Requer heurística |
| collegial_fragmentation | Parcialmente — extraível de "vencido o ministro X" | Requer parsing |
| filed_at | Sim — existe em stf_decisoes.data_autuacao | Não foi migrado |
| state_involved | Sim — cruzável com stf_partes | Nunca calculado |
| phase | Sim — derivável de em_tramitacao + situacao | Tudo ficou "outra" |

**Conclusão:** O modelo judx_* tem a arquitetura certa mas a ingestão ficou incompleta. Os campos que requerem NLP (technique, unanimity, density, fragmentation) nunca foram processados. Os campos que são simples de migrar (filed_at, effective_environment) também não foram. É um piloto abandonado.

---

## 7–11. Tabelas STJ

### stj_decisoes_dj (203.683 registros, 10 colunas)

**O que é:** Decisões do STJ publicadas no Diário da Justiça eletrônico (fev–mai 2022).

| Coluna | O que é | Exemplo |
|---|---|---|
| seq_documento | ID sequencial do DJe | 144948780 |
| data_publicacao | Data da publicação | 2022-02-10 |
| tipo_documento | Tipo | "ACÓRDÃO" |
| numero_registro | Número de registro STJ | "202002151590" |
| processo | Nome do processo | "REsp 1890871" |
| ministro | Relator | "ASSUSETE MAGALHÃES" |
| teor | Resumo do teor | "Concedendo" |
| assuntos | Códigos de assunto | "10254;10225" |

**Nulos:** teor = 1.615 (0,8%). Resto completo.

### stj_fases (46.174 registros, 8 colunas)

**O que é:** Movimentação processual do STJ. Cada linha é um andamento.

| Coluna | O que é | Exemplo |
|---|---|---|
| processo | Nome do processo | "REsp 1364679" |
| numero | Número CNJ | "99230011420068130024" |
| data | Data do andamento | "2019-06-28" |
| hora | Hora | "15:46:00" |
| texto | Descrição do andamento | "Baixa Definitiva para TRIBUNAL DE JUSTIÇA DO ESTADO DE MINAS GERAIS" |
| codigo_cnj | Código CNJ do movimento | "22" |

### stj_partes (18.332 registros, 11 colunas)

**O que é:** Partes processuais do STJ. Uma linha por parte.

| Coluna | O que é | Exemplo |
|---|---|---|
| processo | Nome do processo | "REsp 1364679" |
| classe | Classe por extenso | "Recurso Especial" |
| papel | Papel processual | "RECORRENTE", "RECORRIDO", "PROCURADOR" |
| nome | Nome da parte | "MINISTÉRIO PÚBLICO DO ESTADO DE MINAS GERAIS" |
| tipo | Classificação | "parte", "procurador" |
| polo | Polo processual | "ativo", "passivo" |

### stj_temas (1.420 registros, 24 colunas)

**O que é:** Temas repetitivos do STJ. Cada linha é um tema com questão jurídica, tese firmada, processos afetados.

| Coluna | O que é | Exemplo |
|---|---|---|
| numero | Número do tema | 3 |
| tipo | Tipo | "repetitivo" |
| situacao | Status | "transito_em_julgado", "Cancelado" |
| orgao_julgador | Órgão | "TERCEIRA SEÇÃO" |
| ramo_direito | Ramo | "DIREITO ADMINISTRATIVO" |
| questao | Questão jurídica | "Questão referente à conversão dos vencimentos em URV..." |
| tese_firmada | Tese (23% nulo) | "A imposição ao Estado do RS..." |
| processos_afetados | JSON com processos | [{"uf":"RS","classe":"REsp","numero":"970217"}] |
| relator | Relator | "NAPOLEÃO NUNES MAIA FILHO" |
| repercussao_geral | Vínculo com STF | "Tema 539/STF" |

**Nulos:** tese_firmada = 326 (23%), data_julgamento = 318 (22%) — temas ainda não julgados.

### stj_universal (6.411 registros, 20 colunas)

**O que é:** Tabela consolidada STJ — combina semente + contramostra com dados do tema.

| Coluna | O que é | Exemplo |
|---|---|---|
| processo | Processo | "REsp 1101723/SP" |
| tema_numero | Número do tema | 1 |
| questao_juridica | Questão | "Questão referente à necessidade de anuência do devedor..." |
| tese_firmada | Tese | "A substituição processual..." |
| origem_dado | Fonte | "semente" |

### stj_contramostra (3.902 registros, 15 colunas)

**O que é:** Amostra de controle de decisões STJ para validação cruzada.

| Coluna | O que é | Exemplo |
|---|---|---|
| processo | Processo | "REsp 1890871" |
| relator | Relator | "ASSUSETE MAGALHÃES" |
| data_decisao | Data | 2022-02-10 |
| tipo | Tipo | "contramostra" |
| fonte | Origem | "scon" |

### stj_processos_semente (2.539 registros, 18 colunas)

**O que é:** Processos-semente dos temas repetitivos — os leading cases.

### stj_precedentes_temas (2.295 registros, 14 colunas)

**O que é:** Controvérsias vinculadas a temas STJ.

| Coluna | O que é | Exemplo |
|---|---|---|
| sequencial_precedente | ID | "2043" |
| tipo_precedente | Tipo | "Controvérsia" |
| numero_precedente | Número | "51" |
| situacao_processo_stf | Status | "Vinculada a Tema", "Cancelada" |

### stj_decisoes_detalhe (2.170 registros, 7 colunas)

**O que é:** Detalhes de decisões STJ — tipo e data.

| Coluna | O que é | Exemplo |
|---|---|---|
| processo | Processo | "REsp 1364679" |
| registro | Número de registro | "2013/0020067-7" |
| data | Data | "13/09/2018" |
| tipo | Tipo | "monocratica" |

---

## Resumo geral

| Camada | Tabelas | Registros | Status |
|---|---|---|---|
| **STF fonte** | stf_decisoes, stf_processos, stf_partes | 1.496.870 | Operacional |
| **STF consolidada** | stf_universal | 170.302 | Operacional, partes 79-86% nulas |
| **JudX ontológico** | judx_decision, judx_case + 4 auxiliares | 365.338+3.817 | Piloto incompleto |
| **STJ** | 8 tabelas | 284.931 | Operacional |
| **TOTAL** | 17 tabelas com dados | ~2.320.000 | — |

**Arquivo gerado em:** 03/04/2026
**Nenhuma alteração feita no banco.**
