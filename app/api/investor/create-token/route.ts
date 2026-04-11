import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Protegida por secret — só chamada internamente
const ADMIN_SECRET = process.env.INVESTOR_ADMIN_SECRET || 'judx-investor-2025'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, email, days, secret } = body

  if (secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }

  const token = randomBytes(16).toString('hex')
  const expires_at = new Date(Date.now() + (days || 30) * 86400000).toISOString()

  const { data, error } = await supabase
    .from('investor_tokens')
    .insert({
      token,
      investor_name: name,
      investor_email: email || null,
      expires_at,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const url = `https://judx.com.br/investor?t=${token}`

  return NextResponse.json({
    url,
    token,
    investor: name,
    expires_at,
    id: data.id,
  })
}
