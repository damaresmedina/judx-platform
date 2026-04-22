# seeds-tribunais — estrutura canônica do universo JudX

**Criado em**: 19/abr/2026 — task #21 (Damares aprovou fazer para TODOS os tribunais)

## Conceito

Cada tribunal do sistema judiciário brasileiro é um **nó institucional** com estrutura decisória **pré-existente** (definida pelo Regimento Interno, não inferida dos dados). Esta pasta consolida essa estrutura em 4 arquivos CSV canônicos.

## Ancoragem temporal (crítico)

**Toda linha de todo seed tem `valid_from` + `valid_to`**. A ancoragem é *pulsar*, não *estado* — um ministro atravessa múltiplos órgãos ao longo da carreira (ingressa na T2, migra pra T1, promove a Corte Especial, assume Presidência por biênio, aposenta). **Cada período = uma linha nova**, com `ordem_historico` crescente.

Consulta canônica no acoplamento:
```
dado (relator, data_pulso):
  SELECT codigo_orgao FROM composicao_ministerial
  WHERE ministro_nome_canonico = relator
    AND data_pulso BETWEEN valid_from AND COALESCE(valid_to, now())
```

O mesmo vale para `estrutura_orgaos` (Turmas podem ser reorganizadas por Emenda Regimental) e `regras_competencia` (CPC/73 → CPC/15 mudou quem decide o quê).

```
seeds-tribunais/
├── tribunais.csv                  — 92 tribunais (STF + 91 Datajud)
├── estrutura_orgaos.csv           — órgãos internos de cada tribunal
├── composicao_ministerial.csv     — ministro → órgão + data_início/fim
├── regras_competencia.csv         — classe × tipo_movimento → órgão esperado
└── README.md                      — este arquivo
```

## Como encaixa com o raw

```
(pulso decisório do raw Datajud) ← tem relator + data + classe + tipo_movimento
             +
(regras_competencia.csv) ← classe + tipo_movimento → órgão esperado (ex: TURMA)
             +
(composicao_ministerial.csv) ← relator + data → qual Turma específica
             =
ÓRGÃO JULGADOR REAL ancorado na estrutura regimental
```

## Estado de preenchimento (19/abr)

| Arquivo | Cobertura |
|---|---|
| `tribunais.csv` | **92/92** tribunais listados (completo) |
| `estrutura_orgaos.csv` | Superiores completos (STF, STJ, TST, TSE, STM) + modelo genérico para TRF/TRT/TRE/TJ/TJM (preencher variações regimentais) |
| `composicao_ministerial.csv` | STJ 36 linhas (rascunho a validar contra página institucional) · STF 30 ministros via backup local (a vincular a órgãos) · demais pendentes |
| `regras_competencia.csv` | STJ ~20 regras principais · STF ~11 regras · demais pendentes |

## Plano de preenchimento por ondas

1. **Onda 1 (HOJE)**: 5 superiores (STF, STJ, TST, TSE, STM) — estrutura + composição + regras
2. **Onda 2**: 6 TRFs — variações regimentais entre regiões
3. **Onda 3**: 24 TRTs — estrutura comum + variações
4. **Onda 4**: 27 TREs — estrutura padrão
5. **Onda 5**: 27 TJs — cada com Regimento próprio (o mais trabalhoso)
6. **Onda 6**: 3 TJMs estaduais

## Fontes autoritativas

- **STF**: `stf_composicao_temporal` (banco) + stf.jus.br/institucional + backup local
- **STJ**: stj.jus.br/Institucional/Composicao + Resoluções STJ no DJe
- **TST**: tst.jus.br/composicao + Resoluções TST
- **TSE, STM**: sites institucionais + lei orgânica
- **Demais**: Regimentos publicados pelos próprios tribunais

## Uso no acoplamento

Quando o script de acoplamento dos pulsos rodar:
1. Para cada pulso decisório do raw, extrair (relator, data, classe, tipo_movimento)
2. Consultar `regras_competencia.csv` para saber o órgão esperado
3. Se órgão = TURMA, consultar `composicao_ministerial.csv` para o relator na data → Turma específica
4. Resultado: pulso ancorado no órgão real da estrutura regimental

Isso **substitui** a tentativa anterior de derivar órgão do campo `orgaoJulgador` do raw — que só traz estado administrativo atual, não o órgão julgador histórico.
