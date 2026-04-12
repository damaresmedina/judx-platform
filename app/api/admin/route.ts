import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ADMIN_PASS = process.env.ADMIN_PASS || 'judx-admin-2026'

function auth(req: NextRequest): boolean {
  const p = req.nextUrl.searchParams.get('p') || req.headers.get('x-admin-pass')
  return p === ADMIN_PASS
}

// GET — listar tokens + logs
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: tokens } = await supabase
    .from('investor_tokens')
    .select('*')
    .order('investor_name')

  const { data: logs } = await supabase
    .from('investor_access_log')
    .select('*')
    .order('accessed_at', { ascending: false })
    .limit(100)

  return NextResponse.json({ tokens, logs })
}

// POST — criar, revogar, resetar, deletar
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const { action } = body

  // Criar token
  if (action === 'create') {
    const { name, amount, lang, days } = body
    const token = name.toLowerCase().replace(/[^a-z0-9-]/g, '')
    if (!token || token.length < 2) return NextResponse.json({ error: 'Nome inválido' }, { status: 400 })

    const { data: existing } = await supabase.from('investor_tokens').select('token').eq('token', token).single()
    if (existing) return NextResponse.json({ error: `Token "${token}" já existe` }, { status: 400 })

    const expires_at = new Date(Date.now() + (days || 30) * 86400000).toISOString()
    const investorName = name.charAt(0).toUpperCase() + name.slice(1)

    const { error } = await supabase.from('investor_tokens').insert({
      token,
      investor_name: investorName,
      lang: lang || 'en',
      ticket_amount: amount || 500000,
      expires_at,
      notes: `Via admin — ${new Date().toISOString()}`,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, token, url: `judx.com.br/proposal/${token}` })
  }

  // Revogar
  if (action === 'revoke') {
    await supabase.from('investor_tokens').update({ is_revoked: true }).eq('token', body.token)
    return NextResponse.json({ ok: true })
  }

  // Ativar (desfazer revogação)
  if (action === 'activate') {
    await supabase.from('investor_tokens').update({ is_revoked: false }).eq('token', body.token)
    return NextResponse.json({ ok: true })
  }

  // Resetar IP
  if (action === 'reset') {
    await supabase.from('investor_tokens').update({
      locked_ip: null, locked_at: null, locked_user_agent: null,
      visits: 0, last_visit_at: null,
      geo_country: null, geo_city: null, geo_region: null, geo_lat: null, geo_lon: null, geo_isp: null, geo_device: null,
    }).eq('token', body.token)
    return NextResponse.json({ ok: true })
  }

  // Deletar
  if (action === 'delete') {
    await supabase.from('investor_access_log').delete().eq('token', body.token)
    await supabase.from('investor_tokens').delete().eq('token', body.token)
    return NextResponse.json({ ok: true })
  }

  // Atualizar campos
  if (action === 'update') {
    const updates: Record<string, unknown> = {}
    if (body.lang) updates.lang = body.lang
    if (body.amount) updates.ticket_amount = body.amount
    if (body.days) updates.expires_at = new Date(Date.now() + body.days * 86400000).toISOString()
    await supabase.from('investor_tokens').update(updates).eq('token', body.token)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
