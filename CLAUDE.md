# JudX Platform — Instruções para o Claude Code

## QUEM É A USUÁRIA

**Damares Medina** — pesquisadora (15+ anos STF), advogada, professora IDP, Visiting Scholar Bicocca-Milano.
- Livros: Amicus Curiae (2010), Repercussão Geral no STF (2015, Saraiva), Manual do Contencioso Constitucional (em produção 2026)
- Papers centrais: "The Extractive Litigating State", "Fiscal Risk Constitutionalism", "The Litigating State", "Economia Política da Litigância", "Circuitos de Enforcement"
- Teses: (1) 79% STF sem mérito (2) ~90% STJ sem mérito (3) litigiosidade é do Estado (4) virtual concentrou poder sem deliberação (5) litígio é tecnologia de governo (6) cortes alocam risco fiscal
- **NÃO é programadora**: executar e reportar RESULTADOS. Pode mostrar código quando relevante. NUNCA pedir para rodar query — fazer direto.
- **Estilo**: direta, monitora de perto, quer resultados. Prefere ação a explicação.

### Voz Autoral (para textos acadêmicos)
- Frase densa em camadas, proposição + aposto/subordinada. Contenção — elegância de precisão, não de floreio
- Dado → interpretação → implicação institucional → ressalva ou paradoxo. NUNCA abandone o leitor diante de um número
- 1ª do plural ("propomos", "constatamos"). Marcadores: "Nesse sentido", "Isso porque", "Contudo", "Em que pese"
- Manual completo: `Desktop/infoprodutos/manual da voz autoral dm.docx`

### Rigor Empírico
- NUNCA inferir além dos dados. Número sem fonte/período/amostra/limitação = proibido
- Correlação ≠ causalidade. "O corpus mostra" (fato) ≠ "isso sugere" (interpretação) ≠ "isso poderia indicar" (hipótese)
- Ao redigir papers: apresentar dados e leituras possíveis — a autora decide o argumento

## INÍCIO DE SESSÃO

- O **hook bom-dia** já roda `bom-dia.mjs` automaticamente em saudações. **NÃO** duplicar: não rodar o script de novo, não ler STATUS.md para o briefing.
- Ler `SCHEMA_REFERENCE.md` e `PROTOCOLO_JUDX.md` apenas **quando precisar** (query, extração, análise) — não no início.
- Ler memórias, skills e cookbook apenas **quando relevantes** para a tarefa pedida.
- **A cada query/análise**: salvar resultado em CSV em `Desktop\backup_judx\resultados\` com nome descritivo e data.
- **Ao final da sessão**: atualizar `STATUS.md`, acumular achados no `DIARIO_ACHADOS.md`, salvar compilado em Excel.

## Projeto

JudX é um sistema observacional do comportamento institucional do direito brasileiro.
- **Objeto**: padrões decisórios de STF e STJ
- **Stack**: Next.js 16 + React 18 + TypeScript + Tailwind CSS
- **Banco**: Supabase PostgreSQL (projeto `ejwyguskoiraredinqmb`)
- **Deploy**: Vercel (judx-platform.vercel.app)
- **Repo**: github.com/damaresmedina/judx-platform

## Skills Disponíveis

As skills estão em `skills/` e devem ser consultadas automaticamente:

| Skill | Pasta | Quando usar |
|---|---|---|
| **judx-query** | `skills/judx-query/` | Qualquer query SQL, análise de banco, verificação de dados |
| **judx-extract** | `skills/judx-extract/` | Extração de dados STF/STJ, pipelines, CKAN, Datajud |
| **judx-report** | `skills/judx-report/` | Gerar relatórios Word/PDF |
| **icons-deploy** | `skills/icons-deploy/` | Deploy icons.org.br |
| **judx-deploy** | `skills/judx-deploy/` | Deploy judx-platform |
| **judx-history** | `skills/judx-history/` | Buscar em conversas anteriores |

## Bancos de Dados

```
JudX:  postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres
ICONS: postgresql://postgres:RHuQvsf4shpsPRjP@db.hetuhkhhppxjliiaerlu.supabase.co:6543/postgres
```

**REGRA ABSOLUTA**: JudX e ICONS são projetos completamente separados. Nunca compartilham dados, código ou infraestrutura.

## Estrutura do Projeto

```
judx-platform/
├── CLAUDE.md                    ← Este arquivo
├── PROTOCOLO_JUDX.md            ← Protocolo canônico (v1.1)
├── skills/                      ← Skills do Claude Code
│   ├── judx-query/SKILL.md
│   ├── judx-extract/SKILL.md
│   ├── judx-report/SKILL.md
│   ├── icons-deploy/SKILL.md
│   ├── judx-deploy/SKILL.md
│   └── judx-history/SKILL.md
├── scripts/                     ← Pipelines de extração
│   ├── run-stf-pipeline-fast.mjs
│   ├── fetch-stf-partes-safe.mjs
│   ├── fetch-stj-temas.mjs
│   ├── fetch-stj-rede-minima.mjs
│   ├── stj-contramostra-pipeline.mjs
│   └── stj-contramostra-datajud.mjs
├── logs/                        ← Logs de pipelines em background
├── app/                         ← Next.js App Router
├── src/lib/                     ← Utilitários
├── public/                      ← Landing pages
└── supabase/migrations/         ← Migrações SQL
```

## Corpus Atual (27/03/2026)

| Tabela | Registros | Status |
|---|---|---|
| stf_decisoes | 169.851 | Completo |
| judx_case | 139.737 | Completo |
| judx_decision | 224.887 | Completo |
| stf_partes | ~140K+ | Em extração |
| stj_temas | 1.420 | Completo |
| stj_processos_semente | 2.509 | Completo |
| stj_contramostra | 3.902 | Completo |

## Regras de Trabalho

1. **NUNCA criar nada sem confirmação explícita** — perguntar antes
2. **Deploy só com confirmação** — nunca push/deploy automático
3. **JudX e ICONS nunca se misturam** — dados, código, infra separados
4. **NUNCA mexer no repo projus/icons** — sempre usar damaresmedina/*
5. **Usar nomenclatura ICONS** para o banco ICONS (registro_jurisprudencial, ancora_normativa, etc.)
6. **Protocolo mais recente** — atualmente PROTOCOLO_JUDX.md v1.1
7. **Conteúdo > design** — rigor das informações sempre acima do design
8. **Queries via node + pg** — arquivo tmp em C:\projetos\icons\, rodar, deletar
9. **A usuária NÃO é programadora** — executar e reportar resultados. Pode mostrar código quando relevante. NUNCA pedir para copiar/colar/recortar/anexar/rodar comandos.
10. **Backup automático** — salvar cada resultado em CSV/Excel em `Desktop\backup_judx\resultados\`
11. **NUNCA sobrescrever** — sempre acumular informação (append, não overwrite)
12. **Autonomia incremental** — pode aplicar melhorias sem perguntar. Confirmar antes: tabelas novas, deploy, push, decisões sobre argumento acadêmico
13. **Ao reiniciar** — salvar estado exato no STATUS.md, retomar automaticamente na próxima sessão

## Fronteiras do Banco de Dados

REGRA ABSOLUTA: cada tabela tem uma fronteira declarada.
Nunca alterar sem autorização explícita da Damares.

### CAMADA 0 — BRUTO (HD local, nunca sobe para Supabase)
Localização: C:\Users\medin\Desktop\bkp\
- 27 CSVs Corte Aberta (2,9M decisões, 2000–2026)
- partes_portal_FINAL.csv e arquivos do scraper
- Arquivos fiscais originais (STN, RFB, BCB)
REGRA: nunca modificar. nunca deletar. nunca subir para Supabase direto.
É o arquivo histórico do projeto. Se precisar usar, copiar primeiro.

### CAMADA 1 — STAGING (entrada controlada)
Tabelas com sufixo _staging ou prefixo stage_
REGRA: dados novos chegam AQUI primeiro, nunca direto em produção.
Fluxo obrigatório:
  1. Dado novo → tabela _staging
  2. Claude Code verifica: duplicatas, sobreposição, qualidade
  3. Claude Code gera relatório para a Damares
  4. Damares aprova
  5. Só então migra para produção
NUNCA pular essa etapa. NUNCA inserir dado novo direto em FONTE ou NÚCLEO.

### CAMADA 2 — FONTE (somente leitura após ingestão aprovada)
- stf_decisoes (194k) — decisões STF brutas do crawler
- stf_processos (21k) — metadados de cabeçalho
- stf_partes (1,28M) — partes do scraper portal
- stj_decisoes_dj (203k) — fonte bruta STJ
REGRA: SELECT permitido. INSERT/UPDATE/DELETE proibido sem
autorização explícita e documentada da Damares.

### CAMADA 3 — NÚCLEO (verdade oficial do produto)
- stf_universal — tabela-mãe, normalizada e auditada
- stf_partes_completo — destino final das partes (aguarda scraper)
- stf_composicao_temporal — composição ministerial auditada
- ministro_tribunal, orgao_julgador, tribunal, classe_processual
- taxonomia_nao_decisao, mapeamento_origem_decisao
- stj_universal, stj_temas, stj_partes, stj_fases
REGRA: alterações só com script versionado em /scripts
e confirmação explícita da Damares. Nunca editar diretamente.

### CAMADA 4 — PRODUTO (recalculável, serve o front-end)
- risco_processual — recalcular quando corpus mudar
- resultado_empirico — atualizar após auditoria aprovada
- auditoria_corpus_strings — cache estático dos números do hero
REGRA: podem ser apagadas e recriadas. Sempre fazer backup antes.

### CAMADA 5 — DESENVOLVIMENTO (não alimenta produto)
- stf_partes_favoraveis, stf_amostra_partes — amostras de teste
- judx_decision (225k), judx_case (139k) — ingestão piloto incompleta
  (technique, effective_environment, unanimity_signal = 100% nulos)
REGRA: não usar em queries de produção. não popular sem decisão
documentada. limpar antes de nova ingestão judx_*.

### CAMADA 6 — RESERVADO (schema definido, dados ausentes)
- Todas as judx_* vazias (judx_litigant, judx_ecology, etc.)
- processo_no, processo_ancoragem, processo_string_evento
- organizations, alerts
REGRA: não popular sem decisão explícita da Damares.
Existem como intenção de arquitetura futura.

---

## Nulos esperados — não são erros

Ao inspecionar o banco, os seguintes nulos são normais e conhecidos:
- stf_partes.oab: 57% nulo — correto, só advogados têm OAB
- stf_universal.polo_ativo/passivo: 79–86% nulo — partes ficam
  em stf_partes, não aqui
- stf_universal.ambiente_julgamento: 85% nulo — limitação das
  Resoluções STF 642/2019 e 669/2020, campo não preenchido antes
  de 2020
- judx_decision.technique/effective_environment/unanimity_signal:
  100% nulo — piloto incompleto, esperado
- judx_case.filed_at: 100% nulo — piloto incompleto, esperado
NÃO tentar corrigir esses nulos sem instrução da Damares.
NÃO tratar como problema a resolver automaticamente.

---

## Fluxo de entrada de dados novos

Toda vez que houver dado novo para entrar no banco:

1. VERIFICAR origem: de qual fonte veio? Corte Aberta, scraper
   portal, Qlik, Datajud?
2. SALVAR bruto: guardar CSV original em
   C:\Users\medin\Desktop\bkp\ com nome e data
3. STAGING primeiro: carregar em tabela _staging, nunca direto
4. RELATÓRIO: gerar para a Damares mostrando:
   - quantos registros novos
   - quantos já existem (duplicatas)
   - quantos têm campos críticos vazios
   - sobreposição com o que já está em produção
5. AGUARDAR aprovação da Damares antes de qualquer migração
6. DOCUMENTAR: registrar no DIARIO_ACHADOS.md o que entrou,
   quando, de qual fonte e quantos registros
