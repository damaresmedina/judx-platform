'use client'

import { useState, useEffect } from 'react'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PAYMENT_LINK = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK!
const STORAGE_KEY = 'judx_consultas'
const LIMITE_GRATIS = 3

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

async function buscarDados(filtros: {
  ramo?: string
  relator?: string
  anoIni: number
  anoFim: number
}) {
  let url = `${SUPABASE_URL}/rest/v1/v_provimento`
  url += `?select=relator,categoria_provimento,ramo_direito,assunto_principal,ano`
  url += `&ano=gte.${filtros.anoIni}&ano=lte.${filtros.anoFim}&limit=100000`
  if (filtros.ramo) url += `&ramo_direito=eq.${encodeURIComponent(filtros.ramo)}`
  if (filtros.relator) url += `&relator=eq.${encodeURIComponent(filtros.relator)}`
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  if (!res.ok) throw new Error(`Erro ${res.status}`)
  return res.json()
}

function agregar(dados: any[], groupBy: 'relator' | 'assunto_principal'): Linha[] {
  const mapa: Record<string, any> = {}
  for (const row of dados) {
    const chave = row[groupBy] || 'Não informado'
    if (!mapa[chave]) mapa[chave] = {
      nome: chave, ramo: row.ramo_direito || '',
      total: 0, provido: 0, nao_provido: 0, parcial: 0, nao_conhecido: 0,
    }
    mapa[chave].total++
    const c = row.categoria_provimento
    if (c === 'provido') mapa[chave].provido++
    else if (c === 'nao_provido') mapa[chave].nao_provido++
    else if (c === 'parcial') mapa[chave].parcial++
    else if (c === 'nao_conhecido') mapa[chave].nao_conhecido++
  }
  return Object.values(mapa)
    .map((v: any) => {
      const base = v.provido + v.nao_provido + v.parcial
      return { ...v, taxa: base > 0 ? +((v.provido / base) * 100).toFixed(1) : null }
    })
    .filter((r) => r.total >= 10)
    .sort((a, b) => (b.taxa ?? -1) - (a.taxa ?? -1))
}

function corBarra(taxa: number | null): string {
  if (taxa === null) return 'bg-gray-500'
  if (taxa >= 40) return 'bg-green-500'
  if (taxa >= 20) return 'bg-yellow-500'
  return 'bg-red-500'
}

const anos = Array.from({ length: 10 }, (_, i) => 2016 + i)

export default function TaxaProvimento() {
  const [aba, setAba] = useState<'relator' | 'assunto'>('relator')
  const [ramos, setRamos] = useState<string[]>([])
  const [relatores, setRelatores] = useState<string[]>([])
  const [anoIni, setAnoIni] = useState(2016)
  const [anoFim, setAnoFim] = useState(2025)
  const [ramoSel, setRamoSel] = useState('')
  const [relatorSel, setRelatorSel] = useState('')
  const [dados, setDados] = useState<Linha[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [consultas, setConsultas] = useState(0)
  const [col, setCol] = useState('taxa')
  const [dir, setDir] = useState<'asc'|'desc'>('desc')

  useEffect(() => {
    setConsultas(getContador())
    fetch(
      `${SUPABASE_URL}/rest/v1/v_provimento?select=ramo_direito,relator&limit=100000`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    )
      .then(r => r.json())
      .then(d => {
        setRamos([...new Set(d.map((x: any) => x.ramo_direito).filter(Boolean))].sort() as string[])
        setRelatores([...new Set(d.map((x: any) => x.relator).filter(Boolean))].sort() as string[])
      })
  }, [])

  async function consultar() {
    setErro(''); setLoading(true)
    try {
      const n = incrementar(); setConsultas(n)
      const raw = await buscarDados({
        ramo: aba === 'relator' ? ramoSel || undefined : undefined,
        relator: aba === 'assunto' ? relatorSel || undefined : undefined,
        anoIni, anoFim,
      })
      setDados(agregar(raw, aba === 'relator' ? 'relator' : 'assunto_principal'))
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  function ordenar(c: string) {
    if (col === c) setDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setCol(c); setDir('desc') }
  }

  const paywall = consultas > LIMITE_GRATIS
  const linhas = [...dados].sort((a: any, b: any) =>
    dir === 'desc' ? (b[col] ?? -1) - (a[col] ?? -1) : (a[col] ?? -1) - (b[col] ?? -1)
  )
  const visiveis = paywall ? linhas.slice(0, 3) : linhas

  return (
    <main className="min-h-screen bg-[#0d1b2a] text-white px-4 py-10">
      <div className="max-w-5xl mx-auto">

        <div className="mb-8">
          <a href="/" className="text-[#c9a84c] text-sm hover:underline">&larr; JudX</a>
          <h1 className="text-3xl font-bold mt-2">Taxa de Provimento no STF</h1>
          <p className="text-gray-400 mt-1">145.000+ decisões colegiadas reais &middot; 2016–2025</p>
        </div>

        <div className="flex gap-2 mb-6">
          {(['relator','assunto'] as const).map(a => (
            <button key={a} onClick={() => { setAba(a); setDados([]) }}
              className={`px-4 py-2 rounded font-medium transition ${
                aba === a ? 'bg-[#c9a84c] text-black' : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}>
              {a === 'relator' ? 'Por Ministro Relator' : 'Por Assunto/Tema'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          {aba === 'relator' ? (
            <select value={ramoSel} onChange={e => setRamoSel(e.target.value)}
              className="bg-white/10 text-white rounded px-3 py-2 text-sm min-w-[220px]">
              <option value="">Todos os ramos</option>
              {ramos.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          ) : (
            <select value={relatorSel} onChange={e => setRelatorSel(e.target.value)}
              className="bg-white/10 text-white rounded px-3 py-2 text-sm min-w-[220px]">
              <option value="">Todos os relatores</option>
              {relatores.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          <select value={anoIni} onChange={e => setAnoIni(+e.target.value)}
            className="bg-white/10 text-white rounded px-3 py-2 text-sm">
            {anos.map(a => <option key={a} value={a}>De {a}</option>)}
          </select>
          <select value={anoFim} onChange={e => setAnoFim(+e.target.value)}
            className="bg-white/10 text-white rounded px-3 py-2 text-sm">
            {anos.map(a => <option key={a} value={a}>Até {a}</option>)}
          </select>
          <button onClick={consultar} disabled={loading}
            className="bg-[#c9a84c] hover:bg-[#b8963b] text-black font-bold px-6 py-2 rounded disabled:opacity-50">
            {loading ? 'Consultando...' : 'Consultar'}
          </button>
        </div>

        {loading && (
          <div className="flex flex-col items-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#c9a84c] mb-4"/>
            <p className="text-gray-400">Consultando 145.000+ decisões reais...</p>
          </div>
        )}

        {erro && <p className="text-red-400 mb-4">{erro}</p>}

        {!loading && dados.length === 0 && !erro && (
          <div className="text-center py-16 text-gray-500">
            Selecione os filtros e clique em Consultar
          </div>
        )}

        {!loading && dados.length > 0 && (
          <div className="relative">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-[#c9a84c] border-b border-white/10 text-left">
                  <th className="py-2 px-3 cursor-pointer hover:text-white" onClick={() => ordenar('nome')}>
                    {aba === 'relator' ? 'Ministro' : 'Assunto'}{col==='nome'? dir==='desc'?' \u2193':' \u2191':''}
                  </th>
                  {aba === 'assunto' && (
                    <th className="py-2 px-3 text-xs">Ramo</th>
                  )}
                  {(['total','provido','nao_provido','parcial','nao_conhecido'] as const).map(c => (
                    aba === 'assunto' && c !== 'total' ? null :
                    <th key={c} className="py-2 px-3 cursor-pointer hover:text-white" onClick={() => ordenar(c)}>
                      {c === 'total' ? 'Total'
                        : c === 'provido' ? 'Provido'
                        : c === 'nao_provido' ? 'Não Provido'
                        : c === 'parcial' ? 'Parcial'
                        : 'Não Conhecido'}
                      {col===c? dir==='desc'?' \u2193':' \u2191':''}
                    </th>
                  ))}
                  <th className="py-2 px-3 cursor-pointer hover:text-white" onClick={() => ordenar('taxa')}>
                    Taxa %{col==='taxa'? dir==='desc'?' \u2193':' \u2191':''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 px-3">{l.nome}</td>
                    {aba === 'assunto' && (
                      <td className="py-2 px-3 text-gray-500 text-xs">{l.ramo}</td>
                    )}
                    <td className="py-2 px-3">{l.total.toLocaleString('pt-BR')}</td>
                    {aba === 'relator' && (
                      <>
                        <td className="py-2 px-3 text-green-400">{l.provido.toLocaleString('pt-BR')}</td>
                        <td className="py-2 px-3 text-red-400">{l.nao_provido.toLocaleString('pt-BR')}</td>
                        <td className="py-2 px-3 text-yellow-400">{l.parcial.toLocaleString('pt-BR')}</td>
                        <td className="py-2 px-3 text-gray-400">{l.nao_conhecido.toLocaleString('pt-BR')}</td>
                      </>
                    )}
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-white/10 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${corBarra(l.taxa)}`}
                            style={{ width: `${Math.min(l.taxa ?? 0, 100)}%` }}/>
                        </div>
                        <span>{l.taxa !== null ? `${l.taxa}%` : '\u2014'}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {paywall && (
              <>
                <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0d1b2a] to-transparent pointer-events-none"/>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-[#0d1b2a]/95 border border-[#c9a84c]/30 rounded-xl p-8 text-center max-w-sm shadow-xl">
                    <div className="text-3xl mb-3">&#128274;</div>
                    <h3 className="text-xl font-bold text-white mb-1">Acesso completo</h3>
                    <p className="text-[#c9a84c] font-bold text-lg mb-2">R$ 97/mês</p>
                    <p className="text-gray-400 text-sm mb-5">
                      Todas as combinações de relator,<br/>assunto e período. Sem limite.
                    </p>
                    <a href={PAYMENT_LINK} target="_blank" rel="noopener noreferrer"
                      className="block w-full bg-[#c9a84c] hover:bg-[#b8963b] text-black font-bold py-3 px-6 rounded text-center">
                      Assinar JUDX Plus &rarr;
                    </a>
                    <p className="text-gray-600 text-xs mt-3">Ambiente de teste &middot; pagamentos não são cobrados</p>
                  </div>
                </div>
              </>
            )}

            {!paywall && dados.length > 0 && (
              <p className="text-gray-600 text-xs mt-3 text-right">
                Consulta {consultas} de {LIMITE_GRATIS} gratuitas
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
