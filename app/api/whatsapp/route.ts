import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ALLOWED_NUMBER = 'whatsapp:+5561995759444'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const from = formData.get('From') as string
  const body = (formData.get('Body') as string || '').trim()

  // Só aceita comandos do número da empresa
  if (from !== ALLOWED_NUMBER) {
    return twiml('Access denied.')
  }

  // /token nome [valor] [en|pt] [dias]
  // Ex: /token kubel 500000 en 30
  // Ex: /token silva 100000 pt
  // Ex: /token garcia (defaults: 500000, en, 30)
  if (body.startsWith('/token ')) {
    const parts = body.replace('/token ', '').trim().split(/\s+/)
    const name = parts[0]?.toLowerCase()

    // Parse optional params in any order
    let amount = 500000
    let lang = 'en'
    let days = 30

    for (let i = 1; i < parts.length; i++) {
      const p = parts[i].toLowerCase()
      if (p === 'en' || p === 'pt') lang = p
      else if (parseInt(p) > 1000) amount = parseInt(p)
      else if (parseInt(p) > 0 && parseInt(p) <= 365) days = parseInt(p)
    }

    if (!name || name.length < 2) {
      return twiml('Usage: /token name [amount] [en|pt] [days]\nEx: /token kubel 500000 en 30\nEx: /token silva 100000 pt')
    }

    // Verificar se já existe
    const { data: existing } = await supabase
      .from('investor_tokens')
      .select('token, investor_name, locked_ip, visits, expires_at, lang, ticket_amount')
      .eq('token', name)
      .single()

    if (existing) {
      const status = existing.locked_ip ? `IP locked (${existing.visits} visits)` : 'Not opened yet'
      return twiml(
        `Token "${name}" already exists.\n` +
        `${status}\n` +
        `€${existing.ticket_amount?.toLocaleString('de-DE')} · ${existing.lang}\n` +
        `Expires: ${new Date(existing.expires_at).toLocaleDateString('pt-BR')}\n\n` +
        `judx.com.br/proposal/${name}`
      )
    }

    // Criar token
    const expires_at = new Date(Date.now() + days * 86400000).toISOString()
    const investorName = name.charAt(0).toUpperCase() + name.slice(1)

    const { error } = await supabase
      .from('investor_tokens')
      .insert({
        token: name,
        investor_name: investorName,
        expires_at,
        lang,
        ticket_amount: amount,
        notes: `Via WhatsApp — €${amount.toLocaleString('de-DE')} · ${lang} · ${days}d — ${new Date().toISOString()}`,
      })

    if (error) {
      return twiml(`Error: ${error.message}`)
    }

    return twiml(
      `Token created.\n\n` +
      `Name: ${investorName}\n` +
      `Ticket: €${amount.toLocaleString('de-DE')}\n` +
      `Lang: ${lang}\n` +
      `Expires: ${days} days\n\n` +
      `judx.com.br/proposal/${name}`
    )
  }

  // /list — listar tokens ativos
  if (body === '/list') {
    const { data: tokens } = await supabase
      .from('investor_tokens')
      .select('token, investor_name, locked_ip, visits, expires_at, is_revoked')
      .order('investor_name')

    if (!tokens || tokens.length === 0) {
      return twiml('No active tokens.')
    }

    const lines = tokens.map(t => {
      const status = t.is_revoked ? 'REVOKED' : t.locked_ip ? `OPENED (${t.visits}x)` : 'PENDING'
      const exp = new Date(t.expires_at).toLocaleDateString('pt-BR')
      return `${t.investor_name}: ${status} — ${exp}`
    })

    return twiml(`Tokens (${tokens.length}):\n\n${lines.join('\n')}`)
  }

  // /revoke nome — revogar token
  if (body.startsWith('/revoke ')) {
    const name = body.replace('/revoke ', '').trim().toLowerCase()

    const { data } = await supabase
      .from('investor_tokens')
      .update({ is_revoked: true })
      .eq('token', name)
      .select('investor_name')
      .single()

    if (!data) {
      return twiml(`Token "${name}" not found.`)
    }

    return twiml(`Token "${data.investor_name}" revoked. Link no longer works.`)
  }

  // /reset nome — resetar IP lock
  if (body.startsWith('/reset ')) {
    const name = body.replace('/reset ', '').trim().toLowerCase()

    const { data } = await supabase
      .from('investor_tokens')
      .update({ locked_ip: null, locked_at: null, locked_user_agent: null, visits: 0 })
      .eq('token', name)
      .select('investor_name')
      .single()

    if (!data) {
      return twiml(`Token "${name}" not found.`)
    }

    return twiml(`Token "${data.investor_name}" reset. IP unlocked, ready for new access.`)
  }

  // /delete nome — deletar token e logs
  if (body.startsWith('/delete ')) {
    const name = body.replace('/delete ', '').trim().toLowerCase()

    await supabase.from('investor_access_log').delete().eq('token', name)
    const { data } = await supabase
      .from('investor_tokens')
      .delete()
      .eq('token', name)
      .select('investor_name')
      .single()

    if (!data) {
      return twiml(`Token "${name}" not found.`)
    }

    return twiml(`Token "${data.investor_name}" deleted permanently.`)
  }

  // Help
  return twiml(
    `JudX Investor Commands:\n\n` +
    `/token name [days] — create token\n` +
    `/list — list all tokens\n` +
    `/revoke name — revoke access\n` +
    `/reset name — unlock IP\n` +
    `/delete name — delete permanently`
  )
}

function twiml(message: string) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
  return new NextResponse(xml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
