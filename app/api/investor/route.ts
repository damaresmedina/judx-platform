import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Geo + Device ──

type GeoData = {
  country: string
  city: string
  region: string
  lat: number
  lon: number
  isp: string
}

async function geolocate(ip: string): Promise<GeoData | null> {
  if (!ip || ip === '0.0.0.0' || ip === '127.0.0.1' || ip.startsWith('192.168.')) return null
  try {
    const r = await fetch(`http://ip-api.com/json/${ip}?fields=country,city,regionName,lat,lon,isp,status`, {
      signal: AbortSignal.timeout(3000),
    })
    const d = await r.json()
    if (d.status !== 'success') return null
    return { country: d.country, city: d.city, region: d.regionName, lat: d.lat, lon: d.lon, isp: d.isp }
  } catch {
    return null
  }
}

function parseDevice(ua: string): string {
  if (!ua) return 'Unknown'
  const parts: string[] = []

  // OS
  if (/iPhone/.test(ua)) parts.push('iPhone')
  else if (/iPad/.test(ua)) parts.push('iPad')
  else if (/Android/.test(ua)) parts.push('Android')
  else if (/Windows/.test(ua)) parts.push('Windows')
  else if (/Mac OS/.test(ua)) parts.push('Mac')
  else if (/Linux/.test(ua)) parts.push('Linux')

  // Browser
  if (/Edg\//.test(ua)) parts.push('Edge')
  else if (/Chrome\//.test(ua) && !/Edg/.test(ua)) parts.push('Chrome')
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) parts.push('Safari')
  else if (/Firefox\//.test(ua)) parts.push('Firefox')

  // Mobile
  if (/Mobile/.test(ua)) parts.push('Mobile')
  else parts.push('Desktop')

  return parts.join(' · ') || 'Unknown'
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '0.0.0.0'
  )
}

// ── GET — Validar token ──

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t')
  const ip = getClientIp(req)
  const ua = req.headers.get('user-agent') || ''
  const device = parseDevice(ua)
  const geo = await geolocate(ip)

  if (!token) {
    return NextResponse.json({ status: 'invalid_token' }, { status: 403 })
  }

  const { data: tk, error } = await supabase
    .from('investor_tokens')
    .select('*')
    .eq('token', token)
    .single()

  if (error || !tk) {
    await logAccess(token, null, ip, ua, 'invalid_token', 'Token não existe', geo, device)
    return NextResponse.json({ status: 'invalid_token' }, { status: 403 })
  }

  if (tk.is_revoked) {
    await logAccess(token, tk.investor_name, ip, ua, 'revoked', 'Token revogado', geo, device)
    return NextResponse.json({ status: 'revoked' }, { status: 403 })
  }

  if (new Date(tk.expires_at) < new Date()) {
    await logAccess(token, tk.investor_name, ip, ua, 'expired', `Expirou em ${tk.expires_at}`, geo, device)
    return NextResponse.json({ status: 'expired' }, { status: 403 })
  }

  // Primeiro acesso — travar IP + salvar geo
  if (!tk.locked_ip) {
    await supabase
      .from('investor_tokens')
      .update({
        locked_ip: ip,
        locked_at: new Date().toISOString(),
        locked_user_agent: ua,
        visits: 1,
        last_visit_at: new Date().toISOString(),
        geo_country: geo?.country || null,
        geo_city: geo?.city || null,
        geo_region: geo?.region || null,
        geo_lat: geo?.lat || null,
        geo_lon: geo?.lon || null,
        geo_isp: geo?.isp || null,
        geo_device: device,
      })
      .eq('id', tk.id)

    await logAccess(token, tk.investor_name, ip, ua, 'first_access', `IP travado: ${ip}`, geo, device)

    const loc = geo ? `📍 ${geo.city}, ${geo.region}, ${geo.country}` : '📍 Geolocalização indisponível'

    await sendWhatsApp(
      `👁️ *JudX Investor*\n\n` +
      `*${tk.investor_name}* abriu o brief\n` +
      `${loc}\n` +
      `🌐 IP: ${ip}\n` +
      `📱 ${device}\n` +
      `🏢 ISP: ${geo?.isp || '?'}\n` +
      `🕐 ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC\n` +
      `🔒 IP travado — link não funciona de outro dispositivo`
    )

    return NextResponse.json({
      status: 'granted',
      investor: tk.investor_name,
      lang: tk.lang || 'en',
      ticket: tk.ticket_amount || 500000,
      first_access: true,
    })
  }

  // IP diferente — bloqueado + alerta
  if (tk.locked_ip !== ip) {
    await logAccess(token, tk.investor_name, ip, ua, 'ip_mismatch',
      `Esperado: ${tk.locked_ip}, recebido: ${ip}`, geo, device)

    const loc = geo ? `📍 ${geo.city}, ${geo.country}` : ''

    await sendWhatsApp(
      `⚠️ *JudX Investor*\n\n` +
      `Tentativa BLOQUEADA\n` +
      `🏷️ Token: *${tk.investor_name}*\n` +
      `🌐 IP tentativa: ${ip} ${loc}\n` +
      `📱 ${device}\n` +
      `🔒 IP original: ${tk.locked_ip}\n` +
      `⏰ ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`
    )

    return NextResponse.json({ status: 'ip_mismatch' }, { status: 403 })
  }

  // Acesso válido — incrementar
  await supabase
    .from('investor_tokens')
    .update({
      visits: (tk.visits || 0) + 1,
      last_visit_at: new Date().toISOString(),
    })
    .eq('id', tk.id)

  await logAccess(token, tk.investor_name, ip, ua, 'granted', `Visita #${(tk.visits || 0) + 1}`, geo, device)

  return NextResponse.json({
    status: 'granted',
    investor: tk.investor_name,
    lang: tk.lang || 'en',
    ticket: tk.ticket_amount || 500000,
  })
}

// ── POST — Manifestação de interesse ──

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, name, email, amount, horizon } = body
  const ip = getClientIp(req)
  const ua = req.headers.get('user-agent') || ''
  const device = parseDevice(ua)
  const geo = await geolocate(ip)

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

  await logAccess(token, tk.investor_name, ip, ua, 'granted',
    `MANIFESTACAO: ${name} <${email}> — €${amount} / ${horizon}y`, geo, device)

  await supabase
    .from('investor_tokens')
    .update({
      investor_email: email || tk.investor_email,
      notes: `Manifestação: €${amount}, ${horizon} anos — ${name} <${email}> — ${new Date().toISOString()}`,
    })
    .eq('id', tk.id)

  const loc = geo ? `📍 ${geo.city}, ${geo.region}, ${geo.country}` : ''

  await sendWhatsApp(
    `🔔 *JudX Investor*\n\n` +
    `*${name}* manifestou interesse\n` +
    `📧 ${email}\n` +
    `💶 €${amount?.toLocaleString('de-DE') || '?'}\n` +
    `📅 ${horizon} anos\n` +
    `${loc}\n` +
    `📱 ${device}\n` +
    `🏷️ Token: ${tk.investor_name}\n` +
    `🕐 ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`
  )

  return NextResponse.json({ status: 'ok' })
}

// ── WhatsApp via Twilio ──

async function sendWhatsApp(message: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM
  const to = 'whatsapp:+5561995759444'

  if (!sid || !authToken || !from) return

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${sid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: from, To: to, Body: message }),
    })
  } catch {
    // Falha silenciosa
  }
}

// ── Log com geo ──

async function logAccess(
  token: string | null,
  investor_name: string | null,
  ip: string,
  user_agent: string,
  result: string,
  detail: string,
  geo: GeoData | null,
  device: string
) {
  await supabase.from('investor_access_log').insert({
    token,
    investor_name,
    ip,
    user_agent,
    result,
    detail,
    geo_country: geo?.country || null,
    geo_city: geo?.city || null,
    geo_region: geo?.region || null,
    geo_lat: geo?.lat || null,
    geo_lon: geo?.lon || null,
    geo_isp: geo?.isp || null,
    geo_device: device,
  })
}
