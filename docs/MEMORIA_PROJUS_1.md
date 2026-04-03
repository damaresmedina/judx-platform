# MEMORIA_PROJUS — Contexto Permanente do Projeto
> **v5 — 01/04/2026** — versão final do dia do lançamento
> **Como usar:** Cole no início de qualquer chat Claude.ai, ou mantenha como `CLAUDE.md` na raiz do repositório.

---

## 1. O PROJETO

**ICONS — Instituto Constituição Aberta / PROJUS — Projeto Justiça Aberta**
**JUDX LDA — empresa portuguesa, produto comercial**

**Responsável:** Damares Medina — pesquisadora independente, advogada, doutora em Direito Constitucional, pós-doutora em Democracia e Direitos Humanos (Coimbra). Não programadora. Publicou artigo no JOTA em dezembro/2024 questionando a opacidade da marIA/STF.

- Sites: [icons.org.br](https://icons.org.br) · [judx.com.br](https://judx.com.br)
- Repositório ICONS: `github.com/damaresmedina/icons-cartografia` → icons.org.br (HTML estático)
- Repositório JudX: `github.com/damaresmedina/judx-platform` → judx.com.br (Next.js 14)
- Pastas locais: `C:\Users\medin\projetos\judx-platform` e `C:\Users\medin\projetos\icons-cartografia-update`
- Deploy: Vercel via `git push origin main` (judx) / `git push origin master` (icons)
- Vercel Team: `team_RrCmsmWJEXXwrtEDh6SX7Qiy`
- Vercel Projects: icons `prj_lL4RI2W47VtsXFMkGMJzDIuiQsxR` · judx `prj_7gILK6Z4rzYrfDpSVBwAUAcvwqnj`

**Regra operacional:**
- **Claude.ai** → análise, pesquisa, decisões, prompts
- **Claude Code** → código, commits, deploy, scripts de dados

---

## 2. DOIS PRODUTOS — SEPARAÇÃO CLARA

| | ICONS / PROJUS | JUDX |
|---|---|---|
| Natureza | Pro bono / acadêmico | Comercial |
| Entidade | ICONS | JUDX LDA (Portugal) |
| Site | icons.org.br | judx.com.br |
| Repositório | icons-cartografia-update | judx-platform |
| Stack | HTML estático | Next.js 14 |
| Stripe | Não | ✅ integrado |

---

## 3. PRODUTO LANÇADO — 01/04/2026

**Taxa de Provimento no STF** → `judx.com.br/taxa-provimento`

- ✅ No ar com dados reais do Supabase
- ✅ 110.000+ decisões colegiadas de mérito (2016–2025)
- ✅ Duas abas: Por Ministro Relator / Por Assunto/Tema
- ✅ Paywall: 3 consultas gratuitas → blur + overlay Stripe na 4ª
- ✅ Botão "VER OS DADOS →" na landing aponta para /taxa-provimento
- Commits: `df2f37a` (página) · `eb7665b` (botão landing)

### Diferencial metodológico (NÃO expor — vantagem competitiva)
`v_provimento_merito` separa ontologicamente decisões de mérito colegiado (Turmas + Pleno) de não-decisões da Presidência. "Negado seguimento" pela Presidência ≠ "não provido" pela Turma. Nenhum concorrente faz essa distinção. O denominador correto é provido + nao_provido + parcial, excluindo neutros e processuais.

### Stripe
- Modo: teste (produção pendente — aguarda documentos para Revolut Business)
- Produto: JUDX Plus · R$97/mês · Price ID: `price_1TD8Z3AWRBktQLNLPSCMepyk`
- Payment Link (teste): `https://buy.stripe.com/test_dRm8wO1GZ01g8LJbVW3Nm00`
- Conta: `acct_1TD8DJAWRBktQLNL`
- **Para ativar produção:** verificar empresa no Stripe com NIF `516896776` + IBAN Revolut Business

### Revolut Business
- Em abertura (01/04/2026) — bloqueado por perda de documentos
- Quando aprovado: substituir IBAN Millennium no Stripe
- IBAN backup Millennium BCP: `PT50 0033 0000 4567 0877 1460 5` · BIC: `BCOMPTPL`

### Faturação
- Obrigatória em Portugal para JUDX LDA
- Software AT-certificado a contratar: Invoicexpress ou Moloni

### Pendências comerciais urgentes
- [ ] Recuperar documentos → finalizar Revolut Business
- [ ] IBAN Revolut → vincular ao Stripe → ativar produção
- [ ] Trocar Payment Link test_ pelo link de produção no .env.local
- [ ] Contratar software de faturação
- [ ] Post LinkedIn (ver seção 11)

---

## 4. ENTIDADE COMERCIAL — JUDX LDA

- NIF/NIPC: `516896776`
- Sede: Praça da Pedra Verde, 168, 2 · 4100-385 Porto · Portugal
- Banco backup: Millennium BCP · IBAN `PT50 0033 0000 4567 0877 1460 5` · BIC `BCOMPTPL`
- Banco principal: Revolut Business (em abertura)
- WhatsApp Business: (61) 99575-9444
- Arquitetura: uma entidade (Portugal) → um Stripe → um IBAN. Não abrir PJ no Brasil agora.

---

## 5. ARQUITETURA GERAL DO CORPUS

```
CAMADA 1 — CORPUS BRUTO (HD local)
  2.927.525 decisões STF · 2000–2026 · Corte Aberta
  20 colunas · 27 CSVs por ano · 1.525 MB
  Relator: 100% corrigido (ministro_real) · 663.504 registros corrigidos
  Partes: 68,7% polo real · scraper ativo recuperando o resto (2018+)

CAMADA 2 — CORPUS ENRIQUECIDO (Supabase judx-platform)
  169.851 decisões · 2016–2025 · só colegiadas com incidente
  stf_decisoes: 158.730 com extrato_decisao = íntegra real (até 4.000 chars)
  ministro_real: 100% corrigido
  v_provimento_merito: 110.028 decisões classificadas ontologicamente

CAMADA 3 — CARTOGRAFIA CF/88 (Supabase icons)
  8.495 decisões ancoradas a dispositivos constitucionais
  CF/88: 214 arts · 484 incisos · 243 §§ · 113 alíneas
  Grafo: 252K objetos · 474K edges (estruturais — semânticos em 0)
```

---

## 6. SUPABASE — DOIS PROJETOS

### judx-platform
**ID:** `ejwyguskoiraredinqmb` · **Plano:** Pro

**Anon key:**
`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqd3lndXNrb2lyYXJlZGlucW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjI5NjcsImV4cCI6MjA4OTU5ODk2N30.YJvuOqXThPk_XQLLY63Cy-5KlJUQMQX0aZMjXke0x8s`

**Views criadas:**
- `v_provimento_merito` — mérito colegiado (Turmas + Pleno) · 110.028 registros
- `v_nao_decisao_presidencia` — filtro ARE pela Presidência

**Tabelas STF principais:**
| Tabela | Registros | O que é |
|--------|-----------|---------|
| `stf_partes` | 856.416 | Partes de 117.814 processos |
| `stf_decisoes` | ~194.165 | Colegiadas + íntegra + ministro_real |
| `stf_universal` | ~170.302 | Principal · 40 cols · 2016–2025 |

**Tabelas STJ com dados:**
| Tabela | Registros | O que é |
|--------|-----------|---------|
| `stj_decisoes_dj` | 203.683 | Íntegra via DJe (fev–mai 2022) |
| `stj_temas` | 1.420 | Temas repetitivos + tese (2008–2026) |
| `stj_fases` | 46.174 | Movimentação processual |

### icons
**ID:** `hetuhkhhppxjliiaerlu`
- `published_objects`: 0 — pipeline não executado
- Edges semânticos: todos em 0

---

## 7. HD LOCAL — INVENTÁRIO

```
C:\Users\medin\projetos\judx-platform          ← JudX (Next.js, Stripe)
C:\Users\medin\projetos\icons-cartografia-update ← ICONS (HTML)

Desktop\backup_judx\resultados\
  audit_por_ano\                    (27 CSVs decisões+partes, 25 cols)
  decisoes_relator_corrigido\       (27 CSVs com ministro_real)
  partes_portal_FINAL.csv           (~15K+ partes do portal, scraper ativo)
  taxa_provimento\                  ← NOVO (01/04/2026)
    tabela_por_ano.csv              (17 linhas, 2010–2026)
    tabela_TyAdwyt.csv              (185 linhas, Ano×Criminal×Classe×Provido)
  scripts\extrair_taxa_provimento.py ← script Qlik API
  run_scraper.py                    (scraper portal STF, rodando)
  scraper_permanente.bat            (auto-restart Startup Windows)

Downloads\MEMORIA_COMPLETA_JUDX_31mar2026.md

HD geral:
  Decisões Corte Aberta: 27 CSVs · 1.525 MB · 2.927.525 linhas
  Partes: 2.194.195 processos
  Master: 3_master_completo.csv (2,3 GB, 34 cols)
  STJ: 2.646.620 processos (578 MB)
```

---

## 8. DADOS EXCLUSIVOS — TAXA DE PROVIMENTO STF (Qlik API, 01/04/2026)

Extraídos do painel oficial STF via Qlik Engine API. Universo: 681.575 ocorrências processuais (2010–2026). Nota: "Qtd Ocorrências Processuais" conta andamentos, não processos únicos — o mesmo critério que o STF usa no painel oficial.

**Taxa por Classe:**
| Classe | Total | Providos | Taxa |
|--------|-------|----------|------|
| RE | 104.298 | 17.811 | **17,1%** |
| AI | 69.247 | 1.235 | 1,8% |
| ARE | 508.030 | 5.994 | 1,2% |
| **TOTAL** | **681.575** | **25.040** | **3,7%** |

**Taxa por Classe × Matéria:**
| Combinação | Total | Taxa |
|------------|-------|------|
| RE matéria penal | 7.159 | **24,3%** — verificar causa antes de publicar |
| RE matéria cível | 97.139 | **16,5%** |
| AI matéria cível | 65.512 | 1,8% |
| ARE matéria penal | 57.603 | 1,4% |
| ARE matéria cível | 450.427 | 1,2% |

⚠️ "Indicador Criminal" no Qlik = classificação por matéria (penal/cível), não classe processual. "RE Criminal" não existe como categoria oficial. Investigar antes de publicar.

**Evolução taxa RE:** 14,6% (2010–2012) → 24,7% (2024–2026) — subindo +10pp em 15 anos.

**O STF divulga 5,6% em 2026 como taxa uniforme.** Esse número existe mas esconde distribuição radicalmente assimétrica: RE tem taxa 14× maior que ARE.

---

## 9. QLIK SENSE — APP IDs MAPEADOS

### Painel Taxa de Provimento STF
- **App ID Produção:** `ca45dc5b-0684-4d3d-9f49-7ce39dfa6123`
- **App ID Dev:** `6fee9cba-a44c-4ddc-ae53-a7d96450415b`
- **Host:** `transparencia.stf.jus.br`
- **Auth:** anônima pública via `/qps/user` + `/qps/csrftoken`

| Objeto | ID | O que é |
|--------|-----|---------|
| CHART-1-1 | `0a433c0e-a1ec-4e59-8cdd-9abc0a05901e` | Tabela por ano |
| CHART-1-2 | `a2423b17-199f-43d3-b8f6-a74fd689adc7` | Gráfico temporal |
| FILTER-1 | `XUMsy` | Filtro ano |
| FILTER-2 | `JjMUECG` | Filtro classe |

**App ID decisões/partes (já conhecido):** `023307ab-d927-4144-aabb-831b360515bb`

**Script de extração:** `Desktop\backup_judx\scripts\extrair_taxa_provimento.py`
- Reconexão automática após timeout de sessão Qlik
- Config segura: 1 req/s, pausa 5s entre objetos
- Dimensões ocultas tentadas: Classe, Relator, Polo Ativo, Advogado, UF
- Resultado: modelo Qlik do painel não tem dimensões de parte/advogado

---

## 10. TEORIA — CONCEITOS EM DESENVOLVIMENTO

### Teoria dos Objetos Ancorados (Damares Medina)
- Processo = nó ancorado em órgão + relator + tempo
- Presidência tem dois papéis: distribuição (todos os processos) + filtro ARE (não-decisão primária)
- ARE chega "pela metade" — só admissibilidade. RE chega "inteiro" — traz o mérito.
- Plenário virtual: formalmente colegiado, materialmente monocrático
- Plenário presencial: colegialidade real

### Teoria da Não-Decisão
- A inadmissão não é "neutro" — é improvimento na raiz
- O universo correto inclui inadmissões: o processo morre antes de ser lido
- Poder decisório disfarçado de triagem administrativa

### Implicação para as Bets (produto futuro)
Três camadas de probabilidade calculáveis com dados históricos:
1. O recurso é admitido pela Presidência? (~15% dos AREs)
2. Se admitido, a Turma julga o mérito?
3. Se julgado, é provido? (~17% dos REs)
Usuário aposta em qual filtro o processo passa — JudX calcula as odds.

---

## 11. VISÃO DE LONGO PRAZO

**A metáfora:** O Revolut transformou transferência bancária em conversa — notificação que vira chat, leveza. O JudX quer fazer o mesmo com o direito.

**Prediction markets jurídicos:** inédito no Brasil. Apostas em resultados de julgamentos revelam convicções agregadas = indicador de expectativa social sobre jurisprudência.

**Roadmap:**
```
AGORA:   judx.com.br/taxa-provimento — dados reais, paywall, receita
MÉDIO:   Comunidade · Perfis de ministros · Alertas de julgamento
LONGO:   Apostas em resultados · Notificações · Direito não é chato
```

**Metodologia do índice de taxa de provimento (decisão de 02/04/2026):**

OPÇÃO ESCOLHIDA: Taxa individual calculada sobre o universo histórico de cada ministro.
Média do grupo calculada sobre o total agregado de todos os ministros.

Razão: o advogado quer saber "com esse relator, qual é minha chance?" — a resposta
é a taxa histórica do ministro no período disponível, independente do tempo de tribunal.

OPÇÕES DESCARTADAS:
- Média simples sobre todos os dados: distorcida pelo tempo e volume de cada ministro
- Média só sobre período comum: perde 7 anos de dados quando Zanin entrou em 2023
- Ajuste por tempo de tribunal: análise acadêmica, não produto

DEFINIÇÃO DA MÉDIA DO GRUPO:
Calculada sobre o total agregado — soma de todos os providos / soma de todos os
julgamentos de todos os ministros. É o mesmo método que o STF usa no painel oficial.
Cores dos cards: dourado = acima dessa média, vermelho = abaixo.

NOTA METODOLÓGICA (para publicação futura):
"A taxa de cada ministro é calculada sobre o universo total de decisões colegiadas
de mérito no período disponível (2016–2025). A média de referência é calculada sobre
o conjunto agregado, não por período comum, para preservar a integridade histórica
de cada perfil decisório. Ministros com menor tempo de tribunal têm amostras menores
mas taxas igualmente válidas dentro do universo disponível."
(Medina, 2026 — metodologia JUDX/ICONS)

**Mecânica das bets JudX — o que o usuário aposta:**
- Como um ministro específico vai votar em um julgamento
- Em qual dos 3 filtros o processo vai ficar ou ultrapassar:
  1. Admissão pela Presidência (ARE passa ou não?)
  2. Julgamento de mérito pela Turma (chega lá?)
  3. Provimento (ganha?)
- Odds calculadas com base no histórico real de 2,9M de decisões — não opinião agregada

**Referências para o modelo de prediction markets:**
- **Kalshi** (kalshi.com) — maior prediction market regulado dos EUA, bilionária brasileira fundadora. Inspecionar: UX de criação de mercados, como apresentam probabilidades, estrutura de contratos.
- **Polymarket** (polymarket.com) — maior prediction market descentralizado (crypto). Inspecionar: como exibem odds, resolução de contratos, liquidez.
- **O que aprender deles para o JudX:** como transformar probabilidades históricas em odds navegáveis, como apresentar "mercados" de julgamentos, como gamificar sem perder seriedade, modelo de resolução (quem decide o resultado?).
- **Diferencial JudX vs Kalshi/Polymarket:** eles fazem política/economia/esportes com dados externos. O JudX faz direito com dados proprietários de 2,9M de decisões — as odds são calculadas com base em histórico real, não em opinião agregada.

---

## 12. POST LINKEDIN — PENDENTE

**Tom aprovado:** não é "nós contra eles". Não é antagonismo. É curiosidade — "aqui está o que os dados mostram e ninguém havia mostrado assim antes."

**Contexto para o post:** Damares publicou no JOTA em dez/2024 que a marIA é caixa-preta. Agora tem os dados que revelam o que a marIA usa internamente mas não publica. O JudX não é contra a marIA — é o avesso dela. A marIA serve o tribunal. O JudX serve quem litiga.

**Dados para usar no post:**
- Taxa geral STF: 5,6% (2026) — número que existe mas esconde tudo
- RE: 17,1% · ARE: 1,2% · diferença de 14×
- Taxa do RE subindo: 14,6% (2010) → 24,7% (2025)
- A chave: transformar ARE em RE é estratégia, não sorte

**Rascunho ainda não aprovado** — reescrever com voz de pesquisadora que ilumina, não de produto que ataca.

---

## 13. SCRAPER PORTAL STF

- Script: `run_scraper.py` — rodando (Startup Windows)
- Range: incidentes 5.073.030 → 7.600.000
- Config segura: batch=750, throttle=0,2s, cooldown=90s
- ~15K+ processos recuperados
- Regras: User-Agent obrigatório · UTF-8 · >200 chars = processo real

---

## 14. O QUE NÃO FAZER

- ❌ Expor nota metodológica da v_provimento_merito — diferencial competitivo
- ❌ Publicar "RE Criminal 24,3%" sem investigar o campo "Indicador Criminal"
- ❌ Tom antagonista no LinkedIn — não é contra o STF/marIA
- ❌ Scraping agressivo no STF → bloqueio
- ❌ Pipeline ontológico como fonte de decisões — descartou 976K
- ❌ Subir dados no Supabase antes de auditoria completa
- ❌ `Vercel:deploy_to_vercel` — não funciona
- ❌ Abrir PJ no Brasil agora
- ❌ Citar obras da Damares nos artigos que ela escreve
- ❌ `published_objects` tem dados — está vazio

---

## 15. ARTIGOS ACADÊMICOS

| Artigo | Idioma | Status | Regra |
|--------|--------|--------|-------|
| The Extractive Litigating State | EN | Em desenvolvimento | JudX → "STF's Corte Aberta panel" |
| Imagina que o Brasil é uma casa grande | PT | Em desenvolvimento | Mesmas regras |
| Circuitos de Enforcement | PT | Planejado | Foco pós-dados |
| Direito Vegetal Autônomo (DVA) | PT | Rascunho completo | Stone, Krenak, Pachamama |

---

## 16. PRÓXIMOS PASSOS ORDENADOS

**Urgente — receita:**
- [ ] Recuperar documentos → Revolut Business → Stripe produção
- [ ] Payment Link produção no .env.local
- [ ] Post LinkedIn (tom: iluminar, não atacar)

**Produto:**
- [ ] Design da página /taxa-provimento (Camadas 1, 2, 3 pendentes)
- [ ] Segunda feature: taxa por classe (RE vs ARE) com os dados do Qlik
- [ ] Investigar "Indicador Criminal" antes de publicar segmentação por matéria

**Dados:**
- [ ] Scraper terminar → reconstruir audit CSVs com NI substituído
- [ ] Subir para Supabase SÓ APÓS auditoria completa

**ICONS:**
- [ ] Pipeline de publicação (published_objects vazio)
- [ ] Edges semânticos do grafo

**STJ (médio prazo):**
- [ ] Mapear stj_temas (1.420 temas) à CF/88
