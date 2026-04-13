# JUDX_INDEX — Estado do Banco em 13/04/2026

> Leia este arquivo no início de cada sessão. Atualizar sempre que novos dados forem inseridos.

---

## 1. TABELAS COM DADOS REAIS (produção)

| Tabela | Registros | Período | Completude | Observação |
|--------|-----------|---------|------------|------------|
| `stf_master` | 2.927.525 | 2000–2026 | 100% campos críticos | Fonte: Corte Aberta STF. Relator, orgão, tipo_decisao, andamento, uf_origem, ramo_direito todos 100% preenchidos |
| `stf_master_premium` | 2.927.525 | 2000–2026 | — | Campo `observacao_andamento` — extensão de stf_master |
| `processo_linha_decisoria` | 2.927.914 | 2000–2026 | — | Visão de linha decisória por incidente |
| `vida_do_processo` | 2.212.761 | — | — | Até 5 decisões por incidente, estruturado em colunas |
| `judx_decision` | 2.927.525 | — | PARCIAL | `technique`, `effective_environment`, `unanimity_signal` = 100% nulos (piloto incompleto) |
| `judx_case` | 2.212.761 | — | PARCIAL | `filed_at` = 100% nulo. Camada incompleta — não usar em produção |
| `judx_litigant` | 1.385.761 | — | — | Base de litigantes identificados |
| `stf_partes_completo` | 1.153.635 | — | CRÍTICO | Cobre apenas 52% dos incidentes do stf_master. Cobertura por ano desigual (ver seção 2) |
| `stf_partes` | **0** | — | **VAZIA** | Estrutura existe, sem dados |
| `stj_decisoes_dj` | 212.405 | — | — | Decisões STJ via Diário da Justiça |
| `ministro_card` | 35 linhas | — | — | Taxas por ministro × camada (relator_mono, turma, plenario, presidencia) |
| `risco_processual` | 445 | — | — | 445 combinações tipo_parte × relator × ramo |
| `serie_historica_tribunais` | 86 | 1940–2025 | STJ distribuídos ausentes | STJ distribuídos não têm série — PDFs no HD local |
| `datajud_sobrestados_cef` | 52 | — | — | Sobrestados CEF no DataJud |
| `stf_composicao_temporal` | 122 | 1891–2026 | — | Presidências STF com observações/discursos |
| `stj_temas` | ~1.420 | — | — | Temas repetitivos STJ |

---

## 2. COBERTURA CRÍTICA: PARTES POR ANO

**Problema:** `stf_partes_completo` cobre apenas 52% dos incidentes.

| Ano | Processos master | Com partes | Cobertura |
|-----|-----------------|----------:|----------:|
| 2017 | 113.068 | 103.880 | 91,9% ✓ |
| 2018 | 109.672 | 104.777 | 95,5% ✓ |
| 2019 | 97.585 | 40.701 | 41,7% ⚠ |
| 2020 | 79.985 | 6.721 | 8,4% ✗ |
| 2021 | 80.866 | 3.327 | 4,1% ✗ |
| 2022 | 74.970 | 2.307 | 3,1% ✗ |
| 2023 | 84.174 | 3.339 | 4,0% ✗ |
| 2024 | 90.921 | 3.015 | 3,3% ✗ |
| 2025 | 91.820 | 2.443 | 2,7% ✗ |
| 2026 | 23.055 | 634 | 2,7% ✗ |

**SOLUÇÃO DISPONÍVEL:** xlsx de partes 2017–2026 entregues (~1,02M linhas).
Estrutura: Processo, Polo ativo, Polo passivo, Advogado polo ativo, Advogado polo passivo.
Aguardando aprovação para inserção em `stf_partes`.

---

## 3. PRESENÇA DA CAIXA ECONÔMICA FEDERAL (xlsx, pré-inserção)

| Ano | Polo ativo | Polo passivo |
|-----|----------:|-------------:|
| 2017 | 170 | 629 |
| 2018 | 22 | 26 |
| 2019 | 135 | 339 |
| 2020 | 7 | 12 |
| 2021 | 7 | 13 |
| 2022 | 2 | 4 |
| 2023 | 2 | 6 |
| 2024 | 0 | 2 |
| 2025 | 0 | 0 |
| 2026 | 149 | 354 |
| **TOTAL** | **494** | **1.385** |

Normalização necessária: múltiplas variações de nome identificadas.
Com inserção + normalização + cruzamento com stf_master: perfil completo da Caixa
(classes, relatores, resultados, UF, ambiente) disponível para deck comercial.

---

## 4. TABELAS VAZIAS — POPULAÇÃO POSSÍVEL

### Com dados já no banco:
| Tabela | Fonte |
|--------|-------|
| `stf_partes` | xlsx 2017–2026 (aguardando inserção) |
| `judx_relator_prevalence` | stf_master + processo_linha_decisoria |
| `resultado_empirico` | Calculável do corpus atual |
| `judx_counsel` | stf_partes_completo.adv_ativo |

### Com fontes externas identificadas:
| Tabela | Fonte | Status |
|--------|-------|--------|
| `fiscal_custo_judiciario` | CNJ Justiça em Números | Não ingerido |
| `cnj_estatisticas` | CNJ Justiça em Números | Não ingerido |
| `serie_historica_tribunais` (STJ dist.) | PDFs relatórios STJ no HD | Bloqueado para fetch |

---

## 5. INCONSISTÊNCIAS CONHECIDAS

- `judx_*` com dados: campos analíticos centrais 100% nulos — não usar em produção
- `_tmp_decisoes_ministros` (334 MB): tabela temporária ainda em produção — limpar ou promover
- STF master e judx_decision têm os mesmos 2,9M registros em representações diferentes — `stf_master` é canônica
- `stf_partes` vazia enquanto `stf_partes_completo` tem 1,15M — nomenclatura confusa

---

## 6. O QUE O JUDX RESPONDE HOJE

**Para grandes litigantes (Caixa):**
- ✓ Taxa de sucesso por tipo de parte → `risco_processual`
- ✓ Perfil decisório por ministro → `ministro_card`
- ⚠ Processos da Caixa no STF → xlsx disponíveis, inserção pendente
- ✗ Perfil regional da Caixa → depende da inserção

**Para o observatório:**
- ✓ Série histórica 1940–2025 → `serie_historica_tribunais`
- ✓ Ambiente virtual vs presencial → `stf_master.meio_processo`
- ✓ Presidência como filtro → `stf_master` where orgao_julgador = 'PRESIDÊNCIA'
- ✓ Evolução por ministro → `ministro_card` + `stf_master`

---

## 7. PRÓXIMAS AÇÕES (por prioridade)

**P0 — Desbloqueiam reunião Caixa:**
1. Inserir xlsx partes 2017–2026 → `stf_partes` (aprovação necessária)
2. Normalizar nomes Caixa + extrair perfil completo
3. Cruzar com stf_master (relator, resultado, UF, ambiente)

**P1 — Observatório:**
4. Ingerir CNJ Justiça em Números → `fiscal_custo_judiciario`
5. STJ distribuídos via PDFs do HD

**P2 — Infraestrutura:**
6. Script de atualização automática stf_master via Corte Aberta (aprovação necessária)
7. Limpar `_tmp_decisoes_ministros`

---

## 8. ATUALIZAÇÃO AUTOMÁTICA — CORTE ABERTA STF

URL: `https://transparencia.stf.jus.br/extensions/decisoes/decisoes.html`
Atualização: diária ~06h. Download CSV disponível.
**Status:** ingestão manual. Script automático não implementado.
**Precisa:** cron que baixa CSV, compara por `id_fato_decisao`, insere delta.

---

*Gerado em 13/04/2026 · judx-platform · ejwyguskoiraredinqmb*
