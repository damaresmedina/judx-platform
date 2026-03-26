# PROTOCOLO_JUDX.md
**Versão 1.0 — 26/03/2026**
**Status: Canônico — referência para implementação, auditoria e evolução do sistema**

---

## I. O QUE O JUDX É

O JudX é um sistema observacional estratificado do comportamento institucional do direito brasileiro.

Seu objeto não são decisões isoladas. São os modos pelos quais decisões produzem, estabilizam, deslocam ou recirculam o vínculo jurídico — e os padrões institucionais que esse processo revela ao longo do tempo.

O JudX não é um buscador. Não é um sistema de previsão. Não é jurimetria no sentido estatístico convencional. É uma máquina de observação que torna visível a arquitetura pela qual o direito se estabiliza, se desloca ou se perpetua como conflito.

---

## II. HIPÓTESE CENTRAL

A adjudicação nos tribunais superiores brasileiros não deve ser observada apenas como produção de resultados, mas como arquitetura de vinculação e redistribuição de risco.

Em vez de simplesmente encerrar controvérsias, o sistema decisório brasileiro frequentemente posterga incerteza, desloca efeitos no tempo, recircula o mesmo tema por anos ou décadas e redistribui exposição ao risco por meio de técnicas decisórias, desenho institucional e baixa densidade de fechamento vinculante.

O corolário operacional: quando o sistema não estabiliza, ele não falha apenas — ele reorganiza o jogo, redistribuindo tempo, incerteza e vantagem.

**Contexto empírico:** A introdução da repercussão geral em 2007 reconfigurou o sistema contencioso constitucional brasileiro, transferindo poder decisório do STF para o STJ (+186% no volume do STJ entre 1988-2007 e 2008-2023). Esse deslocamento criou um condomínio da sindicância constitucional — STF e STJ exercendo jurisdição constitucional de forma cooperativa e interdependente. O JudX existe para tornar esse condomínio observável empiricamente.

---

## III. ARQUITETURA DO SISTEMA

### 3.1 Dois sistemas distintos, não integrados

O JudX coexiste com o ICONS (cartografia constitucional do STF), mas são sistemas independentes com ontologias radicalmente diferentes:

| | JudX | ICONS |
|---|---|---|
| Objeto | Comportamento institucional | Ancoragem constitucional |
| Tribunais | STJ + STF | STF |
| Ontologia | Comportamental — padrões decisórios | Topológica — ancoragem na CF/88 |
| DNA | Identidade institucional emergente | Texto constitucional |

Os bancos não se contaminam. Nenhum módulo do `judx-normalizer` conhece ou importa módulos do ICONS. A comunicação futura será via `signal_emitter` — módulo separado, não implementado na versão atual — que emite sinais de instabilidade constitucional para revisão humana no ICONS. Nunca ingestão automática.

### 3.2 Fluxo de dados — quatro camadas estritamente separadas

```
Camada 1: stj_* / stf_*     — dado bruto. Extrai e preserva. Nunca infere.
Camada 2: judx_*             — ontologia. Normaliza, infere, audita.
Camada 3: icons-mapper       — tradução. Converte judx → grafo semântico.
Camada 4: ICONS              — DNA semântico. Absorve padrões validados.
```

Regra absoluta: nenhuma camada conhece a camada seguinte além da imediata. `stj-sync.ts` só conhece a Camada 1. O `judx-normalizer` só conhece Camadas 1 e 2. O `icons-sync.ts` é a única ponte entre Camadas 2 e 4.

### 3.3 Isolamento por tribunal

O JudX usa um único Supabase com `court_id` como tenant e RLS por tribunal. STJ e STF coexistem no mesmo banco, isolados por política de segurança, com o mesmo schema `judx_*`. A heurística própria de cada tribunal emerge dos dados — não da estrutura. Cada tribunal desenvolve, ao longo do tempo, sua própria identidade observável.

---

## IV. PRINCÍPIOS EPISTEMOLÓGICOS

### Princípio I — Separação de camadas

O sistema opera sempre com três camadas separadas:

1. Dado bruto — preservado integralmente, imutável
2. Padrão emergente — inferido, graduado, auditável
3. Categoria analítica — provisória, reavaliável, tensionável

**Regra absoluta:** nenhuma categoria pode apagar ou sobrescrever o padrão que a originou. O dado bruto associado a cada inferência deve ser preservado.

### Princípio II — Não precedência da teoria

A teoria não deve preceder a aparição do padrão; deve acoplar-se a ele progressivamente. O schema completo pode existir desde o início. O povoamento e as inferências devem ser ativados em camadas sucessivas, na ordem do pipeline. Nem toda tabela pronta deve ser populada desde o primeiro ciclo.

### Princípio III — Incerteza explícita

Toda inferência preserva incerteza explícita. Campos obrigatórios em qualquer inferência relevante:

- `confidence_score` — grau de confiança (0.0 a 1.0)
- `evidence_count` — número de evidências que sustentam a inferência
- `contradiction_flag` — existência de contraevidência detectada
- `stability_flag` — estabilidade da inferência ao longo do tempo

A incerteza não é erro — é dado. O sistema não deve tratar indeterminação como ausência de resposta, mas como estado observável.

### Princípio IV — Anti-auto-referência

Nenhuma hipótese pode ser validada exclusivamente por dados gerados pelas próprias categorias do sistema. Mecanismos obrigatórios:

- `judx_inference_audit` — trilha auditável de cada inferência relevante
- `blind_mode` — execução sem camadas semânticas avançadas para detecção de distorção
- Registro obrigatório de contraevidência
- Leituras concorrentes permitidas para o mesmo fenômeno

### Princípio V — Inferência limitada e graduada

Toda inferência deve ser justificada, reversível, auditável e graduada. Nunca binária. Restrições epistemológicas configuráveis:

- `minimum_evidence_threshold` — número mínimo de casos para inferência relevante
- Consistência temporal — repetição ao longo do tempo
- Consistência cruzada — ocorrência em múltiplos órgãos, ambientes ou julgadores

### Princípio VI — DNA institucional dinâmico

Cada tribunal possui padrões próprios, mas esses padrões são dinâmicos, situados e instáveis. O JudX registra padrões de comportamento institucional como distribuições condicionais — sob determinadas condições, o tribunal apresenta padrão X com frequência Y — nunca como identidades fixas ou rótulos essencializados. O DNA deve ser continuamente reavaliado com novos dados e deve exibir variação por órgão, ambiente, relator e tema.

### Princípio VII — Erro visível

O JudX deve ser capaz de errar visivelmente. A exposição de limites, incertezas e contraevidências não é falha do sistema — é condição para produção de conhecimento confiável. O objetivo não é produzir respostas totalizantes, mas tornar observáveis os padrões, tensões, variações e limites do comportamento institucional.

---

## V. PIPELINE EM RESOLUÇÃO PROGRESSIVA

### 5.1 Modos de execução

O pipeline opera em quatro modos cumulativos. Cada modo ativa as camadas do modo anterior mais as suas próprias:

| Modo | Camadas ativas | O que faz |
|---|---|---|
| `core` | court, organ, case, decision, judge, procedural_class, subject, litigant | Organiza o dado real. Zero inferências complexas. |
| `events` | + judgment_regime, environment_event, environment_inference, rapporteur_outcome | Ativa parsers de ambiente e relatoria com evidência e confiança. |
| `patterns` | + latent_signal, unknown_pattern, collegial_context | Observa recorrências e padrões emergentes sem classificação rígida. |
| `advanced` | + decision_line, decisional_dna, situated_profile, emergent_taxonomy | Inferências densas apenas após validação das camadas anteriores. |

### 5.2 Ativação via API

```bash
# Primeiro ciclo — somente estrutura
GET /api/normalize-judx?mode=core&limit=100&dryRun=true

# Após validação do core
GET /api/normalize-judx?mode=events&limit=100

# Após validação dos events
GET /api/normalize-judx?mode=patterns

# Apenas após validação completa
GET /api/normalize-judx?mode=advanced
```

### 5.3 Estados de observação

Toda decisão entra no sistema com um `observation_state` atribuído pelo `decisionNormalizer`:

| Estado | Condição |
|---|---|
| `emergent` | Decisão sem tema recorrente detectado |
| `unstable` | `contradiction_flag = true` — conflito entre fontes de ambiente |
| `probable` | Ambiente de alta confiança (>= 0.88) sem contradição |
| `contested` | Múltiplos sinais latentes com domínios divergentes (>= 3) |
| `consolidated` | Reservado para modo `advanced` — nunca atribuído automaticamente nos modos anteriores |

---

## VI. CINCO DIMENSÕES DE OBSERVAÇÃO

O JudX observa simultaneamente:

**1. Estrutura** — casos, decisões, órgãos, julgadores, classes processuais, temas, litigantes

**2. Ambiente** — virtual vs presencial, destaque, trajetória decisória, transições de ambiente

**3. Posição** — relator, relator para acórdão, colegialidade material vs formal

**4. Anatomia da decisão** — ratio decidendi, obiter dictum, fragmentos argumentativos, núcleos vinculantes

**5. Dinâmica sistêmica** — estabilização, instabilidade, recirculação, custo da não estabilização

---

## VII. RECIRCULAÇÃO COMO FENÔMENO CENTRAL

A recirculação estrutural não é ruído estatístico — é sintoma institucional. O sistema deve detectar quando o mesmo tema retorna reiteradamente ao tribunal em diferentes processos, classes, órgãos, ambientes ou formulações, sem fechamento estável suficiente.

Sinais de recirculação observáveis:
- Múltiplos casos sobre mesmo tema normalizado ao longo do tempo
- Reiteração de controvérsia com variação de formulação mas mesmo núcleo
- Decisões reiteradas sem convergência clara de ratio
- Forte presença de modulação, prospectividade ou não retroatividade
- Coexistência de tese formal com persistência prática do litígio
- Frequentes mudanças de relator ou relator para acórdão
- Dispersão entre órgãos julgadores
- Alta incidência de ambiente virtual com baixa colegialidade material
- Reaparecimento do tema após suposta consolidação

**Pergunta central:** o sistema fecha controvérsias ou administra continuamente o conflito?

---

## VIII. COLEGIALIDADE MATERIAL

Colegiado não é presença formal de múltiplos julgadores — é produção efetiva de fundamentação plural. O JudX distingue colegialidade formal (múltiplos julgadores presentes) de colegialidade material (múltiplos julgadores com fundamentação substancial própria).

Quando apenas o relator produz fundamentação substancial e os demais apenas acompanham, o sistema sinaliza pseudo-colegialidade. Isso se articula com a clareza da ratio, a prevalência do relator e a recirculação estrutural do tema.

---

## IX. AUDITORIA DE INFERÊNCIA

Toda inferência relevante é registrada em `judx_inference_audit` com:

| Campo | Conteúdo |
|---|---|
| `hypothesis` | O que foi inferido e de onde |
| `empirical_base` | Base empírica que sustenta a hipótese |
| `textual_evidence` | Fragmento textual que disparou a inferência |
| `counter_evidence` | Contraevidência detectada ou `null` |
| `limitation` | Limitação conhecida da regra aplicada |
| `plausible_alternative` | Hipótese alternativa descartada |
| `rule_applied` | Regra ou padrão que gerou a inferência |
| `pipeline_layer` | Camada do pipeline onde ocorreu |
| `confidence_score` | Grau de confiança (0.0 a 1.0) |

O registro é append-only — cada inferência é um evento imutável. A trilha nunca é sobrescrita.

---

## X. GOVERNANÇA METODOLÓGICA

Toda decisão metodológica relevante é registrada em `judx_method_registry` com:

- Nome da regra
- Descrição e justificativa
- Camada do pipeline de aplicação
- Limitação conhecida
- Tipo de evidência exigida
- Status de ativação

O código não é apenas execução — é forma de argumentação. O pipeline deve ser legível, justificável, documentado e citável.

---

## XI. CRITÉRIO DE VALIDADE

O sistema é válido se consegue responder, com base empírica:

- Quando o sistema estabiliza
- Quando não estabiliza
- Por quê
- Com quem
- Em que ambiente
- Com que custo

Se não consegue responder a pelo menos quatro dessas perguntas para um dado fenômeno, a inferência não deve ser tratada como confiável.

---

## XII. RELAÇÃO COM O ICONS

O ICONS é a cartografia constitucional do STF — mapeia onde na Constituição cada decisão incide. O JudX é a inteligência jurisprudencial de STJ e STF — observa como o litígio circula, migra e não fecha.

A ponte entre os dois não é técnica — é científica. O JudX detecta que um tema está recirculando no STJ com alta instabilidade. O ICONS verifica se aquele tema tem ancoragem constitucional no STF. A combinação revela o que nenhum dos dois vê sozinho: o condomínio da sindicância constitucional funcionando ou falhando.

**Implementação atual:** os bancos são completamente independentes. A comunicação futura ocorrerá via `signal_emitter` — módulo a ser implementado quando o `judx_*` tiver dados suficientes para emitir sinais confiáveis. Todo sinal emitido requer revisão humana antes de ser absorvido pelo ICONS. Nunca ingestão automática.

---

## XIII. SÍNTESE

O JudX observa o presente como laboratório do vínculo futuro, sem reduzir o real à teoria nem permitir que a teoria se auto-confirme sem resistência empírica.

Ele não descreve apenas decisões. Torna visível a arquitetura pela qual o direito se estabiliza, se desloca ou se perpetua como conflito — e expõe as engrenagens pelas quais o litígio pode deixar de funcionar como mecanismo de estabilização e passar a funcionar como ativo, como fluxo contínuo de risco e como infraestrutura de recirculação da incerteza.

---

*PROTOCOLO_JUDX.md — versão 1.0*
*Gerado em 26/03/2026 após auditoria completa do codebase e revisão arquitetural.*
*Próxima revisão recomendada após primeiro ciclo completo de dados em modo `events`.*
