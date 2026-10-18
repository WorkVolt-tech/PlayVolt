import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import './Stakes.css'

// ── Goud stake tables ────────────────────────────────────────────────────────
// Open a table for a stake, or check one by its code before joining. In the
// waiting room everyone accepts the stake; anyone can propose another amount
// and the table votes (more than half saying yes changes it, and then everyone
// accepts the new amount). The host starts once every seat is filled and
// accepted. The server holds the stakes at the start, runs the game and pays
// the pot at the Vyèj (stake_* in dekabess_database.sql). No Goud is held
// before the start, so leaving the waiting room costs nothing.

const PRESETS = [25, 50, 100, 250]
const KEY = 'dekabess_stake_room'
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s)

export default function Stakes() {
  const navigate = useNavigate()
  const { user, isLoading } = useAuth()
  const [balance, setBalance] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  // open a table
  const [amount, setAmount] = useState(50)
  const [custom, setCustom] = useState('')
  const [mode, setMode] = useState('chien')
  const [seats, setSeats] = useState(4)
  const [pile, setPile] = useState(false)

  // join a table
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState(null)

  // the waiting room
  const [roomId, setRoomId] = useState(() => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null')?.roomId || null } catch { return null } })
  const [info, setInfo] = useState(null)
  const [propose, setPropose] = useState('')

  const stakeNow = custom !== '' ? Number(custom) : amount

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

  function enter(id) {
    try { sessionStorage.setItem(KEY, JSON.stringify({ roomId: id })) } catch { /* ignore */ }
    setPreview(null); setCode(''); setMsg('')
    setRoomId(id)
  }

  async function call(fn, args, then) {
    setBusy(true); setMsg('')
    const { data, error } = await db.rpc(fn, args)
    setBusy(false)
    if (error) { setMsg('Something went wrong — try again.'); return null }
    if (data && data.ok === false) { setMsg(cap(data.reason) || 'Not possible right now'); return null }
    if (then) then(data)
    return data
  }

  const create = () => call('stake_create', {
    p_stake: Math.floor(stakeNow), p_mode: mode, p_seats: mode === 'asosye' ? 4 : seats, p_variant: pile && seats < 4 && mode === 'chien' ? 'pile' : 'all',
  }, d => enter(d.room_id))
  const check = () => call('stake_preview', { p_code: code.trim().toUpperCase() }, d => setPreview(d))
  const join = () => call('stake_join', { p_code: preview.code }, d => enter(d.room_id))
  const accept = () => call('stake_accept', { p_room: roomId }, loadInfo)
  const vote = yes => call('stake_vote', { p_room: roomId, p_yes: yes }, loadInfo)
  const sendProposal = () => call('stake_propose', { p_room: roomId, p_amount: Math.floor(Number(propose)) }, () => { setPropose(''); loadInfo() })
  const start = () => call('stake_start', { p_room: roomId }, loadInfo)
  const leave = () => call('stake_leave', { p_room: roomId }, () => {
    try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
    setRoomId(null); setInfo(null); loadBalance()
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
          <div className="stakes-amount">🪙 {info.stake} <span>Goud each</span></div>
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

  // ── open or join ──
  const maxBal = balance ?? 0
  const okAmount = Number.isFinite(stakeNow) && stakeNow >= 10 && stakeNow <= maxBal
  return (
    <div className="stakes-page">
      <button className="ui-back stakes-back" onClick={() => navigate('/')}>← Lobby</button>
      <h1 className="stakes-title">Goud Stakes</h1>
      <p className="stakes-note">You have <strong>🪙 {balance ?? '…'}</strong> Goud. Play people for Goud: the server deals, checks every move and pays the winner.</p>

      <div className="stakes-card">
        <div className="stakes-label">Join a table</div>
        <div className="stakes-row">
          <input className="stakes-input code" placeholder="CODE" maxLength={6} value={code}
            onChange={e => { setCode(e.target.value.toUpperCase()); setPreview(null) }} />
          <button className="stakes-btn" onClick={check} disabled={busy || code.trim().length < 6}>Check</button>
        </div>
        {preview && (
          <div className="stakes-preview">
            <div><strong>{preview.host}</strong>’s table · {modeName(preview.mode)}</div>
            <div className="stakes-amount">🪙 {preview.stake} <span>Goud each · pot {preview.pot}</span></div>
            <div className="stakes-sub">{preview.seated}/{preview.seat_count} seated{preview.vote_open ? ' · a stake vote is open' : ''}</div>
            {preview.my_seat !== null && preview.my_seat !== undefined && !['finished', 'cancelled'].includes(preview.status)
              ? <div className="stakes-row"><button className="stakes-btn gold" onClick={join} disabled={busy}>Back to your table</button></div>
              : preview.status !== 'waiting'
              ? <div className="stakes-sub">This game has {preview.status === 'finished' || preview.status === 'cancelled' ? 'ended' : 'already started'}.</div>
              : preview.can_afford
                ? <div className="stakes-row">
                    <button className="stakes-btn gold" onClick={join} disabled={busy}>Join for {preview.stake} Goud</button>
                    <button className="stakes-btn" onClick={() => setPreview(null)}>Cancel</button>
                  </div>
                : <div className="stakes-sub">You need {preview.stake} Goud to join.</div>}
          </div>
        )}
      </div>

      <div className="stakes-card">
        <div className="stakes-label">Open a table</div>
        <div className="stakes-chips">
          {PRESETS.map(v => (
            <button key={v} className={`stakes-chip ${custom === '' && amount === v ? 'on' : ''}`} disabled={v > maxBal}
              onClick={() => { setAmount(v); setCustom('') }}>{v}</button>
          ))}
          <input className="stakes-input small" inputMode="numeric" placeholder="Other"
            value={custom} onChange={e => setCustom(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="stakes-chips">
          <button className={`stakes-chip ${mode === 'chien' ? 'on' : ''}`} onClick={() => setMode('chien')}>Every man</button>
          <button className={`stakes-chip ${mode === 'asosye' ? 'on' : ''}`} onClick={() => { setMode('asosye'); setSeats(4) }}>Partners (4)</button>
        </div>
        {mode === 'chien' && (
          <div className="stakes-chips">
            {[2, 3, 4].map(n => (
              <button key={n} className={`stakes-chip ${seats === n ? 'on' : ''}`} onClick={() => setSeats(n)}>{n} players</button>
            ))}
            {seats < 4 && (
              <button className={`stakes-chip ${pile ? 'on' : ''}`} onClick={() => setPile(x => !x)}>Draw pile {pile ? 'on' : 'off'}</button>
            )}
          </div>
        )}
        <button className="stakes-btn gold big" onClick={create} disabled={busy || !okAmount}>
          {okAmount ? `Open a table for ${Math.floor(stakeNow)} Goud each` : stakeNow > maxBal ? 'More than you have' : 'At least 10 Goud'}
        </button>
      </div>
      {msg && <p className="stakes-msg">{msg}</p>}
    </div>
  )
}
