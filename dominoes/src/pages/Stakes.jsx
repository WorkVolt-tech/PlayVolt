import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { statusOf } from './Friends'
import './Stakes.css'
import GoudCoin from '../components/GoudCoin'

// ── The stake waiting room ───────────────────────────────────────────────────
// Reached from the Lobby: "Play for Goud" when creating a room, or a room code
// that belongs to a stake room (components/StakeLobby.jsx). In the waiting room everyone accepts the stake; anyone can propose another amount
// and the table votes (more than half saying yes changes it, and then everyone
// accepts the new amount). The host starts once every seat is filled and
// accepted. The server holds the stakes at the start, runs the game and pays
// the pot at the Vyèj (stake_* in dekabess_database.sql). No Goud is held
// before the start, so leaving the waiting room costs nothing.

const KEY = 'dekabess_stake_room'
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s)

export default function Stakes() {
  const navigate = useNavigate()
  const { user, isLoading } = useAuth()
  const [balance, setBalance] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  // the waiting room
  const [roomId, setRoomId] = useState(() => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null')?.roomId || null } catch { return null } })
  const [info, setInfo] = useState(null)
  const [propose, setPropose] = useState('')
  // friends to invite to this table
  const [friends, setFriends] = useState([])
  const [invited, setInvited] = useState({})
  useEffect(() => {
    if (!roomId || !user) return
    let off = false
    const load = () => db.rpc('my_friends').then(({ data }) => { if (!off) setFriends((data || []).filter(r => r.kind === 'friend')) })
    load()
    const t = setInterval(load, 30000)
    return () => { off = true; clearInterval(t) }
  }, [roomId, user])

  const loadBalance = useCallback(() => {
    db.rpc('goud_status').then(({ data }) => { const r = Array.isArray(data) ? data[0] : data; if (r) setBalance(Number(r.balance)) })
  }, [])
  useEffect(() => { if (user) loadBalance() }, [user, loadBalance])

  const loadInfo = useCallback(async () => {
    if (!roomId) return
    const { data } = await db.rpc('stake_info', { p_room: roomId })
    if (!data || data.my_seat === null || data.my_seat === undefined) {
      // no longer at this table (left, or it was cancelled)
      try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
      if (data?.status === 'cancelled') setMsg('The host closed the table. Nobody was charged.')
      setRoomId(null); setInfo(null)
      return
    }
    setInfo(data)
    if (data.status === 'cancelled') {
      try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
      setMsg('The table was closed. Nobody was charged.')
      setRoomId(null); setInfo(null)
      return
    }
    if (data.status !== 'waiting') {
      // the host started: into the game
      const me = (data.seats || []).find(s => s.seat === data.my_seat)
      sessionStorage.setItem('domino_player', JSON.stringify({
        seat: data.my_seat, nickname: me?.nickname || 'Player', roomId, roomCode: data.code,
        gameMode: data.mode, stake: data.stake,
      }))
      try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
      navigate('/game')
    }
  }, [roomId, navigate])

  // the waiting room follows the room live, with a gentle re-check as a safety net
  useEffect(() => {
    if (!roomId) return
    loadInfo()
    const ch = db.channel('stake-' + roomId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'domino_rooms', filter: `id=eq.${roomId}` }, () => loadInfo())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'domino_players', filter: `room_id=eq.${roomId}` }, () => loadInfo())
      .subscribe()
    const t = setInterval(loadInfo, 4000)
    return () => { db.removeChannel(ch); clearInterval(t) }
  }, [roomId, loadInfo])

  async function call(fn, args, then) {
    setBusy(true); setMsg('')
    const { data, error } = await db.rpc(fn, args)
    setBusy(false)
    if (error) { setMsg('Something went wrong — try again.'); return null }
    if (data && data.ok === false) { setMsg(cap(data.reason) || 'Not possible right now'); return null }
    if (then) then(data)
    return data
  }

  const accept = () => call('stake_accept', { p_room: roomId }, loadInfo)
  const vote = yes => call('stake_vote', { p_room: roomId, p_yes: yes }, loadInfo)
  const sendProposal = () => call('stake_propose', { p_room: roomId, p_amount: Math.floor(Number(propose)) }, () => { setPropose(''); loadInfo() })
  const start = () => call('stake_start', { p_room: roomId }, loadInfo)
  async function invite(f) {
    setInvited(v => ({ ...v, [f.user_id]: '…' }))
    await db.rpc('challenge_friend', { p_friend: f.user_id, p_room: roomId, p_code: info.code, p_mode: 'stake' })
    setInvited(v => ({ ...v, [f.user_id]: 'Invited ✓' }))
  }
  const leave = () => call('stake_leave', { p_room: roomId }, () => {
    try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
    navigate('/')
  })

  const modeName = m => (m === 'asosye' ? 'Partners' : 'Every man')

  if (isLoading) return <div className="stakes-page" />
  if (!user) {
    return (
      <div className="stakes-page">
        <button className="ui-back stakes-back" onClick={() => navigate('/')}>← Lobby</button>
        <h1 className="stakes-title">Goud Stakes</h1>
        <p className="stakes-note">Sign in to play for Goud.</p>
        <button className="stakes-btn gold" onClick={() => navigate('/auth')}>Sign in</button>
      </div>
    )
  }

  // ── the waiting room ──
  if (roomId && info) {
    const mine = (info.seats || []).find(s => s.seat === info.my_seat)
    const p = info.proposal
    const votes = p?.votes || {}
    const myVote = p ? votes[String(info.my_seat)] : undefined
    const yes = p ? Object.values(votes).filter(v => v === true).length : 0
    const seated = (info.seats || []).length
    const allIn = seated === info.seat_count && (info.seats || []).every(s => s.accepted) && !p
    const by = p ? (info.seats || []).find(s => s.seat === p.by)?.nickname || 'Someone' : ''
    return (
      <div className="stakes-page">
        <button className="ui-back stakes-back" onClick={leave} disabled={busy}>← Leave table</button>
        <h1 className="stakes-title">Goud Stakes</h1>
        <div className="stakes-card stakes-room">
          <div className="stakes-code">Table <strong>{info.code}</strong></div>
          <div className="stakes-amount"><GoudCoin />{info.stake} <span>Goud each</span></div>
          <div className="stakes-sub">Pot {info.pot} · {modeName(info.mode)} · {seated}/{info.seat_count} seated</div>
          <ul className="stakes-seats">
            {Array.from({ length: info.seat_count }).map((_, i) => {
              const s = (info.seats || []).find(x => x.seat === i)
              return (
                <li key={i} className={s ? (s.accepted ? 'ok' : 'wait') : 'empty'}>
                  <span>{s ? s.nickname : 'Empty seat'}{s && s.seat === info.my_seat ? ' (you)' : ''}</span>
                  <em>{s ? (s.accepted ? '✓ accepted' : 'to accept') : 'share the code'}</em>
                </li>
              )
            })}
          </ul>
          {mine && !mine.accepted && (
            <button className="stakes-btn gold" onClick={accept} disabled={busy}>Accept {info.stake} Goud</button>
          )}
        </div>

        {(() => {
          // friends online or in another game, not already at this table; they see the stake before joining
          const seatedIds = new Set((info.seats || []).map(s => s.user_id).filter(Boolean))
          const invitable = friends.filter(f => statusOf(f).live && !seatedIds.has(f.user_id))
            .sort((a, b) => statusOf(a).game - statusOf(b).game)
          if (!invitable.length || seated >= info.seat_count) return null
          return (
            <div className="stakes-card">
              <div className="stakes-label">Invite a friend to the table</div>
              {invitable.map(f => (
                <div key={f.user_id} className="stakes-invite">
                  <span>{statusOf(f).game ? '🎲' : '🟢'} {f.nickname}{statusOf(f).game ? <small> · in a game</small> : null}</span>
                  <button className="stakes-btn" disabled={!!invited[f.user_id]} onClick={() => invite(f)}>{invited[f.user_id] || 'Invite'}</button>
                </div>
              ))}
            </div>
          )
        })()}

        {p ? (
          <div className="stakes-card stakes-vote">
            <div className="stakes-vote-title">{by} proposes <strong>{p.amount} Goud</strong></div>
            <div className="stakes-sub">{yes} of {seated} say yes · more than half changes the stake</div>
            {myVote === undefined ? (
              <div className="stakes-row">
                <button className="stakes-btn gold" onClick={() => vote(true)} disabled={busy}>Yes, {p.amount}</button>
                <button className="stakes-btn" onClick={() => vote(false)} disabled={busy}>No, keep {info.stake}</button>
              </div>
            ) : <div className="stakes-sub">You voted {myVote ? 'yes' : 'no'}.</div>}
          </div>
        ) : (
          <div className="stakes-card">
            <div className="stakes-label">Not happy with the stake?</div>
            <div className="stakes-row">
              <input className="stakes-input" inputMode="numeric" placeholder={`Another amount (10–${balance ?? '…'})`}
                value={propose} onChange={e => setPropose(e.target.value.replace(/\D/g, ''))} />
              <button className="stakes-btn" onClick={sendProposal} disabled={busy || !propose || Number(propose) < 10}>Propose</button>
            </div>
          </div>
        )}

        {info.host ? (
          <button className="stakes-btn gold big" onClick={start} disabled={busy || !allIn}>
            {allIn ? `Start — hold ${info.stake} Goud each` : seated < info.seat_count ? 'Waiting for players…' : p ? 'Waiting for the vote…' : 'Waiting for everyone to accept…'}
          </button>
        ) : <p className="stakes-note">The host starts once everyone has accepted.</p>}
        <p className="stakes-fine">Nothing is held until the start; leaving now is free. At the start each stake is held; the Vyèj winner takes the pot{info.mode === 'asosye' ? ' (partners: each winner gets double their stake)' : ''}. If a game goes quiet for 30 minutes, everyone gets their stake back.</p>
        {msg && <p className="stakes-msg">{msg}</p>}
      </div>
    )
  }

  // not at a stake table (closed, left, or opened directly)
  return (
    <div className="stakes-page">
      <h1 className="stakes-title">Goud Stakes</h1>
      <p className="stakes-note">{msg || 'You’re not at a stake table. Create one from the Lobby with “Play for Goud”, or join one with its code.'}</p>
      <button className="stakes-btn gold" onClick={() => navigate('/')}>Back to the lobby</button>
    </div>
  )
}
