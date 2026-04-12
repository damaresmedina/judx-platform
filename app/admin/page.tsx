'use client'

import { useState } from 'react'

type Token = {
  id: string; token: string; investor_name: string; lang: string; ticket_amount: number
  locked_ip: string | null; locked_at: string | null; visits: number; last_visit_at: string | null
  is_revoked: boolean; expires_at: string; geo_country: string | null; geo_city: string | null
  geo_device: string | null; geo_isp: string | null; notes: string | null; created_at: string
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
  const [tab, setTab] = useState<'tokens' | 'logs' | 'create'>('tokens')
  const [msg, setMsg] = useState('')

  // Create form
  const [newName, setNewName] = useState('')
  const [newAmount, setNewAmount] = useState('500000')
  const [newLang, setNewLang] = useState('en')
  const [newDays, setNewDays] = useState('30')

  async function api(method: string, body?: Record<string, unknown>) {
    const opts: RequestInit = {
      method,
      headers: { 'x-admin-pass': pass, 'Content-Type': 'application/json' },
    }
    if (body) opts.body = JSON.stringify(body)
    const r = await fetch('/api/admin', opts)
    return r.json()
  }

  async function login() {
    const r = await fetch(`/api/admin`, { headers: { 'x-admin-pass': pass } })
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
    const d = await api('GET')
    if (d.tokens) { setTokens(d.tokens); setLogs(d.logs || []) }
  }

  async function action(act: string, token: string, label: string) {
    if (!confirm(`${label} "${token}"?`)) return
    const d = await api('POST', { action: act, token })
    if (d.ok) { setMsg(`${label}: ${token}`); refresh() }
    else setMsg(`Erro: ${d.error}`)
    setTimeout(() => setMsg(''), 3000)
  }

  async function createToken() {
    if (!newName.trim()) return
    const d = await api('POST', {
      action: 'create',
      name: newName.trim(),
      amount: parseInt(newAmount) || 500000,
      lang: newLang,
      days: parseInt(newDays) || 30,
    })
    if (d.ok) {
      setMsg(`Token criado: ${d.url}`)
      setNewName('')
      setTab('tokens')
      refresh()
    } else {
      setMsg(`Erro: ${d.error}`)
    }
    setTimeout(() => setMsg(''), 5000)
  }

  const fmt = (d: string | null) => d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

  if (!authed) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: styles }} />
        <div className="ap">
          <div className="ap-center">
            <div className="ap-logo">Jud<span>X</span></div>
            <div className="ap-sub">ADMIN</div>
            <input type="password" className="ap-input" placeholder="Senha" value={pass}
              onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} autoFocus />
            <button className="ap-btn" onClick={login}>Entrar</button>
            {error && <div className="ap-err">{error}</div>}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="ap">
        {/* Header */}
        <div className="ap-header">
          <div className="ap-logo-sm">Jud<span>X</span></div>
          <button className="ap-ref" onClick={refresh}>Atualizar</button>
        </div>

        {/* Tabs */}
        <div className="ap-tabs">
          <button className={`ap-tab ${tab === 'tokens' ? 'active' : ''}`} onClick={() => setTab('tokens')}>
            Tokens ({tokens.length})
          </button>
          <button className={`ap-tab ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>
            + Novo
          </button>
          <button className={`ap-tab ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>
            Logs
          </button>
        </div>

        {msg && <div className="ap-msg">{msg}</div>}

        {/* TOKENS */}
        {tab === 'tokens' && (
          <div className="ap-cards">
            {tokens.map(t => {
              const status = t.is_revoked ? 'REVOKED' : t.locked_ip ? 'OPENED' : 'PENDING'
              const statusClass = t.is_revoked ? 'rev' : t.locked_ip ? 'opened' : 'pending'
              return (
                <div key={t.id} className={`ap-card ${t.is_revoked ? 'ap-card-rev' : ''}`}>
                  <div className="ap-card-top">
                    <div>
                      <div className="ap-card-name">{t.investor_name}</div>
                      <div className="ap-card-token">{t.token}</div>
                    </div>
                    <div className={`ap-status ${statusClass}`}>{status}</div>
                  </div>

                  <div className="ap-card-meta">
                    <div><span className="ap-label">Ticket:</span> €{(t.ticket_amount || 500000).toLocaleString('de-DE')}</div>
                    <div><span className="ap-label">Lang:</span> {t.lang?.toUpperCase()}</div>
                    <div><span className="ap-label">Visitas:</span> {t.visits || 0}</div>
                    <div><span className="ap-label">Expira:</span> {fmtDate(t.expires_at)}</div>
                  </div>

                  {t.geo_country && (
                    <div className="ap-card-geo">
                      {t.geo_city}, {t.geo_country} · {t.geo_device || ''} · {t.geo_isp || ''}
                    </div>
                  )}

                  {t.locked_at && (
                    <div className="ap-card-geo">Primeiro acesso: {fmt(t.locked_at)}</div>
                  )}

                  <div className="ap-card-actions">
                    <a href={`/proposal/${t.token}`} target="_blank" className="ap-act ap-act-view">Preview</a>
                    <button className="ap-act ap-act-reset" onClick={() => action('reset', t.token, 'Reset IP')}>Reset IP</button>
                    {t.is_revoked
                      ? <button className="ap-act ap-act-ok" onClick={() => action('activate', t.token, 'Ativar')}>Ativar</button>
                      : <button className="ap-act ap-act-warn" onClick={() => action('revoke', t.token, 'Revogar')}>Revogar</button>
                    }
                    <button className="ap-act ap-act-del" onClick={() => action('delete', t.token, 'Deletar')}>Deletar</button>
                    <button className="ap-act ap-act-copy" onClick={() => { navigator.clipboard.writeText(`https://judx.com.br/proposal/${t.token}`); setMsg('Link copiado!'); setTimeout(() => setMsg(''), 2000) }}>Copiar link</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* CREATE */}
        {tab === 'create' && (
          <div className="ap-form">
            <div className="ap-form-title">Novo Token</div>

            <label className="ap-label">Nome (vira o token)</label>
            <input className="ap-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="ex: garcia" autoFocus />

            <label className="ap-label">Valor (EUR)</label>
            <input className="ap-input" value={newAmount} onChange={e => setNewAmount(e.target.value)} inputMode="numeric" />

            <label className="ap-label">Idioma</label>
            <div className="ap-lang-row">
              <button className={`ap-lang ${newLang === 'en' ? 'active' : ''}`} onClick={() => setNewLang('en')}>English</button>
              <button className={`ap-lang ${newLang === 'pt' ? 'active' : ''}`} onClick={() => setNewLang('pt')}>Português</button>
            </div>

            <label className="ap-label">Validade (dias)</label>
            <input className="ap-input" value={newDays} onChange={e => setNewDays(e.target.value)} inputMode="numeric" />

            <div className="ap-form-preview">
              Link: <strong>judx.com.br/proposal/{newName.toLowerCase().replace(/[^a-z0-9-]/g, '') || '...'}</strong>
            </div>

            <button className="ap-btn ap-btn-full" onClick={createToken}>Criar token</button>
          </div>
        )}

        {/* LOGS */}
        {tab === 'logs' && (
          <div className="ap-logs">
            {logs.map(l => (
              <div key={l.id} className={`ap-log ${l.result === 'ip_mismatch' ? 'ap-log-block' : l.result === 'first_access' ? 'ap-log-first' : ''}`}>
                <div className="ap-log-top">
                  <span className="ap-log-name">{l.investor_name || l.token}</span>
                  <span className={`ap-log-result ${l.result === 'granted' ? 'ok' : l.result === 'first_access' ? 'first' : 'fail'}`}>{l.result}</span>
                </div>
                <div className="ap-log-detail">{l.detail || ''}</div>
                <div className="ap-log-meta">
                  {fmt(l.accessed_at)} · {l.geo_country ? `${l.geo_city}, ${l.geo_country}` : l.ip} · {l.geo_device || ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

const styles = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
.ap{background:#0d1f35;color:#fff;font-family:'DM Sans',sans-serif;min-height:100vh;padding:1rem;max-width:600px;margin:0 auto}
.ap-center{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:.8rem}
.ap-logo{font-family:'Playfair Display',serif;font-size:3rem;font-weight:700;color:#fff}.ap-logo span{color:#c8922a}
.ap-logo-sm{font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700;color:#fff}.ap-logo-sm span{color:#c8922a}
.ap-sub{font-family:'DM Mono',monospace;font-size:.6rem;letter-spacing:.3em;color:#6b7280;text-transform:uppercase;margin-bottom:1rem}
.ap-input{padding:.75rem 1rem;background:transparent;border:1px solid rgba(200,146,42,.3);color:#fff;font-family:'DM Sans',sans-serif;font-size:.9rem;outline:none;width:100%;margin-bottom:.5rem;border-radius:4px}
.ap-input:focus{border-color:#c8922a}
.ap-btn{padding:.75rem 2rem;background:#c8922a;color:#0d1f35;border:none;font-family:'DM Sans',sans-serif;font-weight:500;font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;border-radius:4px;width:100%}
.ap-btn-full{margin-top:.5rem}
.ap-err{font-family:'DM Mono',monospace;font-size:.7rem;color:#c0392b;margin-top:.5rem}
.ap-msg{font-family:'DM Mono',monospace;font-size:.7rem;color:#c8922a;padding:.6rem;border:1px solid rgba(200,146,42,.3);margin-bottom:1rem;border-radius:4px;text-align:center}
.ap-header{display:flex;justify-content:space-between;align-items:center;padding-bottom:.8rem;border-bottom:1px solid rgba(200,146,42,.15);margin-bottom:.8rem}
.ap-ref{padding:.4rem 1rem;background:transparent;border:1px solid rgba(200,146,42,.3);color:#c8922a;font-family:'DM Mono',monospace;font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;border-radius:4px}
.ap-tabs{display:flex;gap:.3rem;margin-bottom:1rem}
.ap-tab{flex:1;padding:.6rem;background:transparent;border:1px solid rgba(200,146,42,.15);color:#6b7280;font-family:'DM Mono',monospace;font-size:.65rem;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;border-radius:4px;text-align:center}
.ap-tab.active{background:rgba(200,146,42,.1);border-color:#c8922a;color:#c8922a}

/* Cards */
.ap-cards{display:flex;flex-direction:column;gap:.8rem}
.ap-card{border:1px solid rgba(200,146,42,.15);border-radius:6px;padding:1rem;background:rgba(200,146,42,.02)}
.ap-card-rev{opacity:.5}
.ap-card-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.6rem}
.ap-card-name{font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:700;color:#fff}
.ap-card-token{font-family:'DM Mono',monospace;font-size:.65rem;color:#6b7280;margin-top:.1rem}
.ap-status{font-family:'DM Mono',monospace;font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;padding:.25rem .6rem;border-radius:3px}
.ap-status.pending{color:#c8922a;background:rgba(200,146,42,.1)}
.ap-status.opened{color:#27ae60;background:rgba(39,174,96,.1)}
.ap-status.rev{color:#c0392b;background:rgba(192,57,43,.1)}
.ap-card-meta{display:grid;grid-template-columns:1fr 1fr;gap:.3rem;font-size:.75rem;color:#8896a8;margin-bottom:.5rem}
.ap-card-meta .ap-label{color:#6b7280;font-size:.65rem}
.ap-card-geo{font-family:'DM Mono',monospace;font-size:.6rem;color:#6b7280;margin-bottom:.5rem;line-height:1.4}
.ap-card-actions{display:flex;flex-wrap:wrap;gap:.3rem}
.ap-act{padding:.35rem .6rem;font-family:'DM Mono',monospace;font-size:.55rem;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;border-radius:3px;border:1px solid rgba(200,146,42,.2);background:transparent;color:#8896a8;text-decoration:none;text-align:center}
.ap-act-view{color:#c8922a;border-color:rgba(200,146,42,.3)}
.ap-act-copy{color:#3498db;border-color:rgba(52,152,219,.3)}
.ap-act-reset{color:#f39c12;border-color:rgba(243,156,18,.3)}
.ap-act-warn{color:#e67e22;border-color:rgba(230,126,34,.3)}
.ap-act-ok{color:#27ae60;border-color:rgba(39,174,96,.3)}
.ap-act-del{color:#c0392b;border-color:rgba(192,57,43,.3)}

/* Form */
.ap-form{padding:.5rem 0}
.ap-form-title{font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700;color:#fff;margin-bottom:1rem}
.ap-label{font-family:'DM Mono',monospace;font-size:.6rem;letter-spacing:.12em;color:#c8922a;text-transform:uppercase;margin-bottom:.3rem;display:block;margin-top:.6rem}
.ap-lang-row{display:flex;gap:.4rem;margin-bottom:.5rem}
.ap-lang{flex:1;padding:.6rem;background:transparent;border:1px solid rgba(200,146,42,.2);color:#6b7280;font-family:'DM Mono',monospace;font-size:.7rem;cursor:pointer;border-radius:4px;text-align:center}
.ap-lang.active{background:rgba(200,146,42,.1);border-color:#c8922a;color:#c8922a}
.ap-form-preview{font-family:'DM Mono',monospace;font-size:.7rem;color:#6b7280;margin:.8rem 0;padding:.5rem;border:1px solid rgba(200,146,42,.1);border-radius:4px}
.ap-form-preview strong{color:#c8922a}

/* Logs */
.ap-logs{display:flex;flex-direction:column;gap:.4rem}
.ap-log{border:1px solid rgba(200,146,42,.08);border-radius:4px;padding:.6rem .8rem}
.ap-log-block{border-color:rgba(192,57,43,.2);background:rgba(192,57,43,.03)}
.ap-log-first{border-color:rgba(52,152,219,.2);background:rgba(52,152,219,.03)}
.ap-log-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:.2rem}
.ap-log-name{font-weight:500;font-size:.8rem}
.ap-log-result{font-family:'DM Mono',monospace;font-size:.55rem;letter-spacing:.08em;text-transform:uppercase;padding:.15rem .4rem;border-radius:2px}
.ap-log-result.ok{color:#27ae60}.ap-log-result.first{color:#3498db}.ap-log-result.fail{color:#c0392b}
.ap-log-detail{font-size:.7rem;color:#8896a8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-log-meta{font-family:'DM Mono',monospace;font-size:.55rem;color:#6b7280;margin-top:.2rem}
`
