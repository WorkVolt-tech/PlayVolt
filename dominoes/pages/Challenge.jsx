import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { TABLE_SKINS, weekStartUTC } from '../lib/skins'
import { BotAvatar } from '../lib/avatars'
import { challengeFor } from '../lib/challenge'
import './Challenge.css'

// ── Challenge Mode ───────────────────────────────────────────────────────────
// One challenge a week against expert bots, three tries. Beat it — take the
// match to a Vyèj — and that week's table is yours.

export default function Challenge() {
  const navigate = useNavigate()
  const { user, isLoading } = useAuth()
  const [status, setStatus] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)          // Start pressed, waiting for the server
  const [loadProblem, setLoadProblem] = useState('')
  const c = challengeFor()
  const next = challengeFor(new Date(weekStartUTC().getTime() + 7 * 86400000))
  const prize = TABLE_SKINS[c.table]

  // a match already under way this week can be continued without a new try
  const saved = (() => { try { return JSON.parse(localStorage.getItem('challenge_game') || 'null') } catch { return null } })()
  const inProgress = saved?.challenge?.week === c.week && saved?.st?.status

  useEffect(() => {
    if (!user) return
    db.rpc('challenge_status').then(({ data, error }) => {
      if (error) { setLoadProblem(`Couldn’t load your tries — ${error.message || 'server error'}`); return }
      setStatus(Array.isArray(data) ? data[0] : data)
    }, e => setLoadProblem(`Couldn’t reach the server — ${e?.message || 'check your connection'}`))
  }, [user])

  async function start() {
    if (busy) return                                   // one tap only
    setMsg(''); setBusy(true)
    const timeout = new Promise(r => setTimeout(() => r({ timedOut: true }), 10000))
    let res
    try { res = await Promise.race([db.rpc('challenge_start'), timeout]) }
    catch (e) { res = { error: e } }
    if (res?.timedOut) { setBusy(false); setMsg('The server didn’t answer — check your connection and try again.'); return }
    if (res?.error) { setBusy(false); setMsg(`Couldn’t start — ${res.error.message || 'server error'}`); return }
    const left = res?.data
    if (left == null || left < 0) { setBusy(false); setMsg('No tries left this week.'); return }
    localStorage.removeItem('challenge_game')
    sessionStorage.setItem('challenge_setup', JSON.stringify({
      seats: c.seats, pile: c.pile, bots: c.opponents,
      nickname: localStorage.getItem('domino_nickname') || 'You',
      challenge: { week: c.week, table: c.table },
    }))
    navigate('/challenge/play')
  }

  if (!isLoading && !user) {
    return (
      <div className="ch-page">
        <button className="ch-back" onClick={() => navigate('/')}>← Back</button>
        <h1 className="ch-title">Challenge</h1>
        <div className="ch-card"><p>Challenge Mode needs an account, so your tries and prizes are kept.</p>
          <button className="ch-btn" onClick={() => navigate('/auth')}>Sign in</button></div>
      </div>
    )
  }

  const left = status?.tries_left ?? 3
  const won = !!status?.won
  return (
    <div className="ch-page">
      <button className="ch-back" onClick={() => navigate('/')}>← Back</button>
      <h1 className="ch-title">Challenge</h1>
      <p className="ch-sub">A new challenge every week against expert players. Three tries — beat it and the table is yours.</p>

      <div className="ch-card ch-main">
        <div className="ch-label">This week</div>
        <div className="ch-format">{c.title}</div>
        <div className="ch-opponents">
          {c.opponents.map(n => (
            <div key={n} className="ch-opp"><BotAvatar name={n} size={52} /><span>{n}</span></div>
          ))}
        </div>
        {c.blurb && <p className="ch-blurb">{c.blurb}</p>}
        <p className="ch-rule">Win the match — take it to a Vyèj — to beat the challenge.</p>

        <div className="ch-prize">
          <img src={prize?.thumb} alt="" />
          <div><div className="ch-label">Prize</div><div className="ch-prize-name">{prize?.label} table</div></div>
        </div>

        <div className="ch-tries">
          <span className="ch-label">Tries</span>
          {[0, 1, 2].map(i => <span key={i} className={`ch-pip ${i < (won ? 3 : 3 - left) ? 'used' : ''}`} />)}
          <span className="ch-left">{won ? 'Beaten ✓' : `${left} left`}</span>
        </div>

        {loadProblem && <div className="ch-msg">{loadProblem}</div>}
        {msg && <div className="ch-msg">{msg}</div>}
        {c.format === 'team' ? (
          <div className="ch-msg soft">Team challenges — you and a friend — arrive with the next update.</div>
        ) : won ? (
          <div className="ch-msg ok">You beat this week’s challenge. A new one starts on Monday.</div>
        ) : inProgress ? (
          <button className="ch-btn" onClick={() => navigate('/challenge/play')}>Continue your match</button>
        ) : (
          <button className="ch-btn" disabled={left <= 0 || busy} onClick={start}>
            {busy ? 'Starting…' : left > 0 ? 'Start — uses 1 try' : 'No tries left this week'}
          </button>
        )}
      </div>

      <div className="ch-card ch-next">
        <div className="ch-label">Next week</div>
        <div className="ch-next-row">
          <span>{next.title}</span>
          <img src={TABLE_SKINS[next.table]?.thumb} alt="" />
        </div>
      </div>
    </div>
  )
}
