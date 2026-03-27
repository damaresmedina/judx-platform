/**
 * stj-contramostra-datajud.mjs
 * ============================================================
 * Extrai contramostra STJ anos 2008–2021 via API Pública Datajud (CNJ)
 * Substitui SCON (bloqueado por Cloudflare para anos antigos)
 *
 * Uso:
 *   node stj-contramostra-datajud.mjs --probe          # descobre códigos de classe
 *   node stj-contramostra-datajud.mjs --ano 2009       # extrai 1 ano
 *   node stj-contramostra-datajud.mjs --all            # extrai 2008–2021
 *   node stj-contramostra-datajud.mjs --all --dry-run  # simula sem gravar
 *
 * Requisitos:
 *   npm install @supabase/supabase-js node-fetch
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DATAJUD_URL   = 'https://api-publica.datajud.cnj.jus.br/api_publica_stj/_search'
const DATAJUD_KEY   = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=='

const SUPABASE_URL  = 'https://ejwyguskoiraredinqmb.supabase.co'
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqd3lndXNrb2lyYXJlZGlucW1iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDAyMjk2NywiZXhwIjoyMDg5NTk4OTY3fQ.EpS4OHMuwWvcgqAB5BwnAj7FJCQgIodUZRC9xm0Z1XU'

// Códigos TPU CNJ para classes STJ (descobertos via --probe)
// Se probe retornar outros códigos, atualize aqui
const CLASSES = {
  AREsp:           11881,   // Agravo em Recurso Especial (1.837.744)
  REsp:            1032,    // Recurso Especial (593.040)
}

// Anos alvo: 2008–2021 (2022–2026 já estão via CKAN/SCON)
const ANOS_ALVO = [2008,2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021]

// Distribuição de sementes por ano (da sua tabela)
const SEMENTES_POR_ANO = {
  2008:126, 2009:382, 2010:135, 2011:102, 2012:116,
  2013:153, 2014:83,  2015:44,  2016:47,  2017:59,
  2018:62,  2019:102, 2020:84,  2021:116,
}

const RATIO         = 2      // contramostra = 2× sementes
const PAGE_SIZE     = 10000  // máximo Datajud
const DELAY_MS      = 800    // pausa entre requests (ms)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`) }

async function datajudPost(body) {
  const resp = await fetch(DATAJUD_URL, {
    method: 'POST',
    headers: {
      'Authorization': `ApiKey ${DATAJUD_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error(`Datajud ${resp.status}: ${txt.slice(0, 200)}`)
  }
  return resp.json()
}

// ---------------------------------------------------------------------------
// PROBE — descobre códigos reais de classe no índice STJ do Datajud
// ---------------------------------------------------------------------------

async function probe() {
  log('=== PROBE: descobrindo classes disponíveis no índice STJ ===')

  const body = {
    size: 0,
    aggs: {
      classes: {
        terms: { field: 'classe.codigo', size: 50 }
      },
      classes_nome: {
        terms: { field: 'classe.nome.keyword', size: 50 }
      }
    }
  }

  const data = await datajudPost(body)
  const buckets = data?.aggregations?.classes?.buckets || []
  const nomes   = data?.aggregations?.classes_nome?.buckets || []

  console.log('\n--- Códigos de classe (top 50) ---')
  for (const b of buckets) {
    console.log(`  codigo: ${b.key}  |  count: ${b.doc_count}`)
  }
  console.log('\n--- Nomes de classe (top 50) ---')
  for (const b of nomes) {
    console.log(`  nome: "${b.key}"  |  count: ${b.doc_count}`)
  }

  // Tenta também uma query de amostra para ver estrutura do documento
  log('\nAmostra de 1 documento para inspecionar campos:')
  const sample = await datajudPost({ size: 1, query: { match_all: {} } })
  const hit = sample?.hits?.hits?.[0]?._source
  if (hit) {
    console.log(JSON.stringify(hit, null, 2))
  }
}

// ---------------------------------------------------------------------------
// Carrega sementes já conhecidas (para excluir da contramostra)
// ---------------------------------------------------------------------------

async function carregarSementes() {
  const { data, error } = await sb
    .from('stj_processos_semente')
    .select('processo')
  if (error) throw error
  const set = new Set(data.map(r => r.processo))
  log(`Sementes carregadas: ${set.size}`)
  return set
}

async function carregarJaExtraidos() {
  const { data, error } = await sb
    .from('stj_contramostra')
    .select('processo')
  if (error && error.code !== 'PGRST116') throw error
  const set = new Set((data || []).map(r => r.processo))
  log(`Já na contramostra: ${set.size}`)
  return set
}

// ---------------------------------------------------------------------------
// Normaliza número de processo Datajud → formato STJ
// Ex: "0000001-12.2009.1.00.0000" → número único CNJ (mantemos assim)
// ---------------------------------------------------------------------------

function normalizarProcesso(hit) {
  const s = hit._source
  return {
    processo:        s.numeroProcesso || null,
    classe:          s.classe?.nome   || null,
    classe_codigo:   s.classe?.codigo || null,
    numero:          s.numeroProcesso || null,
    uf_origem:       s.tribunal?.uf   || s.orgaoJulgador?.uf || null,
    tribunal_origem: s.tribunal?.nome || null,
    relator:         null,  // Datajud não expõe relator na API pública
    data_decisao:    s.dataAjuizamento ? `${s.dataAjuizamento.slice(0,4)}-${s.dataAjuizamento.slice(4,6)}-${s.dataAjuizamento.slice(6,8)}` : null,
    movimentos:      s.movimentos ? JSON.stringify(s.movimentos) : null,
    assuntos:        s.assuntos   ? JSON.stringify(s.assuntos)   : null,
    tipo:            'contramostra',
    fonte:           'datajud',
    extraido_em:     new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Extrai por classe + ano com paginação search_after
// ---------------------------------------------------------------------------

async function extrairClasseAno(classeNome, classeCodigo, ano, meta, sementes, jaExtraidos) {
  const resultados = []
  let searchAfter  = null
  let pagina       = 1

  // Datajud uses format "20240621000000" for dataAjuizamento
  const dataInicio = `${ano}0101000000`
  const dataFim    = `${ano}1231235959`

  log(`  [${classeNome}/${ano}] buscando até ${meta} processos...`)

  while (resultados.length < meta) {
    const query = {
      size: Math.min(PAGE_SIZE, (meta - resultados.length) * 3), // pega margem para filtrar sementes
      sort: [{ dataAjuizamento: 'asc' }],
      query: {
        bool: {
          must: [
            { term: { 'classe.codigo': classeCodigo } },
            { range: { dataAjuizamento: { gte: dataInicio, lte: dataFim } } }
          ]
        }
      },
      _source: [
        'numeroProcesso', 'classe', 'tribunal', 'orgaoJulgador',
        'dataAjuizamento', 'movimentos', 'assuntos'
      ]
    }

    if (searchAfter) query.search_after = searchAfter

    let data
    try {
      data = await datajudPost(query)
    } catch (e) {
      log(`  ERRO na página ${pagina}: ${e.message}`)
      break
    }

    const hits = data?.hits?.hits || []
    if (hits.length === 0) {
      log(`  [${classeNome}/${ano}] sem mais resultados na página ${pagina}`)
      break
    }

    for (const hit of hits) {
      if (resultados.length >= meta) break
      const proc = hit._source?.numeroProcesso
      if (!proc || sementes.has(proc) || jaExtraidos.has(proc)) continue
      jaExtraidos.add(proc) // previne duplicatas dentro do mesmo run
      resultados.push(normalizarProcesso(hit))
    }

    // search_after usa os valores de sort do último hit
    const ultimo = hits[hits.length - 1]
    searchAfter = ultimo.sort

    log(`  [${classeNome}/${ano}] página ${pagina}: +${hits.length} hits | coletados: ${resultados.length}/${meta}`)
    pagina++
    await sleep(DELAY_MS)
  }

  return resultados
}

// ---------------------------------------------------------------------------
// Insere no Supabase em lotes
// ---------------------------------------------------------------------------

async function inserir(registros, dryRun) {
  if (registros.length === 0) return 0
  if (dryRun) {
    log(`[DRY RUN] Inseriria ${registros.length} registros`)
    return registros.length
  }

  let total = 0
  const LOTE = 500
  for (let i = 0; i < registros.length; i += LOTE) {
    const lote = registros.slice(i, i + LOTE)
    const { error } = await sb
      .from('stj_contramostra')
      .upsert(lote, { onConflict: 'processo' })
    if (error) {
      log(`ERRO ao inserir lote: ${error.message}`)
    } else {
      total += lote.length
    }
  }
  return total
}

// ---------------------------------------------------------------------------
// Pipeline principal
// ---------------------------------------------------------------------------

async function run(anosArg, dryRun) {
  log('=== STJ Contramostra Datajud Pipeline ===')
  log(`Modo: ${dryRun ? 'DRY RUN' : 'PRODUÇÃO'}`)

  const sementes    = await carregarSementes()
  const jaExtraidos = await carregarJaExtraidos()

  const anos = anosArg.length ? anosArg : ANOS_ALVO
  let totalGeral = 0

  for (const ano of anos) {
    const nSementes = SEMENTES_POR_ANO[ano] || 0
    const meta = nSementes * RATIO
    log(`\n--- Ano ${ano}: ${nSementes} sementes → meta ${meta} contramostra ---`)

    const registrosAno = []

    for (const [classeNome, classeCodigo] of Object.entries(CLASSES)) {
      if (registrosAno.length >= meta) break
      const faltam = meta - registrosAno.length
      const lote = await extrairClasseAno(
        classeNome, classeCodigo, ano, faltam, sementes, jaExtraidos
      )
      // Adiciona ano_afetacao para rastreabilidade
      lote.forEach(r => r.ano_afetacao = ano)
      registrosAno.push(...lote)
    }

    const n = await inserir(registrosAno, dryRun)
    totalGeral += n
    log(`Ano ${ano}: ${n} registros ${dryRun ? 'simulados' : 'inseridos'}`)
  }

  log(`\n=== Concluído: ${totalGeral} registros no total ===`)
}

// ---------------------------------------------------------------------------
// SQL para criar/atualizar tabela (caso ainda não tenha as novas colunas)
// ---------------------------------------------------------------------------

function sqlMigracao() {
  return `
-- Adiciona colunas novas se não existirem (idempotente)
ALTER TABLE stj_contramostra
  ADD COLUMN IF NOT EXISTS classe_codigo integer,
  ADD COLUMN IF NOT EXISTS movimentos    jsonb,
  ADD COLUMN IF NOT EXISTS assuntos      jsonb,
  ADD COLUMN IF NOT EXISTS fonte         text DEFAULT 'scon';

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_contramostra_fonte ON stj_contramostra(fonte);
CREATE INDEX IF NOT EXISTS idx_contramostra_assuntos ON stj_contramostra USING gin(assuntos);
CREATE INDEX IF NOT EXISTS idx_contramostra_movimentos ON stj_contramostra USING gin(movimentos);
  `.trim()
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)

if (args.includes('--sql')) {
  console.log('\n--- Execute no Supabase SQL Editor ---\n')
  console.log(sqlMigracao())
  process.exit(0)
}

if (args.includes('--probe')) {
  probe().catch(e => { console.error(e); process.exit(1) })
} else {
  const dryRun = args.includes('--dry-run')
  const all    = args.includes('--all')

  let anos = []
  const anoIdx = args.indexOf('--ano')
  if (anoIdx !== -1) {
    // Suporta múltiplos: --ano 2009 2010 2011
    let i = anoIdx + 1
    while (i < args.length && !args[i].startsWith('--')) {
      anos.push(parseInt(args[i]))
      i++
    }
  }

  if (!all && anos.length === 0) {
    console.log(`
Uso:
  node stj-contramostra-datajud.mjs --probe              Descobre códigos de classe
  node stj-contramostra-datajud.mjs --sql                Mostra SQL de migração
  node stj-contramostra-datajud.mjs --ano 2009           Extrai 1 ano
  node stj-contramostra-datajud.mjs --ano 2009 2010 2011 Extrai múltiplos anos
  node stj-contramostra-datajud.mjs --all                Extrai 2008–2021
  node stj-contramostra-datajud.mjs --all --dry-run      Simula sem gravar
    `)
    process.exit(0)
  }

  run(all ? ANOS_ALVO : anos, dryRun)
    .catch(e => { console.error(e); process.exit(1) })
}
