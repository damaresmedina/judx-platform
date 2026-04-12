'use client'

import { useEffect, useState, use } from 'react'
import { useParams } from 'next/navigation'

function InvestorContent() {
  const params = useParams()
  const token = params.token as string

  const [status, setStatus] = useState<'loading' | 'granted' | 'denied'>('loading')
  const [denyReason, setDenyReason] = useState('')
  const [investorName, setInvestorName] = useState('')
  const [fadeIn, setFadeIn] = useState(false)


  // Validate token on load
  useEffect(() => {
    if (!token) {
      setDenyReason('No access token provided.')
      return
    }
    fetch(`/api/investor?t=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.status === 'granted') {
          setInvestorName(d.investor || '')
          setStatus('granted')
          setTimeout(() => setFadeIn(true), 100)
        } else {
          setStatus('denied')
          const reasons: Record<string, string> = {
            ip_mismatch: 'This link has already been used from a different device.',
            expired: 'This link has expired.',
            revoked: 'This link has been revoked.',
            invalid_token: 'Invalid access link.',
          }
          setDenyReason(reasons[d.status] || 'Access denied.')
        }
      })
      .catch(() => {
        setStatus('denied')
        setDenyReason('Connection error.')
      })
  }, [token])

  // Reveal on scroll
  useEffect(() => {
    if (status !== 'granted') return
    const els = document.querySelectorAll('.inv-reveal')
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('inv-vis')
          obs.unobserve(e.target)
        }
      })
    }, { threshold: 0.06 })
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [status])

  // Block print/devtools/copy/select
  useEffect(() => {
    const ctx = (e: MouseEvent) => e.preventDefault()
    const copy = (e: ClipboardEvent) => e.preventDefault()
    const drag = (e: DragEvent) => e.preventDefault()
    const kbd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (((e.ctrlKey || e.metaKey) && ['s', 'p', 'u', 'a', 'c', 'x'].includes(k)) ||
        e.key === 'F12' || e.key === 'PrintScreen' ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c', 's'].includes(k))) {
        e.preventDefault()
      }
    }
    document.addEventListener('contextmenu', ctx)
    document.addEventListener('keydown', kbd)
    document.addEventListener('copy', copy)
    document.addEventListener('cut', copy)
    document.addEventListener('dragstart', drag)
    return () => {
      document.removeEventListener('contextmenu', ctx)
      document.removeEventListener('keydown', kbd)
      document.removeEventListener('copy', copy)
      document.removeEventListener('cut', copy)
      document.removeEventListener('dragstart', drag)
    }
  }, [])

  const wmText = investorName ? `CONFIDENTIAL · ${investorName.toUpperCase()}` : 'CONFIDENTIAL'

  // ── DENIED SCREEN ──
  if (status === 'denied') {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: investorStyles }} />
        <div className="inv-page">
          <div className="inv-lock">
            <div className="lk">
              <div className="lk-logo">Jud<span className="logo-x">X</span></div>
              <div className="lk-sub">Judicial Intelligence</div>
              <div className="lk-line" />
              <div className="inv-deny">{denyReason}</div>
              <div className="inv-deny-sub">If you believe this is an error, contact contato@judx.com.br</div>
            </div>
          </div>
        </div>
      </>
    )
  }

  // ── LOADING ──
  if (status === 'loading') {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: investorStyles }} />
        <div className="inv-page">
          <div className="inv-lock">
            <div className="lk">
              <div className="lk-logo">Jud<span className="logo-x">X</span></div>
              <div className="lk-sub">Verifying access...</div>
            </div>
          </div>
        </div>
      </>
    )
  }

  // ── GRANTED ──
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: investorStyles }} />

      <div className="inv-page">
        {/* WATERMARK — with investor name for traceability */}
        <div className="inv-wm">{wmText}</div>

        {/* APP */}
        <div className={`inv-app ${fadeIn ? 'on' : ''}`}>

          {/* HERO */}
          <section className="inv-hero">
            <div className="hero-bg" />
            <div className="hero-grid" />
            <div className="hero-inner">
              <div className="hero-eye">Confidential — Investor Brief (EU) — 2026</div>
              <div className="hero-logo">Jud<span className="logo-x">X</span></div>
              <div className="hero-name">Judicial Intelligence Infrastructure</div>
              <div className="hero-rule" />
              <div className="hero-tag">3.14M STF + STJ decisions. One system. Structural visibility.</div>
              <div className="hero-meta">judx.com.br &nbsp;·&nbsp; European HQ &nbsp;·&nbsp; Brazilian Operations</div>
            </div>
            <div className="scroll-hint">
              <span>scroll</span>
              <div className="scroll-hint-bar" />
            </div>
          </section>

          {/* 01 — WHAT JUDX DOES */}
          <div className="inv-sec inv-reveal">
            <div className="sec-n">01 — What JudX does</div>
            <h2 className="sec-h">Not legal research.<br /><em>Operational intelligence.</em></h2>
            <p className="inv-lead">JudX is an operational system for navigating institutional behavior at scale.</p>
            <div className="cap-grid">
              <div className="cap-item"><div className="cap-icon">01</div><div className="cap-text">Mapping litigation exposure at Brazil{"'"}s highest courts</div></div>
              <div className="cap-item"><div className="cap-icon">02</div><div className="cap-text">Anticipating decision environments and their effects</div></div>
              <div className="cap-item"><div className="cap-icon">03</div><div className="cap-text">Tracking procedural paths that shape outcomes</div></div>
              <div className="cap-item"><div className="cap-icon">04</div><div className="cap-text">Identifying patterns of decision and non-decision</div></div>
            </div>
            <div className="inv-hq"><p>JudX turns judicial systems into actionable infrastructure.</p></div>
          </div>

          {/* 02 — THE ASSET */}
          <div className="inv-sec inv-reveal">
            <div className="sec-n">02 — The Asset</div>
            <h2 className="sec-h">The core asset is <em>already built</em></h2>
            <div className="data-panel" style={{ padding: 0 }}>
              <div className="data-grid">
                <div className="data-cell">
                  <div className="data-n">3.14M+</div>
                  <div className="data-l">Decisions structured</div>
                  <div className="data-s">STF + STJ</div>
                </div>
                <div className="data-cell">
                  <div className="data-n">2.21M</div>
                  <div className="data-l">Cases mapped</div>
                  <div className="data-s">full lifecycle</div>
                </div>
                <div className="data-cell">
                  <div className="data-n">1.38M</div>
                  <div className="data-l">Litigants indexed</div>
                  <div className="data-s">parties + counsel</div>
                </div>
                <div className="data-cell">
                  <div className="data-n">Live</div>
                  <div className="data-l">Ingestion pipeline</div>
                  <div className="data-s">continuous update</div>
                </div>
              </div>
            </div>
            <p className="inv-lead" style={{ marginTop: '1.5rem' }}>Investment accelerates scale — not construction.</p>
          </div>

          {/* 03 — BUSINESS MODEL */}
          <div className="inv-sec inv-reveal">
            <div className="sec-n">03 — Business Model</div>
            <h2 className="sec-h">Dual structure.<br /><em>Distribution + Revenue.</em></h2>
            <div className="dual-grid">
              <div className="dual-box">
                <div className="dual-label">Freemium</div>
                <div className="dual-role">Distribution layer</div>
                <ul className="dual-list">
                  <li>Broad access</li>
                  <li>Market penetration</li>
                  <li>Continuous user growth</li>
                </ul>
              </div>
              <div className="dual-box dual-box-gold">
                <div className="dual-label">In-company</div>
                <div className="dual-role">Revenue layer</div>
                <ul className="dual-list">
                  <li>Custom institutional environments</li>
                  <li>Integration into workflows</li>
                  <li>High-value contracts</li>
                </ul>
              </div>
            </div>
            <p className="inv-lead" style={{ marginTop: '1.2rem' }}>Freemium distributes. In-company monetizes.</p>
          </div>

          {/* 04 — COMMERCIAL TRACTION */}
          <div className="inv-sec inv-reveal">
            <div className="sec-n">04 — Commercial Traction</div>
            <h2 className="sec-h">Already operating inside <em>real institutions</em></h2>
            <p className="inv-lead">A pilot project is currently being structured with one of the largest litigants in Brazil, focused on mapping decision exposure and procedural dynamics at the Supreme Court level.</p>
            <div className="inv-hq"><p>JudX is already inside the system it maps.</p></div>
          </div>

          {/* 05 — WHAT MAKES IT DIFFERENT */}
          <div className="inv-sec inv-reveal">
            <div className="sec-n">05 — What makes it different</div>
            <h2 className="sec-h">Legal databases retrieve documents.<br /><em>JudX maps institutional behavior.</em></h2>
            <div className="diff-grid">
              <div className="diff-item"><div className="diff-label">Decisions</div></div>
              <div className="diff-item"><div className="diff-label">Procedural environments</div></div>
              <div className="diff-item"><div className="diff-label">Actors</div></div>
              <div className="diff-item"><div className="diff-label">Outcomes</div></div>
            </div>
            <p className="inv-lead" style={{ marginTop: '1.2rem' }}>This is structural intelligence, not search.</p>
          </div>

          {/* 06 — DATA ADVANTAGE */}
          <div className="inv-sec inv-reveal">
            <div className="sec-n">06 — Data Advantage</div>
            <h2 className="sec-h">Replicating JudX <em>requires</em></h2>
            <div className="moat-list">
              <div className="moat-item"><span className="moat-n">01</span>Large-scale judicial parsing</div>
              <div className="moat-item"><span className="moat-n">02</span>Procedural normalization</div>
              <div className="moat-item"><span className="moat-n">03</span>Relational modeling</div>
              <div className="moat-item"><span className="moat-n">04</span>Continuous ingestion</div>
            </div>
            <div className="inv-hq"><p>JudX has already done this.</p></div>
          </div>

          {/* 07 — WHY EUROPEAN INVESTOR */}
          <div className="inv-sec inv-reveal">
            <div className="sec-n">07 — Why this fits a European investor</div>
            <h2 className="sec-h">European structure.<br /><em>Brazilian scale.</em></h2>
            <div className="fit-grid">
              <div className="fit-item"><div className="fit-icon">EU</div><div className="fit-text">European incorporation</div></div>
              <div className="fit-item"><div className="fit-icon">6×</div><div className="fit-text">EUR → BRL cost efficiency</div></div>
              <div className="fit-item"><div className="fit-icon">SYS</div><div className="fit-text">Process-driven model</div></div>
              <div className="fit-item"><div className="fit-icon">SCL</div><div className="fit-text">Scalable structure</div></div>
            </div>
          </div>

          {/* 08 — RISK + MITIGATION */}
          <div className="inv-sec inv-reveal">
            <div className="sec-n">08 — Risk Profile</div>
            <h2 className="sec-h">Risks are <em>identified and mitigated</em></h2>
            <div className="risk-grid">
              <div className="risk-col">
                <div className="risk-header">Risk</div>
                <div className="risk-item">Institutional adoption cycles</div>
                <div className="risk-item">Ongoing data ingestion</div>
              </div>
              <div className="risk-col risk-col-gold">
                <div className="risk-header">Mitigation</div>
                <div className="risk-item">Internalized database</div>
                <div className="risk-item">Proprietary pipeline</div>
                <div className="risk-item">Multi-client model</div>
                <div className="risk-item">European legal structure</div>
              </div>
            </div>
          </div>

          {/* 09 — INVESTMENT SCOPE */}
          <div className="inv-sec inv-reveal">
            <div className="sec-n">09 — Investment scope (current phase)</div>
            <h2 className="sec-h">€500,000 — <em>allocated to scaling and commercial structuring</em></h2>
            <div className="inv-terms">
              <div className="term-row"><div className="term-k">Horizon</div><div className="term-v">5 years</div></div>
              <div className="term-row"><div className="term-k">Profile</div><div className="term-v">Structured return profile</div></div>
            </div>
          </div>

          {/* 10 — WHO BUILT THIS */}
          <div className="inv-sec inv-reveal">
            <div className="sec-n">10 — Who built this</div>
            <h2 className="sec-h">Damares <em>Medina</em></h2>
            <div className="bio-list">
              <p className="inv-lead"><strong>Constitutional lawyer</strong> · STF researcher (15+ years)</p>
              <p className="inv-lead">Founder — <strong>Instituto Constituição Aberta (ICONS)</strong></p>
              <p className="inv-lead">Visiting Scholar — <strong>Università degli Studi di Milano-Bicocca</strong></p>
            </div>
            <div className="bio-books">
              <div className="bio-book"><em>Amicus Curiae</em> (2010)</div>
              <div className="bio-book"><em>Repercussão Geral no STF</em> (Saraiva, 2015)</div>
            </div>
          </div>

          {/* 11 — ACCESS */}
          <div className="inv-sec inv-reveal">
            <div className="sec-n">11 — Access</div>
            <h2 className="sec-h">This is not <em>a public offering</em></h2>
            <p className="inv-lead">Access is limited and discussed directly.</p>
          </div>

          {/* 12 — CLOSING */}
          <div className="inv-sec inv-reveal">
            <div className="sec-n">12 — Next step</div>
            <div className="final-q">
              <div className="fq-mark">{"\u201C"}</div>
              <p className="fq-text">If the structure aligns with your investment logic, we can go through the numbers in detail.</p>
            </div>
          </div>

          <footer className="inv-footer">
            <a href="https://judx.com.br" target="_blank" rel="noopener">judx.com.br</a>
            <div className="foot-conf">Confidential · {investorName} · Not for distribution</div>
          </footer>
        </div>
      </div>
    </>
  )
}

export default function InvestorPage() {
  return <InvestorContent />
}

// ── ALL CSS ISOLATED ──
const investorStyles = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');

.inv-page *,.inv-page *::before,.inv-page *::after{box-sizing:border-box;margin:0;padding:0}
.inv-page *{-webkit-user-select:none;user-select:none}
.inv-page{
  --navy:#0d1f35;--navy2:#162d4a;
  --gold:#c8922a;--gold2:#e8b44a;--lgold:#f5f0e8;
  --white:#ffffff;--gray:#6b7280;--mgray:#8896a8;
  --dgray:#2a3547;--border:rgba(200,146,42,0.15);
  background:var(--navy);color:var(--white);font-family:'DM Sans',sans-serif;font-weight:300;overflow-x:hidden;min-height:100vh;
}

/* ── LOCK / DENY ── */
.inv-lock{position:fixed;inset:0;z-index:9999;background:var(--navy);display:flex;align-items:center;justify-content:center}
.lk{text-align:center;padding:2rem 1.5rem;animation:inv-up .9s ease both}
.lk-logo{font-family:'Playfair Display',serif;font-size:clamp(4rem,15vw,6rem);font-weight:700;color:var(--white);letter-spacing:.02em;line-height:1}
.logo-x{color:var(--gold)}
.lk-sub{font-family:'DM Mono',monospace;font-size:.58rem;letter-spacing:.28em;color:var(--gray);text-transform:uppercase;margin-top:.4rem;margin-bottom:2.5rem}
.lk-line{width:50px;height:1px;background:var(--gold);margin:0 auto 2rem;opacity:.4}
.inv-deny{font-family:'DM Mono',monospace;font-size:.7rem;letter-spacing:.12em;color:#c0392b;text-transform:uppercase;margin-bottom:.8rem}
.inv-deny-sub{font-family:'DM Mono',monospace;font-size:.52rem;letter-spacing:.1em;color:var(--gray);max-width:320px;line-height:1.6}

/* ── CONTENT ── */
.inv-app{opacity:0;transition:opacity .9s ease;pointer-events:none;padding-bottom:80px}
.inv-app.on{opacity:1;pointer-events:all}

/* ── WATERMARK ── */
.inv-wm{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-family:'DM Mono',monospace;font-size:clamp(1.5rem,6vw,3.5rem);letter-spacing:.3em;color:rgba(200,146,42,.03);pointer-events:none;white-space:nowrap;z-index:0;user-select:none}

/* ── HERO ── */
.inv-hero{min-height:100svh;display:flex;align-items:center;justify-content:center;flex-direction:column;position:relative;overflow:hidden;padding:4rem 1.5rem}
.hero-bg{position:absolute;inset:0;background:radial-gradient(ellipse 90% 60% at 50% 0%,rgba(200,146,42,.07) 0%,transparent 70%)}
.hero-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(200,146,42,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(200,146,42,.04) 1px,transparent 1px);background-size:56px 56px;mask-image:radial-gradient(ellipse 80% 80% at 50% 50%,black,transparent);-webkit-mask-image:radial-gradient(ellipse 80% 80% at 50% 50%,black,transparent)}
.hero-inner{position:relative;z-index:1;text-align:center;max-width:700px}
.hero-eye{font-family:'DM Mono',monospace;font-size:.56rem;letter-spacing:.3em;color:var(--gold);text-transform:uppercase;margin-bottom:1.2rem;opacity:.8}
.hero-logo{font-family:'Playfair Display',serif;font-size:clamp(5.5rem,20vw,9rem);font-weight:900;color:var(--white);letter-spacing:-.02em;line-height:1;margin-bottom:.3rem}
.hero-name{font-family:'DM Mono',monospace;font-size:.62rem;letter-spacing:.28em;color:var(--gold);text-transform:uppercase;opacity:.75;margin-bottom:1.4rem}
.hero-rule{width:70px;height:1px;background:linear-gradient(90deg,transparent,var(--gold),transparent);margin:0 auto 1.4rem}
.hero-tag{font-family:'Playfair Display',serif;font-size:clamp(1.1rem,3.8vw,1.55rem);font-style:italic;font-weight:400;color:rgba(255,255,255,.6);line-height:1.55;max-width:560px;margin:0 auto 1.4rem}
.hero-meta{font-family:'DM Mono',monospace;font-size:.54rem;letter-spacing:.18em;color:var(--gray);text-transform:uppercase}
.scroll-hint{position:absolute;bottom:2rem;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:5px}
.scroll-hint span{font-family:'DM Mono',monospace;font-size:.5rem;letter-spacing:.2em;color:var(--gray);text-transform:uppercase}
.scroll-hint-bar{width:1px;height:36px;background:linear-gradient(to bottom,var(--gold),transparent);animation:inv-pulse 2s ease-in-out infinite}

/* ── DATA PANEL ── */
.data-panel{padding:0 1.5rem}
.data-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border:1px solid var(--border);max-width:780px;margin:0 auto}
.data-cell{background:var(--navy);padding:1.6rem 1.2rem;text-align:center;position:relative;overflow:hidden}
.data-cell::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);opacity:0;transition:opacity .3s}
.data-cell:hover::before{opacity:1}
.data-n{font-family:'Playfair Display',serif;font-size:clamp(2.2rem,7vw,3rem);font-weight:700;color:var(--gold);line-height:1;margin-bottom:.3rem}
.data-l{font-size:.65rem;font-weight:500;letter-spacing:.1em;color:var(--white);text-transform:uppercase;margin-bottom:.25rem}
.data-s{font-family:'DM Mono',monospace;font-size:.52rem;color:var(--gray);line-height:1.4}

/* ── SECTION ── */
.inv-sec{max-width:780px;margin:0 auto;padding:3.5rem 1.5rem;border-bottom:1px solid var(--border)}
.inv-sec:last-of-type{border-bottom:none}
.sec-n{font-family:'DM Mono',monospace;font-size:.54rem;letter-spacing:.25em;color:var(--gold);text-transform:uppercase;margin-bottom:.7rem;opacity:.7}
.sec-h{font-family:'Playfair Display',serif;font-size:clamp(1.6rem,5vw,2.2rem);font-weight:700;color:var(--white);line-height:1.2;margin-bottom:1.4rem}
.sec-h em{color:var(--gold);font-style:italic}
.inv-lead{font-size:.95rem;line-height:1.8;color:var(--mgray);margin-bottom:.9rem}
.inv-lead strong{color:var(--white);font-weight:500}
.inv-lead em{color:var(--lgold);font-style:italic}

/* ── HIGHLIGHT QUOTE ── */
.inv-hq{border-left:2px solid var(--gold);padding:.9rem 1.2rem;margin:1.4rem 0;background:rgba(200,146,42,.04)}
.inv-hq p{font-family:'Playfair Display',serif;font-size:clamp(1rem,2.5vw,1.2rem);font-style:italic;color:var(--gold);line-height:1.65}

/* ── TIMELINE ── */
.tl{margin-top:1.5rem}
.tl-row{display:grid;grid-template-columns:48px 16px 1fr;gap:0 12px}
.tl-yr{font-family:'Playfair Display',serif;font-size:1rem;color:var(--gold);font-weight:700;padding-top:.95rem;text-align:right}
.tl-track{display:flex;flex-direction:column;align-items:center}
.tl-dot{width:7px;height:7px;border-radius:50%;background:var(--gold);flex-shrink:0;margin-top:1.1rem;box-shadow:0 0 7px rgba(200,146,42,.5)}
.tl-bar{flex:1;width:1px;background:linear-gradient(to bottom,rgba(200,146,42,.35),rgba(200,146,42,.08))}
.tl-c{padding:.85rem 0 1.3rem}
.tl-ev{font-weight:500;font-size:.82rem;color:var(--white);margin-bottom:.15rem}
.tl-im{font-family:'DM Mono',monospace;font-size:.54rem;color:var(--gold);letter-spacing:.06em;margin-bottom:.2rem}
.tl-op{font-size:.76rem;color:var(--gray);line-height:1.5}

/* ── CEF BOX ── */
.cef{margin-top:1.5rem;border:1px solid rgba(200,146,42,.3);overflow:hidden}
.cef-top{background:var(--gold);padding:1rem 1.4rem;display:flex;align-items:center;gap:1rem}
.cef-badge{font-family:'Playfair Display',serif;font-size:2rem;font-weight:700;color:var(--navy)}
.cef-badge-sub{font-family:'DM Mono',monospace;font-size:.52rem;letter-spacing:.18em;color:var(--navy);opacity:.65;text-transform:uppercase}
.cef-body{padding:1.3rem 1.4rem;background:rgba(200,146,42,.04)}
.cef-hl{font-family:'Playfair Display',serif;font-size:1.1rem;color:var(--gold);margin-bottom:.7rem;line-height:1.4;font-weight:400}
.cef-p{font-size:.8rem;line-height:1.8;color:var(--mgray);margin-bottom:.5rem}

/* ── TERMS TABLE ── */
.inv-terms{margin-top:1.4rem;border:1px solid var(--border);overflow:hidden}
.term-row{display:grid;grid-template-columns:110px 1fr;border-bottom:1px solid rgba(200,146,42,.07)}
.term-row:last-child{border-bottom:none}
.term-k{padding:.85rem .9rem;background:rgba(200,146,42,.06);font-family:'DM Mono',monospace;font-size:.54rem;letter-spacing:.12em;color:var(--gold);text-transform:uppercase;display:flex;align-items:center;border-right:1px solid rgba(200,146,42,.08)}
.term-v{padding:.85rem 1rem;font-size:.82rem;color:var(--mgray);display:flex;align-items:center;line-height:1.5}

/* ── FINAL QUOTE ── */
.final-q{margin-top:1.5rem;padding:1.4rem 1.5rem;border-left:2px solid var(--gold);background:rgba(200,146,42,.04);position:relative}
.fq-mark{font-family:'Playfair Display',serif;font-size:4rem;color:rgba(200,146,42,.12);position:absolute;top:-.3rem;left:.3rem;line-height:1}
.fq-text{font-family:'Playfair Display',serif;font-size:clamp(1rem,2.5vw,1.15rem);font-style:italic;color:var(--gold);line-height:1.7;position:relative;z-index:1}

/* ── INVEST BAR ── */
.inv-cta-final{margin-top:2rem;display:flex;justify-content:center}
.invest-btn{background:var(--gold);color:var(--navy);border:none;font-family:'DM Sans',sans-serif;font-weight:600;font-size:.8rem;letter-spacing:.18em;text-transform:uppercase;padding:.95rem 2.5rem;cursor:pointer;transition:background .2s,transform .1s;width:100%;max-width:420px}
.invest-btn:hover{background:var(--gold2)}
.invest-btn:active{transform:scale(.98)}

/* ── CALCULATOR OVERLAY ── */
.calc-overlay{position:fixed;inset:0;z-index:200;background:rgba(10,22,40,.96);display:flex;align-items:flex-end;justify-content:center;opacity:0;visibility:hidden;transition:opacity .3s,visibility .3s}
.calc-overlay.open{opacity:1;visibility:visible}
.calc-sheet{background:var(--navy2);border-top:1px solid var(--border);width:100%;max-width:600px;padding:2rem 1.5rem 2.5rem;border-radius:16px 16px 0 0;transform:translateY(100%);transition:transform .35s cubic-bezier(.32,.72,0,1);max-height:92svh;overflow-y:auto;-webkit-user-select:text;user-select:text}
.calc-overlay.open .calc-sheet{transform:translateY(0)}
.calc-handle{width:36px;height:4px;background:rgba(200,146,42,.3);border-radius:2px;margin:0 auto 1.5rem}
.calc-title{font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:700;color:var(--gold);margin-bottom:.3rem}
.calc-sub{font-family:'DM Mono',monospace;font-size:.54rem;letter-spacing:.15em;color:var(--gray);text-transform:uppercase;margin-bottom:1.8rem}
.c-label{font-family:'DM Mono',monospace;font-size:.56rem;letter-spacing:.15em;color:var(--gray);text-transform:uppercase;margin-bottom:.55rem}
.c-input{width:100%;padding:.85rem 1rem;background:transparent;border:1px solid rgba(200,146,42,.25);color:var(--gold);font-family:'DM Mono',monospace;font-size:1rem;outline:none;margin-bottom:1.3rem;transition:border .2s;-webkit-user-select:text;user-select:text}
.c-input:focus{border-color:var(--gold)}
.c-hint{font-family:'DM Mono',monospace;font-size:.52rem;color:#c0392b;margin-top:-.9rem;margin-bottom:.9rem;letter-spacing:.08em;min-height:1rem}
.horizon-row{display:flex;gap:.6rem;margin-bottom:1.5rem}
.h-btn{flex:1;padding:.7rem .5rem;background:transparent;border:1px solid rgba(200,146,42,.2);color:var(--gray);cursor:pointer;font-family:'DM Mono',monospace;font-size:.58rem;letter-spacing:.06em;transition:all .2s;text-align:center}
.h-btn.active{background:rgba(200,146,42,.12);border-color:var(--gold);color:var(--gold)}
.inv-result{margin:0 0 1.4rem;padding:1.3rem;background:rgba(10,22,40,.8);border:1px solid rgba(200,146,42,.2)}
.result-grid{display:grid;grid-template-columns:1fr 1fr;gap:.8rem;margin-bottom:.9rem}
.r-item{text-align:center}
.r-val{font-family:'Playfair Display',serif;font-size:1.7rem;color:var(--gold);font-weight:700;line-height:1}
.r-key{font-family:'DM Mono',monospace;font-size:.5rem;color:var(--gray);letter-spacing:.1em;text-transform:uppercase;margin-top:.2rem}
.r-disc{font-size:.65rem;color:#3a4a60;line-height:1.6;border-top:1px solid rgba(200,146,42,.08);padding-top:.7rem;font-style:italic}
.form-box{padding:1.3rem;border:1px solid var(--border);background:rgba(10,22,40,.6)}
.form-title{font-family:'Playfair Display',serif;font-size:1.2rem;color:var(--white);margin-bottom:.25rem}
.form-note{font-family:'DM Mono',monospace;font-size:.52rem;letter-spacing:.1em;color:var(--gray);text-transform:uppercase;margin-bottom:1.1rem}
.f-input{display:block;width:100%;padding:.8rem 1rem;background:transparent;border:1px solid rgba(200,146,42,.2);color:var(--white);font-family:'DM Sans',sans-serif;font-size:.88rem;outline:none;margin-bottom:.7rem;-webkit-user-select:text;user-select:text}
.form-summary{font-family:'DM Mono',monospace;font-size:.58rem;color:var(--gray);letter-spacing:.08em;margin-bottom:1rem}
.form-summary span{color:var(--gold)}
.submit-btn{width:100%;padding:.95rem;background:var(--gold);color:var(--navy);border:none;font-family:'DM Sans',sans-serif;font-weight:600;font-size:.75rem;letter-spacing:.18em;text-transform:uppercase;cursor:pointer;transition:opacity .2s}
.submit-btn:disabled{opacity:.35;cursor:default}
.sent-box{text-align:center;padding:2rem 1rem}
.sent-check{font-size:2rem;color:var(--gold);margin-bottom:.8rem}
.sent-t{font-family:'Playfair Display',serif;font-size:1.4rem;color:var(--white);margin-bottom:.7rem}
.sent-p{font-size:.82rem;color:var(--mgray);line-height:1.7;margin-bottom:.7rem}
.sent-d{font-family:'DM Mono',monospace;font-size:.56rem;color:var(--gold);letter-spacing:.1em}
.close-btn{margin-top:1.5rem;padding:.7rem 2rem;background:transparent;border:1px solid var(--border);color:var(--gray);font-family:'DM Mono',monospace;font-size:.58rem;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
.inv-footer{max-width:780px;margin:0 auto;padding:2.5rem 1.5rem;text-align:center;border-top:1px solid var(--border)}
.inv-footer a{font-family:'DM Mono',monospace;font-size:.6rem;letter-spacing:.2em;color:var(--gold);text-decoration:none;text-transform:uppercase}
.foot-conf{font-family:'DM Mono',monospace;font-size:.5rem;letter-spacing:.12em;color:var(--gray);text-transform:uppercase;margin-top:.6rem}

/* ── CAPABILITIES GRID (01) ── */
.cap-grid{display:grid;grid-template-columns:1fr;gap:1px;background:var(--border);border:1px solid var(--border);margin:1.4rem 0}
.cap-item{background:var(--navy);padding:1.1rem 1.2rem;display:flex;align-items:center;gap:1rem}
.cap-icon{font-family:'DM Mono',monospace;font-size:.6rem;color:var(--gold);letter-spacing:.08em;min-width:24px}
.cap-text{font-size:.88rem;color:var(--mgray);line-height:1.5}

/* ── DUAL MODEL (03) ── */
.dual-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border:1px solid var(--border);margin:1.4rem 0}
.dual-box{background:var(--navy);padding:1.4rem}
.dual-box-gold{background:rgba(200,146,42,.04)}
.dual-label{font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700;color:var(--white);margin-bottom:.2rem}
.dual-role{font-family:'DM Mono',monospace;font-size:.52rem;letter-spacing:.15em;color:var(--gold);text-transform:uppercase;margin-bottom:1rem}
.dual-list{list-style:none;padding:0}
.dual-list li{font-size:.82rem;color:var(--mgray);line-height:2;padding-left:.8rem;position:relative}
.dual-list li::before{content:'';position:absolute;left:0;top:.65rem;width:4px;height:4px;border-radius:50%;background:var(--gold);opacity:.5}

/* ── DIFF GRID (05) ── */
.diff-grid{display:flex;flex-wrap:wrap;gap:.6rem;margin:1.4rem 0}
.diff-item{padding:.7rem 1.2rem;border:1px solid rgba(200,146,42,.25);background:rgba(200,146,42,.04)}
.diff-label{font-family:'DM Mono',monospace;font-size:.62rem;letter-spacing:.12em;color:var(--gold);text-transform:uppercase}

/* ── MOAT LIST (06) ── */
.moat-list{margin:1.4rem 0}
.moat-item{padding:.9rem 0;border-bottom:1px solid var(--border);font-size:.9rem;color:var(--mgray);display:flex;align-items:center;gap:1rem}
.moat-item:last-child{border-bottom:none}
.moat-n{font-family:'DM Mono',monospace;font-size:.56rem;color:var(--gold);letter-spacing:.08em;min-width:24px}

/* ── FIT GRID (07) ── */
.fit-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border:1px solid var(--border);margin:1.4rem 0}
.fit-item{background:var(--navy);padding:1.3rem 1.2rem;display:flex;align-items:center;gap:1rem}
.fit-icon{font-family:'DM Mono',monospace;font-size:.7rem;font-weight:500;color:var(--gold);letter-spacing:.06em;min-width:32px;text-align:center}
.fit-text{font-size:.82rem;color:var(--mgray)}

/* ── RISK GRID (08) ── */
.risk-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border:1px solid var(--border);margin:1.4rem 0}
.risk-col{background:var(--navy);padding:1.2rem}
.risk-col-gold{background:rgba(200,146,42,.04)}
.risk-header{font-family:'DM Mono',monospace;font-size:.54rem;letter-spacing:.18em;color:var(--gold);text-transform:uppercase;margin-bottom:1rem;padding-bottom:.6rem;border-bottom:1px solid var(--border)}
.risk-item{font-size:.82rem;color:var(--mgray);line-height:2;padding-left:.8rem;position:relative}
.risk-item::before{content:'';position:absolute;left:0;top:.6rem;width:4px;height:4px;border-radius:50%;background:var(--gold);opacity:.4}

/* ── BIO (10) ── */
.bio-list{margin-bottom:1.2rem}
.bio-books{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1rem}
.bio-book{padding:.6rem 1rem;border:1px solid var(--border);font-family:'DM Mono',monospace;font-size:.6rem;color:var(--mgray);letter-spacing:.04em}
.bio-book em{color:var(--gold);font-style:italic}

@keyframes inv-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes inv-pulse{0%,100%{opacity:.3}50%{opacity:1}}
.inv-reveal{opacity:0;transform:translateY(22px);transition:opacity .65s ease,transform .65s ease}
.inv-vis{opacity:1;transform:none}

@media(max-width:639px){
  .dual-grid,.fit-grid,.risk-grid{grid-template-columns:1fr}
  .sec-n{font-size:.64rem}
  .data-s{font-size:.62rem}
  .data-l{font-size:.72rem}
  .hero-eye{font-size:.64rem}
  .hero-meta{font-size:.62rem}
  .hero-name{font-size:.72rem}
  .inv-hq p{font-size:clamp(1.05rem,3vw,1.2rem)}
  .tl-im{font-size:.62rem}
  .tl-op{font-size:.82rem}
  .tl-ev{font-size:.88rem}
  .cap-text{font-size:.92rem}
  .dual-role{font-size:.6rem}
  .dual-list li{font-size:.88rem}
  .diff-label{font-size:.7rem}
  .moat-item{font-size:.94rem}
  .moat-n{font-size:.64rem}
  .fit-text{font-size:.88rem}
  .fit-icon{font-size:.76rem}
  .risk-header{font-size:.62rem}
  .risk-item{font-size:.88rem}
  .term-k{font-size:.62rem}
  .term-v{font-size:.88rem}
  .foot-conf{font-size:.58rem}
  .bio-book{font-size:.68rem}
}
@media(min-width:640px){
  .data-grid{grid-template-columns:repeat(4,1fr)}
  .cap-grid{grid-template-columns:1fr 1fr}
  .calc-sheet{border-radius:12px 12px 0 0}
}
@media print{.inv-page::after{content:'CONFIDENTIAL';position:fixed;inset:0;background:rgba(13,31,53,.97);display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:3rem;color:#c8922a;z-index:99999}}
`
