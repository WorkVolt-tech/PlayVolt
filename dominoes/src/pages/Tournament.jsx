import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import Practice from './Practice'
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
  const [practising, setPractising] = useState(false)
  const [realtime, setRealtime] = useState(null)   // null = unknown, false = using the timer

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

  // Watch for tournaments being created or started, so the list updates
  // without anyone having to refresh.
  useEffect(() => {
    const ch = db.channel('tournaments-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, () => loadList())
      .subscribe()
    return () => { db.removeChannel(ch) }
  }, [loadList])

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

  // Realtime is the fast path, but it only works if the tables are in the
  // supabase_realtime publication and the project has Realtime enabled. A
  // timer underneath means the bracket still keeps up if any of that is off.
  useEffect(() => {
    if (!open) return
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadOne(open.id) }, 4000)
    const onShow = () => { if (document.visibilityState === 'visible') loadOne(open.id) }
    document.addEventListener('visibilitychange', onShow)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onShow) }
  }, [open, loadOne])

  // and the list, so a new tournament turns up on its own
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadList() }, 8000)
    return () => clearInterval(t)
  }, [loadList])

  // live updates while a tournament is on screen
  useEffect(() => {
    if (!open) return
    const ch = db.channel('tour-' + open.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_matches', filter: `tournament_id=eq.${open.id}` }, () => loadOne(open.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_sides', filter: `tournament_id=eq.${open.id}` }, () => loadOne(open.id))
      // members have no tournament_id to filter on, so watch them all and
      // reload — it's a small table and this is how a partner joining your
      // team shows up without a refresh.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_members' }, () => loadOne(open.id))
      // the tournament row itself: status moving to 'running' when it starts
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments', filter: `id=eq.${open.id}` },
        payload => { if (payload.new) setOpen(o => (o ? { ...o, ...payload.new } : o)); loadOne(open.id) })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') setRealtime(true)
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtime(false)
          console.warn('[tournament] realtime not connected (' + status + ') — falling back to refreshing every few seconds')
        }
      })
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

  // Warm up with your partner in a real room: the two of you against two bots.
  // Nothing is recorded — the room is flagged as practice.
  async function practiseWithPartner() {
    setBusy(true); setMsg(null)
    const { data, error } = await db.rpc('start_partner_practice', { p_side: mySide.id })
    setBusy(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    const room = Array.isArray(data) ? data[0] : data
    const { data: seatRows } = await db.from('domino_players')
      .select('seat, nickname, is_ai, user_id').eq('room_id', room.id)
    const mine = (seatRows || []).find(r => !r.is_ai && r.user_id === user?.id)
    if (!mine) { setMsg({ type: 'error', text: 'Could not seat you in the practice room.' }); return }
    sessionStorage.setItem('domino_player', JSON.stringify({
      seat: mine.seat,
      nickname: myMember?.nickname || nickname,
      roomId: room.id,
      roomCode: room.code,
      gameMode: 'asosye',
    }))
    navigate('/game')
  }

  async function claimForfeit(match) {
    await call('forfeit_match', { p_match_id: match.id, p_present: mySide.id },
      () => loadOne(open.id))
  }

  // My next match: either the table is already open (someone pressed Play),
  // or the round has been drawn and it's waiting for us.
  const iAmOut = !!mySide?.eliminated
  const myNextMatch = iAmOut ? null : matches.find(m =>
    m.status !== 'done' && m.status !== 'forfeit' &&
    [m.side_a, m.side_b, m.side_c, m.side_d].filter(Boolean).includes(mySide?.id))
  const liveMatch = myNextMatch?.room_id ? myNextMatch : null

  // A match between two bot pairs has nobody to run it, so it would sit
  // unplayed forever. Have the database decide those, then the bracket can
  // keep moving even after every human is knocked out.
  useEffect(() => {
    if (!open || open.status !== 'running' || !matches.length) return
    const stuck = matches.some(m => m.status !== 'done' && m.status !== 'forfeit')
    if (!stuck) return
    const t = setTimeout(async () => {
      await db.rpc('name_bot_sides', { p_tournament: open.id })   // harmless if already named
      const { data, error } = await db.rpc('resolve_bot_matches', { p_tournament: open.id })
      if (!error && data > 0) loadOne(open.id)
    }, 2000)
    return () => clearTimeout(t)
  }, [matches, open, loadOne])

  // When every match in the latest round has finished, draw the next round.
  // Any client can do it — the function refuses if a match is still running,
  // so several people noticing at once is harmless.
  useEffect(() => {
    if (!open || open.status !== 'running' || !matches.length) return
    const last = Math.max(...matches.map(m => m.round))
    const thisRound = matches.filter(m => m.round === last)
    const allDone = thisRound.every(m => m.status === 'done' || m.status === 'forfeit')
    if (!allDone) return
    // Note: a single-match round IS the final, and advance_bracket is still
    // what closes the tournament and names the champion — so it has to be
    // called here too. Skipping it left a finished bracket stuck on
    // "running" with no result shown.
    const t = setTimeout(async () => {
      const { error } = await db.rpc('advance_bracket', { p_tournament: open.id })
      if (!error) loadOne(open.id)
    }, 1200)
    return () => clearTimeout(t)
  }, [matches, open, loadOne])

  async function addBot(sideId, botName) {
    setPicking(null)
    await call('fill_missing_partner', { p_side: sideId, p_bot: botName }, () => loadOne(open.id))
  }
  const myMembers = mySide ? members.filter(m => m.side_id === mySide.id) : []
  const sideName = id => sides.find(s => s.id === id)?.name || '—'
  // The whole bracket, not just the matches that exist yet. Every round from
  // the first to the final is drawn, with placeholders for ties that haven't
  // been decided — so you can see the path to the winner from the start.
  const perTie = open?.format === 'solo' ? 4 : 2
  const roundShape = (() => {
    const out = []
    let n = sides.length || perTie
    let r = 1
    while (n > 1 && r < 10) {
      out.push({ round: r, ties: Math.max(1, Math.ceil(n / perTie)) })
      n = Math.ceil(n / perTie)
      r += 1
    }
    return out.length ? out : [{ round: 1, ties: 1 }]
  })()
  const rounds = roundShape.map(x => x.round)
  const champion = open?.status === 'finished'
    ? sides.find(x => !x.eliminated)
    : null

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
        <div className="tp-sub">
          {open.format === 'duo' ? 'Teams of two' : 'Solo — one on one on one on one'} · {open.status}
          {realtime === false && <span className="tp-stale"> · updates delayed</span>}
          <button className="tp-refresh" onClick={() => loadOne(open.id)} title="Refresh now">⟳</button>
        </div>
        {msg && <div className={`tp-msg ${msg.type}`}>{msg.text}</div>}

        {open.status === 'finished' && champion && (
          <div className="tp-champion">
            <div className="tp-champion-label">Champion</div>
            <div className="tp-champion-name">{champion.name}{champion.is_bot ? ' (bots)' : ''}</div>
            <div className="tp-champion-who">
              {members.filter(m => m.side_id === champion.id).map(m => m.nickname).join(' & ') || 'expert pair'}
            </div>
            {champion.id === mySide?.id && <div className="tp-champion-you">That's you.</div>}
          </div>
        )}

        {iAmOut && open.status !== 'finished' && (
          <div className="tp-out">
            <strong>You're out of this one.</strong>
            <span>The bracket plays on below — the remaining matches finish themselves.</span>
          </div>
        )}

        {myNextMatch && open.status === 'running' && (
          <div className="tp-live">
            <div>
              <strong>{liveMatch ? 'Your match is live' : 'Your next match is ready'}</strong>
              <span>
                Round {myNextMatch.round} —{' '}
                {liveMatch
                  ? 'the table is open and waiting for you.'
                  : 'your opponents have been drawn. Open the table when you are.'}
              </span>
            </div>
            <button className="tp-btn" disabled={busy} onClick={() => playMatch(myNextMatch)}>
              {liveMatch ? 'Join now' : 'Open the table'}
            </button>
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

        {practising && (
        <div className="tp-practice">
          <div className="tp-practice-bar">
            <button className="tp-btn small" onClick={() => setPractising(false)}>← Back to the bracket</button>
            {myNextMatch && (
              <span className={liveMatch ? 'tp-practice-live' : 'tp-practice-wait'}>
                {liveMatch ? 'Your match is live — finish this round and go' : 'Waiting for your next match'}
              </span>
            )}
            {liveMatch && (
              <button className="tp-btn small gold" onClick={() => { setPractising(false); playMatch(liveMatch) }}>
                Join now
              </button>
            )}
          </div>
          <Practice embedded onExit={() => setPractising(false)} />
        </div>
      )}

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

      <div className="tp-bracket">
        {roundShape.map(({ round: r, ties }) => {
          const inRound = matches.filter(m => m.round === r)
          const blanks = Math.max(0, ties - inRound.length)
          return (
            <div className="tp-round" key={r}>
              <div className="tp-round-label">{bracketLabel(r, rounds.length)}</div>
              {inRound.map(m => {
                const ids = [m.side_a, m.side_b, m.side_c, m.side_d].filter(Boolean)
                const mine = ids.includes(mySide?.id)
                const over = m.status === 'done' || m.status === 'forfeit'
                return (
                  <div key={m.id} className={`tp-tie ${mine ? 'mine' : ''} ${over ? 'over' : ''}`}>
                    {ids.map(id => {
                      const won = m.winner_side === id
                      return (
                        <div key={id} className={`tp-tie-side ${won ? 'won' : over ? 'lost' : ''}`}>
                          <span className="tp-tie-name">
                            {sideName(id)}{id === mySide?.id ? ' (you)' : ''}
                          </span>
                          <span className="tp-tie-score">
                            {m.status === 'forfeit' ? (won ? 'W/O' : '—') : (m.wins?.[id] ?? 0)}
                          </span>
                        </div>
                      )
                    })}
                    <div className="tp-tie-state">
                      {m.status === 'done' ? 'final'
                        : m.status === 'forfeit' ? 'walkover — opponents never showed'
                        : m.status === 'playing' ? 'in progress'
                        : 'waiting for both sides'}
                    </div>
                    {mine && !over && (
                      <div className="tp-match-actions">
                        <Countdown until={m.no_show_at} />
                        <button className="tp-btn small gold" disabled={busy} onClick={() => playMatch(m)}>
                          {m.room_id ? 'Rejoin' : 'Play'}
                        </button>
                        {open.format === 'duo' && myMembers.filter(x => !x.bot_name).length < 2 && (
                          <button className="tp-btn small" onClick={() => setPicking(mySide.id)}>Partner didn’t show</button>
                        )}
                        {open.format === 'duo' && myMembers.filter(x => !x.bot_name).length === 2 && (
                          <button className="tp-btn small" disabled={busy} onClick={practiseWithPartner}>Practice with partner</button>
                        )}
                        <button className="tp-btn small" onClick={() => setPractising(true)}>Practice alone</button>
                        {/* Only when the opponents never turned up at all. Once the
                            table has been opened, the match is played, not awarded. */}
                        {!m.room_id && m.no_show_at && new Date(m.no_show_at) < new Date() && (
                          <button className="tp-btn small" disabled={busy} onClick={() => claimForfeit(m)}>Claim the walkover</button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {Array.from({ length: blanks }).map((_, i) => (
                <div className="tp-tie pending" key={`blank-${r}-${i}`}>
                  <div className="tp-tie-side"><span className="tp-tie-name">—</span></div>
                  <div className="tp-tie-side"><span className="tp-tie-name">—</span></div>
                  <div className="tp-tie-state">
                    {r === 1 ? 'not drawn yet' : `winners of ${bracketLabel(r - 1, rounds.length)}`}
                  </div>
                </div>
              ))}
            </div>
          )
        })}

        <div className="tp-round">
          <div className="tp-round-label">Winner</div>
          <div className={`tp-tie ${champion ? 'over champ' : 'pending'}`}>
            <div className={`tp-tie-side ${champion ? 'won' : ''}`}>
              <span className="tp-tie-name">{champion ? `🏆 ${champion.name}` : '—'}</span>
            </div>
            {!champion && <div className="tp-tie-state">still to be decided</div>}
          </div>
        </div>

        {false && champion && (
          <div className="tp-round">
            <div className="tp-round-label">Winner</div>
            <div className="tp-tie over champ">
              <div className="tp-tie-side won">
                <span className="tp-tie-name">🏆 {champion.name}</span>
              </div>
            </div>
          </div>
        )}
      </div>
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

// Quarter-final, semi-final, final — counted back from the last round.
function bracketLabel(round, total) {
  const fromEnd = total - round
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semi-final'
  if (fromEnd === 2) return 'Quarter-final'
  return `Round ${round}`
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
