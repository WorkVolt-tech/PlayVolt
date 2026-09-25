import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import './Tournament.css'

// ── Tournaments ──────────────────────────────────────────────────────────────
// Mostly human: you register a team of two (or alone, in a solo cup) and play
// through a bracket. Bot pairs only appear when the bracket is uneven, and a
// bot can stand in for a partner who never showed.

export default function Tournament() {
  const navigate = useNavigate()
  const { user, isLoading } = useAuth()

  const [list, setList] = useState([])
  const [open, setOpen] = useState(null)      // the tournament being viewed
  const [sides, setSides] = useState([])
  const [members, setMembers] = useState([])
  const [matches, setMatches] = useState([])
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [unlocked, setUnlocked] = useState([])   // bots earned in story mode
  const [picking, setPicking] = useState(null)   // side id we're filling a seat for

  const [newName, setNewName] = useState('')
  const [newFormat, setNewFormat] = useState('duo')
  const [teamName, setTeamName] = useState('')
  const [joinCode, setJoinCode] = useState('')

  const nickname = (typeof localStorage !== 'undefined' && localStorage.getItem('domino_nickname')) || 'Player'

  const loadList = useCallback(async () => {
    const { data } = await db.from('tournaments').select('*').order('created_at', { ascending: false }).limit(20)
    setList(data || [])
  }, [])

  const loadOne = useCallback(async (id) => {
    const [{ data: s }, { data: m }] = await Promise.all([
      db.from('tournament_sides').select('*').eq('tournament_id', id).order('created_at'),
      db.from('tournament_matches').select('*').eq('tournament_id', id).order('round').order('slot'),
    ])
    setSides(s || []); setMatches(m || [])
    const ids = (s || []).map(x => x.id)
    if (ids.length) {
      const { data: mem } = await db.from('tournament_members').select('*').in('side_id', ids)
      setMembers(mem || [])
    } else setMembers([])
  }, [])

  useEffect(() => { loadList() }, [loadList])

  // bots this player has unlocked, for standing in for a missing partner
  useEffect(() => {
    if (!user) return
    let off = false
    ;(async () => {
      const { data } = await db.rpc('ensure_story_progress')
      const row = Array.isArray(data) ? data[0] : data
      if (!off) setUnlocked(row?.unlocked_bots || [])
    })()
    return () => { off = true }
  }, [user])
  useEffect(() => { if (open) loadOne(open.id) }, [open, loadOne])

  // live updates while a tournament is on screen
  useEffect(() => {
    if (!open) return
    const ch = db.channel('tour-' + open.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_matches', filter: `tournament_id=eq.${open.id}` }, () => loadOne(open.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_sides', filter: `tournament_id=eq.${open.id}` }, () => loadOne(open.id))
      .subscribe()
    return () => { db.removeChannel(ch) }
  }, [open, loadOne])

  async function call(fn, args, after) {
    setBusy(true); setMsg(null)
    const { data, error } = await db.rpc(fn, args)
    setBusy(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return null }
    if (after) await after(data)
    return data
  }

  const mySide = sides.find(s => members.some(m => m.side_id === s.id && m.user_id === user?.id))
  const myMember = members.find(m => m.side_id === mySide?.id && m.user_id === user?.id)

  // Start (or rejoin) the room for a match and drop into the game.
  async function playMatch(match) {
    setBusy(true); setMsg(null)
    const { data, error } = await db.rpc('start_tournament_match', { p_match: match.id })
    if (error) { setBusy(false); setMsg({ type: 'error', text: error.message }); return }
    const room = Array.isArray(data) ? data[0] : data
    if (!room?.id) { setBusy(false); setMsg({ type: 'error', text: 'Could not open the room.' }); return }

    // find my seat in that room — by account, so two players sharing a
    // nickname can't be given each other's hand
    const { data: seatRows } = await db.from('domino_players')
      .select('seat, nickname, is_ai, user_id').eq('room_id', room.id)
    const mine = (seatRows || []).find(r => !r.is_ai && r.user_id === user?.id)
              || (seatRows || []).find(r => !r.is_ai && r.nickname === myMember?.nickname)
    setBusy(false)
    if (!mine) { setMsg({ type: 'error', text: 'Your seat is not in that room.' }); return }

    sessionStorage.setItem('domino_player', JSON.stringify({
      seat: mine.seat,
      nickname: myMember?.nickname || nickname,
      roomId: room.id,
      roomCode: room.code,
      gameMode: room.game_mode || 'chien',
      tournamentMatchId: match.id,
    }))
    navigate('/game')
  }

  async function claimForfeit(match) {
    await call('forfeit_match', { p_match_id: match.id, p_present: mySide.id },
      () => loadOne(open.id))
  }

  // A match of mine that someone has already opened the room for.
  const liveMatch = matches.find(m =>
    m.room_id && m.status !== 'done' && m.status !== 'forfeit' &&
    [m.side_a, m.side_b, m.side_c, m.side_d].filter(Boolean).includes(mySide?.id))

  async function addBot(sideId, botName) {
    setPicking(null)
    await call('fill_missing_partner', { p_side: sideId, p_bot: botName }, () => loadOne(open.id))
  }
  const myMembers = mySide ? members.filter(m => m.side_id === mySide.id) : []
  const sideName = id => sides.find(s => s.id === id)?.name || '—'
  const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b)

  // ── guests ────────────────────────────────────────────────────────────────
  if (!isLoading && !user) {
    return (
      <div className="tp-page">
        <Header navigate={navigate} />
        <div className="tp-gate">
          <p>Tournaments are played against other people, so you need an account.</p>
          <button className="tp-btn" onClick={() => navigate('/auth')}>Sign in</button>
        </div>
      </div>
    )
  }

  // ── one tournament ────────────────────────────────────────────────────────
  if (open) {
    const canStart = open.created_by === user?.id && open.status === 'registration'
    return (
      <div className="tp-page">
        <Header navigate={navigate} onBack={() => setOpen(null)} title={open.name} />
        <div className="tp-sub">{open.format === 'duo' ? 'Teams of two' : 'Solo — one on one on one on one'} · {open.status}</div>
        {msg && <div className={`tp-msg ${msg.type}`}>{msg.text}</div>}

        {liveMatch && (
          <div className="tp-live">
            <div>
              <strong>Your match is live</strong>
              <span>Round {liveMatch.round} — the table is open and waiting for you.</span>
            </div>
            <button className="tp-btn" disabled={busy} onClick={() => playMatch(liveMatch)}>Join now</button>
          </div>
        )}

        {open.status === 'registration' && !mySide && (
          <div className="tp-panel">
            <div className="tp-label">Register</div>
            {open.format === 'duo' ? (
              <>
                <div className="tp-row">
                  <input className="tp-input" placeholder="Team name" value={teamName} onChange={e => setTeamName(e.target.value)} maxLength={20} />
                  <button className="tp-btn" disabled={busy || !teamName.trim()}
                    onClick={() => call('create_side', { p_tournament: open.id, p_name: teamName.trim(), p_nickname: nickname }, () => loadOne(open.id))}>
                    Create team
                  </button>
                </div>
                <div className="tp-or">or join your partner’s team</div>
                <div className="tp-row">
                  <input className="tp-input" placeholder="Team code" value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={6} />
                  <button className="tp-btn" disabled={busy || joinCode.length !== 6}
                    onClick={() => call('join_side', { p_code: joinCode, p_nickname: nickname }, () => loadOne(open.id))}>
                    Join
                  </button>
                </div>
              </>
            ) : (
              <div className="tp-row">
                <button className="tp-btn" disabled={busy}
                  onClick={() => call('create_side', { p_tournament: open.id, p_name: nickname, p_nickname: nickname }, () => loadOne(open.id))}>
                  Enter the cup
                </button>
              </div>
            )}
          </div>
        )}

        {mySide && (
          <div className="tp-panel">
            <div className="tp-label">Your {open.format === 'duo' ? 'team' : 'entry'}</div>
            <div className="tp-team">
              <strong>{mySide.name}</strong>
              {mySide.code && <span className="tp-code">code {mySide.code}</span>}
            </div>
            <div className="tp-members">
              {myMembers.map(m => (
                <span key={m.id} className={`tp-chip ${m.bot_name ? 'bot' : ''}`}>
                  {m.nickname}{m.bot_name ? ' (bot)' : ''}
                </span>
              ))}
              {open.format === 'duo' && myMembers.length < 2 && <span className="tp-chip empty">waiting for partner…</span>}
            </div>
            {open.format === 'duo' && myMembers.length < 2 && (
              <div className="tp-hint">
                Share the code. If they don’t show, you can bring in a bot you’ve unlocked once the match is due.
              </div>
            )}
          </div>
        )}

        <div className="tp-panel">
          <div className="tp-label">Entries ({sides.length})</div>
          <div className="tp-sides">
            {sides.map(s => (
              <div key={s.id} className={`tp-side ${s.eliminated ? 'out' : ''} ${s.is_bot ? 'bot' : ''}`}>
                <span>{s.name}{s.is_bot ? ' · bots' : ''}</span>
                <span className="tp-side-members">
                  {members.filter(m => m.side_id === s.id).map(m => m.nickname).join(' & ') || (s.is_bot ? 'expert pair' : '—')}
                </span>
              </div>
            ))}
            {!sides.length && <div className="tp-empty">Nobody has entered yet.</div>}
          </div>
          {canStart && (
            <button className="tp-btn wide" disabled={busy}
              onClick={() => call('start_tournament', { p_tournament: open.id }, async () => {
                await loadOne(open.id); setOpen({ ...open, status: 'running' })
              })}>
              Start the tournament
            </button>
          )}
        </div>

        {picking && (
        <div className="tp-overlay" onClick={() => setPicking(null)}>
          <div className="tp-card" onClick={e => e.stopPropagation()}>
            <h3>Bring in a bot</h3>
            <p>They take your missing partner’s seat for this tournament.</p>
            <div className="tp-botlist">
              {unlocked.map(b => (
                <button key={b} className="tp-btn small" onClick={() => addBot(picking, b)}>{b}</button>
              ))}
              {!unlocked.length && <div className="tp-empty">You haven’t unlocked any bots yet — play Story Mode.</div>}
            </div>
            <button className="tp-btn small" onClick={() => setPicking(null)}>Cancel</button>
          </div>
        </div>
      )}

      {rounds.map(r => (
          <div className="tp-panel" key={r}>
            <div className="tp-label">Round {r}</div>
            {matches.filter(m => m.round === r).map(m => {
              const ids = [m.side_a, m.side_b, m.side_c, m.side_d].filter(Boolean)
              const mine = ids.includes(mySide?.id)
              return (
                <div key={m.id} className={`tp-match ${m.status} ${mine ? 'mine' : ''}`}>
                  <div className="tp-match-sides">
                    {ids.map(id => (
                      <span key={id} className={m.winner_side === id ? 'won' : ''}>
                        {sideName(id)}
                        <em>{m.wins?.[id] ?? 0}</em>
                      </span>
                    ))}
                  </div>
                  <div className="tp-match-state">
                    {m.status === 'done' ? `${sideName(m.winner_side)} through`
                      : m.status === 'forfeit' ? `${sideName(m.winner_side)} through (no show)`
                      : m.status}
                  </div>
                  {mine && m.status !== 'done' && m.status !== 'forfeit' && (
                    <div className="tp-match-actions">
                      <Countdown until={m.no_show_at} />
                      <button className="tp-btn small gold" disabled={busy} onClick={() => playMatch(m)}>
                        {m.room_id ? 'Rejoin match' : 'Play match'}
                      </button>
                      {open.format === 'duo' && myMembers.length < 2 && (
                        <button className="tp-btn small" onClick={() => setPicking(mySide.id)}>
                          Partner didn’t show
                        </button>
                      )}
                      {m.no_show_at && new Date(m.no_show_at) < new Date() && (
                        <button className="tp-btn small" disabled={busy} onClick={() => claimForfeit(m)}>
                          Claim the walkover
                        </button>
                      )}
                      <button className="tp-btn small" onClick={() => navigate('/story')}>Practice vs AI</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  // ── the list ──────────────────────────────────────────────────────────────
  return (
    <div className="tp-page">
      <Header navigate={navigate} />
      {msg && <div className={`tp-msg ${msg.type}`}>{msg.text}</div>}

      <div className="tp-panel">
        <div className="tp-label">Start a tournament</div>
        <div className="tp-row">
          <input className="tp-input" placeholder="Name it" value={newName} onChange={e => setNewName(e.target.value)} maxLength={30} />
          <select className="tp-select" value={newFormat} onChange={e => setNewFormat(e.target.value)}>
            <option value="duo">Teams of 2</option>
            <option value="solo">Solo (1v1v1v1)</option>
          </select>
        </div>
        <button className="tp-btn wide" disabled={busy || !newName.trim()}
          onClick={() => call('create_tournament', { p_name: newName.trim(), p_format: newFormat }, async (t) => {
            setNewName(''); await loadList(); setOpen(Array.isArray(t) ? t[0] : t)
          })}>
          Create
        </button>
      </div>

      <div className="tp-panel">
        <div className="tp-label">Tournaments</div>
        {list.map(t => (
          <button key={t.id} className="tp-item" onClick={() => setOpen(t)}>
            <span className="tp-item-name">{t.name}</span>
            <span className="tp-item-meta">{t.format === 'duo' ? '2v2' : 'solo'} · {t.status}</span>
          </button>
        ))}
        {!list.length && <div className="tp-empty">None yet — start one above.</div>}
      </div>
    </div>
  )
}

function Header({ navigate, onBack, title }) {
  return (
    <div className="tp-header">
      <button className="tp-back" onClick={() => (onBack ? onBack() : navigate('/'))}>← Back</button>
      <h1 className="tp-title">{title || 'Tournaments'}</h1>
      <span style={{ width: 54 }} />
    </div>
  )
}

function Countdown({ until }) {
  const [left, setLeft] = useState(() => remaining(until))
  useEffect(() => {
    const t = setInterval(() => setLeft(remaining(until)), 1000)
    return () => clearInterval(t)
  }, [until])
  if (!until) return null
  return <span className="tp-count">{left > 0 ? `starts within ${fmt(left)}` : 'no-show deadline passed'}</span>
}
function remaining(until) { return until ? Math.max(0, Math.floor((new Date(until) - Date.now()) / 1000)) : 0 }
function fmt(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
