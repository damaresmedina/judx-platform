# judx-fillgap — Auditoria de gap Datajud + fillgap automático

## Quando usar

Sempre que precisar **validar a completude do raw local** de qualquer um dos 90 endpoints Datajud/CNJ, e eventualmente **preencher gaps** detectados. Usa o método canonizado no STJ em 20/abr/2026 (decisão canônica #30).

Gatilhos típicos:
- "rodar auditoria no TJMG" · "bater gap TJSP" · "fechar gap de todos os gigantes"
- Pós-extração de qualquer tribunal, antes de dar a coleta por "completa"
- Período após mudanças no scraper ou suspeita de perdas silenciosas

## Princípio empírico (por que existe)

A paginação `search_after` do Datajud com sort único (`@timestamp`) produz **perdas silenciosas** por race em boundary quando há timestamps repetidos. O Elasticsearch reordena internamente docs com mesmo valor, e o cursor progride saltando registros. Detectado no STJ: gap de **10.910 docs / 0,32%** sobre 3.390.010.

**Correção canônica** (ratificada em `DECISOES_CANONICAS.md` #30):
```
sort: [{"@timestamp": "asc"}, {"id.keyword": "asc"}]
```
Tiebreak com `id.keyword` força determinismo por documento. **A ⊇ raw**, A − raw = docs que estavam faltando. Zero descarte: nada do raw original é mexido — o repass é **somado** em pasta paralela `<SIGLA>_repass_A/` e deduplicado por `_id` na carga DuckDB.

## Como invocar

```bash
node scripts/datajud-auditoria-gap.mjs <SIGLA> [SIGLA2 ...] [--dry-run]
```

### Exemplos
```bash
# Diagnostica E dispara fillgap se gap > 0
node scripts/datajud-auditoria-gap.mjs TJMG

# Só diagnóstico (não baixa nada extra)
node scripts/datajud-auditoria-gap.mjs TJMG --dry-run

# Múltiplos em série
node scripts/datajud-auditoria-gap.mjs TRF3 TRF4 TJRS

# Regra: sempre em série, nunca paralelo (evita estourar rate limit Datajud)
```

Siglas aceitas: **STJ, TST, TSE, STM** (superiores) · **TRF1-TRF6** · **27 TJs** · **TRT1-TRT24** · **TRE-AC...TRE-DFT** · **TJMMG/TJMRS/TJMSP**. Ver `datajud-scraper-orchestrator.mjs` para catálogo completo com totais esperados.

## O que o script faz (3 etapas)

1. **Universo Datajud** — `POST /<alias>/_search` com `{size:0, track_total_hits:true}` → `hits.total.value`
2. **IDs únicos no raw** — lê todos os `part-*.ndjson.gz` da pasta da sigla, coleta `_id` em um `Set`, retorna `size`
3. **Gap = universo − unique_raw**
   - `gap ≤ 0` → raw completo, nada a fazer
   - `gap > 0` sem `--dry-run` → dispara fillgap em `<raw>_repass_A/` com sort composto

## Outputs

| Arquivo | Conteúdo |
|---|---|
| `<raw>/_audit_gap.json` | Relatório: universo, raw_lines, raw_unique, gap, duração |
| `<raw>_repass_A/part-*.ndjson.gz` | Arquivos recuperados via fillgap (se disparado) |
| `<raw>_repass_A/manifest.json` | Manifesto do fillgap: mode, sort, total, duração |
| `<raw>_repass_A/checkpoint.json` | Checkpoint (retomável) |
| `<raw>_repass_A/errors.log` | Erros de request se houver |

## Tempos esperados por tribunal (ordem de grandeza)

Diagnóstico (contagem IDs únicos — CPU/IO local):
- STJ (3,4M docs, 3.400 arquivos): ~15min
- TJMG (35M docs, 35k arquivos): ~60min
- TJSP (72M docs, 72k arquivos): ~2h

Fillgap (coleta Datajud com throttle 100ms):
- Depende do tamanho do gap. STJ 10.910 docs = ~2h20min. Se o tribunal já está completo, fillgap não roda.

## Regras importantes

- **Nunca rodar paralelo** no mesmo Datajud — rate limit agressivo do CNJ
- **Não rodar fillgap** se raw ainda está em extração ativa (`checkpoint.done === false` no raw original) — esperar a primeira passada terminar
- **O fillgap é somatório, não substitutivo** — os docs novos ficam em pasta `_repass_A`; a carga final (DuckDB/Supabase) faz o dedup por `_id`. **Nunca apagar raw original.**
- **Preservação absoluta** — se o fillgap falhar no meio, o checkpoint permite retomar sem perda

## Ligação com outras memórias

- `DECISOES_CANONICAS.md` #30 (tiebreak obrigatório)
- `DECISOES_CANONICAS.md` #31 (`@timestamp` é reindex, não data do processo)
- `reference_regras_validacao_integridade.md` (6 checagens pós-carga)
- `feedback_search_after_tiebreak_obrigatorio.md`
- `feedback_principio_preservacao_absoluta.md`

## Anatomia do script

O `datajud-auditoria-gap.mjs` é **auto-contido** — traz inline o catálogo dos 90 endpoints (sigla → alias + category), as funções de fetch/paginação, o contador de IDs únicos e o fillgap com tiebreak. Não depende de nenhum outro script do repo (evita acoplamento com orchestrator em produção).

Alterações futuras (adicionar sigla nova, mudar política de throttle, etc.) ficam no próprio script. Se o catálogo estiver desatualizado, sincronizar com `datajud-scraper-orchestrator.mjs`.

## Histórico de aplicação

| Data | Sigla | Gap detectado | Fillgap? | Resultado |
|---|---|---|---|---|
| 20/abr/2026 | STJ | 10.910 (0,32%) | ✓ | fechou em 3.390.010 exatos |
| 21/abr/2026 | TJMG | 37.720 (0,107%) | ✓ em curso | raw: 35.359.000 uniques · universo: 35.396.720 · fillgap rodando em TJMG_repass_A |
| ... | ... | ... | ... | ... |

Atualizar esta tabela a cada nova aplicação.
