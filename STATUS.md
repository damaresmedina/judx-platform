# JudX — Estado do Projeto
**Última atualização: 27/03/2026 20:00 UTC**
**Atualizado por: Claude Code (sessão e083e141)**

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

### 27/mar/2026 — Dia 6: Análise Completa (HOJE)
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

---

## ESTADO ATUAL DOS BANCOS

### JudX (ejwyguskoiraredinqmb)
| Tabela | Registros | Status |
|---|---|---|
| stf_decisoes | 169.851 | Completo |
| judx_case | 139.737 | Completo |
| judx_decision | 224.887 | Completo |
| stf_partes | ~140K+ | EM EXTRAÇÃO (PID 2556) |
| stj_temas | 1.420 | Completo |
| stj_processos_semente | 2.509 | Completo |
| stj_contramostra | 3.902 | Completo |
| judx_court | 2 | STF + STJ |
| judx_judge | 88 | Completo |
| judx_organ | 15 | Completo |
| judx_procedural_class | 338 | Completo |
| judx_subject | 2.799 | Completo |

### ICONS (hetuhkhhppxjliiaerlu)
| Tabela | Registros | Status |
|---|---|---|
| objects | 126.545+ | Completo |
| edges | ~470K+ | Completo |
| edges (ancora_normativa) | 7.766 | Validado |

---

## PROCESSOS EM BACKGROUND

Verificar com: `wmic process where "name='node.exe'" get processid,commandline 2>/dev/null | grep -E "pipeline|partes|fetch"`

| Processo | Script | Log | Status esperado |
|---|---|---|---|
| Pipeline STF normalização | run-stf-pipeline-fast.mjs | logs/ | **COMPLETO** (27/mar 08:26 UTC) |
| Extração partes STF | fetch-stf-partes-safe.mjs | logs/partes-full.log | Pode ter completado ou ainda rodando |

---

## ACHADOS EMPÍRICOS CONFIRMADOS

### STF
- **79% das decisões** não apreciam mérito
- **86,6% unanimidade** nas sessões virtuais (125.476 de 145.129)
- **~102 processos/ministro/semana** nas sessões de pico
- Divergência: Trabalho 28,9% > Processual Penal 18,8% > Civil 9,0%
- **2022 é anomalia**: 6,1% divergência (metade de qualquer outro ano)
- Contrafactual Marco Aurélio: delta apenas 1,1pp — não explica anomalia
- Bloco Mendonça+Nunes: minoria penal estável, 67% votam juntos, Moraes relata 54% das derrotas

### STJ
- **~90% sem mérito** (AREsp: 95%, REsp: 70,9%)
- **292 temas tributários**, 329 dias médio de resolução
- **TRF4 é o maior gerador** de temas repetitivos (388 sementes, 15,5%)
- 257 circuitos STJ↔STF via Repercussão Geral

---

## PRÓXIMOS PASSOS

1. **Completar extração de partes STF** (~100K incidentes restantes)
2. **Query de mapa advogado→cliente→relator→taxa de sucesso** (quando partes completar)
3. **Análise de inflexão 2021-2022** no comportamento litigioso da União (cruzar partes × CCHA)
4. **Extração de processos-semente enriquecidos** via portal STJ (bloqueado por Cloudflare — usar Datajud)
5. **Série temporal completa STJ** via CKAN (2022+) para medir taxa de não-decisão por mês
6. **Escrita do paper** — Circuitos de Enforcement (draft em C:\Users\medin\Downloads\CircuitosEnforcement_COMPLETO (1).docx)

---

## ARQUIVOS IMPORTANTES

| Arquivo | Local | Conteúdo |
|---|---|---|
| PROTOCOLO_JUDX.md | judx-platform/ | Protocolo canônico v1.1 |
| CircuitosEnforcement_COMPLETO.docx | Downloads/ | Draft do paper |
| Relatorio_Achados_JudX_ICONS_27mar2026.docx | Desktop/ | Relatório completo |
| judx-dashboard.html | Desktop/ | Dashboard interativo |
| seismic_silence.pdf | Desktop/judx-canvas/ | Poster visual |
| FIESP pesquisa | Downloads/ | Obstáculos ao crescimento |
| Teto Decorativo PDF | Desktop/bicocca milano/subsidios/ | Honorários de sucumbência |

---

*Este arquivo é atualizado ao final de cada sessão de trabalho.*
*O Claude Code deve ler este arquivo no início de cada sessão para saber o estado atual.*
