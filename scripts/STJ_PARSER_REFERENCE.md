# STJ HTML Parser Reference

## URL Pattern
```
https://processo.stj.jus.br/processo/pesquisa/?termo={NUMERO}&aplicacao=processos.ea&tipoPesquisa=tipoPesquisaGenerica&chkordem=DESC&chkMorto=MORTO
```

## HTML Structure for Partes (inside div#idDetalhesPartesAdvogadosProcuradores)

```html
<div class="classDivLinhaDetalhes">
    <span class="classSpanDetalhesLabel">AGRAVANTE:</span>
    <span class="classSpanDetalhesTexto">
        <a href="/processo/pesquisa/?parteNome=NOME&...">NOME DA PARTE</a>
    </span>
</div>
<div class="classDivLinhaDetalhes">
    <span class="classSpanDetalhesLabel">ADVOGADO:</span>
    <span class="classSpanDetalhesTexto">
        <a href="/processo/pesquisa/?advogadoNome=NOME&...">NOME - OAB</a>
    </span>
</div>
```

## Parsing Rules
- Labels (papel): AGRAVANTE, AGRAVADO, RECORRENTE, RECORRIDO, IMPETRANTE, IMPETRADO, AUTOR, REU, ADVOGADO, PROCURADOR
- Advogados have OAB after " - " (e.g., "DAMARES MEDINA COELHO - DF014489")
- Partes and advogados are grouped: first comes the parte, then its advogados below, until the next parte
- Polo ativo: AGRAVANTE, RECORRENTE, IMPETRANTE, AUTOR, REQUERENTE
- Polo passivo: AGRAVADO, RECORRIDO, IMPETRADO, REU, REQUERIDO

## Additional Data Available
- Processo: span#idSpanClasseDescricao (e.g., "AREsp no 2971391 / SP")
- Registro: span#idSpanNumeroRegistro (e.g., "(2025/0230443-8)")
- Relator: classSpanDetalhesLabel "RELATOR(A):" -> classSpanDetalhesTexto
- Ramo do Direito: classSpanDetalhesLabel "RAMO DO DIREITO:"
- Tribunal de Origem: classSpanDetalhesLabel "TRIBUNAL DE ORIGEM:"
- Autuacao: classSpanDetalhesLabel "AUTUACAO:"

## Cloudflare Bypass
- Portal blocked by Cloudflare Turnstile (no cookies, no headless bypass)
- Solution: FlareSolverr via Docker (docker run -p 8191:8191 ghcr.io/flaresolverr/flaresolverr)
- Table: stj_partes (same schema as stf_partes + polo column)

## Target
- 6,411 processos STJ (2,509 sementes + 3,902 contramostra)
- Search by numero column from stj_processos_semente and stj_contramostra
