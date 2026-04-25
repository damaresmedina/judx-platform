# Diário de Achados — JudX/ICONS
**Arquivo acumulável — nunca sobrescrever, só adicionar ao final**

---

## 22/03/2026 — Sessão 7d948a64 (Dia 1: Fundação)

### ICONS — Schema e seed inicial
- Schema SQL criado: cf_titulos, cf_capitulos, cf_artigos, cf_vinculos, stf_decisoes
- Seed da CF/88: 9 títulos, 33 capítulos, 250 artigos CF + 138 ADCT
- Seed de decisões: 5.209 decisões únicas do STF (da CF comentada)
- 9.014 citações totais (decisões × dispositivos) → 5.209 decisões únicas
- Fonte: `constituição comentada stf.docx`
- Parsing tratou lixo: "1ªTDJde" = órgão grudado com data DJ → separado via regex
- Regra aprendida: nunca descartar dado com parsing sujo — limpar e preservar

### ICONS — Primeira visualização
- Cartografia STF (12 painéis) gerada a partir do banco
- Paleta: navy #1a2744, gold #d4a017, paper #f5f0e8
- Tipografia: Playfair Display + DM Mono + DM Sans

---

## 22-23/03/2026 — Sessões 8a869472 + 73c8ef4a (Extração)

### STF — Download de ementas via API
- API: jurisprudencia.stf.jus.br/pages/search
- Rodadas: 5+ batches de 500
- Problema: classes como HC/RHC em segredo de justiça → retry infinito
- Solução: priorizar por classe (controle concentrado primeiro), batches curtos
- Relator null em casos famosos (ADPF 378 MC, relator Fachin) → preencher do banco
- Deploy: projus.github.io/icons + GitHub Pages

---

## 24/03/2026 — Sessão e47b70c7 (Arquitetura JudX — 128 msgs)

### Decisão arquitetural: JudX separado do ICONS
- JudX = comportamento institucional (STF + STJ)
- ICONS = ancoragem constitucional (STF → CF/88)
- Bancos separados, código separado, infra separada
- Comunicação futura via signal_emitter (não implementado)

### JudX — Setup
- Supabase: ejwyguskoiraredinqmb
- GitHub: damaresmedina/judx-platform
- Vercel: judx-platform.vercel.app
- Stack: Next.js 16 + React 18 + TypeScript + Tailwind

### ICONS — Dupla ancoragem (Emenda 01)
- Cada decisão ancorada no artigo da CF E tem identidade própria
- Nomenclatura definida: registro_jurisprudencial, ancora_normativa, etc.
- Schema v9 com 9 entidades, 3 camadas

---

## 25/03/2026 — Sessões 59b1eeaa + a2e0d6c5 (Limpeza ICONS — 312+118 msgs)

### ICONS — Banco resetado e repopulado
- Protocolo ontológico v9 congelado
- CONSTITUICAO_ONTOLOGICA.md definida como lei fundamental
- 954 artigos com fronteiras vazadas corrigidos via espelho misto v9
- Banco ICONS limpo e repopulado com schema correto
- Deploy: ontologia.html, protocolo_v9.html

### ICONS — Ponte para JudX
- Script ponte_stj.py: replicação do ICONS para o JudX
- Direção: sempre inversa (ICONS → JudX, nunca o contrário)
- "Colonizar" o JudX com dados do ICONS

---

## 26/03/2026 — Sessões c47ff0fd + 042a2736 + 53feee6f + 5008ee07 (Pipeline STF)

### JudX — Schema reformulado
- DROP + CREATE de todas as tabelas judx_*
- 40+ tabelas criadas (judx_case, judx_decision, judx_court, etc.)
- Tabelas raw: stf_decisoes, stf_processos, stf_partes
- PROTOCOLO_JUDX.md v1.0 criado (13 seções, princípios epistemológicos)

### STF — Corte Aberta carregada
- 169.851 decisões carregadas de arquivos Excel em C:\projetos\judx\STF\
- Arquivos: 7 planilhas .xlsx com decisões 1988-2026
- Colunas: processo, classe, orgao_julgador, relator, data_decisao, descricao_andamento, etc.
- Fonte: portal Corte Aberta do STF

### Pipeline normalização iniciado
- run-stf-pipeline-fast.mjs: normaliza stf_decisoes → judx_case + judx_decision
- Batch de 500, keepalive 30s, log persistente
- Problema: 2 instâncias simultâneas causaram deadlock → resolvido matando duplicata
- Solução: SAVEPOINT por batch + retry

### Extração de partes iniciada
- fetch-stf-partes-safe.mjs: portal.stf.jus.br/processos/abaPartes.asp
- Rate limit conservador: 3 concurrent, 400ms delay, pausa 60s/500req
- IP tinha sido bloqueado (429) → desbloqueou após ~12h
- Teste 1.000 incidentes: 7.792 partes, 0 erros, 4.5 req/s

### Landing pages
- Landing PT e EN do JudX criadas
- Deploy judx-platform.vercel.app
- Landing ICONS PT copiada de projus.github.io/icons → icons.org.br

### STJ — Primeiras tentativas
- SCON bloqueado por Cloudflare (403)
- Portal pesquisa processual bloqueado (403)
- CKAN funciona (dadosabertos.web.stj.jus.br) — dados a partir de fev/2022
- Datajud API funciona (api-publica.datajud.cnj.jus.br) — todos os anos

---

## 27/03/2026 — Sessão e083e141

### STF — Não-decisão
- 79% das 169.851 decisões não apreciam mérito
- Corpus: Corte Aberta STF, 1988-2026
- Limitação: o corpus inclui decisões em andamento

### STF — Ambiente virtual e assessorização
- 99,5% das decisões colegiadas são virtuais (campo decisoes_virtual=true)
- 86,6% unanimidade (125.476 de 145.129 colegiadas)
- Semanas de pico: ~102 processos/ministro/semana (excluindo Presidente/Vice)
- Plenário Virtual RG: 41% unânime (único espaço com divergência real)
- Texto mediano: ~190 caracteres (estável 2016-2025)
- Decisões "Procedente" (mérito real): 1.162 chars vs Agravo não provido: ~190 chars

### STF — Divergência (série histórica)
- 2016: 24,4% | 2017: 16,3% | 2018: 16,9% | 2019: 13,2%
- 2020: 22,8% | 2021: 20,3% | 2022: **6,1%** | 2023: 14,0%
- 2024: 10,7% | 2025: 11,6%
- Proxy: presença de "vencido" em observacao_andamento de decisões COLEGIADAS + decisoes_virtual=true
- Limitação: "vencido" captura qualquer ministro vencido, não necessariamente o relator

### STF — Contrafactual Marco Aurélio
- Delta: apenas 1,1pp em 2020-2021 (22,8% → 21,7% sem ele)
- Conclusão: a anomalia 2020-2021 NÃO é explicável por um único ministro
- A anomalia 2022 (6,1%) permanece inexplicada pela composição

### STF — Ministros vencidos (no texto da decisão)
- Marco Aurélio: 8.451 | Mendonça+Nunes (juntos): 2.520 | Fachin: 1.146
- Gilmar: 840 | Dino: 606 | Moraes: 411
- Proxy: regex em observacao_andamento para "vencido(a) o(a) Ministro(a) X"
- Limitação: captura o ministro nomeado como vencido, não todos os que votaram contra

### STF — Bloco Mendonça+Nunes
- Votam juntos em 67% das vezes (2.520 de ~3.750)
- 62% das derrotas são em Processual Penal (2.323 decisões)
- Moraes é relator em 54% dos casos onde perdem (2.022)
- Série: 2021:128 → 2022:220 → 2023:1.833 → 2024:781 → 2025:715
- Limitação: "juntos" = ambos nomeados como vencidos na mesma decisão

### STF — Divergência por ramo
- Trabalho: 28,9% | Alta Complexidade/RG: 26,2% | Proc. Penal: 18,8%
- Previdenciário: 18,2% | Proc. Civil: 15,0% | Administrativo: 12,2%
- Tributário: 11,4% | Civil: 9,0%

### STF — Partes (extração completou nesta sessão)
- 117.814 incidentes com partes extraídas
- 856.416 partes no total
- Fonte: portal.stf.jus.br/processos/abaPartes.asp
- Fazenda Nacional: 1.648 aparições como parte

### STJ — Temas repetitivos
- 1.420 temas (0 erros), 77% com tese firmada, 257 com link STF
- Fonte: portal de repetitivos STJ (pesquisa.jsp), decodificação ISO-8859-1
- Por situação: trânsito 973, cancelado 190, afetado 113, julgado 90

### STJ — Velocidade por ramo
- Previdenciário: 421 dias | Proc. Civil: 419 | Tributário: 329 | Administrativo: 254
- Limitação: dias = data_julgamento - data_afetacao, apenas para temas com ambas as datas

### STJ — Tribunais de origem (sementes)
- TRF4: 388 (15,5%) | TJSP: 311 (12,4%) | TRF3: 251 | TRF5: 247 | TJRS: 214
- Fonte: stj_processos_semente, 2.509 processos, 96% com tribunal

### STJ — Taxa de não-decisão
- AREsp (75% do fluxo): 95% terminam sem mérito
- REsp: 70,9% sem mérito
- Fonte: 1 dia de metadados CKAN STJ (19/03/2026, 5.968 decisões)
- Limitação: amostra de 1 dia, pode não ser representativa

### ICONS — Ancoragem validada
- 7.766 edges ancora_normativa
- 100% source_id são registro_jurisprudencial
- Art. 5º lidera: 1.049 decisões (13,5% das ancoragens)
- Granularidade: até alínea

### Dados externos citados
- FIESP (jun/2023): tributação obstáculo #1, morosidade judiciária 15,7%
- Teto Decorativo (dez/2025): R$ 12,7 bi CCHA, R$ 3,8 bi extrateto 2025, 93% acima do teto

---

*Próxima sessão: adicionar novos achados ABAIXO desta linha, com data e identificador de sessão.*

## 22/04/2026 — Reconciliação canônica dos números da Caixa (deck privado)

### Incidente
A rota privada `/d/x8jv-amtw-4b3r` (proposta CEF) teve **três conjuntos de números diferentes** sob o mesmo rótulo "Caixa como ré" em sessões distintas do próprio Claude:
- DECK_CEF.md 13/abr: 1.396.265 pendentes · "1,4 milhão"
- HTML 14/abr: 954.243 pendentes · 543.450 novos
- HTML 22/abr: 625.174 pendentes · 444.422 novos

### Rastreamento (registro interno — 4 elementos)
- **Fonte**: CNJ Grandes Litigantes
- **Data**: fev/2026 (extração publicada pelo CNJ)
- **Amostra/filtro** testados:
  | Filtro aplicado | NOVOS | PEND LÍQUIDO |
  |---|---|---|
  | CNPJ 00360305, polo A (autora) | 98.322 | 327.175 |
  | CNPJ 00360305, polo P (ré) | 441.014 | 619.955 |
  | CNPJ 00360305, A+P total | 539.336 | 947.130 |
  | polo P expandido por nome (mapa_regional) | **444.422** | **625.174** |
  | pendentes bruto A+P (antes de deduzir suspensos) | — | 1.385.754 |
- **Limitação**: CSV do CNJ é snapshot fev/2026; não captura movimento intra-mês; expansão por nome absorve linhas com CNPJ inválido mas pode incluir entidades coligadas

### Diagnóstico
Não houve fontes diferentes. Foi **mesma fonte + filtros diferentes + mesmo rótulo**.
- Deck 14/abr: filtro A+P, rotulou "como ré" → **filtro errado para o label**
- Deck 22/abr: polo P expandido por nome → **filtro correto para o label**
- DECK 13/abr: pendentes bruto → **métrica diferente, não comparável**

### Canônico fixado — Caixa fev/2026
Para uso em qualquer material a partir de 22/04/2026:
- **Pendentes líquidos, Caixa como ré**: 625.174
- **Novos processos/ano, Caixa como ré**: 444.422
- **Fonte**: CNJ Grandes Litigantes · fev/2026
- **Arquivo canônico**: `Desktop\backup_judx\resultados\2026-04-13_cef_mapa_regional_completo.csv`
- **Filtro**: polo=P (passivo); expansão por nome "CAIXA ECONOMICA FEDERAL"
- **Limitação**: exclui Caixa como autora (98.322 novos / 327.175 pendentes)
- **Métrica alternativa explicitada** ("volume total da carteira, sem separar polo"): pendentes bruto 1.385.754 — rotular sempre como "carteira total", nunca como "ré"

### Regra consolidada
- **Material comercial (cliente vê)**: declarar só fonte + data
- **Registros internos (diário, memória, doc técnica)**: sempre os 4 elementos (fonte, data, amostra/filtro, limitação)
- Sem os 4 elementos registrados, nenhum número entra em material comercial
