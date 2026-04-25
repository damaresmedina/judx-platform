# STJ Flat Canônico — 25/abr/2026

Pipeline definitivo do flat STJ. Saída: `G:/staging_local/stj_flat_canonical.duckdb` (5,13 GB).
Espelho dos resultados em Supabase (9 tabelas v2/canonical).

## Pipeline em ordem

| Script | Função | Entrada | Saída |
|---|---|---|---|
| `inventario_codigos_raw_stj.py` | Lista todos os códigos do raw | flat atual | `inventario_movimentos.csv` (239), `inventario_complementos_tabelados.csv` (84 pares) |
| `extrair_composicao_pdfs_v4.py` | Parser dos 18 PDFs históricos com detecção dinâmica de colunas | `composicao_pdfs/*.pdf` | `composicao_stj_canonical_v4.csv` |
| `limpar_v6_e_aliases.py` | Remove lixo do parser, consolida aliases | v4-v6 | `composicao_stj_canonical_v6_limpa.csv` + `stj_alias_ministros.csv` |
| `importar_seed_antigo_safe.py` | Importa entradas históricas pré-2015 do seed antigo | seed `composicao_ministerial.csv` | `composicao_stj_canonical_v7.csv` |
| `consolidar_v7_final.py` | Aplica TRUNCADOS_KNOWN unificado | v7 | v7 consolidado, alias dedup |
| `construir_dicionario_stj_v10.py` | Categoriza 239 códigos (TPU CNJ + STJ próprio) | inventário movimentos | `dicionario_stj_canonico_v10.csv` (99,98% volume) |
| `build_stj_flat_canonical.py` | Pipeline único: monta o flat canônico | flat atual + 5 fontes | `stj_flat_canonical.duckdb` |
| `patches_pos_build.py` | 4 patches: flag_consistente, flag_pre_2015, drop temp, eventos | flat canônico | flat canônico patched |
| `refinar_e_finalizar.py` | Refina consistência (multi-órgão legítimo) + tabelas-resultado | flat canônico | flat canônico final |
| `exportar_para_supabase.py` | Exporta 9 tabelas em CSV | flat canônico | `upload_supabase/*.csv` |
| `popular_supabase_canonical.py` | Upload via REST API | CSVs | 9 tabelas no Supabase |

## Tabelas finais no Supabase (25/abr/2026)

| Tabela | Linhas | Conteúdo |
|---|---|---|
| `stj_composicao_temporal_v7` | 1.697 | Fotografias dos 18 PDFs + seed histórico |
| `stj_alias_ministros` | 108 | nome_raw → ministro_key (87 ministros únicos) |
| `stj_dicionario_movimentos` | 239 | Categorias TPU CNJ + STJ próprio (99,98% cobertura) |
| `stj_eventos_ministros` | 351 | POSSE_STJ + TRANSITO + APOSENTADORIA por ministro |
| `stj_composicao_gaps_canonical` | 117 | Gaps explícitos do cruzamento processos × canônico |
| `stj_taxa_anual_v2` | 9.036 | Taxa por ano × turma × resultado (cat v10) |
| `stj_ministros_metricas_v2` | 170 | Métricas agregadas por ministro × turma |
| `stj_tribunal_origem_resultado_v2` | 19.567 | Origem (TJ/TRF/UF) × resultado |
| `stj_matriz_ministro_macro_v2` | 52.290 | Matriz ministro × macro × resultado |

## Conceito-chave: ministro_key

Todas as queries fazem JOIN por `ministro_key` (sem acentos, UPPER, consolidado). A tabela
`stj_alias_ministros` resolve cada `nome_raw` (do Datajud ou dos PDFs) → 1 chave canônica.

## Fontes raw (imutáveis)

- `G:/datajud_raw/nivel_1_anteparos/STJ/` — 3.380 JSONLs, 3.379.100 docs
- `G:/staging_local/stj_consolidado.duckdb` — tabela `stj_datajud_core_v2_20abr`
- 18 PDFs históricos em `Desktop/backup_judx/flat_stj_20260424/exports/composicao_pdfs/`

## Cobertura final do flat

- 3.390.010 processos, 100% com `ministro_key`
- 77.956.196 pulsos, 100% categorizados pelo dicionário v10
- 87,85% dos processos com `orgao_esperado` têm `flag_consistente_orgao = TRUE`
- Restantes 12% são casos legítimos (presidente julga turma, membro CE julga turma origem) ou
  ministros aposentados pré-2015 sem cobertura de PDF (gap estrutural conhecido)
