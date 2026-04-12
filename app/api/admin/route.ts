import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ADMIN_PASS = process.env.ADMIN_PASS || 'judx-admin-2026'

export async function GET(req: NextRequest) {
  const pass = req.nextUrl.searchParams.get('p')
  if (pass !== ADMIN_PASS) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: tokens } = await supabase
    .from('investor_tokens')
    .select('*')
    .order('investor_name')

  const { data: logs } = await supabase
    .from('investor_access_log')
    .select('*')
    .order('accessed_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ tokens, logs })
}
