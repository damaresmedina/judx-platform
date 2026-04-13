# JUDX INDEX — Inventário Geral
**Última atualização: 13/abr/2026**

---

## 1. O QUE EXISTE NO SUPABASE

### Camada MASTER — Corpus STF (2.9M decisões, 2000-2026)

| Tabela | Rows | Fonte | O que contém |
|---|---|---|---|
| **stf_master** | 2.927.525 | Corte Aberta (Qlik) | CORE: 20 cols leves — incidente, processo, classe, relator, ano, data, andamento, orgao_julgador, origem_decisao, assuntos, UF |
| **stf_master_premium** | 2.927.525 | Corte Aberta | PREMIUM: id_fato_decisao + observacao_andamento (inteiro teor) |
| **stf_master_audit_presidencia** | 553.382 | Derivada | Decisões da Presidência isoladas para análise |

**Como separar Presidência de Relator:** `WHERE orgao_julgador = 'PRESIDÊNCIA'` (maiúsculas com acento)
**Relator na Presidência:** quando `orgao_julgador = 'PRESIDÊNCIA'`, o campo `relator` indica qual ministro-presidente decidiu

### Camada MINISTROS — Biografia + Decisões

| Tabela | Rows | Fonte | O que contém |
|---|---|---|---|
| **stf_ministros** | 171 | Excel DM + portal STF | CORE: nome, slug, nascimento, posse, carreira, faculdade, presidente que indicou, antecessor, sucessor, genero, idade_posse, atual, foi_presidente, foto |
| **stf_ministros_premium** | 171 | Portal STF (scraping) | PREMIUM: nome_completo, pai, portal_slug, subpages, pdf_links, biografia, discursos |
| **v_presidencia_perfil** | 16 | View mat. stf_master | Perfil decisório de cada presidente (2000-2026): total, ARE, RE, negado seguimento, devolução, provido |
| **v_presidencia_serie** | 42 | View mat. stf_master | Série anual: ano × presidente × decisões |

### Camada JUDX — Classificação Ontológica

| Tabela | Rows | Fonte | O que contém |
|---|---|---|---|
| **judx_case** | 2.212.761 | stf_master (derivada) | Processos únicos com metadata. decided_at 100% preenchido |
| **judx_decision** | 2.927.525 | stf_master (derivada) | Decisões classificadas v3: result (96%), kind, environment |
| **judx_litigant** | 1.385.761 | Partes STF | Litigantes indexados |
| **judx_case_litigant** | 439.970 | Junction | Vínculo processo-litigante |
| **judx_judge** | 95 | Manual | Ministros com metadata |
| **judx_procedural_class** | 343 | STF | Classes processuais |
| **judx_subject** | 3.621 | STF | Assuntos |

### Camada STF — Fontes Brutas

| Tabela | Rows | Fonte | O que contém |
|---|---|---|---|
| **stf_decisoes** | 169.851 | Crawler antigo | Decisões colegiadas 2016-2025 com extrato_decisao |
| **stf_universal** | 169.851 | stf_decisoes normalizada | 40 cols, ministro_real corrigido |
| **stf_partes_completo** | 1.153.635 | Portal + Corte Aberta | 9 colunas, polo_ativo/passivo, advogados |
| **stf_composicao_temporal** | 122 | Manual | Composição ministerial por período |
| **stf_processos** | 21.181 | Crawler antigo | Metadados cabeçalho |

### Camada STJ

| Tabela | Rows | Fonte | O que contém |
|---|---|---|---|
| **stj_decisoes_dj** | 212.405 | DJe (fev-mai 2022) | Íntegras STJ |
| **stj_temas** | 1.420 | Portal STJ | Temas repetitivos + tese |
| **stj_fases** | 46.174 | Portal STJ | Movimentação processual |
| **stj_processos_semente** | 2.509 | Portal STJ | Processos-semente dos temas |
| **stj_universal** | 6.411 | Derivada | STJ normalizado |
| **stj_partes** | 18.316 | Portal STJ | Partes STJ |
| **stj_contramostra** | 3.902 | CKAN + Datajud | Amostra de contraste |
| **stj_precedentes_temas** | 2.295 | Portal STJ | Precedentes vinculados |

### Camada FISCAL

| Tabela | Rows | Fonte | O que contém |
|---|---|---|---|
| fiscal_carga_tributaria | 36 | Receita Federal | Série 1990-2025 |
| fiscal_custo_judiciario | 20 | CNJ | Custo do Judiciário |
| fiscal_divida_publica | 34 | Tesouro Nacional | Dívida pública |
| fiscal_pib | 37 | IBGE/BCB | PIB série |
| fiscal_resultado_primario | 26 | STN | Resultado primário |

### Camada PRODUTO

| Tabela | Rows | Fonte | O que contém |
|---|---|---|---|
| risco_processual | 445 | Derivada | Recalculável |
| resultado_empirico | 6 | Manual | Achados para o hero |
| auditoria_corpus_strings | 1 | Cache | Números do hero |
| serie_historica_tribunais | 86 | Relatórios STF | 1940-2025 |
| taxa_por_ministro | 22 | v_provimento_merito | Taxa por relator |
| processo_linha_decisoria | 2.927.914 | stf_master | Linha decisória de cada processo |
| vida_do_processo | 2.212.761 | Derivada | Ciclo de vida |

### Tabelas VAZIAS (reservadas, não popular sem decisão da Damares)

82 tabelas judx_* vazias: judx_collegial_context, judx_counsel, judx_decision_line, judx_decisional_dna, judx_ecology, judx_emergent_taxonomy, judx_environment_inference, judx_environmental_profile, judx_inference_audit, judx_inference_log, judx_intercourt_*, judx_judgment_*, judx_latent_signal, judx_normalization_log, judx_raw_document, judx_regime_*, judx_relator_*, judx_situated_profile, judx_text_*, judx_unknown_*, processo_no, processo_ancoragem, processo_string_evento, organizations, alerts, etc.

---

## 2. O QUE EXISTE NO HD LOCAL

### Desktop/backup_judx/resultados/ (~93 arquivos)

| Arquivo | O que contém |
|---|---|
| `2026-04-06_stf_serie_historica_v2.csv` | 87 anos (1940-2026), 16 colunas, 3 fontes |
| `2026-04-06_anatomia_filtro_presidencia_stf.txt` | Decomposição Presidência vs Relator vs Turma |
| `2026-04-13_presidencia_perfil.csv` | 16 presidentes, perfil decisório |
| `2026-04-13_presidencia_serie_anual.csv` | 42 linhas, ano × presidente |
| `stf_todos_ministros_consolidado.json` | 171 ministros, dados biográficos + portal |
| `dj_posses_presidencia/` | 13 PDFs das sessões solenes (DJ) |
| `discurso_*.txt` | 4 transcrições (Gonçalves, Trigueiro, Baleeiro, Eloy) |

### Desktop/stf no diva/ (livro "O Supremo no divã")

| Arquivo/Pasta | O que contém |
|---|---|
| `Discursos posse STF - consolidado 1963-2025.docx` | Corpus fechado, 35 presidentes |
| `CORPUS.docx` | Corpo do livro |
| `PRÓLOGO.docx` | Prólogo |
| `fotos/` | ~100+ JPGs de presidentes e ministros |
| `plaquetas_originais/` | 9 PDFs plaquetas (Djaci Falcão a Xavier de Albuquerque) |
| `ocr_txt/` | 8 transcrições OCR das plaquetas |
| `termos_manuscritos/` | 7 PDFs termos de posse manuscritos (1963-1979) |
| `dados_ministros/` | JSONs consolidados, galeria parseada, Excel parseado |
| `GALERIA DOS PRESIDENTES.docx` | 50 presidentes, biografia completa (coleta manual DM) |
| `CONSOLIDADO_TABLEAU_COMPLETO.csv` | Dados Tableau da Damares |

### Downloads/ (dados brutos STF)

| Pasta/Arquivo | O que contém |
|---|---|
| `stf_decisoes_fatias/` | 27 CSVs Corte Aberta (2.927.525 decisões, 1.525 MB) |
| `stf_processo_incidente_qlik.csv` | 2.213.991 mapeamentos processo→incidente |
| `stf_incidente_link.csv` | Links portal para cada incidente |
| `stf_master/` | Master4 core + premium normalizados |

### Desktop/bkp/ (CAMADA 0 — NUNCA MODIFICAR)

Arquivo histórico do projeto. CSVs originais, partes portal, fiscais.

---

## 3. O QUE ESTÁ NO AR (judx.com.br)

| Rota | Tipo | O que faz |
|---|---|---|
| `/` | Landing HTML | Página principal — "O judiciário brasileiro, inteiro, legível" |
| `/en` | Landing HTML | Versão inglês |
| `/serie-historica` | HTML + Chart.js | Série histórica 1940-2025 (WIP — precisa redesenho) |
| `/linha-sucessoria` | HTML + JS | Timeline 171 ministros, cards clicáveis |
| `/rede-de-acesso` | HTML | Rede de acesso ao STF |
| `/colapso-silencioso` | HTML | Visualização do colapso |
| `/proposal/[token]` | Next.js | Investor brief (tokens IP-locked) |
| `/jdx-ctrl-2026` | Next.js | Admin panel (oculto, com senha) |
| `/risco-processual` | Next.js | Ferramenta risco (paywall) |
| `/taxa-provimento` | Redirect → `/` | DESATIVADA — redireciona para landing |
| `/cadastro` | Next.js | Cadastro |
| `/login` | Next.js | Login |
| `/dashboard` | Next.js | Dashboard (Stripe) |
| `/planos` | Next.js | Planos/preços |
| `/ministros/[slug].html` | HTML estático | Cards dos 11 ministros atuais |

---

## 4. O QUE FALTA

### Lacunas de dados

| Lacuna | Status | Como resolver |
|---|---|---|
| STJ distribuídos (2.646.620) | CSV local, não no Supabase | Aguarda upgrade Supabase |
| Dados pré-2000 STF | Série histórica em CSV (1940-1999) | Já no banco: serie_historica_tribunais |
| Fotos de ~79 ministros | Scraping em andamento | Portal STF (10s/request) |
| Subpáginas dos ministros (Discursos, DadosDatas) | Mapeadas, não acessadas | Scrapear devagar |
| Inteiro teor STF (jurisprudência) | Não investigado | API jurisprudencia.stf.jus.br |
| LOA DPU via SIOP | Pendente | SIOP |
| Ancoragem STJ × códigos | Pendente | Manual |
| Scraper portal STF partes | CANCELADO (WAF 403) | 411K recuperados, parado |

### Lacunas do site

| Lacuna | Status |
|---|---|
| Cards dos presidentes históricos | Dados prontos, HTML a montar |
| Série histórica visual | WIP — precisa redesenho nível Tableau |
| Seção Presidência (distribuidora → processadora) | Dados prontos, visualização a fazer |
| Stripe produção | Aguarda Revolut Business IBAN |
| www.judx.com.br CNAME | Pendente no Registro.br |
| Email corporativo contato@judx.com.br | Google Workspace pendente |

---

## 5. PERGUNTAS QUE O JUDX RESPONDE HOJE

### Para a Caixa (ou qualquer grande litigante)
- Qual a taxa de sucesso/insucesso por classe (ARE, RE, AI) no STF?
- Qual ministro-relator tem maior taxa de provimento para a classe X?
- Quantos processos da Caixa estão no STF e em que estágio?
- Qual o tempo médio de tramitação por classe?
- Qual a probabilidade de um ARE ser admitido pela Presidência?

### Para o doutorado
- Qual o percentual de decisões sem mérito no STF? (79%)
- Qual o percentual no STJ? (~90%)
- Como evoluiu o papel da Presidência de 2000 a 2026? (2% → 44%)
- Quem são os grandes litigantes e qual seu perfil decisório?
- O plenário virtual concentrou poder sem deliberação?
- A sessão virtual mudou padrões de votação?
- Como se distribuem decisões monocráticas vs colegiadas?

### Para investidor
- Qual o tamanho do corpus? (2.9M STF + 2.6M STJ)
- O ativo já está construído? (sim — pipeline operacional)
- Qual o modelo de receita? (freemium + B2B)
- Há tração comercial? (piloto em estruturação)

---

## 6. ACHADOS EMPÍRICOS CONFIRMADOS

- **86,4% monocráticas** (2.530.482/2.927.525)
- **85% dos processos** nunca chegam ao colegiado
- **34,9% são não-decisões** (1.021.680) — grau 1: 676K, grau 2: 289K, grau 3: 56K
- **Presidência filtra 73-76% dos AREs** (2020+)
- **Taxa provimento RE: 17,1%** vs ARE: 1,2% (diferença de 14×)
- **Provimentos absolutos estáveis**: ~2.500-3.500/ano (2013-2025)
- **Inconsistência interna STF**: 2018 — 4 decisões de divergência entre dois sistemas oficiais
- **Barroso: 95.964 decisões** como presidente — recorde absoluto
