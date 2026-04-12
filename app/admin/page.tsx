'use client'

import { useState } from 'react'

type Token = {
  id: string; token: string; investor_name: string; lang: string; ticket_amount: number
  locked_ip: string | null; locked_at: string | null; visits: number; last_visit_at: string | null
  is_revoked: boolean; expires_at: string; geo_country: string | null; geo_city: string | null
  geo_device: string | null; geo_isp: string | null; notes: string | null
}

type Log = {
  id: number; token: string; investor_name: string | null; ip: string; result: string
  detail: string | null; accessed_at: string; geo_country: string | null; geo_city: string | null
  geo_device: string | null
}

export default function AdminPage() {
  const [pass, setPass] = useState('')
  const [authed, setAuthed] = useState(false)
  const [tokens, setTokens] = useState<Token[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [error, setError] = useState('')

  async function login() {
    const r = await fetch(`/api/admin?p=${pass}`)
    if (r.ok) {
      const d = await r.json()
      setTokens(d.tokens || [])
      setLogs(d.logs || [])
      setAuthed(true)
    } else {
      setError('Senha incorreta')
    }
  }

  async function refresh() {
    const r = await fetch(`/api/admin?p=${pass}`)
    if (r.ok) {
      const d = await r.json()
      setTokens(d.tokens || [])
      setLogs(d.logs || [])
    }
  }

  const fmt = (d: string | null) => d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'

  if (!authed) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: adminStyles }} />
        <div className="adm-page">
          <div className="adm-lock">
            <div className="adm-logo">Jud<span>X</span></div>
            <div className="adm-sub">ADMIN</div>
            <input type="password" className="adm-input" placeholder="Senha" value={pass}
              onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} />
            <button className="adm-btn" onClick={login}>Entrar</button>
            {error && <div className="adm-err">{error}</div>}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: adminStyles }} />
      <div className="adm-page">
        <div className="adm-header">
          <div className="adm-logo-sm">Jud<span>X</span> Admin</div>
          <button className="adm-refresh" onClick={refresh}>Atualizar</button>
        </div>

        <h2 className="adm-title">Tokens ({tokens.length})</h2>
        <div className="adm-table">
          <div className="adm-row adm-row-h">
            <div>Nome</div><div>Token</div><div>Lang</div><div>Ticket</div><div>Status</div><div>Visitas</div><div>Geo</div><div>Expira</div><div>Preview</div>
          </div>
          {tokens.map(t => (
            <div key={t.id} className={`adm-row ${t.is_revoked ? 'adm-revoked' : ''}`}>
              <div className="adm-name">{t.investor_name}</div>
              <div className="adm-mono">{t.token}</div>
              <div>{t.lang?.toUpperCase()}</div>
              <div>€{(t.ticket_amount || 500000).toLocaleString('de-DE')}</div>
              <div className={t.locked_ip ? 'adm-opened' : t.is_revoked ? 'adm-rev' : 'adm-pending'}>
                {t.is_revoked ? 'REVOKED' : t.locked_ip ? 'OPENED' : 'PENDING'}
              </div>
              <div>{t.visits || 0}</div>
              <div className="adm-geo">{t.geo_country ? `${t.geo_city}, ${t.geo_country}` : '—'}<br />{t.geo_device || ''}</div>
              <div>{fmt(t.expires_at)?.split(',')[0]}</div>
              <div><a href={`/proposal/${t.token}`} target="_blank" className="adm-link">Abrir</a></div>
            </div>
          ))}
        </div>

        <h2 className="adm-title" style={{ marginTop: '2rem' }}>Logs recentes (50)</h2>
        <div className="adm-table adm-table-log">
          <div className="adm-row adm-row-h">
            <div>Hora</div><div>Token</div><div>Resultado</div><div>Geo</div><div>Detalhe</div>
          </div>
          {logs.map(l => (
            <div key={l.id} className={`adm-row ${l.result === 'ip_mismatch' ? 'adm-blocked' : l.result === 'first_access' ? 'adm-first' : ''}`}>
              <div className="adm-mono">{fmt(l.accessed_at)}</div>
              <div>{l.investor_name || l.token}</div>
              <div className={l.result === 'granted' ? 'adm-ok' : l.result === 'first_access' ? 'adm-first-t' : 'adm-fail'}>{l.result}</div>
              <div className="adm-geo">{l.geo_country ? `${l.geo_city}, ${l.geo_country}` : '—'}</div>
              <div className="adm-detail">{l.detail || ''}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

const adminStyles = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
.adm-page{background:#0d1f35;color:#fff;font-family:'DM Sans',sans-serif;min-height:100vh;padding:1.5rem}
.adm-lock{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:.8rem}
.adm-logo{font-family:'Playfair Display',serif;font-size:3rem;font-weight:700;color:#fff;letter-spacing:.02em}
.adm-logo span{color:#c8922a}
.adm-logo-sm{font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700;color:#fff}
.adm-logo-sm span{color:#c8922a}
.adm-sub{font-family:'DM Mono',monospace;font-size:.6rem;letter-spacing:.3em;color:#6b7280;text-transform:uppercase;margin-bottom:1rem}
.adm-input{padding:.7rem 1rem;background:transparent;border:1px solid rgba(200,146,42,.3);color:#c8922a;font-family:'DM Mono',monospace;font-size:.9rem;text-align:center;outline:none;width:250px}
.adm-input:focus{border-color:#c8922a}
.adm-btn{padding:.7rem 2rem;background:#c8922a;color:#0d1f35;border:none;font-family:'DM Sans',sans-serif;font-weight:500;font-size:.75rem;letter-spacing:.15em;text-transform:uppercase;cursor:pointer}
.adm-err{font-family:'DM Mono',monospace;font-size:.7rem;color:#c0392b;margin-top:.5rem}
.adm-header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(200,146,42,.15);padding-bottom:1rem;margin-bottom:1.5rem}
.adm-refresh{padding:.5rem 1.2rem;background:transparent;border:1px solid rgba(200,146,42,.3);color:#c8922a;font-family:'DM Mono',monospace;font-size:.65rem;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
.adm-title{font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:700;color:#fff;margin-bottom:.8rem}
.adm-table{border:1px solid rgba(200,146,42,.15);overflow-x:auto;font-size:.75rem}
.adm-table-log .adm-row{grid-template-columns:140px 90px 90px 120px 1fr}
.adm-row{display:grid;grid-template-columns:100px 80px 35px 80px 70px 50px 140px 80px 50px;gap:0;border-bottom:1px solid rgba(200,146,42,.07);align-items:center}
.adm-row>div{padding:.5rem .4rem;border-right:1px solid rgba(200,146,42,.05)}
.adm-row-h{background:rgba(200,146,42,.06);font-family:'DM Mono',monospace;font-size:.6rem;letter-spacing:.08em;color:#c8922a;text-transform:uppercase;font-weight:500}
.adm-name{font-weight:500;color:#fff}
.adm-mono{font-family:'DM Mono',monospace;font-size:.65rem;color:#6b7280}
.adm-geo{font-size:.6rem;color:#6b7280;line-height:1.3}
.adm-detail{font-size:.6rem;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adm-pending{color:#c8922a}
.adm-opened{color:#27ae60}
.adm-rev{color:#c0392b}
.adm-ok{color:#27ae60}
.adm-first-t{color:#3498db}
.adm-fail{color:#c0392b}
.adm-blocked{background:rgba(192,57,43,.05)}
.adm-first{background:rgba(52,152,219,.05)}
.adm-revoked{opacity:.4}
.adm-link{font-family:'DM Mono',monospace;font-size:.6rem;color:#c8922a;text-decoration:none;letter-spacing:.08em;text-transform:uppercase}
.adm-link:hover{text-decoration:underline}
`
