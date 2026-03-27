# JudX Platform — Instruções para o Claude Code

## OBRIGATÓRIO A CADA INÍCIO DE SESSÃO

Ao iniciar qualquer conversa neste projeto, SEMPRE execute nesta ordem:

1. Leia este arquivo `CLAUDE.md`
2. Leia `STATUS.md` — contém timeline, estado dos bancos, processos, achados e próximos passos
3. Rode `node scripts/bom-dia.mjs` — diagnóstico automático de bancos, processos em background, sites e logs. Reporte o resultado para a usuária como "estado atual".
4. Leia `SCHEMA_REFERENCE.md` — estrutura completa de TODAS as tabelas, fontes e APIs. **NUNCA perguntar a estrutura dos dados.** Está tudo ali.
5. Leia `PROTOCOLO_JUDX.md` (protocolo canônico, atualmente v1.1)
6. Consulte as memórias `user_producao_academica.md` e `feedback_voz_autoral_damares.md`
7. Carregue as skills em `skills/` e o cookbook em `skills/judx-query/queries-cookbook.md`
8. **A cada query ou análise**: salve o resultado automaticamente em CSV na pasta `Desktop\backup_judx\resultados\` com nome descritivo e data. A usuária precisa de cópia local auditável de TUDO.
9. **Ao final da sessão**:
   - Atualize `STATUS.md` com o que foi feito e os próximos passos
   - **ACUMULE** novos achados no `DIARIO_ACHADOS.md` — NUNCA sobrescrever, só adicionar ao final com data e sessão. Cada achado inclui: dado, fonte, proxy usado, limitação.
   - Salve compilado em Excel em `Desktop\backup_judx\`

O `STATUS.md` é a memória viva do projeto. Sempre leia antes de começar, sempre atualize antes de terminar. O `bom-dia.mjs` é o diagnóstico rápido — não substitui o STATUS.md, complementa com dados live.

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
