'use client'

import { useState, useEffect } from 'react'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PAYMENT_LINK = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK!
const STORAGE_KEY = 'judx_consultas'
const LIMITE = 3

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
  let url = `${SUPABASE_URL}/rest/v1/v_provimento_merito`
  url += `?select=relator,categoria_provimento,ramo_direito,assunto_principal,ano`
  url += `&ano=gte.${filtros.anoIni}&ano=lte.${filtros.anoFim}`
  url += `&limit=100000`
  if (filtros.ramo) url += `&ramo_direito=eq.${encodeURIComponent(filtros.ramo)}`
  if (filtros.relator) url += `&relator=eq.${encodeURIComponent(filtros.relator)}`

  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  })
  if (!res.ok) throw new Error(`Erro ${res.status}`)
  return res.json()
}

function agregar(dados: any[], groupBy: 'relator' | 'assunto_principal'): Linha[] {
  const mapa: Record<string, any> = {}
  for (const row of dados) {
    const chave = row[groupBy] || 'N\u00e3o informado'
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

const anos = Array.from({ length: 10 }, (_, i) => 2016 + i)

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
      })
  }, [])

  async function consultar() {
    setErro('')
    setLoading(true)
    try {
      const n = incrementar()
      setConsultas(n)
      const raw = await buscarDados({
        ramo: aba === 'relator' ? ramoSel || undefined : undefined,
        relator: aba === 'assunto' ? relatorSel || undefined : undefined,
        anoIni,
        anoFim,
      })
      setDados(agregar(raw, aba === 'relator' ? 'relator' : 'assunto_principal'))
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
  const linhas = [...dados].sort((a: any, b: any) =>
    dir === 'desc' ? (b[col] ?? -1) - (a[col] ?? -1) : (a[col] ?? -1) - (b[col] ?? -1)
  )
  const dadosVisiveis = paywall ? linhas.slice(0, 3) : linhas

  return (
    <main className="min-h-screen bg-[#0d1b2a] text-white px-4 py-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <a href="/" className="text-yellow-400 text-sm hover:underline">
          &larr; JudX
        </a>
        <h1 className="text-3xl font-bold mt-2">Taxa de Provimento no STF</h1>
        <p className="text-gray-400 mt-1">
          Baseado em 110.000+ decis&otilde;es colegiadas de m&eacute;rito &middot; 2016&ndash;2025
        </p>
      </div>

      <div className="flex gap-4 mb-6 border-b border-gray-700">
        {(['relator', 'assunto'] as const).map((a) => (
          <button
            key={a}
            onClick={() => {
              setAba(a)
              setDados([])
            }}
            className={`pb-2 px-1 text-sm font-medium ${
              aba === a
                ? 'border-b-2 border-yellow-400 text-yellow-400'
                : 'text-gray-400'
            }`}
          >
            {a === 'relator' ? 'Por Ministro Relator' : 'Por Assunto/Tema'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        {aba === 'relator' ? (
          <select
            value={ramoSel}
            onChange={(e) => setRamoSel(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
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
            className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
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
          className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
        >
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <span className="self-center text-gray-400 text-sm">at&eacute;</span>
        <select
          value={anoFim}
          onChange={(e) => setAnoFim(+e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
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
          className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-6 py-2 rounded text-sm disabled:opacity-50"
        >
          {loading ? 'Consultando...' : 'Consultar'}
        </button>
      </div>

      {loading && (
        <div className="flex flex-col items-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-yellow-500 mb-4" />
          <p className="text-gray-400 text-sm">
            Consultando 110.000+ decis&otilde;es colegiadas de m&eacute;rito...
          </p>
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
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700 text-left">
                <th
                  className="py-2 pr-4 cursor-pointer hover:text-white"
                  onClick={() => ordenar('nome')}
                >
                  {aba === 'relator' ? 'Ministro' : 'Assunto'}
                  {col === 'nome' ? (dir === 'desc' ? ' \u2193' : ' \u2191') : ''}
                </th>
                {aba === 'assunto' && <th className="py-2 px-2 text-xs">Ramo</th>}
                <th
                  className="py-2 px-2 cursor-pointer hover:text-white"
                  onClick={() => ordenar('total')}
                >
                  Total{col === 'total' ? (dir === 'desc' ? ' \u2193' : ' \u2191') : ''}
                </th>
                {aba === 'relator' && (
                  <>
                    <th
                      className="py-2 px-2 cursor-pointer hover:text-white"
                      onClick={() => ordenar('provido')}
                    >
                      Provido
                      {col === 'provido' ? (dir === 'desc' ? ' \u2193' : ' \u2191') : ''}
                    </th>
                    <th
                      className="py-2 px-2 cursor-pointer hover:text-white"
                      onClick={() => ordenar('nao_provido')}
                    >
                      N&atilde;o Provido
                      {col === 'nao_provido' ? (dir === 'desc' ? ' \u2193' : ' \u2191') : ''}
                    </th>
                    <th
                      className="py-2 px-2 cursor-pointer hover:text-white"
                      onClick={() => ordenar('parcial')}
                    >
                      Parcial
                      {col === 'parcial' ? (dir === 'desc' ? ' \u2193' : ' \u2191') : ''}
                    </th>
                  </>
                )}
                <th
                  className="py-2 px-2 cursor-pointer hover:text-white"
                  onClick={() => ordenar('taxa')}
                >
                  Taxa %{col === 'taxa' ? (dir === 'desc' ? ' \u2193' : ' \u2191') : ''}
                </th>
                <th className="w-32">Visual</th>
              </tr>
            </thead>
            <tbody>
              {dadosVisiveis.map((row, i) => (
                <tr key={i} className="border-b border-gray-800 hover:bg-white/5">
                  <td className="py-2 pr-4 font-medium">{row.nome}</td>
                  {aba === 'assunto' && (
                    <td className="py-2 px-2 text-gray-500 text-xs">{row.ramo}</td>
                  )}
                  <td className="py-2 px-2 text-gray-400">
                    {row.total.toLocaleString('pt-BR')}
                  </td>
                  {aba === 'relator' && (
                    <>
                      <td className="py-2 px-2 text-green-400">
                        {row.provido.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2 px-2 text-red-400">
                        {row.nao_provido.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2 px-2 text-yellow-400">
                        {row.parcial.toLocaleString('pt-BR')}
                      </td>
                    </>
                  )}
                  <td className="py-2 px-2 font-bold">
                    {row.taxa !== null ? `${row.taxa}%` : '\u2014'}
                  </td>
                  <td>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          (row.taxa ?? 0) > 40
                            ? 'bg-green-500'
                            : (row.taxa ?? 0) > 20
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
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
            <p className="text-gray-600 text-xs mt-3 text-right">
              Consulta {consultas} de {LIMITE} gratuitas
            </p>
          )}

          {paywall && (
            <>
              <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#0d1b2a] to-transparent pointer-events-none" />
              <div className="flex flex-col items-center py-10 border border-gray-700 rounded-lg mt-4">
                <span className="text-3xl mb-3">&#128274;</span>
                <h3 className="text-xl font-bold mb-1">
                  Acesso completo &mdash; R$ 97/m&ecirc;s
                </h3>
                <p className="text-gray-400 text-sm mb-6 text-center max-w-sm">
                  Todas as combina&ccedil;&otilde;es de relator, assunto e per&iacute;odo.
                  <br />
                  Sem limite de consultas.
                </p>
                <a
                  href={PAYMENT_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 px-8 rounded text-sm"
                >
                  Assinar JUDX Plus &rarr;
                </a>
                <p className="text-gray-600 text-xs mt-4">
                  Acesso liberado em at&eacute; 24h ap&oacute;s confirma&ccedil;&atilde;o
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </main>
  )
}
