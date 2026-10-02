import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Engine from '../story/storyEngine'
import { chooseTile, getPersonality, isExpertBot } from '../lib/botAI'
import Board from '../components/Board'
import PlayerHand from '../components/PlayerHand'
import OpponentHands from '../components/OpponentHands'
import KnockAnimation from '../components/KnockAnimation'
import TileBack from '../components/TileBack'
import { canPlayOnSide } from '../hooks/useGameState'
import './Game.css'
import './StoryChallenge.css'

// ── Practice ─────────────────────────────────────────────────────────────────
// A throwaway game against bots, for killing time between tournament rounds.
// Runs on the device through the story engine — no room, no database, nothing
// to clean up afterwards. Leave whenever you like.

// Same pace as the live game: bots think for 1.2s, a knock plays out in full
// before anyone moves again, and drawing from the pile is quicker.
const BOT_DELAY = 1200
const DRAW_DELAY = 450

const TABLE = [
  { id: 'quick', label: '1v1 with a pile', seats: 2, pile: true,  opponents: ['Ti-Djo'] },
  { id: 'full',  label: 'Full table',      seats: 4, pile: false, opponents: ['Ti-Djo', 'Ti-Cam', 'Ti-Jean'] },
  { id: 'hard',  label: 'Against experts', seats: 4, pile: false, opponents: ['Ti-Jòj', 'Ti-Roro', 'Ti-Pyèj'] },
]

export default function Practice({ embedded = false, onExit }) {
  const navigate = useNavigate()

  // Saved on the device as you play, so a refresh picks up the same table,
  // the same hand and the same tally. Leaving clears it.
  const SAVE_KEY = 'practice_game'
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') } catch { return null }
  })()

  const leave = () => {
    try { localStorage.removeItem(SAVE_KEY) } catch { /* ignore */ }
    embedded && onExit ? onExit() : navigate(-1)
  }
  const [setup, setSetup] = useState(saved?.setup ?? null)
  const [st, setSt] = useState(saved?.st ?? null)
  // rounds already counted in the tally, by deal — so a refresh right after a
  // round can't count it twice
  const counted = useRef(new Set(saved?.counted || []))
  // restoring a round in play: skip the automatic first deal
  const resumeRound = useRef(!!saved?.st)
  const [selected, setSelected] = useState(null)
  const [pileOpen, setPileOpen] = useState(false)   // the pick-a-tile sheet
  // Open the pile by itself the moment you have nothing to play
  useEffect(() => {
    const must = !!st && st.status === 'playing' && st.turn === 0 &&
                 !!st.usePile && st.pile.length > 0 && !Engine.canPlay(st)
    if (must) setPileOpen(true)
    else setPileOpen(false)
  }, [st])
  const [tally, setTally] = useState(saved?.tally ?? { won: 0, lost: 0 })
  const busyRef = useRef(false)
  const [knock, setKnock] = useState(null)
  const [passingSeats, setPassingSeats] = useState(() => new Set(saved?.passing || []))
  const knockQueue = useRef([])
  // start from the end of a restored log, so a refresh doesn't replay knocks
  const seenLog = useRef(saved?.st?.log?.length || 0)

  const deal = useCallback((cfg) => {
    const fresh = Engine.settleTurn(Engine.startGame({ seats: cfg.seats, pile: cfg.pile, forceDoubleSix: true }))
    setSt({ ...fresh, dealId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` })
    setSelected(null)
  }, [])

  useEffect(() => {
    if (!setup) return
    // after a refresh the saved round is already on the table — don't deal over it
    if (resumeRound.current) { resumeRound.current = false; return }
    deal(setup)
  }, [setup, deal])

  // save as you play
  useEffect(() => {
    if (!setup) return
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        setup, st, tally,
        passing: [...passingSeats],
        counted: [...counted.current],
      }))
    } catch { /* storage full or unavailable — practice still plays */ }
  }, [setup, st, tally, passingSeats])

  // bots play
  useEffect(() => {
    if (!st || !setup || st.status !== 'playing' || st.turn === 0 || busyRef.current || knock) return
    busyRef.current = true
    const drawing = !Engine.canPlay(st) && st.usePile && st.pile.length > 0
    const t = setTimeout(() => {
      setSt(prev => {
        if (!prev || prev.status !== 'playing' || prev.turn === 0) return prev
        // ONE action per turn: draw one tile, or knock once, or play.
        if (!Engine.canPlay(prev)) return Engine.drawOrPass(prev)
        const next = prev
        const seat = next.turn
        const name = setup.seats === 2 ? setup.opponents[0] : setup.opponents[seat - 1]
        const pers = getPersonality(name || 'Ti-Djo')
        const moves = Engine.legalMoves(next)
        if (!moves.length) return next
        const ctx = {
          seat, mode: 'chien',
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
      busyRef.current = false
    }, drawing ? DRAW_DELAY : BOT_DELAY)
    return () => { clearTimeout(t); busyRef.current = false }
  }, [st, setup, knock])

  // You, with nothing to play and nothing to draw: you knock — and you SEE it.
  useEffect(() => {
    if (!st || st.status !== 'playing' || st.turn !== 0 || knock) return
    if (Engine.canPlay(st)) return
    if (st.usePile && st.pile.length > 0) return
    const t = setTimeout(() => setSt(p => (p && p.turn === 0 && !Engine.canPlay(p) ? Engine.drawOrPass(p) : p)), BOT_DELAY)
    return () => clearTimeout(t)
  }, [st, knock])

  const knockName = seat => (seat === 0 ? 'You'
    : (setup?.seats === 2 ? setup.opponents[0] : setup?.opponents?.[seat - 1]) || 'Player')
  const knockPos = seat => {
    if ((st?.seats ?? 4) === 2) return seat === 0 ? 'bottom' : 'top'
    return ({ 0: 'bottom', 1: 'right', 2: 'top', 3: 'left' })[seat]
  }

  // Watch the move log: every pass gets its knock, and a seat stops showing
  // PASS the moment it plays a tile again. A new deal starts clean.
  useEffect(() => {
    const log = st?.log || []
    if (log.length < seenLog.current) {           // a new deal
      seenLog.current = 0
      setPassingSeats(new Set())
    }
    const fresh = log.slice(seenLog.current)
    seenLog.current = log.length
    for (const e of fresh) {
      if (e.action === 'pass') {
        setPassingSeats(prev => new Set(prev).add(e.seat))
        const k = { name: knockName(e.seat), position: knockPos(e.seat) }
        setKnock(cur => { if (cur) { knockQueue.current.push(k); return cur } return k })
      } else if (e.action === 'play') {
        setPassingSeats(prev => {
          if (!prev.has(e.seat)) return prev
          const next = new Set(prev); next.delete(e.seat); return next
        })
      }
    }
  }, [st?.log])

  // round over — count it and deal again
  useEffect(() => {
    if (!st || st.status !== 'over' || !setup) return
    // a round already counted (you refreshed right after it) isn't counted again
    if (!st.dealId || !counted.current.has(st.dealId)) {
      if (st.dealId) counted.current.add(st.dealId)
      // a Dekabess counts as two, as everywhere else in the game
      const worth = st.dekabess ? 2 : 1
      setTally(t => (st.winner === 0 ? { ...t, won: t.won + worth } : { ...t, lost: t.lost + worth }))
    }
    const t = setTimeout(() => deal(setup), 2000)
    return () => clearTimeout(t)
  }, [st?.status])

  // Place a tile, checking the side against the board first — the same guard
  // the live game applies.
  function playMove(tile, side) {
    setSt(prev => {
      if (!prev || prev.status !== 'playing' || prev.turn !== 0) return prev
      let use = side
      if (prev.board?.tiles?.length) {
        const cL = canPlayOnSide(tile, 'left', prev.board)
        const cR = canPlayOnSide(tile, 'right', prev.board)
        if (use === 'first') use = cL ? 'left' : 'right'
        if (use === 'left' && !cL) use = cR ? 'right' : null
        else if (use === 'right' && !cR) use = cL ? 'left' : null
        if (!use) return prev
      } else {
        // the opening tile has to be one the rules allow (the required double)
        const ok = Engine.legalMoves(prev, 0).some(m => m.tile[0] === tile[0] && m.tile[1] === tile[1])
        if (!ok) return prev
        use = 'first'
      }
      return Engine.playTile(prev, tile, use)
    })
    setSelected(null)
  }

  // Same tap behaviour as a normal game — select only, never place.
  function selectTile(tile, idx) {
    if (!isMyTurn) return
    if (selected?.idx === idx) { setSelected(null); return }
    setSelected({ tile, idx })
    // Selecting never places a tile, even on an empty board.
  }

  if (!setup) {
    return (
      <div className="sc-empty">
        <p>Practice while you wait. Nothing here counts — no stats, no record.</p>
        <div className="sc-picks">
          {TABLE.map(o => (
            <button key={o.id} className="sc-btn" onClick={() => setSetup(o)}>{o.label}</button>
          ))}
        </div>
        <button className="sc-btn ghost" onClick={leave}>Back</button>
      </div>
    )
  }

  const moves = st ? Engine.legalMoves(st, 0) : []
  const playable = moves.map(m => m.tile).filter((t, i, arr) => arr.findIndex(x => x[0] === t[0] && x[1] === t[1]) === i)
  const isMyTurn = !!st && st.status === 'playing' && st.turn === 0
  // you may only draw when you have nothing to play
  const mustDraw = isMyTurn && !!st?.usePile && st.pile.length > 0 && !Engine.canPlay(st)

  const seatNames = [0, 1, 2, 3].map(seat =>
    seat === 0 ? 'You' : (setup.seats === 2 ? setup.opponents[0] : setup.opponents[seat - 1]))
  // 1v1: the lone opponent sits ACROSS from you, not to your right.
  const twoSeat = (st?.seats ?? 4) === 2
  const shown = seat => (twoSeat && seat === 1 ? 2 : seat)
  const fakePlayers = (st?.hands || []).map((h, seat) => ({
    seat: shown(seat), engineSeat: seat, nickname: seatNames[seat], hand: h, is_ai: seat !== 0,
  }))
  const fakeRoom = { current_turn: shown(st?.turn ?? 0), game_mode: 'chien', status: 'playing' }

  return (
    <div className="game-layout">
      <div className="top-bar">
        <div className="top-bar-left">
          <button className="sc-back" onClick={leave}>← Back</button>
          <span className="sc-chapter">Practice</span>
        </div>
        <div className="player-tags">
          {fakePlayers.map(p => (
            <div key={p.seat} className={[
              'player-tag',
              p.seat === fakeRoom.current_turn ? 'active-turn' : '',
              p.seat === 0 ? 'is-me' : '',
            ].join(' ')}>
              <div className="tag-dot" />
              <span>{p.nickname}{p.seat === 0 ? ' ★' : ''}</span>
              <span className="tag-tiles">{p.hand.length}</span>
              {passingSeats.has(p.engineSeat) && <span className="tag-pass">PASS</span>}
            </div>
          ))}
        </div>
        {st?.usePile && <span className="sc-pile">Pile {st.pile.length}</span>}
        <span className="sc-score">{tally.won} — {tally.lost}</span>
      </div>

      <div className="board-container">
        {st?.usePile && st.pile.length > 0 && (
          <>
            {/* Compact in the corner, so it never covers the chain on a narrow
                phone. When you have to draw, tap it (or it opens itself) and
                every tile is laid out to pick from. */}
            <button
              className={`pile-stack ${mustDraw ? 'active' : ''}`}
              disabled={!mustDraw}
              onClick={() => setPileOpen(true)}
              title={mustDraw ? 'Draw from the pile' : 'Draw pile'}
            >
              <span className="pile-mini" aria-hidden="true">
                <span><TileBack /></span><span><TileBack /></span><span><TileBack /></span>
              </span>
              <span className="pile-count">{st.pile.length}</span>
              <span className="pile-label">{mustDraw ? 'tap to draw' : 'pile'}</span>
            </button>

            {pileOpen && mustDraw && (
              <div className="pile-sheet-overlay" onClick={() => setPileOpen(false)}>
                <div className="pile-sheet" onClick={e => e.stopPropagation()}>
                  <div className="pile-sheet-title">Nothing to play — pick a tile from the pile</div>
                  <div className="pile-grid">
                    {st.pile.map((_, i) => (
                      <button
                        key={i}
                        className="pile-tile"
                        onClick={() => {
                          setSt(prev => (prev && prev.turn === 0 ? Engine.drawFrom(prev, i) : prev))
                          setPileOpen(false)
                        }}
                        title="Take this one"
                      ><TileBack /></button>
                    ))}
                  </div>
                  <button className="pile-sheet-close" onClick={() => setPileOpen(false)}>Look at the board first</button>
                </div>
              </div>
            )}
          </>
        )}
        <OpponentHands players={fakePlayers} myInfo={{ seat: 0 }} roomData={fakeRoom} />
        <Board
          boardData={st?.board}
          selectedTile={selected}
          isMyTurn={isMyTurn}
          onDropZone={side => { if (selected) playMove(selected.tile, side) }}
          onDragPlace={(tile, _idx, side) => {
            if (!isMyTurn) return
            if (side === 'first') { playMove(tile, 'first'); return }
            const cL = canPlayOnSide(tile, 'left', st?.board)
            const cR = canPlayOnSide(tile, 'right', st?.board)
            if (side === 'left' && cL) playMove(tile, 'left')
            else if (side === 'right' && cR) playMove(tile, 'right')
            else if (cL) playMove(tile, 'left')
            else if (cR) playMove(tile, 'right')
          }}
        />
      </div>

      {knock && (
        <KnockAnimation
          playerName={knock.name}
          position={knock.position}
          onDone={() => setKnock(knockQueue.current.shift() || null)}
        />
      )}

      <PlayerHand
        hand={st?.hands?.[0] || []}
        isMyTurn={isMyTurn}
        playableTiles={playable}
        selectedIdx={selected?.idx ?? null}
        onSelect={selectTile}
        onPass={() => setSt(p => (p && p.turn === 0 ? Engine.drawOrPass(p) : p))}
        hasTilesOnBoard={!!st?.board?.tiles?.length}
      />
    </div>
  )
}
