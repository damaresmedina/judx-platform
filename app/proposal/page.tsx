'use client'

export default function InvestorNoToken() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Mono:wght@400&display=swap');
        body{margin:0;padding:0}
        .inv-deny-page{background:#0d1f35;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:'DM Sans',sans-serif}
        .lk{text-align:center;padding:2rem 1.5rem}
        .lk-logo{font-family:'Playfair Display',serif;font-size:clamp(4rem,15vw,6rem);font-weight:700;color:#fff;letter-spacing:.02em;line-height:1}
        .lk-logo span{color:#c8922a}
        .lk-sub{font-family:'DM Mono',monospace;font-size:.58rem;letter-spacing:.28em;color:#6b7280;text-transform:uppercase;margin-top:.4rem;margin-bottom:2.5rem}
        .lk-line{width:50px;height:1px;background:#c8922a;margin:0 auto 2rem;opacity:.4}
        .inv-deny{font-family:'DM Mono',monospace;font-size:.7rem;letter-spacing:.12em;color:#c0392b;text-transform:uppercase;margin-bottom:.8rem}
        .inv-deny-sub{font-family:'DM Mono',monospace;font-size:.52rem;letter-spacing:.1em;color:#6b7280;max-width:320px;line-height:1.6}
      `}} />
      <div className="inv-deny-page">
        <div className="lk">
          <div className="lk-logo">Jud<span>X</span></div>
          <div className="lk-sub">Judicial Intelligence</div>
          <div className="lk-line" />
          <div className="inv-deny">Invalid access link.</div>
          <div className="inv-deny-sub">If you believe this is an error, contact contato@judx.com.br</div>
        </div>
      </div>
    </>
  )
}
