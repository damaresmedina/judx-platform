import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '0.0.0.0'
  )
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t')
  const ip = getClientIp(req)
  const ua = req.headers.get('user-agent') || ''

  if (!token) {
    return NextResponse.json({ status: 'invalid_token' }, { status: 403 })
  }

  // Buscar token
  const { data: tk, error } = await supabase
    .from('investor_tokens')
    .select('*')
    .eq('token', token)
    .single()

  if (error || !tk) {
    await logAccess(token, null, ip, ua, 'invalid_token', 'Token não existe')
    return NextResponse.json({ status: 'invalid_token' }, { status: 403 })
  }

  // Revogado?
  if (tk.is_revoked) {
    await logAccess(token, tk.investor_name, ip, ua, 'revoked', 'Token revogado')
    return NextResponse.json({ status: 'revoked' }, { status: 403 })
  }

  // Expirado?
  if (new Date(tk.expires_at) < new Date()) {
    await logAccess(token, tk.investor_name, ip, ua, 'expired', `Expirou em ${tk.expires_at}`)
    return NextResponse.json({ status: 'expired' }, { status: 403 })
  }

  // Primeiro acesso — travar IP
  if (!tk.locked_ip) {
    await supabase
      .from('investor_tokens')
      .update({
        locked_ip: ip,
        locked_at: new Date().toISOString(),
        locked_user_agent: ua,
        visits: 1,
        last_visit_at: new Date().toISOString(),
      })
      .eq('id', tk.id)

    await logAccess(token, tk.investor_name, ip, ua, 'first_access', `IP travado: ${ip}`)

    return NextResponse.json({
      status: 'granted',
      investor: tk.investor_name,
      first_access: true,
    })
  }

  // IP diferente — bloqueado
  if (tk.locked_ip !== ip) {
    await logAccess(token, tk.investor_name, ip, ua, 'ip_mismatch',
      `Esperado: ${tk.locked_ip}, recebido: ${ip}`)
    return NextResponse.json({ status: 'ip_mismatch' }, { status: 403 })
  }

  // Acesso válido — incrementar visitas
  await supabase
    .from('investor_tokens')
    .update({
      visits: (tk.visits || 0) + 1,
      last_visit_at: new Date().toISOString(),
    })
    .eq('id', tk.id)

  await logAccess(token, tk.investor_name, ip, ua, 'granted', `Visita #${(tk.visits || 0) + 1}`)

  return NextResponse.json({
    status: 'granted',
    investor: tk.investor_name,
  })
}

// Manifestação de interesse
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, name, email, amount, horizon } = body
  const ip = getClientIp(req)
  const ua = req.headers.get('user-agent') || ''

  // Validar token antes de aceitar
  const { data: tk } = await supabase
    .from('investor_tokens')
    .select('*')
    .eq('token', token)
    .single()

  if (!tk || tk.is_revoked || new Date(tk.expires_at) < new Date()) {
    return NextResponse.json({ error: 'invalid' }, { status: 403 })
  }

  if (tk.locked_ip && tk.locked_ip !== ip) {
    return NextResponse.json({ error: 'ip_mismatch' }, { status: 403 })
  }

  // Salvar no log com detalhes da manifestação
  await logAccess(token, tk.investor_name, ip, ua, 'granted',
    `MANIFESTACAO: ${name} <${email}> — €${amount} / ${horizon}y`)

  // Atualizar token com dados do formulário
  await supabase
    .from('investor_tokens')
    .update({
      investor_email: email || tk.investor_email,
      notes: `Manifestação: €${amount}, ${horizon} anos — ${name} <${email}> — ${new Date().toISOString()}`,
    })
    .eq('id', tk.id)

  return NextResponse.json({ status: 'ok' })
}

async function logAccess(
  token: string | null,
  investor_name: string | null,
  ip: string,
  user_agent: string,
  result: string,
  detail: string
) {
  await supabase.from('investor_access_log').insert({
    token,
    investor_name,
    ip,
    user_agent,
    result,
    detail,
  })
}
