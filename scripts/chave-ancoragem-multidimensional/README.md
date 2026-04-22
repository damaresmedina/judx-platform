# 🔑 Chave de Ancoragem Multidimensional

**Canonizada em**: 19/abr/2026
**Conceito da Damares**: cada pulso decisório do corpus é ancorado em **múltiplas dimensões simultaneamente** — ator (relator) × forma (órgão) × tempo (data) × estrutura (regimento) — e a **chave** é o script que resolve essa ancoragem cruzando raw + seed temporal + linha decisória do processo.

## Dimensões da chave

| Dimensão | Fonte | O que ancora |
|---|---|---|
| **ator** | `stf_judx_norm.csv` → `relator_canonico` | quem decidiu |
| **forma** | `composicao_ministerial.csv` → `codigo_orgao` | onde decidiu (órgão regimental) |
| **tempo** | `composicao_ministerial.csv` → `valid_from` + `valid_to` | quando a composição era vigente |
| **estrutura** | `composicao_ministerial.csv` + Regimento | qual órgão existia e com que competência |
| **linha decisória do processo** | `stf_judx_norm.csv` → `origem_decisao` + `orgao_julgador` | o que o próprio processo declarou |
| **conferência** | cruzamento dimensão 2 × dimensão 5 | validação interna |

## Os dois scripts

### `1_ancorar_decisoes_via_seed.py`

Consome:
- `C:\Users\medin\Desktop\backup_judx\resultados\stf_judx_norm.csv` (3,76M linhas de decisões normalizadas)
- `C:\Users\medin\projetos\judx-platform\scripts\seeds-tribunais\composicao_ministerial.csv` (seed temporal)

Produz:
- `2026-04-19_judx_decision_ancorado.csv` (1 linha por decisão, com `orgao_julgador_ancorado` derivado)
- `2026-04-19_judx_case_ancorado.csv` (1 linha por processo, agregado)

Motor: DuckDB (JOIN temporal via `valid_from <= data_decisao AND (valid_to IS NULL OR valid_to >= data_decisao)`).

### `2_conferir_ancoragem_vs_origem.py`

Aplica regras de conferência cruzando `orgao_julgador_ancorado` (dimensão forma via seed) com `origem_decisao` (linha decisória declarada pelo processo). Classifica cada decisão em:

- **confere** — ancoragem bate com o declarado pelo processo
- **inconsistente_turma** — seed diz TURMA_1, processo diz 2ª TURMA (ou vice-versa) → sinaliza problema de relator, troca de turma não registrada ou erro no raw
- **sem_ancoragem** — relator não encontrado no seed para a data da decisão
- **nao_classificado** — origem_decisao não mapeada

Produz:
- `2026-04-19_judx_decision_com_conferencia.csv` (colunas completas + `confere_origem_decisao`)
- `2026-04-19_inconsistencias_ancoragem.csv` (amostra de 50k inconsistências para inspeção)

## Resultados primeira execução (19/abr/2026, STF 2,93M decisões)

| Resultado | n | % |
|---|---:|---:|
| confere | 2.097.953 | **71,49%** |
| sem_ancoragem | 745.281 | 25,40% |
| inconsistente_turma | 87.588 | 2,98% |
| nao_classificado | 3.853 | 0,13% |

**Principais causas de SEM_ANCORAGEM** (745k):
- 541k com relator "PRESIDENTE" genérico — precisa mapeamento no seed por período
- 123k com "*NI*" (não informado)
- 30k com MOREIRA ALVES (pré-corpus parcialmente)
- Restantes 51k: ministros com grafia divergente entre raw e seed (acentos, espaços)

## Próximos refinamentos

1. Adicionar ao seed linhas canônicas de "PRESIDENTE (em exercício)" mapeadas por biênio
2. Normalizar acentos no match (Damares = DAMARES = "DAMARES")
3. Incluir STJ quando seed STJ for validado contra portal oficial
4. Repetir para demais tribunais (task #21)

## Regra canônica

Esta é a **chave** da ancoragem multidimensional: sempre que houver necessidade de derivar o órgão julgador real de um pulso decisório, a rota é:

```
raw (ator + data) → seed temporal (forma via valid_from/valid_to) → conferência com linha decisória do processo
```

Nenhum outro método substitui. Registrado em DECISOES_CANONICAS.md.
