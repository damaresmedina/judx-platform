import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ADMIN_PASS = process.env.ADMIN_PASS || 'judx-admin-2026'

export async function GET(req: NextRequest) {
  const pass = req.nextUrl.searchParams.get('p')
  const tokenName = req.nextUrl.searchParams.get('token')

  if (pass !== ADMIN_PASS || !tokenName) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: tk } = await supabase
    .from('investor_tokens')
    .select('*')
    .eq('token', tokenName)
    .single()

  if (!tk) {
    return NextResponse.json({ error: 'token not found' }, { status: 404 })
  }

  const ticket = tk.ticket_amount || 500000
  const fmtTicket = `€${ticket.toLocaleString('de-DE')}`
  const isEN = tk.lang !== 'pt'

  // Return HTML that can be printed to PDF by the browser
  const html = generatePdfHtml(tk.investor_name, fmtTicket, isEN)

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}

function generatePdfHtml(name: string, ticket: string, isEN: boolean) {
  const t = isEN ? {
    sub: 'Judicial Intelligence Infrastructure',
    conf: 'Confidential · Investor Brief — 2026',
    tag: '3.14M STF + STJ decisions. One system. Structural visibility.',
    s01: 'What JudX does',
    s01p: 'JudX is an operational system for navigating institutional behavior at scale. It maps litigation exposure, anticipates decision environments, tracks procedural paths, and identifies patterns of decision and non-decision.',
    s01q: 'JudX turns judicial systems into actionable infrastructure.',
    s02: 'Business Model',
    freeRole: 'Distribution layer', free: ['Broad access', 'Market penetration', 'Continuous user growth'],
    compRole: 'Revenue layer', comp: ['Custom institutional environments', 'Integration into workflows', 'High-value contracts'],
    s02p: 'Freemium distributes. In-company monetizes.',
    s03: 'Commercial Traction',
    s03p: 'A pilot project is currently being structured with one of the largest litigants in Brazil, focused on mapping decision exposure and procedural dynamics at the Supreme Court level.',
    s03q: 'JudX is already inside the system it maps.',
    s04: 'What makes it different',
    s04h: 'Legal databases retrieve documents. <em>JudX maps institutional behavior.</em>',
    diffs: ['Decisions', 'Procedural environments', 'Actors', 'Outcomes'],
    s04p: 'This is structural intelligence, not search.',
    s05: 'Data Advantage',
    s05p: 'Replicating JudX requires: large-scale judicial parsing, procedural normalization, relational modeling, and continuous ingestion. <strong>JudX has already done this.</strong>',
    s06: 'Why this fits a European investor',
    fits: ['EU · European incorporation', '6× · EUR/BRL efficiency', 'SYS · Process-driven', 'SCL · Scalable'],
    s07: 'Risk Profile',
    riskH: 'Risk', risks: ['Institutional adoption cycles', 'Ongoing data ingestion'],
    mitH: 'Mitigation', mits: ['Internalized database', 'Proprietary pipeline', 'Multi-client model', 'European legal structure'],
    s08: 'Investment scope (current phase)',
    alloc: 'allocated to scaling and commercial structuring',
    horizon: 'Horizon', horizonV: '5 years', profile: 'Profile', profileV: 'Structured return profile',
    s09: 'Who built this',
    bio: '<strong>Constitutional lawyer</strong> · STF researcher (15+ years) · Founder, Instituto Constituição Aberta (ICONS) · Visiting Scholar, Università degli Studi di Milano-Bicocca',
    s10: 'Access',
    s10p: 'This is not a public offering. Access is limited and discussed directly.',
    closing: 'If the structure aligns with your investment logic, we can go through the numbers in detail.',
    foot: `Confidential · ${name} · Not for distribution`,
  } : {
    sub: 'Infraestrutura de Inteligência Judicial',
    conf: 'Confidencial · Proposta de Investimento — 2026',
    tag: '3,14M decisões STF + STJ. Um sistema. Visibilidade estrutural.',
    s01: 'O que o JudX faz',
    s01p: 'JudX é um sistema operacional para navegar o comportamento institucional em escala. Mapeia exposição litigiosa, antecipa ambientes decisórios, rastreia caminhos processuais e identifica padrões de decisão e não-decisão.',
    s01q: 'JudX transforma sistemas judiciais em infraestrutura acionável.',
    s02: 'Modelo de Negócio',
    freeRole: 'Camada de distribuição', free: ['Acesso amplo', 'Penetração de mercado', 'Crescimento contínuo'],
    compRole: 'Camada de receita', comp: ['Ambientes institucionais customizados', 'Integração em fluxos de trabalho', 'Contratos de alto valor'],
    s02p: 'Freemium distribui. In-company monetiza.',
    s03: 'Tração Comercial',
    s03p: 'Um projeto-piloto está sendo estruturado com um dos maiores litigantes do Brasil, focado no mapeamento da exposição decisória e dinâmicas processuais no STF.',
    s03q: 'O JudX já está dentro do sistema que mapeia.',
    s04: 'O que o diferencia',
    s04h: 'Bancos jurídicos recuperam documentos. <em>JudX mapeia comportamento institucional.</em>',
    diffs: ['Decisões', 'Ambientes processuais', 'Atores', 'Resultados'],
    s04p: 'Isto é inteligência estrutural, não busca.',
    s05: 'Vantagem de Dados',
    s05p: 'Replicar o JudX exige: parsing judicial em larga escala, normalização processual, modelagem relacional e ingestão contínua. <strong>O JudX já fez isso.</strong>',
    s06: 'Por que se encaixa para um investidor europeu',
    fits: ['EU · Incorporação europeia', '6× · Eficiência EUR/BRL', 'SYS · Orientado a processos', 'SCL · Escalável'],
    s07: 'Perfil de Risco',
    riskH: 'Risco', risks: ['Ciclos de adoção institucional', 'Ingestão contínua de dados'],
    mitH: 'Mitigação', mits: ['Base internalizada', 'Pipeline proprietário', 'Modelo multi-cliente', 'Estrutura jurídica europeia'],
    s08: 'Escopo do investimento (fase atual)',
    alloc: 'alocado para escala e estruturação comercial',
    horizon: 'Horizonte', horizonV: '5 anos', profile: 'Perfil', profileV: 'Perfil de retorno estruturado',
    s09: 'Quem construiu',
    bio: '<strong>Advogada constitucionalista</strong> · Pesquisadora STF (15+ anos) · Fundadora, Instituto Constituição Aberta (ICONS) · Visiting Scholar, Università degli Studi di Milano-Bicocca',
    s10: 'Acesso',
    s10p: 'Isto não é uma oferta pública. O acesso é limitado e discutido diretamente.',
    closing: 'Se a estrutura faz sentido para a sua lógica de investimento, podemos analisar os números em detalhe.',
    foot: `Confidencial · ${name} · Não distribuir`,
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}body{background:#0d1f35;color:#fff;font-family:'DM Sans',sans-serif;font-weight:300;font-size:9pt;line-height:1.6;padding:40px 50px}
h1{font-family:'Playfair Display',serif;font-weight:900;font-size:32pt;color:#fff;letter-spacing:-.02em}h1 span{color:#c8922a}
.sub{font-family:'DM Mono',monospace;font-size:6.5pt;letter-spacing:.25em;color:#6b7280;text-transform:uppercase;margin-bottom:16px}
.conf{font-family:'DM Mono',monospace;font-size:6pt;letter-spacing:.15em;color:#c8922a;text-transform:uppercase;text-align:right}
.tagline{font-family:'Playfair Display',serif;font-style:italic;font-size:11pt;color:rgba(255,255,255,.55);margin-bottom:24px}
.rule{width:50px;height:1px;background:#c8922a;margin:0 0 20px;opacity:.4}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:rgba(200,146,42,.15);border:1px solid rgba(200,146,42,.15);margin-bottom:20px}
.stat{background:#0d1f35;padding:10px 8px;text-align:center}.stat-n{font-family:'Playfair Display',serif;font-size:16pt;font-weight:700;color:#c8922a;line-height:1}
.stat-l{font-size:6.5pt;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:#fff;margin-top:3px}.stat-s{font-family:'DM Mono',monospace;font-size:5.5pt;color:#6b7280}
.sec{margin-bottom:16px}.sec-n{font-family:'DM Mono',monospace;font-size:6pt;letter-spacing:.2em;color:#c8922a;text-transform:uppercase;margin-bottom:4px;opacity:.7}
.sec-h{font-family:'Playfair Display',serif;font-size:12pt;font-weight:700;color:#fff;margin-bottom:6px;line-height:1.25}.sec-h em{color:#c8922a;font-style:italic}
p{color:#8896a8;margin-bottom:6px;font-size:8.5pt}p strong{color:#fff;font-weight:500}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:rgba(200,146,42,.15);border:1px solid rgba(200,146,42,.15);margin:8px 0}
.col{background:#0d1f35;padding:10px 12px}.col-gold{background:rgba(200,146,42,.04)}
.col-title{font-family:'Playfair Display',serif;font-size:10pt;font-weight:700;color:#fff;margin-bottom:2px}
.col-role{font-family:'DM Mono',monospace;font-size:5.5pt;letter-spacing:.12em;color:#c8922a;text-transform:uppercase;margin-bottom:6px}
.col li{font-size:8pt;color:#8896a8;list-style:none;padding-left:8px;position:relative;line-height:1.8}
.col li::before{content:'';position:absolute;left:0;top:6px;width:3px;height:3px;border-radius:50%;background:#c8922a;opacity:.5}
.tags{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0}.tag{padding:4px 10px;border:1px solid rgba(200,146,42,.25);background:rgba(200,146,42,.04);font-family:'DM Mono',monospace;font-size:6.5pt;letter-spacing:.1em;color:#c8922a;text-transform:uppercase}
.terms{border:1px solid rgba(200,146,42,.15);margin:8px 0}.term-row{display:grid;grid-template-columns:80px 1fr;border-bottom:1px solid rgba(200,146,42,.07)}
.term-row:last-child{border-bottom:none}.term-k{padding:6px 8px;background:rgba(200,146,42,.06);font-family:'DM Mono',monospace;font-size:6pt;letter-spacing:.1em;color:#c8922a;text-transform:uppercase;display:flex;align-items:center}
.term-v{padding:6px 10px;font-size:8pt;color:#8896a8;display:flex;align-items:center}
.fit{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:rgba(200,146,42,.15);border:1px solid rgba(200,146,42,.15);margin:8px 0}
.fit-item{background:#0d1f35;padding:8px;text-align:center;font-size:7pt;color:#8896a8}
.quote{border-left:2px solid #c8922a;padding:8px 12px;margin:8px 0;background:rgba(200,146,42,.04)}
.quote p{font-family:'Playfair Display',serif;font-style:italic;color:#c8922a;font-size:9pt}
.footer{text-align:center;border-top:1px solid rgba(200,146,42,.15);padding-top:10px;margin-top:16px}
.footer a{font-family:'DM Mono',monospace;font-size:6.5pt;letter-spacing:.2em;color:#c8922a;text-decoration:none;text-transform:uppercase}
.footer-conf{font-family:'DM Mono',monospace;font-size:5.5pt;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-top:4px}
.bio-books{display:flex;gap:6px;margin-top:6px}.bio-book{padding:4px 8px;border:1px solid rgba(200,146,42,.15);font-family:'DM Mono',monospace;font-size:6pt;color:#8896a8}.bio-book em{color:#c8922a;font-style:italic}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px"><div><h1>Jud<span>X</span></h1><div class="sub">${t.sub}</div></div><div class="conf">${t.conf}<br>judx.com.br</div></div>
<div class="tagline">${t.tag}</div><div class="rule"></div>
<div class="stats"><div class="stat"><div class="stat-n">3.14M+</div><div class="stat-l">${isEN ? 'Decisions' : 'Decisões'}</div><div class="stat-s">STF + STJ</div></div><div class="stat"><div class="stat-n">2.21M</div><div class="stat-l">${isEN ? 'Cases' : 'Processos'}</div><div class="stat-s">${isEN ? 'full lifecycle' : 'ciclo completo'}</div></div><div class="stat"><div class="stat-n">1.38M</div><div class="stat-l">${isEN ? 'Litigants' : 'Litigantes'}</div><div class="stat-s">${isEN ? 'parties + counsel' : 'partes + advogados'}</div></div><div class="stat"><div class="stat-n">Live</div><div class="stat-l">Pipeline</div><div class="stat-s">${isEN ? 'continuous' : 'contínuo'}</div></div></div>
<div class="sec"><div class="sec-n">01 — ${t.s01}</div><p>${t.s01p}</p><div class="quote"><p>${t.s01q}</p></div></div>
<div class="sec"><div class="sec-n">02 — ${t.s02}</div><div class="two-col"><div class="col"><div class="col-title">Freemium</div><div class="col-role">${t.freeRole}</div><ul>${t.free.map(x => `<li>${x}</li>`).join('')}</ul></div><div class="col col-gold"><div class="col-title">In-company</div><div class="col-role">${t.compRole}</div><ul>${t.comp.map(x => `<li>${x}</li>`).join('')}</ul></div></div><p>${t.s02p}</p></div>
<div class="sec"><div class="sec-n">03 — ${t.s03}</div><p>${t.s03p}</p><div class="quote"><p>${t.s03q}</p></div></div>
<div class="sec"><div class="sec-n">04 — ${t.s04}</div><div class="sec-h">${t.s04h}</div><div class="tags">${t.diffs.map(d => `<div class="tag">${d}</div>`).join('')}</div><p>${t.s04p}</p></div>
<div class="sec"><div class="sec-n">05 — ${t.s05}</div><p>${t.s05p}</p></div>
<div class="sec"><div class="sec-n">06 — ${t.s06}</div><div class="fit">${t.fits.map(f => `<div class="fit-item">${f}</div>`).join('')}</div></div>
<div class="sec"><div class="sec-n">07 — ${t.s07}</div><div class="two-col"><div class="col"><div class="col-role">${t.riskH}</div><ul>${t.risks.map(r => `<li>${r}</li>`).join('')}</ul></div><div class="col col-gold"><div class="col-role">${t.mitH}</div><ul>${t.mits.map(m => `<li>${m}</li>`).join('')}</ul></div></div></div>
<div class="sec"><div class="sec-n">08 — ${t.s08}</div><div class="sec-h">${ticket} — <em>${t.alloc}</em></div><div class="terms"><div class="term-row"><div class="term-k">${t.horizon}</div><div class="term-v">${t.horizonV}</div></div><div class="term-row"><div class="term-k">${t.profile}</div><div class="term-v">${t.profileV}</div></div><div class="term-row"><div class="term-k">${isEN ? 'Currency' : 'Moeda'}</div><div class="term-v">EUR</div></div></div></div>
<div class="sec"><div class="sec-n">09 — ${t.s09}</div><div class="sec-h">Damares <em>Medina</em></div><p>${t.bio}</p><div class="bio-books"><div class="bio-book"><em>Amicus Curiae</em> (2010)</div><div class="bio-book"><em>Repercussão Geral no STF</em> (Saraiva, 2015)</div></div></div>
<div class="sec"><div class="sec-n">10 — ${t.s10}</div><p>${t.s10p}</p></div>
<div class="quote" style="margin-top:12px"><p>${t.closing}</p></div>
<div class="footer"><a href="https://judx.com.br">judx.com.br</a><div class="footer-conf">${t.foot}</div></div>
</body></html>`
}
