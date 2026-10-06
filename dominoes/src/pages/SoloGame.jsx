import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import * as Engine from '../story/storyEngine'
import { chooseTile, getPersonality, isExpertBot } from '../lib/botAI'
import { canPlayOnSide } from '../hooks/useGameState'
import Board from '../components/Board'
import PlayerHand from '../components/PlayerHand'
import OpponentHands from '../components/OpponentHands'
import RoundOverlay from '../components/RoundOverlay'
import DekabessOverlay from '../components/DekabessOverlay'
import KnockAnimation, { knockKey } from '../components/KnockAnimation'
import ReshuffleOffer, { countDoubles } from '../components/ReshuffleOffer'
import './Game.css'

// ── Solo vs AI, on the device ────────────────────────────────────────────────
//
// One human and three bots don't need a database to talk through: there's
// nobody else to tell. This plays the whole match locally — instant moves, no
// network, nothing to throttle — and only reaches the database once per round
// to record your result.
//
// The rules are the live game's own. Playable tiles, sides and Dekabess come
// from useGameState; the round and match logic below mirrors endRound and
// startNextRound exactly:
//   • round 1 — whoever holds the 6-6 opens, and must play it
//   • later rounds — the previous round's winner opens, any tile
//   • a blocked round goes to the lowest pip count, ties to the lowest seat
//   • the same seat winning again extends the streak; a Dekabess counts double
//   • a streak of 4 is a Vyèj, and the match is over

// Same pace as the live game: bots think for 1.2s, and a knock plays out in
// full (1.5s) before anyone moves again — so you can see who passed, and on
// what, and follow the board.
const BOT_DELAY = 1200
const POS = { 1: 'right', 2: 'top', 3: 'left', 0: 'bottom' }
const baseName = n => String(n || '').replace(/\s+\d+$/, '')   // "Ti-Djo 2" -> "Ti-Djo"

// Same as computeNewStreak in useGameState, for a game with no partners.
function nextStreak(streak, winner, isDek) {
  if (streak.seat === winner) return { ...streak, count: streak.count + (isDek ? 2 : 1) }
  return { seat: winner, team: winner, count: isDek ? 2 : 1 }
}

export default function SoloGame() {
  const navigate = useNavigate()

  // The game is saved on the device as you play, so a refresh — or closing
  // the app and coming back — picks up exactly where you were. The lobby
  // clears this when you start a NEW solo game.
  const SAVE_KEY = 'solo_game'
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') } catch { return null }
  })()

  const setup = (() => {
    try { return JSON.parse(sessionStorage.getItem('solo_setup') || 'null') } catch { return null }
  })()
  const bots = setup?.bots?.length === 3 ? setup.bots
             : saved?.bots?.length === 3 ? saved.bots
             : ['Ti-Djo', 'Ti-Cam', 'Ti-Jean']
  const myName = setup?.nickname || saved?.nickname || 'You'

  const [round, setRound] = useState(saved?.round ?? 1)
  const [st, setSt] = useState(() => saved?.st || Engine.startGame({ seats: 4, forceDoubleSix: true }))
  const [streak, setStreak] = useState(saved?.streak || { seat: null, team: null, count: 0 })
  const [selected, setSelected] = useState(null)
  const [roundEnd, setRoundEnd] = useState(saved?.roundEnd || null)   // { winner, isDek, blocked, vyej }
  const [showDek, setShowDek] = useState(false)
  const botBusy = useRef(false)
  const [knock, setKnock] = useState(null)             // { name, position } while it plays
  const [passingSeats, setPassingSeats] = useState(() => new Set(saved?.passing || []))
  // start from the end of the saved log, so a refresh doesn't replay old knocks
  const seenLog = useRef(saved?.st?.log?.length || 0)
  // rounds already recorded to your stats — saved too, so a refresh right
  // after a round can't record it a second time
  const recorded = useRef(new Set(saved?.recorded || []))

  const names = [myName, ...bots]
  // ── Five doubles: reshuffle or play on ────────────────────────────────────
  // Open before the round's first tile, while you hold 5+ doubles and haven't
  // decided. (Solo is every-man-for-himself, so it always applies.)
  const myDoubles = countDoubles(st.hands?.[0])
  const offerOpen = st.status === 'playing' && !(st.board?.tiles?.length) && !(st.log || []).length
    && myDoubles >= 5 && !st.doublesDecided
  const reshuffle = () => setSt(prev => Engine.startGame(prev.forceDoubleSix
    ? { seats: 4, forceDoubleSix: true }          // a first round: the doubles rule picks the opener again
    : { seats: 4, starter: prev.turn }))           // a later round: the same winner still opens
  const playOn = () => setSt(prev => ({ ...prev, doublesDecided: true, fiveDoubles: true }))

  const isMyTurn = st.status === 'playing' && st.turn === 0 && !offerOpen

  // ── bots play ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (st.status !== 'playing' || st.turn === 0 || botBusy.current || knock || offerOpen) return
    botBusy.current = true
    const t = setTimeout(() => {
      setSt(prev => {
        if (prev.status !== 'playing' || prev.turn === 0) return prev
        // ONE action per turn. A bot that can't play knocks — once — and the
        // knock plays out before the next seat moves.
        if (!Engine.canPlay(prev)) return Engine.drawOrPass(prev)
        const next = prev
        const seat = next.turn
        const pers = getPersonality(baseName(bots[seat - 1]))
        const moves = Engine.legalMoves(next)
        if (!moves.length) return Engine.drawOrPass(next)
        const ctx = {
          seat,
          mode: 'chien',
          tileCountsBySeat: next.hands.map(h => h.length),
          opponentTileCounts: next.hands.map((h, i) => (i === seat ? null : h.length)).filter(x => x !== null),
        }
        if (isExpertBot(pers)) ctx.hands = next.hands
        const pick = chooseTile(pers, moves.map(m => m.tile), next.hands[seat], next.board, ctx)
        const mv = moves.find(m => m.tile[0] === pick?.tile?.[0] && m.tile[1] === pick?.tile?.[1] && m.side === pick.side)
                || moves.find(m => m.tile[0] === pick?.tile?.[0] && m.tile[1] === pick?.tile?.[1])
                || moves[0]
        return Engine.playTile(next, mv.tile, mv.side)
      })
      botBusy.current = false
    }, BOT_DELAY)
    return () => { clearTimeout(t); botBusy.current = false }
  }, [st, knock])

  // You can't play: you knock automatically — but you SEE it, the same knock
  // the live game shows, and the game waits for it before moving on.
  useEffect(() => {
    if (st.status !== 'playing' || st.turn !== 0 || knock || offerOpen) return
    if (Engine.canPlay(st)) return
    const t = setTimeout(() => setSt(p => (p.turn === 0 && !Engine.canPlay(p) ? Engine.drawOrPass(p) : p)), BOT_DELAY)
    return () => clearTimeout(t)
  }, [st, knock])

  // Watch the move log: every pass gets its knock, and a seat stops showing
  // PASS the moment it plays a tile again.
  useEffect(() => {
    const log = st.log || []
    if (log.length < seenLog.current) seenLog.current = 0      // new round
    const fresh = log.slice(seenLog.current)
    seenLog.current = log.length
    if (!fresh.length) return
    for (const e of fresh) {
      if (e.action === 'pass') {
        setPassingSeats(prev => new Set(prev).add(e.seat))
        setKnock({ name: names[e.seat], position: POS[e.seat] })
      } else if (e.action === 'play') {
        setPassingSeats(prev => {
          if (!prev.has(e.seat)) return prev
          const next = new Set(prev); next.delete(e.seat); return next
        })
      }
    }
  }, [st.log])

  // ── a round ended ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (st.status !== 'over' || roundEnd) return
    const winner = st.winner
    const isDek = !!st.dekabess
    const s2 = nextStreak(streak, winner, isDek)
    const vyej = s2.count >= 4
    setStreak(s2)
    setRoundEnd({ winner, isDek, blocked: !!st.blocked, vyej })
    if (isDek) setShowDek(true)

    // Trophies. A clean round: you won it without knocking once. A comeback:
    // you won the match after an opponent's streak had reached 3.
    const clean = winner === 0 && !(st.log || []).some(e => e.action === 'pass' && e.seat === 0)
    let down3 = false
    try { down3 = localStorage.getItem('dk-solo-down3') === '1' } catch { /* ignore */ }
    if (streak.seat !== null && streak.seat !== 0 && streak.count >= 3) down3 = true
    if (s2.seat !== null && s2.seat !== 0 && s2.count >= 3) down3 = true
    const comeback = vyej && winner === 0 && down3
    try {
      if (vyej) localStorage.removeItem('dk-solo-down3')          // match over either way
      else if (down3) localStorage.setItem('dk-solo-down3', '1')
    } catch { /* ignore */ }

    recordRound({ won: winner === 0, isDek: isDek && winner === 0, vyej: vyej && winner === 0, matchOver: vyej, clean, comeback,
      fiveDoubles: !!st.fiveDoubles, fiveDoublesWon: !!st.fiveDoubles && winner === 0 })
  }, [st.status])

  // One database call per round, and only for your own record.
  async function recordRound({ won, isDek, vyej, matchOver, clean = false, comeback = false, fiveDoubles = false, fiveDoublesWon = false }) {
    const key = `${round}`
    if (recorded.current.has(key)) return
    recorded.current.add(key)
    try {
      const { data } = await db.auth.getUser()
      const uid = data?.user?.id
      if (!uid) return                               // guests aren't recorded
      await db.rpc('record_round_stats', {
        p_results: [{ user_id: uid, won, vyej, dekabess: isDek, match_over: matchOver }],
      })
      if (clean) await db.rpc('record_feat', { p_kind: 'clean_round' })
      if (comeback) await db.rpc('record_feat', { p_kind: 'comeback' })
      if (fiveDoubles) await db.rpc('record_feat', { p_kind: 'five_doubles' })
      if (fiveDoublesWon) await db.rpc('record_feat', { p_kind: 'five_doubles_won' })
    } catch (e) {
      console.error('[solo] could not record the round (non-fatal):', e)
    }
  }

  const nextRound = useCallback(() => {
    if (!roundEnd) return
    const starter = roundEnd.winner
    setRound(r => r + 1)
    setRoundEnd(null)
    setShowDek(false)
    setSelected(null)
    setKnock(null)
    setPassingSeats(new Set())
    seenLog.current = 0
    setSt(Engine.startGame({ seats: 4, starter }))
  }, [roundEnd])

  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        bots, nickname: myName,
        round, st, streak, roundEnd,
        passing: [...passingSeats],
        recorded: [...recorded.current],
      }))
    } catch { /* storage full or unavailable — the game still plays */ }
  }, [st, round, streak, roundEnd, passingSeats])

  const newMatch = useCallback(() => {
    setRound(1)
    setStreak({ seat: null, team: null, count: 0 })
    setRoundEnd(null)
    setShowDek(false)
    setSelected(null)
    recorded.current = new Set()
    setKnock(null)
    setPassingSeats(new Set())
    seenLog.current = 0
    setSt(Engine.startGame({ seats: 4, forceDoubleSix: true }))
  }, [])

  const leave = () => {
    sessionStorage.removeItem('solo_setup')
    localStorage.removeItem(SAVE_KEY)
    navigate('/')
  }

  // ── placing tiles: same rules and tap behaviour as the live game ───────────
  function playMove(tile, side) {
    setSt(prev => {
      if (prev.status !== 'playing' || prev.turn !== 0) return prev
      let use = side
      if (prev.board.tiles.length) {
        const cL = canPlayOnSide(tile, 'left', prev.board)
        const cR = canPlayOnSide(tile, 'right', prev.board)
        if (use === 'first') use = cL ? 'left' : 'right'
        if (use === 'left' && !cL) use = cR ? 'right' : null
        else if (use === 'right' && !cR) use = cL ? 'left' : null
        if (!use) return prev
      } else {
        // the opening tile must be a legal opener (6-6 in round 1)
        const ok = Engine.legalMoves(prev, 0).some(m => m.tile[0] === tile[0] && m.tile[1] === tile[1])
        if (!ok) return prev
        use = 'first'
      }
      return Engine.playTile(prev, tile, use)
    })
    setSelected(null)
  }

  function selectTile(tile, idx) {
    if (!isMyTurn) return
    if (selected?.idx === idx) { setSelected(null); return }
    setSelected({ tile, idx })          // selecting never places a tile
  }

  // ── shapes the shared components expect ────────────────────────────────────
  const players = st.hands.map((h, seat) => ({
    seat, nickname: names[seat], hand: h, is_ai: seat !== 0,
  }))
  const roomLike = {
    status: roundEnd ? (roundEnd.vyej ? 'finished' : 'round_end') : 'playing',
    current_turn: roundEnd ? roundEnd.winner : st.turn,
    streak,
    pending_point: !!roundEnd?.isDek,
    blocked: !!roundEnd?.blocked,
    game_mode: 'chien',
    round,
  }
  const me = { seat: 0, nickname: myName }
  const moves = Engine.legalMoves(st, 0)
  const playable = moves.map(m => m.tile)
    .filter((t, i, arr) => arr.findIndex(x => x[0] === t[0] && x[1] === t[1]) === i)

  return (
    <div className="game-layout">
      <div className="top-bar">
        <div className="top-bar-left">
          <span className="game-title">Solo</span>
          <span className="room-code-badge">Round {round}</span>
        </div>
        <div className="player-tags">
          {players.map(p => (
            <div key={p.seat} className={[
              'player-tag',
              p.seat === roomLike.current_turn && !roundEnd ? 'active-turn' : '',
              p.seat === 0 ? 'is-me' : '',
            ].join(' ')}>
              <div className="tag-dot" />
              <span>{p.nickname}{p.seat === 0 ? ' ★' : ''}</span>
              <span className="tag-tiles">{p.hand.length}</span>
              {passingSeats.has(p.seat) && <span className="tag-pass">PASS</span>}
            </div>
          ))}
        </div>
        <button className="btn-leave" onClick={leave}>Leave</button>
      </div>

      <div className="board-container">
        <OpponentHands players={players} myInfo={me} roomData={roomLike} />
        <Board
          boardData={st.board}
          selectedTile={selected}
          isMyTurn={isMyTurn}
          onDropZone={side => { if (selected) playMove(selected.tile, side) }}
          onDragPlace={(tile, _idx, side) => {
            if (!isMyTurn) return
            if (side === 'first') { playMove(tile, 'first'); return }
            const cL = canPlayOnSide(tile, 'left', st.board)
            const cR = canPlayOnSide(tile, 'right', st.board)
            if (side === 'left' && cL) playMove(tile, 'left')
            else if (side === 'right' && cR) playMove(tile, 'right')
            else if (cL) playMove(tile, 'left')
            else if (cR) playMove(tile, 'right')
          }}
        />
      </div>

      <PlayerHand
        hand={st.hands[0]}
        isMyTurn={isMyTurn}
        playableTiles={playable}
        selectedIdx={selected?.idx ?? null}
        onSelect={selectTile}
        onPass={() => setSt(p => (p.turn === 0 ? Engine.drawOrPass(p) : p))}
        hasTilesOnBoard={st.board.tiles.length > 0}
      />

      {offerOpen && <ReshuffleOffer doubles={myDoubles} onReshuffle={reshuffle} onContinue={playOn} />}

      {knock && (
        <KnockAnimation
          key={knockKey(knock)}
          playerName={knock.name}
          position={knock.position}
          onDone={() => setKnock(null)}
        />
      )}

      {showDek && roundEnd && (
        <DekabessOverlay
          playerName={names[roundEnd.winner]}
          onDone={() => setShowDek(false)}
        />
      )}

      {roundEnd && !showDek && (
        <RoundOverlay
          roomData={roomLike}
          players={players}
          myInfo={me}
          canContinue
          onNextRound={nextRound}
          onPlayAgain={newMatch}
          onLeaveLobby={leave}
        />
      )}
    </div>
  )
}
