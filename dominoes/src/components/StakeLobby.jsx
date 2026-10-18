import { useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import '../pages/Stakes.css'

// ── Goud stakes in the Lobby ─────────────────────────────────────────────────
// "Play for Goud" when creating a room (off unless the player turns it on),
// and the stake card shown when a code belongs to a stake room. Both hand
// over to the stake waiting room (pages/Stakes.jsx), where everyone accepts
// the stake, can propose another amount and vote, and the host starts.

const PRESETS = [25, 50, 100, 250]
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s)
export const STAKE_ROOM_KEY = 'dekabess_stake_room'

export function openStakeRoom(roomId, navigate) {
  try { sessionStorage.setItem(STAKE_ROOM_KEY, JSON.stringify({ roomId })) } catch { /* ignore */ }
  navigate('/stakes')
}

// the switch and settings under "Create New Room"
export function StakeCreate({ on, setOn, signedIn, onCreated }) {
  const [balance, setBalance] = useState(null)
  const [amount, setAmount] = useState(50)
  const [custom, setCustom] = useState('')
  const [mode, setMode] = useState('chien')
  const [seats, setSeats] = useState(4)
  const [pile, setPile] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!on || !signedIn) return
    db.rpc('goud_status').then(({ data }) => { const r = Array.isArray(data) ? data[0] : data; if (r) setBalance(Number(r.balance)) })
  }, [on, signedIn])

  const stakeNow = custom !== '' ? Number(custom) : amount
  const maxBal = balance ?? 0
  const okAmount = Number.isFinite(stakeNow) && stakeNow >= 10 && stakeNow <= maxBal

  async function create() {
    setBusy(true); setMsg('')
    const { data, error } = await db.rpc('stake_create', {
      p_stake: Math.floor(stakeNow), p_mode: mode, p_seats: mode === 'asosye' ? 4 : seats,
      p_variant: pile && seats < 4 && mode === 'chien' ? 'pile' : 'all',
    })
    setBusy(false)
    if (error) { setMsg('Something went wrong — try again.'); return }
    if (!data?.ok) { setMsg(cap(data?.reason) || 'Not possible right now'); return }
    onCreated(data.room_id)
  }

  return (
    <div className="stake-switch">
      <label className="stake-toggle">
        <input type="checkbox" checked={on} onChange={e => setOn(e.target.checked)} />
        <span className="stake-toggle-track"><span /></span>
        <span>🪙 Play for Goud</span>
      </label>
      {on && !signedIn && <p className="stakes-sub">Sign in to play for Goud.</p>}
      {on && signedIn && (
        <div className="stake-setup">
          <p className="stakes-sub">You have <strong>🪙 {balance ?? '…'}</strong> Goud. Each player puts in the stake; the Vyèj winner takes the pot{mode === 'asosye' ? ' (partners split it)' : ''}. Players see the stake before joining and can vote on another amount.</p>
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
          <button className="btn btn-primary" onClick={create} disabled={busy || !okAmount}>
            {okAmount ? `Create Room — ${Math.floor(stakeNow)} Goud each` : stakeNow > maxBal ? 'More Goud than you have' : 'At least 10 Goud'}
          </button>
          {msg && <p className="stakes-msg">{msg}</p>}
        </div>
      )}
    </div>
  )
}

// the card shown when a code belongs to a stake room
export function StakeJoinCard({ preview, signedIn, onJoined, onCancel }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const modeName = preview.mode === 'asosye' ? 'Partners' : 'Every man'
  const mine = preview.my_seat !== null && preview.my_seat !== undefined && !['finished', 'cancelled'].includes(preview.status)

  async function join() {
    setBusy(true); setMsg('')
    const { data, error } = await db.rpc('stake_join', { p_code: preview.code })
    setBusy(false)
    if (error) { setMsg('Something went wrong — try again.'); return }
    if (!data?.ok) { setMsg(cap(data?.reason) || 'Not possible right now'); return }
    onJoined(data.room_id)
  }

  return (
    <div className="stakes-card stakes-preview-card">
      <div className="stakes-label">🪙 This room plays for Goud</div>
      <div><strong>{preview.host}</strong>’s table · {modeName}</div>
      <div className="stakes-amount">🪙 {preview.stake} <span>Goud each · pot {preview.pot}</span></div>
      <div className="stakes-sub">{preview.seated}/{preview.seat_count} seated{preview.vote_open ? ' · a stake vote is open' : ''}</div>
      {!signedIn ? <div className="stakes-sub">Sign in to play for Goud.</div>
        : mine ? <div className="stakes-row"><button className="stakes-btn gold" onClick={join} disabled={busy}>Back to your table</button></div>
        : preview.status !== 'waiting' ? <div className="stakes-sub">This game has {['finished', 'cancelled'].includes(preview.status) ? 'ended' : 'already started'}.</div>
        : !preview.can_afford ? <div className="stakes-sub">You need {preview.stake} Goud to join.</div>
        : <div className="stakes-row">
            <button className="stakes-btn gold" onClick={join} disabled={busy}>Join for {preview.stake} Goud</button>
            <button className="stakes-btn" onClick={onCancel}>Cancel</button>
          </div>}
      {(mine || preview.status !== 'waiting' || !preview.can_afford || !signedIn) && (
        <div className="stakes-row"><button className="stakes-btn" onClick={onCancel}>Back</button></div>
      )}
      {msg && <p className="stakes-msg">{msg}</p>}
    </div>
  )
}
