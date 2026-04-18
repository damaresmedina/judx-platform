# Scripts de análise DuckDB — para leitura e cruzamento de dados Datajud

Esta pasta contém scripts SQL que rodam localmente em DuckDB (Camada 2 da arquitetura de 3 camadas). Nenhum deles toca o Supabase — todos operam sobre arquivos locais em `G:\datajud_raw\`.

## O que cada script faz (em linguagem simples)

### `01-carregar-endpoints-concluidos.sql` — o leitor

**O que faz**: abre os arquivos compactados dos tribunais que o scraper já baixou (em `G:\datajud_raw\nivel_*\`) e os organiza numa tabela única local chamada `docs`.

**O que aparece na tela quando roda**:
- Tabela com totais do universo (quantos registros, quantos endpoints, quantos processos únicos, quantos eventos).
- Quantos registros têm `numero_processo` nulo ou com tamanho diferente de 20 (sinais de corrupção — devem ser zero).
- Quantos registros por tribunal.

**Onde o resultado fica**: arquivo único em `C:\Users\medin\staging_local\analise_trilhas.duckdb` (portável, pode ser copiado para outro computador).

**Por que é o primeiro**: todos os outros scripts leem dessa tabela. Sem o leitor, não tem o que analisar.

**Política de carga**: tudo como texto cru (VARCHAR). Nenhum campo é inferido automaticamente. Isso protege contra corrupção silenciosa do `numero_processo` (que tem 20 dígitos e estoura qualquer inteiro).

---

### `02-catalogo-strings.sql` — o catálogo de processos multi-tribunal

**O que faz**: conta quantos processos apareceram em quantos tribunais (endpoints). Identifica os casos em que o mesmo `numero_processo` está registrado em mais de um endpoint — cada um desses casos é uma **trilha multi-jurisdição** (a string atravessou o sistema).

**O que aparece na tela**:
- Distribuição: quantos processos ficam em 1 endpoint só, quantos em 2, quantos em 3+.
- Os pares de tribunais que mais compartilham processos (ex: STJ × TJSP — strings que foram do TJSP para o STJ via REsp).
- As combinações de níveis (N2 → N1, N4 → N1, etc.) mais frequentes.

**Pra que serve**: dar a primeira foto empírica de como as strings atravessam o sistema. Antes dele, só temos números isolados de cada endpoint; depois dele, vemos a trilha.

---

### `03-trilha-do-processo.sql` — a biografia de um processo

**O que faz**: mostra a vida inteira de UM processo específico — todos os registros dele, em todos os tribunais, ordenados no tempo. Precisa passar o `numero_processo` como parâmetro.

**O que aparece na tela**:
- Parte A: lista dos tribunais por onde o processo passou, com data e órgão julgador.
- Parte B: a sequência de movimentos (a trilha inteira), ordenada por data.
- Parte C: o tempo entre cada movimento (detecta períodos de paralisação, sobrestamento).

**Pra que serve**: investigar casos específicos. Quando aparece um processo interessante (pela classe, pelo ator, pelo assunto), usa este script para ver a biografia real.

---

### `04-tipologia-trilhas.sql` — classificação de trilhas

**O que faz**: classifica os processos em quatro tipos conforme o total de movimentos:
- **curta** (<10 movimentos): nasceu e morreu rápido
- **normal** (10-100): rito típico com 1-2 recursos
- **longa** (100-1000): processo problemático
- **patológica** (1000+): anomalia institucional

**O que aparece na tela**:
- Contagem de processos em cada tipo.
- Top 10 mais patológicos (com número, tribunais que atravessou, total de movimentos, duração).

**Pra que serve**: localizar onde estão as trilhas patológicas — potenciais casos emblemáticos para estudos aprofundados (ex: o processo no TRF5 com 267 mil movimentos).

---

## Ordem recomendada

1. Roda o **leitor (01)** para organizar os arquivos.
2. Roda o **catálogo (02)** para ver a foto geral das trilhas.
3. Quando um processo chamar atenção, usa a **biografia (03)** para investigá-lo.
4. Roda a **tipologia (04)** para classificar o corpus inteiro.

**IMPORTANTE**: os scripts 02, 03 e 04 só funcionam depois que o script 01 foi rodado. Se o arquivo `C:\Users\medin\staging_local\analise_trilhas.duckdb` ainda não existe, começar pelo 01.

## Como rodar cada script

```
C:\Users\medin\tools\duckdb\duckdb.exe "C:\Users\medin\staging_local\analise_trilhas.duckdb" -f "C:\Users\medin\projetos\judx-platform\scripts\duckdb-analise\01-carregar-endpoints-concluidos.sql"
```

Troca `01-...sql` pelo nome do script que quer rodar. O CLI do DuckDB executa o arquivo SQL inteiro e imprime os resultados na tela.

## O que NÃO fazer

- **Nunca passar dados das análises para o Supabase automaticamente** — apenas após validação humana consciente, como tabela-produto pronta (Camada 3). A regra das 3 camadas é para proteger o banco de produção.
- **Nunca modificar os arquivos em `G:\datajud_raw\`** — eles são raw imutáveis (Camada 1). Os scripts só leem.
- **Nunca remover registros com `numero_processo` repetido** achando que são duplicatas — são **manifestações diferentes da mesma string em tribunais distintos** (zero dedupe).

## Referência cruzada

- `..\datajud-scraper-orchestrator.mjs` — gera os arquivos que o leitor (01) consome.
- Memórias: `feedback_principio_preservacao_absoluta.md`, `feedback_arquitetura_3_camadas_17abr.md`, `feedback_nunca_dedupar_datajud.md`.
- Notas técnicas: `2026-04-17_NOTA_TECNICA_numeracao_cnj_tpu_dado_puro.md` para a política de carga pura.
- Catálogos: `reference_endpoints_datajud.md`, `reference_campos_datajud.md`, `reference_regras_validacao_integridade.md`.

## Bug pendente

O script `01-carregar-endpoints-concluidos.sql` foi corrigido em 17/abr (versão 2) para usar carga pura (todos os campos como VARCHAR, `_source` como JSON). A versão anterior falhava quando o DuckDB tentava interpretar `dataAjuizamento` como timestamp ISO. A versão atual não tem esse bug, mas só foi testada em amostra — validação completa depende de rodar contra os 18 endpoints concluídos da Fase 1 quando ela fechar.
