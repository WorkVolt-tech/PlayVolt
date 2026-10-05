import { useState, useEffect, useRef, useCallback } from 'react'
import { db } from '../lib/supabase'
import { NORMAL_CIRCUIT, EXPERT_CIRCUIT } from '../story/chapters'
import { getEquipped, setRoomSkins, useOwnedSkins, TILE_SKINS, TABLE_SKINS, TILE_UNLOCKS, TABLE_UNLOCKS } from '../lib/skins'
import { useNavigate } from 'react-router-dom'
import { useGameState } from '../hooks/useGameState'
import { canPlayOnSide } from '../hooks/useGameState'
import Board from '../components/Board'
import PlayerHand from '../components/PlayerHand'
import RoundOverlay from '../components/RoundOverlay'
import DekabessOverlay from '../components/DekabessOverlay'
import KnockAnimation from '../components/KnockAnimation'
import OpponentHands from '../components/OpponentHands'
import './Game.css'

export default function Game() {
  // A tournament match, or a practice room started from one: the way out is
  // back to the bracket, not the lobby.
  const fromTournament = (() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('domino_player') || 'null')
      return !!(saved?.tournamentMatchId || saved?.fromTournament)
    } catch { return false }
  })()
  const navigate = useNavigate()
  const myInfo   = JSON.parse(sessionStorage.getItem('domino_player') || 'null')

  const [passingSeats, setPassingSeats] = useState(new Set())
  const [showDekabess, setShowDekabess] = useState(false)
  const [dekabessPlayer, setDekabessPlayer] = useState('')
  const [knockPlayer, setKnockPlayer] = useState(null)

  const {
    roomData, players, boardData, selectedTile, showPicker,
    showOverlay, toast, isProcessing,
    hand, isMyTurn, playable, hasTilesOnBoard, replaceWithBot,
    awaySeats, standIn, turnStart, turnLimitMs, deciderSeat,
    selectTile, placeTile, passMove, cancelSelection,
    startNextRound, leaveTable, setShowOverlay,
  } = useGameState(myInfo, navigate)

  // Show Dekabess celebration — only once per round
  const dekabessShownRef = useRef(false)
  useEffect(() => {
    if (!roomData || !showOverlay) return
    if (roomData.pending_point && !dekabessShownRef.current) {
      dekabessShownRef.current = true
      const winner = players.find(p => p.seat === roomData.current_turn)
      setDekabessPlayer(winner?.nickname || '?')
      setShowDekabess(true)
    }
    if (!roomData.pending_point) {
      dekabessShownRef.current = false
    }
  }, [showOverlay, roomData?.pending_point])

  // Knocks come from the move log itself. Every play and every pass writes a
  // game_event saying exactly who did what, and those arrive in the order
  // they happened. (An earlier version guessed a knock from "the turn moved
  // but the board didn't grow" — but the turn and the new tile arrive
  // separately, so it announced knocks after real moves and missed real
  // knocks. Never guess this again.)
  // ── Practising with your partner during a tournament ────────────────────
  // This room is a warm-up. Keep an eye on the real bracket, and the moment
  // your team's match is ready or live, say so — with a way straight in —
  // so a match can't be lost as a walkover while you're practising.
  const practiceFor = (myInfo?.fromTournament && myInfo?.sideId && !myInfo?.tournamentMatchId)
    ? { tournamentId: myInfo.tournamentId, sideId: myInfo.sideId } : null
  const [realMatch, setRealMatch] = useState(null)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    if (!practiceFor?.tournamentId) return
    let off = false
    const check = async () => {
      const { data } = await db.from('tournament_matches')
        .select('*').eq('tournament_id', practiceFor.tournamentId)
      if (off) return
      const mine = (data || []).find(m =>
        m.status !== 'done' && m.status !== 'forfeit' &&
        [m.side_a, m.side_b, m.side_c, m.side_d].includes(practiceFor.sideId))
      setRealMatch(mine || null)
    }
    check()
    const ch = db.channel('practice-watch-' + practiceFor.sideId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tournament_matches', filter: `tournament_id=eq.${practiceFor.tournamentId}` },
        () => check())
      .subscribe()
    const t = setInterval(() => { if (document.visibilityState === 'visible') check() }, 30000)
    return () => { off = true; clearInterval(t); db.removeChannel(ch) }
  }, [practiceFor?.tournamentId, practiceFor?.sideId])

  // Straight into the real match: open (or rejoin) its table and take your seat.
  async function joinRealMatch() {
    if (!realMatch || joining) return
    setJoining(true)
    const { data, error } = await db.rpc('start_tournament_match', { p_match: realMatch.id })
    const room = Array.isArray(data) ? data[0] : data
    if (error || !room?.id) { setJoining(false); navigate('/tournament'); return }
    const { data: auth } = await db.auth.getUser()
    const { data: seats } = await db.from('domino_players')
      .select('seat, nickname, is_ai, user_id').eq('room_id', room.id)
    const mine = (seats || []).find(r => !r.is_ai && r.user_id === auth?.user?.id)
    if (!mine) { setJoining(false); navigate('/tournament'); return }
    sessionStorage.setItem('domino_player', JSON.stringify({
      seat: mine.seat,
      nickname: mine.nickname,
      roomId: room.id,
      roomCode: room.code,
      gameMode: room.game_mode || 'asosye',
      tournamentMatchId: realMatch.id,
      fromTournament: true,
    }))
    // a full load, so the game screen starts cleanly on the new table
    window.location.assign('/game')
  }

  // ── Choosing a replacement bot ────────────────────────────────────────────
  // Every regular, plus any expert this player has unlocked in Story Mode.
  const [myExperts, setMyExperts] = useState([])
  useEffect(() => {
    let off = false
    db.auth.getUser().then(({ data }) => {
      if (!data?.user) return
      db.rpc('ensure_story_progress').then(({ data: row }) => {
        const r = Array.isArray(row) ? row[0] : row
        if (!off) setMyExperts((r?.unlocked_bots || []).filter(b => EXPERT_CIRCUIT.includes(b)))
      })
    })
    return () => { off = true }
  }, [])
  const [pick, setPick] = useState({})     // seat -> chosen bot

  // ── Skins at the table ────────────────────────────────────────────────────
  // Everyone sees the HOST's table and tile faces; each player's hand shows
  // the backs in THEIR OWN skin. Each device records its own player's skin
  // when the game opens; the host's device (seat 0) records the table's.
  useEffect(() => {
    if (!myInfo?.roomId) return
    const eq = getEquipped()
    db.from('domino_players').update({ tile_skin: eq.tile })
      .eq('room_id', myInfo.roomId).eq('seat', myInfo.seat).then(() => {})
    if (myInfo.seat === 0) {
      db.from('domino_rooms').update({ tile_skin: eq.tile, table_skin: eq.table })
        .eq('id', myInfo.roomId).then(() => {})
    }
  }, [myInfo?.roomId, myInfo?.seat])

  // show the host's look while seated here; back to your own when you leave
  useEffect(() => {
    setRoomSkins({ tile: roomData?.tile_skin, table: roomData?.table_skin })
  }, [roomData?.tile_skin, roomData?.table_skin])
  useEffect(() => () => setRoomSkins(null), [])

  // The incentive: if the host's table or tiles are ones you haven't earned,
  // say what unlocks them.
  const owned = useOwnedSkins()
  const unlockHints = []
  if (roomData?.table_skin && TABLE_SKINS[roomData.table_skin] && !owned.tables.has(roomData.table_skin)) {
    const u = TABLE_UNLOCKS.find(x => x.id === roomData.table_skin)
    if (u?.need) unlockHints.push(`${TABLE_SKINS[roomData.table_skin].label} table — ${u.need}`)
  }
  if (roomData?.tile_skin && TILE_SKINS[roomData.tile_skin] && !owned.tiles.has(roomData.tile_skin)) {
    const u = TILE_UNLOCKS.find(x => x.id === roomData.tile_skin)
    if (u?.need) unlockHints.push(`${TILE_SKINS[roomData.tile_skin].label} tiles — ${u.need}`)
  }

  // ── Trophies: clean rounds and comebacks ──────────────────────────────────
  // Each device records only its own player's feats, once each.
  useEffect(() => {
    if (!roomData || !myInfo?.roomId) return
    const mySeat = myInfo.seat
    const team = seat => (roomData.game_mode === 'asosye' ? seat % 2 : seat)
    const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }
    const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore */ } }

    // the other side reached a streak of 3: you're "down 0–3" this match
    const s = roomData.streak
    if (s && Number.isInteger(s.seat) && team(s.seat) !== team(mySeat) && s.count >= 3) {
      write('dk-down3', { room: myInfo.roomId })
    }

    const st = roomData.status
    if (st !== 'round_end' && st !== 'finished') return
    const me = players.find(p => p.seat === mySeat)
    if (!me || me.is_ai) return                     // a stand-in played it, not you
    const round = roomData.round
    const winner = roomData.current_turn
    const done = read('dk-feats-done') || {}
    const tag = `${myInfo.roomId}-${round}`

    // a clean round: I won it, and never knocked during it
    const knocked = read('dk-knocked')
    if (winner === mySeat && !(knocked && knocked.room === myInfo.roomId && knocked.round === round) && done.clean !== tag) {
      write('dk-feats-done', { ...read('dk-feats-done'), clean: tag })
      db.rpc('record_feat', { p_kind: 'clean_round' }).then(() => {})
    }

    // a comeback: my side won the match after being down 0–3
    if (st === 'finished') {
      const down = read('dk-down3')
      if (down && down.room === myInfo.roomId && team(winner) === team(mySeat) && done.comeback !== tag) {
        write('dk-feats-done', { ...read('dk-feats-done'), comeback: tag })
        db.rpc('record_feat', { p_kind: 'comeback' }).then(() => {})
      }
      write('dk-down3', null)                       // the match is over either way
    }
  }, [roomData?.status, roomData?.round, roomData?.streak?.count, roomData?.streak?.seat])

  // ── Turn clock display ────────────────────────────────────────────────────
  const [clockNow, setClockNow] = useState(() => Date.now())
  useEffect(() => {
    if (roomData?.status !== 'playing') return
    const t = setInterval(() => setClockNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [roomData?.status])
  const secondsLeft = (turnStart && turnLimitMs && roomData?.status === 'playing')
    ? Math.max(0, Math.ceil((turnStart + turnLimitMs - clockNow) / 1000))
    : null
  const clockText = secondsLeft === null ? '' : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`

  const knockQueue = useRef([])
  const playersForKnock = useRef(players)
  useEffect(() => { playersForKnock.current = players }, [players])

  const showNextKnock = useCallback(() => {
    const next = knockQueue.current.shift()
    setKnockPlayer(next || null)
  }, [])

  // the round in play, for the knock handler (which outlives renders)
  const roundRef = useRef(roomData?.round)
  roundRef.current = roomData?.round

  useEffect(() => {
    if (!myInfo?.roomId) return
    const ch = db.channel('knocks-' + myInfo.roomId)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'game_events', filter: `room_id=eq.${myInfo.roomId}` },
        payload => {
          const e = payload.new
          if (!e || !Number.isInteger(e.player_seat)) return
          if (e.action === 'pass') {
            // Trophies: remember that I knocked this round (a clean round is
            // one I win without knocking — including a knock made for me
            // when my turn ran out).
            if (e.player_seat === myInfo.seat) {
              try { localStorage.setItem('dk-knocked', JSON.stringify({ room: myInfo.roomId, round: roundRef.current })) } catch { /* ignore */ }
            }
            setPassingSeats(prev => new Set(prev).add(e.player_seat))
            const p = playersForKnock.current.find(pl => pl.seat === e.player_seat)
            const mySeat = myInfo?.seat ?? 0
            const diff = ((e.player_seat - mySeat) + 4) % 4
            const posMap = { 0: 'bottom', 1: 'right', 2: 'top', 3: 'left' }
            const knock = { name: p?.nickname || 'Player', position: posMap[diff] }
            // several knocks in a row each get shown, one after another
            setKnockPlayer(cur => {
              if (cur) { knockQueue.current.push(knock); return cur }
              return knock
            })
          } else if (e.action === 'place') {
            setPassingSeats(prev => {
              if (!prev.has(e.player_seat)) return prev
              const next = new Set(prev); next.delete(e.player_seat); return next
            })
          }
        })
      .subscribe()
    return () => { db.removeChannel(ch) }
  }, [myInfo?.roomId, myInfo?.seat])

  // a new round starts clean
  useEffect(() => {
    setPassingSeats(new Set())
    knockQueue.current = []
  }, [roomData?.round])

  if (!myInfo || !roomData) return <div className="loading">Loading…</div>

  return (
    <div className="game-layout">
      {/* Top bar */}
      {realMatch && (
        <div className="practice-live">
          <div>
            <strong>{realMatch.room_id ? 'Your match is live' : 'Your match is ready'}</strong>
            <span>This is practice — your real tournament match is waiting.</span>
          </div>
          <button className="btn btn-primary" disabled={joining} onClick={joinRealMatch}>
            {joining ? 'Joining…' : 'Join now'}
          </button>
        </div>
      )}

      {(() => {
        if (!roomData || (roomData.status !== 'playing' && roomData.status !== 'round_end')) return null
        // Seats that need a decision: players who dropped out, and players who left.
        const dropped = (awaySeats || [])
          .map(seat => players.find(pl => pl.seat === seat))
          .filter(p => p && !p.stand_in)
        const left = players.filter(p => p.stand_in && p.left_at)
        if (!dropped.length && !left.length) return null
        const inUse = players.map(p => p.nickname)
        const choices = [...NORMAL_CIRCUIT, ...myExperts].filter(b => !inUse.includes(b))
        const nameOf = seat => players.find(pl => pl.seat === seat)?.nickname || 'someone'
        const isTeam = roomData.game_mode === 'asosye'
        return (
          <div className="away-notice">
            {dropped.map(p => {
              const d = deciderSeat(p.seat)
              return (
                <div key={'d' + p.seat} className="away-row">
                  <span><strong>{p.nickname}</strong> has dropped out.</span>
                  {d === myInfo.seat
                    ? <button className="btn btn-primary" onClick={() => standIn(p.seat)}>Let a bot play for them</button>
                    : <em className="away-wait">{isTeam ? 'their partner' : 'the host'} ({nameOf(d)}) decides</em>}
                </div>
              )
            })}
            {left.map(p => {
              const d = deciderSeat(p.seat)
              const chosen = pick[p.seat] || choices[0] || 'Ti-Djo'
              return (
                <div key={'l' + p.seat} className="away-row">
                  <span><strong>{p.nickname}</strong> left the table.</span>
                  {d === myInfo.seat ? (
                    <span className="away-replace">
                      <select value={chosen} onChange={e => setPick(prev => ({ ...prev, [p.seat]: e.target.value }))}>
                        {choices.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <button className="btn btn-primary" onClick={() => replaceWithBot(p.seat, chosen)}>Replace</button>
                    </span>
                  ) : (
                    <em className="away-wait">{isTeam ? 'their partner' : 'the host'} ({nameOf(d)}) chooses a replacement</em>
                  )}
                </div>
              )
            })}
            <div className="away-hint">
              A bot keeps their seat moving meanwhile. Until they're replaced, they can still come back with the room code.
            </div>
          </div>
        )
      })()}

      <div className="top-bar">
        <div className="top-bar-left">
          <span className="game-title">Dekabess!</span>
          <span className="room-code-badge">{myInfo.roomCode || '——'}</span>
        </div>
        <div className="player-tags">
          {players.map(p => (
            <div key={p.seat} className={[
              'player-tag',
              p.seat === roomData.current_turn ? 'active-turn' : '',
              p.seat === myInfo.seat ? 'is-me' : '',
            ].join(' ')}>
              <div className="tag-dot" />
              <span>{p.nickname}{p.seat === myInfo.seat ? ' ★' : ''}</span>
              {p.stand_in && p.left_at && <span className="tag-away">left</span>}
              {p.stand_in && <span className="tag-standin" title="A bot is playing until they're back">🤖 bot playing</span>}
              {!p.stand_in && (awaySeats || []).includes(p.seat) && <span className="tag-away">away</span>}
              {passingSeats.has(p.seat) && <span className="tag-pass">PASS</span>}
              <span className="tag-tiles">{Array.isArray(p.hand) ? p.hand.length : 0}</span>
              {p.seat === roomData.current_turn && !p.is_ai && secondsLeft !== null && (
                <span className={`tag-clock ${secondsLeft <= 15 ? 'urgent' : ''}`}>{clockText}</span>
              )}
            </div>
          ))}
        </div>
        <button className="btn-leave" onClick={leaveTable}>Leave</button>
      </div>

      <div className="board-container">
        {unlockHints.length > 0 && (
          <div className="unlock-hint" title="The host's skins — earn them by playing">
            {unlockHints.map(h => <div key={h}>🔒 {h}</div>)}
          </div>
        )}
        <OpponentHands
          players={players}
          myInfo={myInfo}
          roomData={roomData}
          turnClock={roomData?.status === 'playing' && turnStart ? { start: turnStart, limit: turnLimitMs } : null}
        />
        <Board
          boardData={boardData}
        selectedTile={selectedTile}
        isMyTurn={isMyTurn}
        onDropZone={side => {
          // You tapped a side: play the selected tile there. (This used to
          // call selectTile again when the tile fitted both ends — which
          // DESELECTED it instead of placing it.)
          if (!selectedTile) return
          const cL = canPlayOnSide(selectedTile.tile, 'left', boardData)
          const cR = canPlayOnSide(selectedTile.tile, 'right', boardData)
          const use = side === 'left' ? (cL ? 'left' : cR ? 'right' : null)
                                      : (cR ? 'right' : cL ? 'left' : null)
          if (use) placeTile(selectedTile.tile, selectedTile.idx, use)
        }}
        onDragPlace={(tile, idx, side) => {
          if (!isMyTurn) return
          if (side === 'first') { placeTile(tile, idx, 'first'); return }
          const cL = canPlayOnSide(tile, 'left', boardData)
          const cR = canPlayOnSide(tile, 'right', boardData)
          if (side === 'left' && cL) placeTile(tile, idx, 'left')
          else if (side === 'right' && cR) placeTile(tile, idx, 'right')
          else if (cL && cR) { placeTile(tile, idx, 'left') }
          else if (cL) placeTile(tile, idx, 'left')
          else if (cR) placeTile(tile, idx, 'right')
        }}
        />
      </div>

      {/* Side picker */}
      {showPicker && (
        <div className="side-picker">
          <button className="side-btn" onClick={() => { placeTile(selectedTile.tile, selectedTile.idx, 'left') }}>← Left</button>
          <button className="side-btn" onClick={() => { placeTile(selectedTile.tile, selectedTile.idx, 'right') }}>Right →</button>
          <button className="side-btn side-btn-cancel" onClick={cancelSelection}>Cancel</button>
        </div>
      )}

      {/* Hand */}
      <PlayerHand
        hand={hand}
        isMyTurn={isMyTurn}
        playableTiles={playable}
        selectedIdx={selectedTile?.idx}
        onSelect={selectTile}
        onPass={passMove}
        hasTilesOnBoard={hasTilesOnBoard}
      />

      {/* Toast */}
      {toast && <div className="turn-toast">{toast}</div>}

      {isMyTurn && secondsLeft !== null && (
        <div className={`my-clock ${secondsLeft <= 15 ? 'urgent' : ''}`}>
          Your turn · {clockText}
          {secondsLeft <= 15 && <span> — play, or the game plays for you</span>}
        </div>
      )}

      {/* Knock animation */}
      {knockPlayer && (
        <KnockAnimation
          playerName={knockPlayer.name}
          position={knockPlayer.position}
          onDone={showNextKnock}
        />
      )}

      {/* Dekabess celebration */}
      {showDekabess && (
        <DekabessOverlay
          playerName={dekabessPlayer}
          onDone={() => setShowDekabess(false)}
        />
      )}

      {/* Round/Match overlay */}
      {showOverlay && !showDekabess && roomData && (
        <RoundOverlay
          roomData={roomData}
          players={players}
          myInfo={myInfo}
          onNextRound={startNextRound}
          leaveLabel={fromTournament ? 'Back to the tournament' : undefined}
          onLeaveLobby={() => {
            sessionStorage.removeItem('domino_player')
            navigate(fromTournament ? '/tournament' : '/')
          }}
        />
      )}
    </div>
  )
}
