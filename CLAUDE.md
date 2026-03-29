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
