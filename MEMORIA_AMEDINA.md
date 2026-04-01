# MEMORIA_AMEDINA — Estado atual
**Atualizado em: 01/abr/2026**

---

## O projeto

### JudX — Sistema Observacional do Comportamento Judicial Brasileiro
- **O que é**: plataforma de dados e análise de padrões decisórios do STF e STJ. Observa não-decisão, coalizões, recirculação temática, taxa de provimento.
- **Onde está**: `C:\Users\medin\projetos\judx-platform`
- **Stack**: Next.js 16 + React 18 + TypeScript + Tailwind CSS
- **Banco**: Supabase PostgreSQL (projeto `ejwyguskoiraredinqmb`)
- **Deploy**: Vercel — https://judx-platform.vercel.app
- **Repo**: https://github.com/damaresmedina/judx-platform
- **Stripe**: configurado (test mode), Payment Link R$ 97/mês, página `/taxa-provimento` com paywall

### ICONS — Cartografia do Contencioso Constitucional
- **O que é**: mapeamento de decisões do STF ancoradas na CF/88. Grafo ontológico de objects + edges.
- **Onde está**: `C:\projetos\icons`
- **Banco**: Supabase (projeto `hetuhkhhppxjliiaerlu`)
- **Deploy**: Vercel — https://icons.org.br (icons-cartografia)
- **Repo**: https://github.com/damaresmedina/icons-cartografia
- **Dados**: 252.481 objects, 473.853 edges, 7.766 ancoragens normativas
- **Regra**: JudX e ICONS **nunca se misturam** — dados, código e infra completamente separados

### PROJUS — Projeto Justiça Aberta
- **O que é**: guarda-chuva institucional do ICONS e JudX
- **Site**: https://projus.github.io/icons/
- **Instituição**: Instituto Constituição Aberta (ICONS)

---

## Estado atual do banco JudX (01/abr/2026)

### Tabelas com dados

| Tabela | Linhas | Descrição |
|---|---|---|
| stf_decisoes | 169.851 | Raw Corte Aberta + ministro_real, orgao_decisorio, ambiente_unificado |
| stf_universal | 169.851 | 40 cols — tabela de auditoria cruzada |
| stf_partes | 856.416 | Partes via portal API (117.814 incidentes) |
| judx_decision | 225.404 | Decisões normalizadas (kind, result, session_environment) |
| judx_case | 139.737 | Processos normalizados |
| stj_decisoes_dj | 207.720 | STJ diário de justiça |
| stf_processos | 21.181 | Subset processos |
| stj_fases | 46.174 | Fases processuais STJ |
| stj_partes | 18.332 | Partes STJ |
| stj_contramostra | 3.902 | Contraste STJ (CKAN + Datajud) |
| stj_universal | 6.411 | STJ universal |
| stj_temas | 1.420 | Temas repetitivos |
| judx_subject | 3.364 | Assuntos normalizados |
| stj_precedentes_temas | 2.295 | Precedentes por tema |
| stj_processos_semente | 2.539 | Processos-semente |
| v_provimento (view) | 140.899 | Decisões classificadas provido/não provido (2016-2025) |

### Tabelas de referência
stf_composicao_temporal (92), judx_judge (95), judx_procedural_class (343), judx_organ (15), judx_court (2), cnj_estatisticas (16), fiscal_* (5 tabelas)

### Tabelas vazias (35+)
processo_no, processo_string_evento, processo_ancoragem, stf_partes_completo, judx_decisional_dna, judx_counsel, judx_litigant, judx_case_litigant, judx_decision_line, judx_judgment_environment_event, judx_judgment_regime, judx_relator_prevalence, judx_text_inference, judx_emergent_taxonomy, entre outras.

**O banco tem ~7% da base real** (169K de 2.927.525 decisões). Ingestão completa aguarda auditoria final.

### Dados locais (HD) — a base real

| Dataset | Linhas | Local |
|---|---|---|
| Decisões STF (Corte Aberta) | 2.927.525 | `Downloads\stf_decisoes_fatias\` (27 CSVs, 1.525 MB) |
| Partes STF (Corte Aberta) | ~2.194.195 processos | `Downloads\stf_partes_fatias\` + `stf_partes_20XX.xlsx` |
| Partes Portal (scraper) | ~21.277+ (em andamento) | `Desktop\backup_judx\resultados\partes_portal_FINAL.csv` |
| Pipeline processo_no | 2.927.525 | `Downloads\stf_pipeline_local\processo_no.csv` (969 MB) |
| Pipeline string_evento | 3.753.307 | `Downloads\stf_pipeline_local\processo_string_evento.csv` (791 MB) |
| Master consolidado | 2.927.525 | `Downloads\stf_master\3_master_completo.csv` (2.3 GB) |
| Basicos ponte | 1.813.780 | `Downloads\stf_master\1_basicos_ponte.csv` (174 MB) |
| Audit por ano | 2.927.525 | `Desktop\backup_judx\resultados\audit_por_ano\` (27 CSVs) |
| Relatores corrigidos | 2.927.525 | `Desktop\backup_judx\resultados\decisoes_relator_corrigido\` (27 CSVs) |
| STJ Datajud | 2.646.620 | `projetos\judx-backup\stj_datajud_20XX.csv` (578 MB) |
| Base normativa | 5.915 artigos | `Desktop\backup_judx\resultados\base_normativa_codigos_2026-03-29.csv` |
| HTML bruto partes | ~21K+ arquivos | `Desktop\backup_judx\resultados\html_raw_partes\` |

### Pendências do banco
1. **Scraper de partes em andamento** — varrendo incidentes 5.073.030→7.600.000 (~9 dias ETA)
2. 35+ tabelas ontológicas vazias — aguardando ingestão após auditoria
3. stf_decisoes tem 169K, não 2.9M — ingestão completa pendente
4. Faixas de incidentes 1→1.405.086 (pré-2000) e 2.699.257→3.698.186 ainda não varridas

---

## Decisões tomadas (e por quê)

### ministro_real em vez de relator_atual
- **O quê**: Criamos coluna `ministro_real` que resolve "MINISTRO PRESIDENTE", "VICE-PRESIDENTE" e "*NI*" para o nome do ministro que efetivamente decidiu
- **Por quê**: 663.504 decisões (22,7%) tinham relator genérico. A composição temporal do STF permite mapear quem era presidente/vice na data da decisão.
- **Como**: Tabela `stf_composicao_temporal` com períodos de cada presidente/vice. Join por data_decisao.
- **Resultado**: 100% dos relatores identificados, 0 não resolvidos.

### Partes via portal STF em vez de Corte Aberta
- **O quê**: A Corte Aberta marca *NI* (Não Informado) para polo ativo/passivo a partir de 2018 (~88-99% *NI*)
- **Por quê**: Limitação da fonte — a Corte Aberta parou de expor polos. Advogados continuam (86%).
- **Como**: Scraper em `abaPartes.asp?incidente={N}` do portal STF. Retorna dados reais.
- **Resultado parcial**: 21K+ processos recuperados com 99,5% polo ativo preenchido.

### Pipeline ontológico local em vez de banco
- **O quê**: 2.927.525 decisões processadas em CSVs locais, não no Supabase
- **Por quê**: O plano Supabase tem limites. Processar 2.9M localmente é instantâneo.
- **Resultado**: processo_no.csv (969 MB) + processo_string_evento.csv (791 MB)

### Audit dos originais em vez do pipeline
- **O quê**: Os 27 CSVs de audit usam os CSVs originais da Corte Aberta, não o pipeline ontológico
- **Por quê**: O pipeline descartou 976K decisões durante processamento. Os originais têm 2.927.525 completos.

### Scraper com batch+cooldown em vez de contínuo
- **O quê**: 750 requests → 90s pausa → repete
- **Por quê**: O WAF do STF bane após ~860 requests contínuos com 0.2s throttle. Batch+cooldown = zero bans.
- **Limite descoberto**: ~860 requests por sessão a 3.4 req/s.

### View v_provimento para a página de taxa
- **O quê**: View SQL que classifica descricao_andamento em provido/nao_provido/parcial/nao_conhecido
- **Por quê**: A página /taxa-provimento consulta via PostgREST (Supabase API). View = query pré-definida, sem lógica no frontend.
- **Cobertura**: 140.899 decisões classificadas (2016-2025)

---

## Scripts/queries que funcionaram

### Scraper de partes do portal STF
```
# Local: Desktop\backup_judx\resultados\run_scraper.py
# Lançar:
python run_scraper.py
# Config: batch=750, throttle=0.2s, cooldown=90s
# Auto-restart: scraper_permanente.bat no Startup do Windows
# Monitorar: wc -l partes_portal_FINAL.csv + cat cp_final.txt
```

### Download Corte Aberta via Qlik Engine API
```
# Local: Downloads\download_corte_aberta.py
# Método: GET mashup → Cookie X-Qlik-Session → wss:// → Engine API → /tempcontent/
# App ID: 023307ab-d927-4144-aabb-831b360515bb
# Obj Decisões: UbMrYBg | Obj Partes: pRRETQ
```

### Correção de relatores (composição temporal)
```sql
-- Presidentes STF mapeados por período (stf_composicao_temporal)
-- Join: data_decisao entre inicio e fim do mandato
-- 663.504 corrigidos, 0 não resolvidos
-- CSVs em: Desktop\backup_judx\resultados\decisoes_relator_corrigido\
```

### View v_provimento
```sql
CREATE VIEW v_provimento AS
SELECT
  COALESCE(ministro_real, relator_atual) AS relator,
  ramo_direito,
  SPLIT_PART(assunto, ' | ', 1) AS assunto_principal,
  SUBSTRING(data_decisao FROM '\d{4}$')::int AS ano,
  CASE
    WHEN descricao_andamento ILIKE '%provido%' AND descricao_andamento NOT ILIKE '%não provido%' THEN 'provido'
    WHEN descricao_andamento ILIKE 'procedente' THEN 'provido'
    WHEN descricao_andamento ILIKE 'concedida%' THEN 'provido'
    WHEN descricao_andamento ILIKE '%não provido%' THEN 'nao_provido'
    WHEN descricao_andamento ILIKE 'improcedente%' THEN 'nao_provido'
    WHEN descricao_andamento ILIKE 'embargos rejeitados%' THEN 'nao_provido'
    WHEN descricao_andamento ILIKE 'denegada%' THEN 'nao_provido'
    WHEN descricao_andamento ILIKE '%em parte%' THEN 'parcial'
    WHEN descricao_andamento ILIKE '%não conhecido%' THEN 'nao_conhecido'
    ELSE NULL
  END AS categoria_provimento
FROM stf_decisoes
WHERE subgrupo_andamento IN ('Decisão Final', 'Decisão em recurso interno')
  AND SUBSTRING(data_decisao FROM '\d{4}$')::int >= 2016;
-- Resultado: 140.899 decisões classificadas
```

### Encoding do portal STF
```python
# Portal declara ISO-8859-1 mas conteúdo real é UTF-8
# CORRETO:
content = r.content.decode('utf-8', errors='replace')
# ERRADO:
r.encoding = 'utf-8'  # não funciona
```

### Lançar processo detached no Windows
```python
import subprocess, os
subprocess.Popen(
    [r'C:\...\python.exe', r'C:\...\run_scraper.py'],
    stdout=open(r'C:\...\scraper_log.txt', 'a'),
    stderr=subprocess.STDOUT,
    creationflags=0x00000008 | 0x00000200,  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    env={**os.environ, 'PYTHONIOENCODING': 'utf-8'},
)
```

---

## Próximos passos confirmados

### Em andamento
1. **Scraper partes portal STF** — varrendo 5.122.737→7.600.000 (~21K recuperados, ETA ~9 dias)

### Quando scraper terminar
2. Cruzar partes_portal_FINAL.csv com decisões (incidente→processo via basicos_ponte)
3. Rodar scraper para faixa 1→1.405.086 (processos pré-2000)
4. Rodar scraper para faixa 2.699.257→3.698.186 (gap intermediário)
5. Passe 2: buscar abaInformacoes nos encontrados (assunto, data, UF)
6. Reconstruir audit CSVs substituindo *NI* por dados reais do portal

### Montagem final
7. Reprocessar pipeline ontológico com relatores corrigidos + ambiente corrigido
8. Gerar CSVs finais para auditoria humana

### Subir para Supabase (SÓ APÓS AUDITORIA)
9. Ingerir 2.927.525 decisões com ministro_real
10. Ingerir partes completas do portal
11. Popular tabelas ontológicas (processo_no, processo_string_evento)

### Pendências gerais
- [ ] www.judx.com.br — CNAME no Registro.br
- [ ] Ementas STF
- [ ] LOA DPU via SIOP
- [ ] Ancoragem STJ×códigos
- [ ] Paper Circuitos de Enforcement — escrita

---

## Estado do ICONS (01/abr/2026)

| Tabela | Registros |
|---|---|
| objects | 252.481 |
| edges | 473.853 |

- Protocolo ontológico v9, Constituição Ontológica congelada (25/mar/2026)
- 4 páginas: index, cartografia_stf, oscilacao_jurisprudencial, zipper
- Base normativa: 5.915 artigos de 17 códigos
- Emenda 01: dupla ancoragem (normativa + processual)

---

*Este arquivo é a memória persistente do projeto. Atualizar ao final de cada sessão de trabalho.*
