# Schema de Referência — Todos os Bancos e Fontes
**O Claude NUNCA deve perguntar a estrutura dos dados. Está tudo aqui.**

---

## BANCO JUDX (ejwyguskoiraredinqmb)

### stf_decisoes (169.851 rows) — Raw do Corte Aberta STF
| Coluna | Tipo | Exemplo |
|---|---|---|
| id | bigint | 112398 |
| processo | text | ADI 6180 |
| orgao_julgador | text | Tribunal Pleno |
| relator_decisao | text | MIN. DIAS TOFFOLI |
| relator_atual | text | MIN. DIAS TOFFOLI |
| data_autuacao | date | 2019-06-24 |
| data_decisao | **text (DD/MM/YYYY)** | 15/08/2023 |
| data_baixa | date | 2023-10-25 |
| grupo_origem | text | Originária / Recursal |
| tipo_classe | text | Controle Concentrado / Recursal |
| classe | text | ADI / RE / ARE / HC / Rcl |
| ramo_direito | text | DIREITO TRIBUTÁRIO |
| assunto | text | DIREITO TRIBUTÁRIO \| IMPOSTOS |
| assunto_completo | text | (hierarquia completa) |
| incidente | bigint | 5724154 |
| link_processo | text | https://portal.stf.jus.br/... |
| cod_andamento | text | 6.228 |
| subgrupo_andamento | text | Decisão Final / Decisão em recurso interno |
| descricao_andamento | text | Procedente / Agravo não provido (RESULTADO CURTO) |
| observacao_andamento | text | Decisão: O Tribunal, por maioria... (TEXTO LONGO) |
| tipo_decisao | text | COLEGIADA / Decisão Final / Decisão Interlocutória |
| preferencia_covid19 | boolean | false |
| preferencia_criminal | boolean | false |
| sigla_ultimo_recurso | text | ADI-ED |
| recurso_interno_pendente | boolean | false |
| em_tramitacao | boolean | false |
| decisoes_virtual | boolean | true (85% do corpus) |
| ambiente_julgamento | text | NULL (maioria) / Presencial / Virtual (só 2026) |
| indicador_colegiado | text | NULL (maioria) / COLEGIADA / MONOCRÁTICA |
| raw_source | text | 372e |
| created_at | timestamptz | 2026-03-26T21:15:23 |

**GOTCHAS:**
- data_decisao é TEXT, não date. Para ano: `SUBSTRING(data_decisao FROM '\d{4}$')::int`
- decisoes_virtual=true cobre 85%. ambiente_julgamento só existe para 2026
- observacao_andamento = texto longo (unanimidade, vencido, etc). descricao_andamento = categoria curta
- 26 relatores distintos. "MINISTRO PRESIDENTE" = decisões da Presidência

### stf_partes (856.416 rows / 117.814 incidentes)
| Coluna | Tipo | Exemplo |
|---|---|---|
| id | bigint | PK |
| incidente | bigint | 5724154 (FK para stf_decisoes) |
| processo | text | ADI 6180 |
| papel | text | ADV / PROC / INTDO / IMPTE / REQTE / PACTE |
| nome | text | PROCURADOR-GERAL DA FAZENDA NACIONAL |
| tipo | text | oab / ente_publico / pessoa_fisica / pessoa_juridica |
| oab | text | 12345/SP |
| raw_source | text | portal_stf |
| created_at | timestamptz | |

**Distribuição:** oab 126K, ente_publico 64K, pessoa_fisica 12K, pessoa_juridica 2.5K

### judx_case (139.737 rows) — Normalizado
| Coluna | Tipo | Nota |
|---|---|---|
| id | uuid | PK |
| external_number | text | "HC 254912" (UNIQUE) |
| court_id | uuid | FK → judx_court |
| organ_id | uuid | FK → judx_organ |
| procedural_class_id | uuid | FK → judx_procedural_class |
| main_subject_id | uuid | FK → judx_subject |
| decided_at | date | |
| summary | text | Trecho da decisão |
| metadata | jsonb | {incidente, source_table, link_processo} |

### judx_decision (224.887 rows) — Decisões normalizadas
| Coluna | Tipo | Valores |
|---|---|---|
| id | uuid | PK |
| case_id | uuid | FK → judx_case |
| decision_date | date | |
| kind | enum | acordao / monocratica / decisao_interlocutoria / outra |
| result | enum | procedente / improcedente / nao_conhecido / parcialmente_procedente / deferido / indeferido / prejudicado |
| session_environment | enum | virtual / presencial / nao_informado (88% nao_informado) |
| metadata | jsonb | {ramo, source_id, ramo_direito, tipo_classe} |

**NOTA:** session_environment está 88% como nao_informado. Para ambiente, usar stf_decisoes.decisoes_virtual direto.

### judx_court (2 rows)
- STF: id=ff7f5ecd-2cb2-4bbb-bb70-265ea9683863, acronym='STF'
- STJ: id=504ec7e6-1a46-47f1-9992-727b58e951b7, acronym='STJ'

### stj_temas (1.420 rows)
| Coluna | Tipo | Exemplo |
|---|---|---|
| numero | integer (UNIQUE) | 1350 |
| tipo | text | repetitivo |
| situacao | text | transito_em_julgado / afetado / julgado / Cancelado |
| orgao_julgador | text | PRIMEIRA SEÇÃO |
| ramo_direito | text | DIREITO TRIBUTÁRIO |
| questao | text | (texto longo) |
| tese_firmada | text | (texto longo ou NULL se pendente) |
| relator | text | GURGEL DE FARIA |
| tribunal_origem | text | TRF4 / TJSP |
| data_afetacao | date | |
| data_julgamento | date | |
| data_transito | date | |
| processos_afetados | jsonb | [{"classe":"REsp","numero":"123","uf":"SC"}] |
| link_stf_rg | text | Tema 361/STF (ou NULL) |
| assuntos | text[] | {IPTU, Imposto Predial} |

### stj_processos_semente (2.509 rows)
| Coluna | Tipo | Exemplo |
|---|---|---|
| tema_numero | integer | FK → stj_temas(numero) |
| processo | text | REsp 2194708/SC |
| classe | text | REsp (97%) / EREsp / Pet |
| numero | text | 2194708 |
| uf_origem | text | SC |
| tribunal_origem | text | TRF4 (96% preenchido) |
| relator | text | NANCY ANDRIGHI (94% preenchido) |
| rrc | boolean | true/false (96% preenchido) |
| data_afetacao | date | |
| data_julgamento | date | (67% preenchido) |

### stj_contramostra (3.902 rows)
| Coluna | Tipo | Nota |
|---|---|---|
| processo | text (UNIQUE) | AREsp 2935515 / REsp 1890871 |
| classe | text | AREsp (76%) / REsp (24%) |
| numero | text | |
| relator | text | |
| data_decisao | date | |
| ano_afetacao | integer | Ano de referência |
| fonte | text | scon / datajud |

---

## BANCO ICONS (hetuhkhhppxjliiaerlu)

### objects (252.481 rows)
| Coluna | Tipo | Nota |
|---|---|---|
| id | uuid | PK |
| slug | text | stf-re-582525 / cf-1988-art-5 |
| type_slug | text | registro_jurisprudencial / processo / artigo / inciso / paragrafo / alinea |
| payload | jsonb | {classe, numero, relator, data_julgamento, ...} |
| court_id | text | |
| recorded_at | timestamptz | |

### edges (473.853 rows)
| Coluna | Tipo | Nota |
|---|---|---|
| edge_id | uuid | PK |
| type_slug | text | ancora_normativa / ancora_processual / relator_de / produzido_por |
| source_id | uuid | FK → objects |
| target_id | uuid | FK → objects |
| payload | jsonb | |

**NUNCA usar:** `edge_type` (não existe), `label` (não existe), `metadata` (é `payload` nos objects)

---

## FONTES EXTERNAS

### STJ CKAN (dadosabertos.web.stj.jus.br)
- Dataset: integras-de-decisoes-terminativas-e-acordaos-do-diario-da-justica
- 923 arquivos de metadados JSON (fev/2022 a mar/2026)
- Formato 2022: `ministro`, `dataDistribuicao`, timestamps em milissegundos
- Formato 2024+: `NM_MINISTRO`, `dataDistribuição`, ISO dates
- Campos: SeqDocumento, dataPublicacao, tipoDocumento, numeroRegistro, processo, NM_MINISTRO, recurso, teor, descricaoMonocratica, assuntos

### Datajud CNJ (api-publica.datajud.cnj.jus.br)
- Endpoint: POST /api_publica_stj/_search
- Auth: ApiKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==
- Formato data: "20240621000000" (não ISO)
- Classes STJ confirmadas: AREsp=11881, REsp=1032, HC=1720, RHC=1722
- Sort: só `dataAjuizamento` funciona (sem _id, sem numeroProcesso)
- Paginação: search_after

### STJ Portal Repetitivos
- URL: processo.stj.jus.br/repetitivos/temas_repetitivos/pesquisa.jsp
- Requer JSESSIONID (GET novaConsulta=true primeiro)
- Paginação: l=100&i=N com cookie
- Encoding: ISO-8859-1 (decodificar com TextDecoder('latin1'))

### BLOQUEADOS
- scon.stj.jus.br — 403 Cloudflare
- processo.stj.jus.br/processo/pesquisa/ — 403 Cloudflare
- ww2.stj.jus.br — 403 Cloudflare
