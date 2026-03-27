# Diário de Achados — JudX/ICONS
**Arquivo acumulável — nunca sobrescrever, só adicionar ao final**

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
