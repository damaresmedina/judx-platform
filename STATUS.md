# JudX — Estado do Projeto
**Última atualização: 30/03/2026**
**Atualizado por: Claude Code**

---

## TIMELINE DE PROGRESSO

### 22/mar/2026 — Dia 1: Fundação
- [x] Criação do CLAUDE.md do ICONS
- [x] Schema SQL do banco Supabase (ICONS)
- [x] Início da extração de decisões STF
- [x] Parsing da Constituição comentada STF

### 23/mar/2026 — Dia 2: Extração ICONS
- [x] Continuação da extração de decisões
- [x] Debugging de problemas no parser

### 24/mar/2026 — Dia 3: Arquitetura JudX
- [x] Definição da arquitetura do JudX (128 mensagens, sessão mais longa)
- [x] Separação formal JudX vs ICONS
- [x] Schema do banco JudX (ejwyguskoiraredinqmb)
- [x] PROTOCOLO_JUDX.md v1.0

### 25/mar/2026 — Dia 4: Limpeza e Ontologia
- [x] Limpeza geral do projeto ICONS (312 mensagens)
- [x] Processamento da CF comentada STF
- [x] Protocolo ontológico ICONS v9
- [x] Constituição ontológica congelada
- [x] Deploy ontologia.html no icons.org.br

### 26/mar/2026 — Dia 5: Pipeline STF
- [x] Criação das tabelas raw STF no JudX (stf_decisoes, stf_processos)
- [x] Load de 169.851 decisões do Corte Aberta
- [x] Pipeline de normalização (run-stf-pipeline-fast.mjs) — iniciado
- [x] Início da extração de partes (fetch-stf-partes-safe.mjs)
- [x] Landing pages deployadas: icons.org.br, cartografia_stf.html, linhas_decisorias_stf.html

### 27/mar/2026 — Dia 6: Análise Completa
- [x] Pipeline STF normalização **COMPLETO** — 139.737 cases, 224.887 decisions, 0 erros
- [x] Extração de partes STF — em andamento (~27K incidentes, ~140K partes)
- [x] STJ temas repetitivos — **1.420/1.420** extraídos, 0 erros
- [x] STJ processos-semente — **2.509** com tribunal/relator/datas
- [x] STJ contramostra CKAN (2022-2026) — **1.848** processos
- [x] STJ contramostra Datajud (2008-2021) — **2.054** processos
- [x] PROTOCOLO_JUDX.md atualizado para v1.1 (estratégia amostra de contraste)
- [x] Análise de ambiente virtual: volume/sessão, unanimidade, assessorização
- [x] Análise de coalizões: bloco Mendonça+Nunes, Marco Aurélio contrafactual
- [x] Análise de divergência: série histórica 2016-2025, anomalia 2022
- [x] Relatório Word gerado (Desktop)
- [x] Dashboard HTML interativo gerado (Desktop)
- [x] Poster PDF "Seismic Silence" gerado (Desktop)
- [x] 6 skills criadas em skills/ (judx-query, judx-extract, judx-report, icons-deploy, judx-deploy, judx-history)
- [x] CLAUDE.md do projeto criado com instruções obrigatórias
- [x] STATUS.md criado como diário de bordo persistente
- [x] Sistema de memória expandido: 23 memórias no MEMORY.md
- [x] Background acadêmico completo mapeado (15 anos, todos os papers)
- [x] Voz autoral como REGRA MESTRA no MEMORY.md
- [x] Dashboard HTML interativo (judx-dashboard.html no Desktop)
- [x] Poster PDF "Seismic Silence" (Desktop/judx-canvas/)
- [x] Relatório Word completo (Desktop/)

### 28/mar/2026 — Dia 7: Mapa de Partes + STJ + Tabelas Universais
- [x] Hook bom-dia configurado (.claude/settings.local.json + scripts/hook-bom-dia.sh)
- [x] Extração STF partes CONFIRMADA COMPLETA — 856.416 partes, 117.814 incidentes
- [x] Exportação tabelas originais CSV: stf_partes (117.7 MB), stf_decisoes (61.7 MB), judx_decision (54.0 MB)
- [x] Análises STF salvas: relator×resultado, partes×polo×resultado, advogados×volume
- [x] Mapa relator×taxa de sucesso: Alexandre Moraes 97.5%, Marco Aurélio 14.8%, Barroso 5.7%
- [x] Mapa entes públicos: MPF 2685 proc (44.6%), Congresso 58.8%, Governadores ~70%
- [x] Tabela stj_partes criada no banco JudX
- [x] Parser HTML STJ mapeado (classSpanDetalhesLabel/classSpanDetalhesTexto)
- [x] Docker Desktop instalado + WSL Ubuntu instalado
- [x] Projeto copiado para C:\projetos\judx
- [x] **stf_universal** criada no banco — 169.851 rows, 40 colunas
- [x] **stj_universal** criada no banco — 6.411 rows, 20 colunas
- [x] CSV/Excel auditoria exportados

### 29/mar/2026 — Dia 8: STJ Completo + ICONS Site + Base Normativa
- [x] STJ Datajud 2005-2015 extraído (89.924 processos)
- [x] Gaps STJ 2017-2024 completados: +176.646 processos
- [x] Auditoria STJ: 2.646.620 processos, 578 MB, 22 anos
- [x] Site ICONS atualizado: carrossel nav, canvas ancoragem, PROJUS→ICONS
- [x] oscilacao_jurisprudencial.html com RAW 150 arts 3.359 decisões
- [x] cartografia_stf.html com dados reais Supabase
- [x] Base normativa: 5.915 artigos de 17 códigos (planalto.gov.br)
- [x] Push GitHub judx-platform + icons-cartografia

### 30/mar/2026 — Dia 9: Ontologia + Corte Aberta Completa + Audit + ICONS

#### Audit do Banco STF
- [x] Audit completo de todas as tabelas STF — 6 tabelas, 17 abas, 12 inconsistências
- [x] Problema dos 13 ministros identificado e corrigido: MINISTRO PRESIDENTE e VICE-PRESIDENTE mapeados para ministro real via composição temporal
- [x] Colunas novas em stf_decisoes (169.851 rows): `ministro_real`, `orgao_decisorio`, `ambiente_unificado`, `fonte_ambiente` — 100% preenchidas
- [x] Excel audit: `2026-03-30_audit_completo_stf.xlsx` (17 abas)

#### Modelo Ontológico — Teoria dos Objetos Ancorados
- [x] SQL completo do modelo salvo: `MODELO_ONTOLOGICO_ICONS.sql`
- [x] Teoria lida e integrada: `TEORIA DOS OBJETOS ANCORADOS.txt`
- [x] 6 ENUMs, 8 tabelas referência, 2 tabelas principais, 4 views analíticas
- [x] Composição temporal completa: 21 presidentes STF + 11 vice-presidentes + turmas
- [x] Taxonomia de não-decisão: 4 graus (primária, secundária, terciária)

#### Download Corte Aberta STF — 2.927.525 decisões
- [x] **Script de download via Qlik Engine WebSocket API** — `download_corte_aberta.py`
- [x] Descoberta: GET na página do mashup → cookie `X-Qlik-Session` → WebSocket `wss://` → Engine API (`OpenDoc` → `GetField` → `SelectValues` → `ExportData`) → CSV em `/tempcontent/`
- [x] **27 arquivos baixados** (2000-2026) em `Downloads\stf_decisoes_fatias\` — 1.525 MB total
- [x] App ID: `023307ab-d927-4144-aabb-831b360515bb` | Obj decisões: `UbMrYBg` | Obj partes: `pRRETQ`

#### Mapa de Conteúdo — 2.927.525 decisões
- [x] `stf_mapa_conteudo.json` — distribuição completa de todos os 20 campos
- [x] 47 classes processuais: ARE 884K (30.2%), AI 784K (26.8%), RE 706K (24.1%), HC 230K (7.8%)
- [x] 8 valores de Origem decisão: MONOCRÁTICA 2.530.482 (86.4%), colegiadas 397.043 (13.6%)
- [x] Sessão Virtual identificada em Origem decisão (não em Ambiente julgamento)
- [x] 2.212.761 processos únicos, média 1.32 decisões/processo
- [x] 76.6% dos processos têm apenas 1 decisão (string de comprimento 1)
- [x] 85% dos processos NUNCA chegam ao colegiado

#### Pipeline Ontológico Local — processo_no + processo_string_evento
- [x] Pipeline v1 rodado: 2.927.525 decisões → CSVs em `Downloads\stf_pipeline_local\`
- [x] Não-decisões corrigidas: 1.021.680 (34.9%) — grau 1: 676K, grau 2: 289K, grau 3: 56K
- [x] Evolução: ~20% em 2007 → ~43% em 2022-2024

#### Consolidação Master — decisões × incidentes × partes
- [x] basicos.csv do crawler (1.813.780 processos, range 1-995.518) parseado como tabela-ponte
- [x] basicos_slow é subconjunto do basicos_fast (0 processos exclusivos no slow)
- [x] Join exato (classe+número): 1.924.366 (65.7%)
- [x] Join por número (ignora classe): +305.866 = 2.230.232 (76.2%)
- [x] Join com banco JudX (117.848 incidentes): +159.125 = 2.389.357 (81.6%)
- [x] Gap restante: 538.168 decisões (18.4%) — processos 2017+ sem incidente
- [x] Processos únicos sem incidente: 492.823 (maioria ARE 427K + RE 95K)
- [x] Scraper portal STF testado: funciona (`listarProcessos.asp` → redirect `detalhe.asp?incidente=N`)
- [x] 828 incidentes recuperados via requests antes de bloqueio 403
- [x] Playwright instalado para retomada
- [ ] **BLOQUEADO**: IP bloqueado pelo WAF do STF (403 em portal + transparencia) — aguardar desbloqueio

#### Partes Corte Aberta
- [x] Export partes via Qlik: 1.000.000 linhas (limite do Qlik), 5 colunas
- [x] Colunas: Processo, Polo ativo, Polo passivo, Advogado polo ativo, Advogado polo passivo
- [x] **Não tem incidente** — só Processo como chave

#### ICONS Site
- [x] zipper.html adicionado como 4ª página ICONS
- [x] Nav atualizada nas 4 páginas: index → cartografia → oscilação → zipper (circular)
- [x] Commit `f5376d2` pushed, deploy Vercel automático

#### Arquivos Gerados
| Arquivo | Local | Tamanho |
|---|---|---|
| `stf_decisoes_fatias/decisoes_2000-2026.csv` | Downloads/ | 1.525 MB (27 arquivos) |
| `stf_partes_fatias/partes_todas.csv` | Downloads/ | 135 MB |
| `stf_master/1_basicos_ponte.csv` | Downloads/ | 173 MB |
| `stf_master/2_decisoes_com_incidente.csv` | Downloads/ | 1.737 MB |
| `stf_master/2b_decisoes_join_numero.csv` | Downloads/ | 1.705 MB |
| `stf_master/3_master_completo.csv` | Downloads/ | 2.282 MB |
| `stf_master/judx_processo_incidente.csv` | Downloads/ | 3 MB |
| `stf_master/processos_sem_incidente.txt` | Downloads/ | 12 MB |
| `stf_master/incidentes_portal_stf.csv` | Downloads/ | ~1 MB (828 OK + 481 NF) |
| `stf_pipeline_local/processo_no.csv` | Downloads/ | 968 MB |
| `stf_pipeline_local/processo_string_evento.csv` | Downloads/ | 791 MB |
| `stf_pipeline_local/auditoria_nao_decisoes.csv` | Downloads/ | 280 MB |
| `stf_pipeline_local/auditoria_resumo.csv` | Downloads/ | 1 KB |
| `stf_mapa_conteudo.json` | Downloads/ | mapa completo dos 20 campos |
| `download_corte_aberta.py` | Downloads/ | Script Qlik Engine API |
| `MODELO_ONTOLOGICO_ICONS.sql` | judx-platform/ | Schema ontológico completo |

---

## ⚡ RETOMAR AQUI APÓS REINÍCIO

### EM ANDAMENTO — Scraper partes portal STF (PID 18348)
- **Script**: `Desktop\backup_judx\resultados\run_scraper.py`
- **Modo**: rajadas de 300 requests + cooldown 5min (evita ban WAF)
- **Range**: 5.074.440 → 7.600.000 (~2.5M incidentes)
- **Saída**: `Desktop\backup_judx\resultados\partes_portal_FINAL.csv`
- **Checkpoint**: `Desktop\backup_judx\resultados\cp_final.txt`
- **HTML bruto**: `Desktop\backup_judx\resultados\html_raw_partes/`
- **Monitorar**: `wc -l partes_portal_FINAL.csv` + `cat cp_final.txt`
- **Se cair**: relançar `python run_scraper.py` — retoma do checkpoint

### Prioridade 1 — Quando scraper terminar
1. Cruzar partes_portal_FINAL.csv com decisões para substituir *NI*
2. Rodar scraper para faixa 1→1.405.086 (pré-2000) e 2.699.257→3.698.186
3. Reconstruir audit CSVs com dados reais do portal
4. Passe 2: buscar abaInformacoes só nos encontrados (assunto, data, UF)

### Prioridade 2 — Montagem final
5. Reprocessar pipeline ontológico com ambiente corrigido
6. Gerar CSVs finais para auditoria

### Prioridade 3 — Subir para Supabase (SÓ APÓS AUDITORIA)
7. Criar tabelas ontológicas no banco
8. Ingerir dados via pipeline de carga

### Pendências anteriores
- [ ] www.judx.com.br (CNAME no Registro.br)
- [ ] Ementas STF
- [ ] LOA DPU via SIOP
- [ ] Ancoragem STJ×códigos
- [ ] Escrita do paper — Circuitos de Enforcement

---

## ESTADO ATUAL DOS BANCOS

### JudX (ejwyguskoiraredinqmb)
| Tabela | Registros | Status |
|---|---|---|
| stf_decisoes | 169.851 | Completo + 4 colunas novas (ministro_real, orgao_decisorio, ambiente_unificado, fonte_ambiente) |
| judx_case | 139.737 | Completo |
| judx_decision | 225.366 | Completo |
| stf_partes | 856.416 | Completo (117.814 incidentes) |
| stf_universal | 169.851 | 40 colunas — tabela de auditoria |
| stj_universal | 6.411 | 20 colunas |
| stj_temas | 1.420 | Completo |
| stj_processos_semente | 2.509 | Completo |
| stj_contramostra | 3.902 | Completo |

### Dados Locais (não no banco ainda)
| Dataset | Registros | Local |
|---|---|---|
| Corte Aberta decisões | 2.927.525 | Downloads/stf_decisoes_fatias/ (27 CSVs) |
| Corte Aberta partes | 1.000.000 | Downloads/stf_partes_fatias/ |
| Master consolidado | 2.927.525 | Downloads/stf_master/ (3 CSVs) |
| Pipeline ontológico | 2.927.525 | Downloads/stf_pipeline_local/ |
| basicos crawler | 1.813.780 | Desktop/geral/Fechamento DMA/ |
| STJ Datajud | 2.646.620 | Desktop/backup_judx/resultados/stj_datajud/ |

### ICONS (hetuhkhhppxjliiaerlu)
| Tabela | Registros | Status |
|---|---|---|
| objects | 126.545+ | Completo |
| edges | ~470K+ | Completo |

---

## ACHADOS EMPÍRICOS CONFIRMADOS

### STF — Corpus 2.927.525 decisões (Corte Aberta completa 2000-2026)
- **86.4% monocráticas** (2.530.482) — 1 ministro decide
- **13.6% colegiadas** (397.043) — presencial ou virtual
- Dentro das colegiadas: 69.7% presencial (277.609), 30.3% virtual (119.434)
- **85% dos processos** nunca chegam ao colegiado
- **76.6% dos processos** têm apenas 1 decisão
- **34.9% são não-decisões** (1.021.680) — grau 1: 676K, grau 2: 289K, grau 3: 56K
- Evolução ND: ~20% (2007) → ~43% (2022-2024)
- 47 classes processuais, 2.212.761 processos únicos

### STF — Banco (169.851 decisões enriquecidas)
- 24 ministros reais mapeados (MINISTRO PRESIDENTE → nome via composição temporal)
- 6 órgãos decisórios normalizados
- 12 inconsistências auditadas e documentadas

### STJ
- **~90% sem mérito** (AREsp: 95%, REsp: 70.9%)
- 2.646.620 processos (Datajud 2005-2026)
- 1.420 temas repetitivos

---

## SCRIPTS E FERRAMENTAS CRIADOS

| Script | Função |
|---|---|
| `download_corte_aberta.py` | Baixa decisões STF via Qlik Engine WebSocket API |
| `download_partes_por_ano.py` | Baixa partes STF via Qlik (pronto, não rodou) |
| `scraper_playwright_10.py` | Busca incidentes no portal STF (10 workers paralelos) |
| `pipeline_local_stf.py` | Pipeline ontológico local (2.9M decisões) |
| `montar_master.py` | Consolida decisões + basicos + partes |
| `refaz_join_numero.py` | Join por número (recupera AI→RE) |
| `audit-completo-stf.mjs` | Audit banco STF (17 abas) |
| `bom-dia.mjs` | Diagnóstico matinal + mapa de dados STF |

---

*Este arquivo é atualizado ao final de cada sessão de trabalho.*
*O Claude Code deve ler este arquivo no início de cada sessão para saber o estado atual.*
