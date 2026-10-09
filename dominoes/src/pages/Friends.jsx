import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { TrophyAvatar } from '../lib/avatars'
import './Friends.css'

// ── Friends ──────────────────────────────────────────────────────────────────
// Add friends by nickname or with your friend link, answer requests, and
// manage your list. Friends need accounts; everything goes through the
// server's friend functions, so each player only ever sees their own.

const MESSAGES = {
  'sent': 'Request sent.',
  'already sent': 'You’ve already sent them a request.',
  'already friends': 'You’re already friends.',
  'now friends': 'They’d already asked you — you’re now friends!',
  'no such player': 'No player with that name.',
  'that\'s you': 'That’s you!',
  'sign in first': 'Sign in to add friends.',
}

function Face({ p, size = 40 }) {
  return p.avatar
    ? <TrophyAvatar trophyId={p.avatar} size={size} badge={false} />
    : <div className="fr-initial" style={{ width: size, height: size }}>{(p.nickname || '?')[0].toUpperCase()}</div>
}

export default function Friends() {
  const navigate = useNavigate()
  const { user, isLoading } = useAuth()
  const [rows, setRows] = useState([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [{ data }, { data: c }] = await Promise.all([db.rpc('my_friends'), db.rpc('my_friend_code')])
    setRows(data || [])
    setCode(c || '')
  }, [])

  // a friend link (/friends?add=CODE) sends the request in one tap
  useEffect(() => {
    if (!user) return
    const add = new URLSearchParams(window.location.search).get('add')
    ;(async () => {
      if (add) {
        const { data } = await db.rpc('friend_request_by_code', { p_code: add })
        setMsg({ ok: data === 'sent' || data === 'now friends', text: MESSAGES[data] || data })
        window.history.replaceState(null, '', '/friends')
      }
      load()
    })()
  }, [user, load])

  async function act(fn, args, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    const { data } = await db.rpc(fn, args)
    if (typeof data === 'string') setMsg({ ok: data === 'sent' || data === 'now friends', text: MESSAGES[data] || data })
    await load()
    setBusy(false)
  }

  if (!isLoading && !user) {
    return (
      <div className="fr-page">
        <button className="fr-back" onClick={() => navigate('/')}>← Back</button>
        <h1 className="fr-title">Friends</h1>
        <div className="fr-card"><p>Friends need an account, so you can find each other again.</p>
          <button className="fr-btn" onClick={() => navigate('/auth')}>Sign in</button></div>
      </div>
    )
  }

  const friends = rows.filter(r => r.kind === 'friend')
  const incoming = rows.filter(r => r.kind === 'incoming')
  const outgoing = rows.filter(r => r.kind === 'outgoing')
  const blocked = rows.filter(r => r.kind === 'blocked')
  const link = code ? `${window.location.origin}/friends?add=${code}` : ''

  return (
    <div className="fr-page">
      <button className="fr-back" onClick={() => navigate('/')}>← Back</button>
      <h1 className="fr-title">Friends</h1>

      {msg && <div className={`fr-msg ${msg.ok ? 'ok' : ''}`}>{msg.text}</div>}

      <div className="fr-card">
        <div className="fr-label">Add a friend</div>
        <div className="fr-row">
          <input className="fr-input" placeholder="Their nickname" value={name} maxLength={24}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { act('friend_request_by_nickname', { p_nickname: name }); setName('') } }} />
          <button className="fr-btn" disabled={busy || !name.trim()}
            onClick={() => { act('friend_request_by_nickname', { p_nickname: name }); setName('') }}>Send</button>
        </div>
        {link && (
          <div className="fr-link">
            <span>Or share your friend link — opening it sends you a request:</span>
            <button className="fr-btn ghost" onClick={async () => {
              try { await navigator.clipboard.writeText(link) } catch { /* ignore */ }
              setCopied(true); setTimeout(() => setCopied(false), 1800)
            }}>{copied ? 'Copied!' : 'Copy my friend link'}</button>
          </div>
        )}
      </div>

      {(incoming.length > 0 || outgoing.length > 0) && (
        <div className="fr-card">
          <div className="fr-label">Requests</div>
          {incoming.map(r => (
            <div key={r.id} className="fr-person">
              <Face p={r} /><span className="fr-name">{r.nickname}<small>wants to be friends</small></span>
              <button className="fr-btn" disabled={busy} onClick={() => act('friend_respond', { p_id: r.id, p_accept: true })}>Accept</button>
              <button className="fr-btn ghost" disabled={busy} onClick={() => act('friend_respond', { p_id: r.id, p_accept: false })}>Decline</button>
            </div>
          ))}
          {outgoing.map(r => (
            <div key={r.id} className="fr-person">
              <Face p={r} /><span className="fr-name">{r.nickname}<small>waiting for them to accept</small></span>
              <button className="fr-btn ghost" disabled={busy} onClick={() => act('friend_remove', { p_user: r.user_id })}>Cancel</button>
            </div>
          ))}
        </div>
      )}

      <div className="fr-card">
        <div className="fr-label">Your friends ({friends.length})</div>
        {!friends.length && <p className="fr-empty">No friends yet — add someone by nickname, or share your link.</p>}
        {friends.map(r => (
          <div key={r.id} className="fr-person">
            <Face p={r} /><span className="fr-name">{r.nickname}</span>
            <button className="fr-btn ghost small" disabled={busy}
              onClick={() => act('friend_remove', { p_user: r.user_id }, `Remove ${r.nickname} from your friends?`)}>Remove</button>
            <button className="fr-btn ghost small danger" disabled={busy}
              onClick={() => act('friend_block', { p_user: r.user_id }, `Block ${r.nickname}? They won’t be able to send you requests or challenges.`)}>Block</button>
          </div>
        ))}
      </div>

      {blocked.length > 0 && (
        <details className="fr-card fr-blocked">
          <summary>Blocked ({blocked.length})</summary>
          {blocked.map(r => (
            <div key={r.user_id} className="fr-person">
              <Face p={r} size={32} /><span className="fr-name">{r.nickname}</span>
              <button className="fr-btn ghost small" disabled={busy} onClick={() => act('friend_unblock', { p_user: r.user_id })}>Unblock</button>
            </div>
          ))}
        </details>
      )}
    </div>
  )
}
