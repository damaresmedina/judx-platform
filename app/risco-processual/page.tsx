'use client'

import { useState, useEffect } from 'react'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PAYMENT_LINK = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK || '#'
const STORAGE_KEY = 'judx_risco_consultas'
const LIMITE = 3

const RAMO_LABEL: Record<string, string> = {
  'DIREITO ADMINISTRATIVO E OUTRAS MATÉRIAS DE DIREITO PÚBLICO': 'Administrativo / Público',
  'DIREITO AMBIENTAL': 'Ambiental',
  'DIREITO CIVIL': 'Civil',
  'DIREITO DA CRIANÇA E DO ADOLESCENTE': 'Criança e Adolescente',
  'DIREITO DA SAÚDE': 'Saúde',
  'DIREITO DO CONSUMIDOR': 'Consumidor',
  'DIREITO DO TRABALHO': 'Trabalho',
  'DIREITO ELEITORAL': 'Eleitoral',
  'DIREITO INTERNACIONAL': 'Internacional',
  'DIREITO PENAL': 'Penal',
  'DIREITO PENAL MILITAR': 'Penal Militar',
  'DIREITO PREVIDENCIÁRIO': 'Previdenciário',
  'DIREITO PROCESSUAL CIVIL E DO TRABALHO': 'Processual Civil / Trabalho',
  'DIREITO PROCESSUAL PENAL': 'Processual Penal',
  'DIREITO PROCESSUAL PENAL MILITAR': 'Processual Penal Militar',
  'DIREITO TRIBUTÁRIO': 'Tributário',
  'QUESTÕES DE ALTA COMPLEXIDADE, GRANDE IMPACTO E REPERCUSSÃO': 'Alta Complexidade / Repercussão',
}

const TIPOS = [
  { value: 'pessoa_fisica', label: 'Pessoa Física', icon: '👤' },
  { value: 'ente_publico', label: 'Ente Público', icon: '🏛️' },
  { value: 'pessoa_juridica', label: 'Pessoa Jurídica', icon: '🏢' },
]

const MINISTROS_ATUAIS = [
  'MIN. EDSON FACHIN', 'MIN. GILMAR MENDES', 'MIN. CÁRMEN LÚCIA',
  'MIN. DIAS TOFFOLI', 'MIN. LUIZ FUX', 'MIN. ALEXANDRE DE MORAES',
  'MIN. NUNES MARQUES', 'MIN. ANDRÉ MENDONÇA',
  'MIN. CRISTIANO ZANIN', 'MIN. FLÁVIO DINO',
]

function getContador(): number {
  if (typeof window === 'undefined') return 0
  return parseInt(localStorage.getItem(STORAGE_KEY) || '0')
}
function incrementar(): number {
  const novo = getContador() + 1
  localStorage.setItem(STORAGE_KEY, String(novo))
  return novo
}

async function query(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  if (!res.ok) throw new Error(`Erro ${res.status}`)
  return res.json()
}

function nomeRelator(r: string) {
  return r.replace('MIN. ', '').split(' ').map(w =>
    w.length <= 2 ? w.toLowerCase() : w.charAt(0) + w.slice(1).toLowerCase()
  ).join(' ')
}

export default function RiscoProcessual() {
  const [tipo, setTipo] = useState('')
  const [ramos, setRamos] = useState<string[]>([])
  const [ramo, setRamo] = useState('')
  const [relatores, setRelatores] = useState<string[]>([])
  const [relator, setRelator] = useState('')
  const [resultado, setResultado] = useState<{
    taxa: number; processos: number; providos: number
  } | null>(null)
  const [mediaTipo, setMediaTipo] = useState(0)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [consultas, setConsultas] = useState(0)
  const [bloqueado, setBloqueado] = useState(false)
  const [notaAberta, setNotaAberta] = useState(false)

  useEffect(() => { setConsultas(getContador()) }, [])

  // Load ramos when tipo changes
  useEffect(() => {
    if (!tipo) return
    setRamo('')
    setRelator('')
    setResultado(null)
    setRamos([])
    setRelatores([])
    query(
      `risco_processual?select=ramo_direito&tipo_polo_ativo=eq.${tipo}&order=ramo_direito`
    ).then((d: { ramo_direito: string }[]) => {
      setRamos([...new Set(d.map(r => r.ramo_direito))].sort())
    })
  }, [tipo])

  // Load relatores when ramo changes
  useEffect(() => {
    if (!tipo || !ramo) return
    setRelator('')
    setResultado(null)
    setRelatores([])
    const inFilter = MINISTROS_ATUAIS.map(m => `"${m}"`).join(',')
    query(
      `risco_processual?select=relator&tipo_polo_ativo=eq.${tipo}&ramo_direito=eq.${encodeURIComponent(ramo)}&relator=in.(${encodeURIComponent(inFilter)})&order=relator`
    ).then((d: { relator: string }[]) => {
      setRelatores([...new Set(d.map(r => r.relator))].sort())
    })
  }, [tipo, ramo])

  async function calcular() {
    if (!tipo || !ramo || !relator) return
    if (consultas >= LIMITE) { setBloqueado(true); return }

    setLoading(true)
    setErro('')
    setResultado(null)
    try {
      // Main query
      const data = await query(
        `risco_processual?select=taxa_sucesso,processos,providos&tipo_polo_ativo=eq.${tipo}&ramo_direito=eq.${encodeURIComponent(ramo)}&relator=eq.${encodeURIComponent(relator)}&limit=10`
      )

      // Aggregate if multiple rows (different classes)
      let processos = 0, providos = 0
      if (data.length > 0) {
        for (const r of data) { processos += r.processos; providos += r.providos }
      }

      // Average for this tipo_polo
      const avgData = await query(
        `risco_processual?select=processos,providos&tipo_polo_ativo=eq.${tipo}&limit=1000`
      )
      let avgP = 0, avgProv = 0
      for (const r of avgData) { avgP += r.processos; avgProv += r.providos }
      setMediaTipo(avgP > 0 ? (avgProv / avgP) * 100 : 0)

      if (processos === 0) {
        // Fallback: show tipo average
        setResultado({
          taxa: avgP > 0 ? (avgProv / avgP) * 100 : 0,
          processos: avgP,
          providos: avgProv,
        })
      } else {
        setResultado({
          taxa: (providos / processos) * 100,
          processos,
          providos,
        })
      }

      const n = incrementar()
      setConsultas(n)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  const taxaCor = (t: number) =>
    t >= 5 ? '#c8922a' : t >= 2 ? '#e8922a' : '#ef4444'

  const frase = (t: number) =>
    t < 2
      ? 'Combinação de alto risco. Avalie a estratégia antes de recorrer.'
      : t <= 5
        ? 'Risco moderado. Dentro da média para este perfil.'
        : 'Combinação favorável. Acima da média histórica.'

  const tipoLabel = TIPOS.find(t => t.value === tipo)?.label || tipo

  return (
    <div style={{ background: '#0d1f35', minHeight: '100vh', color: '#fff', fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '1rem 2rem', borderBottom: '1px solid rgba(200,146,42,0.12)',
        background: 'rgba(10,21,37,0.95)', position: 'sticky', top: 0, zIndex: 100,
        backdropFilter: 'blur(12px)',
      }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <span style={{ color: '#c8922a', fontSize: '0.75rem', letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' as const }}>JUDX</span>
          <span style={{ color: '#6a8aa5', fontSize: '0.6rem', letterSpacing: '0.1em', marginLeft: '0.3rem' }}>· Inteligência Jurisprudencial</span>
        </a>
        <a href="/taxa_provimento.html" style={{ color: '#6a8aa5', fontSize: '0.78rem', textDecoration: 'none' }}>← Taxa de Provimento</a>
      </header>

      {/* Hero */}
      <section style={{
        padding: '3.5rem 2rem 2.5rem', textAlign: 'center',
        background: 'linear-gradient(180deg, #0a1628, #0d1f35)',
        borderBottom: '1px solid rgba(200,146,42,0.12)',
      }}>
        <div style={{ color: '#c8922a', fontSize: '0.65rem', letterSpacing: '0.25em', fontWeight: 500, textTransform: 'uppercase' as const, marginBottom: '0.8rem' }}>
          Análise de Risco Processual
        </div>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 900, lineHeight: 1.1, marginBottom: '0.8rem' }}>
          Qual é a sua <span style={{ color: '#c8922a', fontStyle: 'italic' }}>chance real</span> no STF?
        </h1>
        <p style={{ color: '#6a8aa5', fontSize: '0.9rem', maxWidth: 520, margin: '0 auto', lineHeight: 1.7 }}>
          Análise de risco por tipo de parte, relator e ramo do direito. Dados reais de 24.000+ processos.
        </p>
      </section>

      {/* Calculator */}
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '2rem' }}>

        {/* Step 1 */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ color: '#6a8aa5', fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase' as const, marginBottom: '0.8rem' }}>
            Passo 1 — Quem é você neste processo?
          </div>
          <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' as const }}>
            {TIPOS.map(t => (
              <button
                key={t.value}
                onClick={() => setTipo(t.value)}
                style={{
                  flex: '1 1 180px',
                  padding: '1.2rem 1rem',
                  background: tipo === t.value ? 'rgba(200,146,42,0.12)' : 'rgba(15,30,50,0.7)',
                  border: tipo === t.value ? '2px solid #c8922a' : '1px solid rgba(200,146,42,0.12)',
                  borderRadius: 6,
                  color: tipo === t.value ? '#c8922a' : '#e8f0f8',
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '0.85rem',
                  fontWeight: tipo === t.value ? 700 : 400,
                  transition: 'all 0.2s',
                  textAlign: 'center' as const,
                }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '0.3rem' }}>{t.icon}</div>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Step 2 */}
        {tipo && (
          <div style={{ marginBottom: '2rem', animation: 'fadeUp 0.3s ease' }}>
            <div style={{ color: '#6a8aa5', fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase' as const, marginBottom: '0.8rem' }}>
              Passo 2 — Qual é o ramo do direito?
            </div>
            <select
              value={ramo}
              onChange={e => setRamo(e.target.value)}
              style={{
                width: '100%', padding: '0.8rem 1rem', background: '#112a4a',
                border: '1px solid rgba(200,146,42,0.15)', borderRadius: 6,
                color: '#e8f0f8', fontSize: '0.85rem', fontFamily: "'DM Sans', sans-serif",
              }}
            >
              <option value="">Selecione o ramo do direito</option>
              {ramos.map(r => <option key={r} value={r}>{RAMO_LABEL[r] || r}</option>)}
            </select>
          </div>
        )}

        {/* Step 3 */}
        {ramo && (
          <div style={{ marginBottom: '2rem', animation: 'fadeUp 0.3s ease' }}>
            <div style={{ color: '#6a8aa5', fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase' as const, marginBottom: '0.8rem' }}>
              Passo 3 — Qual é o relator?
            </div>
            <select
              value={relator}
              onChange={e => setRelator(e.target.value)}
              style={{
                width: '100%', padding: '0.8rem 1rem', background: '#112a4a',
                border: '1px solid rgba(200,146,42,0.15)', borderRadius: 6,
                color: '#e8f0f8', fontSize: '0.85rem', fontFamily: "'DM Sans', sans-serif",
              }}
            >
              <option value="">Selecione o relator</option>
              {relatores.map(r => (
                <option key={r} value={r}>{nomeRelator(r)}</option>
              ))}
            </select>
          </div>
        )}

        {/* Button */}
        {relator && (
          <button
            onClick={calcular}
            disabled={loading}
            style={{
              width: '100%', padding: '1rem', background: '#c8922a',
              color: '#0d1f35', border: 'none', borderRadius: 6,
              fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.15em',
              textTransform: 'uppercase' as const, cursor: loading ? 'wait' : 'pointer',
              fontFamily: "'DM Sans', sans-serif", transition: 'background 0.2s',
              marginBottom: '2rem', animation: 'fadeUp 0.3s ease',
            }}
          >
            {loading ? 'CALCULANDO...' : `CALCULAR MEU RISCO (${LIMITE - consultas} consultas restantes)`}
          </button>
        )}

        {/* Error */}
        {erro && (
          <div style={{ color: '#ef4444', fontSize: '0.8rem', textAlign: 'center', marginBottom: '1rem' }}>
            {erro}
          </div>
        )}

        {/* Result */}
        {resultado && !bloqueado && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(200,146,42,0.08), rgba(10,21,37,0.9))',
            border: '1px solid rgba(200,146,42,0.2)', borderRadius: 10,
            padding: '2.5rem 2rem', textAlign: 'center',
            animation: 'fadeUp 0.4s ease', position: 'relative',
          }}>
            <div style={{ color: '#6a8aa5', fontSize: '0.6rem', letterSpacing: '0.2em', textTransform: 'uppercase' as const, marginBottom: '0.5rem' }}>
              Taxa de Sucesso
            </div>
            <div style={{
              fontFamily: "'Playfair Display', serif", fontSize: '4rem', fontWeight: 900,
              color: taxaCor(resultado.taxa), lineHeight: 1,
            }}>
              {resultado.taxa.toFixed(1)}%
            </div>
            <div style={{ color: '#6a8aa5', fontSize: '0.78rem', marginTop: '0.5rem', marginBottom: '1.5rem' }}>
              Baseado em {resultado.processos.toLocaleString('pt-BR')} processos analisados
            </div>

            {/* Comparativo */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem',
              marginBottom: '1.5rem',
            }}>
              <div style={{ background: 'rgba(10,21,37,0.6)', padding: '1rem', borderRadius: 6, border: '1px solid rgba(200,146,42,0.1)' }}>
                <div style={{ fontSize: '0.55rem', color: '#6a8aa5', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '0.3rem' }}>Sua combinação</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.2rem', color: taxaCor(resultado.taxa) }}>
                  {resultado.taxa.toFixed(1)}%
                </div>
              </div>
              <div style={{ background: 'rgba(10,21,37,0.6)', padding: '1rem', borderRadius: 6, border: '1px solid rgba(200,146,42,0.1)' }}>
                <div style={{ fontSize: '0.55rem', color: '#6a8aa5', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '0.3rem' }}>Média {tipoLabel}</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.2rem', color: '#6a8aa5' }}>
                  {mediaTipo.toFixed(1)}%
                </div>
              </div>
              <div style={{ background: 'rgba(10,21,37,0.6)', padding: '1rem', borderRadius: 6, border: '1px solid rgba(200,146,42,0.1)' }}>
                <div style={{ fontSize: '0.55rem', color: '#6a8aa5', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '0.3rem' }}>Média geral STF</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.2rem', color: '#6a8aa5' }}>
                  3,2%
                </div>
              </div>
            </div>

            {/* Frase */}
            <div style={{
              padding: '1rem', borderRadius: 6,
              background: `${taxaCor(resultado.taxa)}10`,
              border: `1px solid ${taxaCor(resultado.taxa)}30`,
              color: taxaCor(resultado.taxa),
              fontSize: '0.85rem', fontWeight: 500,
            }}>
              {frase(resultado.taxa)}
            </div>
          </div>
        )}

        {/* Paywall */}
        {bloqueado && (
          <div style={{
            background: 'rgba(10,21,37,0.95)', border: '1px solid rgba(200,146,42,0.2)',
            borderRadius: 10, padding: '3rem 2rem', textAlign: 'center',
            animation: 'fadeUp 0.4s ease',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.3rem', marginBottom: '0.5rem' }}>
              Limite de consultas gratuitas atingido
            </h3>
            <p style={{ color: '#6a8aa5', fontSize: '0.85rem', marginBottom: '1.5rem', maxWidth: 400, margin: '0 auto 1.5rem' }}>
              Você realizou {LIMITE} consultas gratuitas. Assine o JudX para consultas ilimitadas e acesso completo à inteligência jurisprudencial.
            </p>
            <a
              href={PAYMENT_LINK}
              style={{
                display: 'inline-block', background: '#c8922a', color: '#0d1f35',
                padding: '0.8rem 2rem', borderRadius: 6, textDecoration: 'none',
                fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase' as const,
              }}
            >
              Assinar JudX
            </a>
          </div>
        )}

        {/* Nota Metodológica */}
        <div style={{ marginTop: '2rem', borderTop: '1px solid rgba(200,146,42,0.08)', paddingTop: '1.5rem' }}>
          <button
            onClick={() => setNotaAberta(!notaAberta)}
            style={{
              background: 'none', border: 'none', color: '#6a8aa5',
              fontSize: '0.75rem', cursor: 'pointer', display: 'flex',
              alignItems: 'center', gap: '0.4rem', fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <span style={{ transform: notaAberta ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
            Nota Metodológica
          </button>
          {notaAberta && (
            <div style={{ color: '#3a5a74', fontSize: '0.72rem', lineHeight: 1.7, marginTop: '0.8rem', maxWidth: 600 }}>
              A taxa é calculada sobre processos em que o tipo de parte selecionado figura no polo ativo,
              com o relator indicado, neste ramo do direito. Amostra mínima: 5 processos por combinação.
              Dados agregados de decisões colegiadas de mérito (2016–2025).
              Metodologia: Medina, 2026 · JUDX/ICONS.
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid rgba(200,146,42,0.12)', padding: '1.2rem 2rem',
        display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' as const,
        color: '#3a5a74', fontSize: '0.65rem', letterSpacing: '0.08em', gap: '0.3rem',
      }}>
        <span>© 2026 JudX. Todos os direitos reservados.</span>
        <span>Dados sujeitos a verificação. Não constitui aconselhamento jurídico.</span>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@300;400;500;700&family=DM+Mono:wght@400;500&display=swap');
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%236a8aa5' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 1rem center; padding-right: 2.5rem !important; }
        select:focus, button:focus { outline: none; }
        select option { background: #112a4a; color: #e8f0f8; }
      `}</style>
    </div>
  )
}
