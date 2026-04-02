'use client'

import { useState, useEffect } from 'react'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PAYMENT_LINK = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK!
const STORAGE_KEY = 'judx_consultas'
const LIMITE = 3

const COMPOSICAO_ATUAL = [
  'MIN. ALEXANDRE DE MORAES',
  'MIN. DIAS TOFFOLI',
  'MIN. FLÁVIO DINO',
  'MIN. CRISTIANO ZANIN',
  'MIN. EDSON FACHIN',
  'MIN. LUIZ FUX',
  'MIN. CÁRMEN LÚCIA',
  'MIN. GILMAR MENDES',
  'MIN. NUNES MARQUES',
  'MIN. ANDRÉ MENDONÇA',
  'MIN. LUÍS ROBERTO BARROSO',
] as const

const FOTOS: Record<string, string> = {
  'MIN. ALEXANDRE DE MORAES': '/ministros/moraes.jpg',
  'MIN. DIAS TOFFOLI': '/ministros/toffoli.jpg',
  'MIN. FLÁVIO DINO': '/ministros/dino.jpg',
  'MIN. CRISTIANO ZANIN': '/ministros/zanin.jpg',
  'MIN. EDSON FACHIN': '/ministros/fachin.jpg',
  'MIN. LUIZ FUX': '/ministros/fux.jpg',
  'MIN. CÁRMEN LÚCIA': '/ministros/carmen.jpg',
  'MIN. GILMAR MENDES': '/ministros/gilmar.jpg',
  'MIN. NUNES MARQUES': '/ministros/nunes.jpg',
  'MIN. ANDRÉ MENDONÇA': '/ministros/andre.jpg',
  'MIN. LUÍS ROBERTO BARROSO': '/ministros/barroso.jpg',
}

function nomeExibicao(nomeCompleto: string): string {
  return nomeCompleto.replace(/^MIN\.\s*/i, '')
}

function iniciais(nome: string): string {
  const partes = nomeExibicao(nome).split(' ').filter(p => !['DE', 'DA', 'DO', 'DAS', 'DOS'].includes(p.toUpperCase()))
  if (partes.length >= 2) return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
  return partes[0]?.substring(0, 2).toUpperCase() || '??'
}

type Linha = {
  nome: string
  ramo?: string
  total: number
  provido: number
  nao_provido: number
  parcial: number
  nao_conhecido: number
  taxa: number | null
}

function getContador(): number {
  if (typeof window === 'undefined') return 0
  return parseInt(localStorage.getItem(STORAGE_KEY) || '0')
}
function incrementar(): number {
  const novo = getContador() + 1
  localStorage.setItem(STORAGE_KEY, String(novo))
  return novo
}

async function buscarDadosRelator(filtros: { ramo?: string; anoIni: number; anoFim: number }) {
  const filtroRelatores = COMPOSICAO_ATUAL.map(r => `relator.eq.${encodeURIComponent(r)}`).join(',')
  let url = `${SUPABASE_URL}/rest/v1/v_provimento_merito`
  url += `?select=relator,categoria_provimento,ramo_direito,ano`
  url += `&or=(${filtroRelatores})`
  url += `&ano=gte.${filtros.anoIni}&ano=lte.${filtros.anoFim}`
  url += `&limit=100000`
  if (filtros.ramo) url += `&ramo_direito=eq.${encodeURIComponent(filtros.ramo)}`

  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  if (!res.ok) throw new Error(`Erro ${res.status}`)
  return res.json()
}

async function buscarDadosAssunto(filtros: {
  relator?: string
  anoIni: number
  anoFim: number
}) {
  let url = `${SUPABASE_URL}/rest/v1/v_provimento_merito`
  url += `?select=relator,categoria_provimento,ramo_direito,assunto_principal,ano`
  url += `&ano=gte.${filtros.anoIni}&ano=lte.${filtros.anoFim}`
  url += `&limit=100000`
  if (filtros.relator) url += `&relator=eq.${encodeURIComponent(filtros.relator)}`

  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  if (!res.ok) throw new Error(`Erro ${res.status}`)
  return res.json()
}

function agregarRelator(dados: any[]): Linha[] {
  const mapa: Record<string, any> = {}
  for (const row of dados) {
    const chave = row.relator || 'Não informado'
    if (!mapa[chave]) {
      mapa[chave] = {
        nome: chave, ramo: row.ramo_direito || '',
        total: 0, provido: 0, nao_provido: 0, parcial: 0, nao_conhecido: 0,
      }
    }
    mapa[chave].total++
    const cat = row.categoria_provimento
    if (cat === 'provido') mapa[chave].provido++
    else if (cat === 'nao_provido') mapa[chave].nao_provido++
    else if (cat === 'parcial') mapa[chave].parcial++
    else if (cat === 'nao_conhecido') mapa[chave].nao_conhecido++
  }
  return Object.values(mapa)
    .map((v: any) => {
      const base = v.provido + v.nao_provido + v.parcial
      return { ...v, taxa: base > 0 ? +((v.provido / base) * 100).toFixed(1) : null }
    })
    .sort((a, b) => (b.taxa ?? -1) - (a.taxa ?? -1))
}

function agregarAssunto(dados: any[]): Linha[] {
  const mapa: Record<string, any> = {}
  for (const row of dados) {
    const chave = row.assunto_principal || 'Não informado'
    if (!mapa[chave]) {
      mapa[chave] = {
        nome: chave, ramo: row.ramo_direito || '',
        total: 0, provido: 0, nao_provido: 0, parcial: 0, nao_conhecido: 0,
      }
    }
    mapa[chave].total++
    const cat = row.categoria_provimento
    if (cat === 'provido') mapa[chave].provido++
    else if (cat === 'nao_provido') mapa[chave].nao_provido++
    else if (cat === 'parcial') mapa[chave].parcial++
    else if (cat === 'nao_conhecido') mapa[chave].nao_conhecido++
  }
  return Object.values(mapa)
    .map((v: any) => {
      const base = v.provido + v.nao_provido + v.parcial
      return { ...v, taxa: base > 0 ? +((v.provido / base) * 100).toFixed(1) : null }
    })
    .filter((r) => r.total >= 10)
    .sort((a, b) => (b.taxa ?? -1) - (a.taxa ?? -1))
}

function formatarAssunto(slug: string): string {
  if (!slug) return ''
  const mapa: Record<string, string> = {
    'tributario': 'tributário', 'publico': 'público',
    'processual': 'processual', 'administrativo': 'administrativo',
    'constitucional': 'constitucional', 'previdenciario': 'previdenciário',
    'acao': 'ação', 'execucao': 'execução', 'funcao': 'função',
    'obrigacao': 'obrigação', 'nao': 'não', 'e': 'e',
    'de': 'de', 'do': 'do', 'da': 'da', 'das': 'das', 'dos': 'dos',
    'em': 'em', 'com': 'com', 'por': 'por', 'para': 'para',
    'penal': 'penal', 'civil': 'civil', 'trabalho': 'trabalho',
    'direito': 'Direito', 'outras': 'outras', 'materia': 'matéria',
    'materias': 'matérias', 'servidor': 'servidor', 'impostos': 'impostos',
    'contribuicoes': 'contribuições', 'icms': 'ICMS', 'iss': 'ISS',
    'ipi': 'IPI', 'ir': 'IR', 'iptu': 'IPTU', 'ipva': 'IPVA',
    'prisao': 'prisão', 'preventiva': 'preventiva', 'revogacao': 'revogação',
    'investigacao': 'investigação', 'nulidade': 'nulidade',
    'cerceamento': 'cerceamento', 'defesa': 'defesa',
    'liberdade': 'liberdade', 'provisoria': 'provisória',
    'aplicacao': 'aplicação', 'pena': 'pena', 'parte': 'parte',
    'geral': 'geral', 'especial': 'especial', 'recurso': 'recurso',
    'repercussao': 'repercussão', 'mandado': 'mandado',
    'seguranca': 'segurança', 'habeas': 'habeas', 'corpus': 'corpus',
    'regimental': 'regimental', 'agravo': 'agravo',
  }
  return slug
    .split('_')
    .map((w) => mapa[w.toLowerCase()] ?? (w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

const anos = Array.from({ length: 10 }, (_, i) => 2016 + i)

function AvatarMinistro({ nome }: { nome: string }) {
  const [imgErro, setImgErro] = useState(false)
  const foto = FOTOS[nome]

  if (foto && !imgErro) {
    return (
      <img
        src={foto}
        alt={nomeExibicao(nome)}
        onError={() => setImgErro(true)}
        className="w-20 h-20 rounded-full object-cover shrink-0 border-2 border-[#c8922a]/40"
      />
    )
  }

  return (
    <div className="w-20 h-20 rounded-full bg-[#c8922a] flex items-center justify-center shrink-0">
      <span className="text-[#0d1f35] font-bold text-xl font-[family-name:var(--font-dm-sans)]">
        {iniciais(nome)}
      </span>
    </div>
  )
}

function CardMinistro({
  ministro,
  media,
  maxTaxa,
}: {
  ministro: Linha
  media: number
  maxTaxa: number
}) {
  const taxa = ministro.taxa ?? 0
  const acimaDaMedia = taxa >= media
  const corTaxa = acimaDaMedia ? '#c8922a' : '#ef4444'
  const larguraBarra = maxTaxa > 0 ? (taxa / maxTaxa) * 100 : 0

  return (
    <div className="bg-white/[0.04] border border-white/10 p-6 flex flex-col items-center gap-4 hover:bg-white/[0.07] transition-colors">
      <AvatarMinistro nome={ministro.nome} />
      <h3 className="text-white/90 font-semibold text-sm text-center font-[family-name:var(--font-dm-sans)] leading-tight">
        {nomeExibicao(ministro.nome)}
      </h3>
      <div
        className="text-4xl font-black font-[family-name:var(--font-playfair)]"
        style={{ color: corTaxa }}
      >
        {ministro.taxa !== null ? `${ministro.taxa}%` : '—'}
      </div>
      <div className="w-full bg-white/10 h-2 rounded-sm">
        <div
          className="h-2 rounded-sm transition-all duration-700"
          style={{ width: `${larguraBarra}%`, backgroundColor: corTaxa }}
        />
      </div>
      <p className="text-white/30 text-xs font-[family-name:var(--font-dm-mono)]">
        {ministro.total.toLocaleString('pt-BR')} decisões
      </p>
    </div>
  )
}

export default function TaxaProvimento() {
  const [aba, setAba] = useState<'relator' | 'assunto'>('relator')
  const [ramos, setRamos] = useState<string[]>([])
  const [relatores, setRelatores] = useState<string[]>([])
  const [ramoSel, setRamoSel] = useState('')
  const [relatorSel, setRelatorSel] = useState('')
  const [anoIni, setAnoIni] = useState(2016)
  const [anoFim, setAnoFim] = useState(2025)
  const [dados, setDados] = useState<Linha[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [consultas, setConsultas] = useState(0)
  const [col, setCol] = useState('taxa')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    setConsultas(getContador())
    fetch(
      `${SUPABASE_URL}/rest/v1/v_provimento_merito?select=ramo_direito,relator&limit=100000`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    )
      .then((r) => r.json())
      .then((d) => {
        setRamos([...new Set(d.map((x: any) => x.ramo_direito).filter(Boolean))].sort() as string[])
        setRelatores([...new Set(d.map((x: any) => x.relator).filter(Boolean))].sort() as string[])
        consultarAuto()
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function consultarAuto() {
    setLoading(true)
    try {
      const raw = await buscarDadosRelator({ anoIni: 2016, anoFim: 2025 })
      setDados(agregarRelator(raw))
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function consultar() {
    setErro('')
    setLoading(true)
    try {
      const n = incrementar()
      setConsultas(n)
      if (aba === 'relator') {
        const raw = await buscarDadosRelator({ ramo: ramoSel || undefined, anoIni, anoFim })
        setDados(agregarRelator(raw))
      } else {
        const raw = await buscarDadosAssunto({ relator: relatorSel || undefined, anoIni, anoFim })
        setDados(agregarAssunto(raw))
      }
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  function ordenar(c: string) {
    if (col === c) setDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else {
      setCol(c)
      setDir('desc')
    }
  }

  const paywall = consultas > LIMITE
  const media = dados.length > 0
    ? dados.reduce((acc, d) => acc + (d.taxa ?? 0), 0) / dados.filter(d => d.taxa !== null).length
    : 0
  const maxTaxa = Math.max(...dados.map((d) => d.taxa ?? 0), 1)

  // Aba relator: cards (sem sort de tabela)
  // Aba assunto: tabela com sort
  const linhasAssunto = [...dados].sort((a: any, b: any) =>
    dir === 'desc' ? (b[col] ?? -1) - (a[col] ?? -1) : (a[col] ?? -1) - (b[col] ?? -1)
  )

  const dadosVisiveisCards = paywall ? dados.slice(0, 3) : dados
  const dadosVisiveisTabela = paywall ? linhasAssunto.slice(0, 3) : linhasAssunto

  return (
    <main className="min-h-screen bg-[#0d1f35] text-white px-6 py-10 max-w-6xl mx-auto font-[family-name:var(--font-dm-sans)]">
      <div className="mb-8">
        <a
          href="/"
          className="text-[#c8922a] text-xs tracking-widest uppercase font-[family-name:var(--font-dm-mono)] hover:text-[#e8b44a] transition-colors"
        >
          &larr; JudX
        </a>
        <h1 className="text-4xl md:text-5xl font-black mt-3 font-[family-name:var(--font-playfair)] leading-tight tracking-tight">
          Taxa de Provimento no STF
        </h1>
        <p className="text-white/40 mt-2 text-sm tracking-wide font-[family-name:var(--font-dm-mono)]">
          Baseado em 110.000+ decisões colegiadas de mérito &middot; 2016–2025
        </p>
      </div>

      <div className="flex gap-6 mb-8 border-b border-white/10">
        {(['relator', 'assunto'] as const).map((a) => (
          <button
            key={a}
            onClick={() => {
              setAba(a)
              setDados([])
            }}
            className={`pb-3 px-1 text-xs tracking-widest uppercase font-[family-name:var(--font-dm-mono)] font-medium ${
              aba === a
                ? 'border-b-2 border-[#c8922a] text-[#c8922a]'
                : 'text-white/35 hover:text-white/60 transition-colors'
            }`}
          >
            {a === 'relator' ? 'Por Ministro Relator' : 'Por Assunto/Tema'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-8">
        {aba === 'relator' ? (
          <select
            value={ramoSel}
            onChange={(e) => setRamoSel(e.target.value)}
            className="bg-white/5 border border-white/15 px-3 py-2 text-sm text-white/80 font-[family-name:var(--font-dm-mono)] focus:border-[#c8922a] focus:outline-none transition-colors"
          >
            <option value="">Todos os ramos</option>
            {ramos.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        ) : (
          <select
            value={relatorSel}
            onChange={(e) => setRelatorSel(e.target.value)}
            className="bg-white/5 border border-white/15 px-3 py-2 text-sm text-white/80 font-[family-name:var(--font-dm-mono)] focus:border-[#c8922a] focus:outline-none transition-colors"
          >
            <option value="">Todos os ministros</option>
            {relatores.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
        <select
          value={anoIni}
          onChange={(e) => setAnoIni(+e.target.value)}
          className="bg-white/5 border border-white/15 px-3 py-2 text-sm text-white/80 font-[family-name:var(--font-dm-mono)] focus:border-[#c8922a] focus:outline-none transition-colors"
        >
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <span className="self-center text-white/30 text-xs font-[family-name:var(--font-dm-mono)] tracking-widest">
          até
        </span>
        <select
          value={anoFim}
          onChange={(e) => setAnoFim(+e.target.value)}
          className="bg-white/5 border border-white/15 px-3 py-2 text-sm text-white/80 font-[family-name:var(--font-dm-mono)] focus:border-[#c8922a] focus:outline-none transition-colors"
        >
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <button
          onClick={consultar}
          disabled={loading}
          className="bg-[#c8922a] hover:bg-[#e8b44a] text-[#0d1f35] font-bold px-8 py-2 text-xs tracking-widest uppercase font-[family-name:var(--font-dm-sans)] disabled:opacity-40 transition-colors"
        >
          {loading ? 'Consultando...' : 'Consultar'}
        </button>
      </div>

      {loading && (
        <div className="flex flex-col items-center py-12">
          <div className="animate-spin h-8 w-8 border border-[#c8922a] border-t-transparent mb-4" />
          <p className="text-white/30 text-xs tracking-widest font-[family-name:var(--font-dm-mono)]">
            Consultando 110.000+ decisões colegiadas de mérito...
          </p>
        </div>
      )}

      {erro && <p className="text-red-400 mb-4">{erro}</p>}

      {!loading && dados.length === 0 && !erro && (
        <div className="text-center py-16 text-white/20 text-sm tracking-widest font-[family-name:var(--font-dm-mono)]">
          Selecione os filtros e clique em Consultar
        </div>
      )}

      {/* === ABA RELATOR: CARDS === */}
      {!loading && dados.length > 0 && aba === 'relator' && (
        <div className="relative">
          <div className="text-white/25 text-xs mb-4 font-[family-name:var(--font-dm-mono)] tracking-wide">
            Composição atual &middot; Média do grupo: {media.toFixed(1)}% &middot;{' '}
            <span className="text-[#c8922a]">dourado</span> = acima da média &middot;{' '}
            <span className="text-[#ef4444]">vermelho</span> = abaixo
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dadosVisiveisCards.map((m) => (
              <CardMinistro key={m.nome} ministro={m} media={media} maxTaxa={maxTaxa} />
            ))}
          </div>

          {!paywall && (
            <p className="text-white/15 text-xs mt-6 text-right tracking-widest font-[family-name:var(--font-dm-mono)]">
              Consulta {consultas} de {LIMITE} gratuitas
            </p>
          )}

          {paywall && (
            <>
              <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#0d1f35] to-transparent pointer-events-none" />
              <div className="flex flex-col items-center py-12 mt-6 border border-[#c8922a]/30 bg-white/[0.02]">
                <div className="w-8 h-px bg-[#c8922a]/50 mb-6" />
                <h3 className="text-3xl font-black mb-2 font-[family-name:var(--font-playfair)] italic">
                  Acesso completo — R$ 97/mês
                </h3>
                <p className="text-white/40 text-sm mb-8 text-center max-w-sm leading-relaxed font-[family-name:var(--font-dm-sans)]">
                  Todas as combinações de relator, assunto e período.
                  <br />
                  Sem limite de consultas.
                </p>
                <a
                  href={PAYMENT_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#c8922a] hover:bg-[#e8b44a] text-[#0d1f35] font-bold py-3 px-10 text-xs tracking-widest uppercase font-[family-name:var(--font-dm-sans)] transition-colors"
                >
                  Assinar JUDX Plus &rarr;
                </a>
                <p className="text-white/15 text-xs mt-5 tracking-widest font-[family-name:var(--font-dm-mono)]">
                  Acesso liberado em até 24h após confirmação
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* === ABA ASSUNTO: TABELA === */}
      {!loading && dados.length > 0 && aba === 'assunto' && (
        <div className="relative">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/30 border-b border-white/10 text-left">
                <th
                  className="py-3 pr-4 cursor-pointer hover:text-white/80 text-xs tracking-widest uppercase font-[family-name:var(--font-dm-mono)] font-normal transition-colors"
                  onClick={() => ordenar('nome')}
                >
                  Assunto
                  {col === 'nome' ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
                </th>
                <th
                  className="py-3 px-2 cursor-pointer hover:text-white/80 text-xs tracking-widest uppercase font-[family-name:var(--font-dm-mono)] font-normal transition-colors"
                  onClick={() => ordenar('total')}
                >
                  Total{col === 'total' ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
                </th>
                <th
                  className="py-3 px-2 cursor-pointer hover:text-white/80 text-xs tracking-widest uppercase font-[family-name:var(--font-dm-mono)] font-normal transition-colors"
                  onClick={() => ordenar('provido')}
                >
                  Provido
                  {col === 'provido' ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
                </th>
                <th
                  className="py-3 px-2 cursor-pointer hover:text-white/80 text-xs tracking-widest uppercase font-[family-name:var(--font-dm-mono)] font-normal transition-colors"
                  onClick={() => ordenar('nao_provido')}
                >
                  Não Provido
                  {col === 'nao_provido' ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
                </th>
                <th
                  className="py-3 px-2 cursor-pointer hover:text-white/80 text-xs tracking-widest uppercase font-[family-name:var(--font-dm-mono)] font-normal transition-colors"
                  onClick={() => ordenar('parcial')}
                >
                  Parcial
                  {col === 'parcial' ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
                </th>
                <th
                  className="py-3 px-2 cursor-pointer hover:text-white/80 text-xs tracking-widest uppercase font-[family-name:var(--font-dm-mono)] font-normal transition-colors"
                  onClick={() => ordenar('taxa')}
                >
                  Taxa %{col === 'taxa' ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
                </th>
                <th className="w-32 py-3 text-xs tracking-widest uppercase font-[family-name:var(--font-dm-mono)] font-normal text-white/30">Visual</th>
              </tr>
            </thead>
            <tbody>
              {dadosVisiveisTabela.map((row, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                  <td className="py-3 pr-4 font-medium text-white/90 font-[family-name:var(--font-dm-sans)]">
                    {formatarAssunto(row.nome)}
                  </td>
                  <td className="py-3 px-2 text-white/35 font-[family-name:var(--font-dm-mono)] text-sm">
                    {row.total.toLocaleString('pt-BR')}
                  </td>
                  <td className="py-3 px-2 text-emerald-400/70 font-[family-name:var(--font-dm-mono)] text-sm">
                    {row.provido.toLocaleString('pt-BR')}
                  </td>
                  <td className="py-3 px-2 text-red-400/60 font-[family-name:var(--font-dm-mono)] text-sm">
                    {row.nao_provido.toLocaleString('pt-BR')}
                  </td>
                  <td className="py-3 px-2 text-[#c8922a]/70 font-[family-name:var(--font-dm-mono)] text-sm">
                    {row.parcial.toLocaleString('pt-BR')}
                  </td>
                  <td className="py-3 px-2 font-black text-white font-[family-name:var(--font-playfair)] text-lg">
                    {row.taxa !== null ? `${row.taxa}%` : '—'}
                  </td>
                  <td>
                    <div className="w-full bg-white/8 h-[6px]">
                      <div
                        className={`h-[6px] transition-all duration-700 ${
                          (row.taxa ?? 0) > 40
                            ? 'bg-emerald-400/80'
                            : (row.taxa ?? 0) > 20
                            ? 'bg-[#c8922a]/80'
                            : 'bg-red-400/60'
                        }`}
                        style={{ width: `${Math.min(row.taxa ?? 0, 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!paywall && (
            <p className="text-white/15 text-xs mt-4 text-right tracking-widest font-[family-name:var(--font-dm-mono)]">
              Consulta {consultas} de {LIMITE} gratuitas
            </p>
          )}

          {paywall && (
            <>
              <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#0d1f35] to-transparent pointer-events-none" />
              <div className="flex flex-col items-center py-12 mt-6 border border-[#c8922a]/30 bg-white/[0.02]">
                <div className="w-8 h-px bg-[#c8922a]/50 mb-6" />
                <h3 className="text-3xl font-black mb-2 font-[family-name:var(--font-playfair)] italic">
                  Acesso completo — R$ 97/mês
                </h3>
                <p className="text-white/40 text-sm mb-8 text-center max-w-sm leading-relaxed font-[family-name:var(--font-dm-sans)]">
                  Todas as combinações de relator, assunto e período.
                  <br />
                  Sem limite de consultas.
                </p>
                <a
                  href={PAYMENT_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#c8922a] hover:bg-[#e8b44a] text-[#0d1f35] font-bold py-3 px-10 text-xs tracking-widest uppercase font-[family-name:var(--font-dm-sans)] transition-colors"
                >
                  Assinar JUDX Plus &rarr;
                </a>
                <p className="text-white/15 text-xs mt-5 tracking-widest font-[family-name:var(--font-dm-mono)]">
                  Acesso liberado em até 24h após confirmação
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </main>
  )
}
