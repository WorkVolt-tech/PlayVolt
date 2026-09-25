import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Engine from '../story/storyEngine'
import { chooseTile, getPersonality, seesAllHands } from '../lib/botAI'
import Board from '../components/Board'
import PlayerHand from '../components/PlayerHand'
import './Game.css'
import './StoryChallenge.css'

// ── Practice ─────────────────────────────────────────────────────────────────
// A throwaway game against bots, for killing time between tournament rounds.
// Runs on the device through the story engine — no room, no database, nothing
// to clean up afterwards. Leave whenever you like.

const BOT_DELAY = 700

const TABLE = [
  { id: 'quick', label: '1v1 with a pile', seats: 2, pile: true,  opponents: ['Ti-Djo'] },
  { id: 'full',  label: 'Full table',      seats: 4, pile: false, opponents: ['Ti-Djo', 'Ti-Cam', 'Ti-Jean'] },
  { id: 'hard',  label: 'Against experts', seats: 4, pile: false, opponents: ['Ti-Jòj', 'Ti-Roro', 'Ti-Pyèj'] },
]

export default function Practice() {
  const navigate = useNavigate()
  const [setup, setSetup] = useState(null)
  const [st, setSt] = useState(null)
  const [selected, setSelected] = useState(null)
  const [tally, setTally] = useState({ won: 0, lost: 0 })
  const busyRef = useRef(false)

  const deal = useCallback((cfg) => {
    setSt(Engine.settleTurn(Engine.startGame({ seats: cfg.seats, pile: cfg.pile })))
    setSelected(null)
  }, [])

  useEffect(() => { if (setup) deal(setup) }, [setup, deal])

  // bots play
  useEffect(() => {
    if (!st || !setup || st.status !== 'playing' || st.turn === 0 || busyRef.current) return
    busyRef.current = true
    const t = setTimeout(() => {
      setSt(prev => {
        if (!prev || prev.status !== 'playing' || prev.turn === 0) return prev
        let next = Engine.settleTurn(prev)
        if (next.status !== 'playing' || next.turn === 0) return next
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
        if (seesAllHands(pers)) ctx.hands = next.hands
        const pick = chooseTile(pers, moves.map(m => m.tile), next.hands[seat], next.board, ctx)
        const mv = moves.find(m => m.tile[0] === pick?.tile?.[0] && m.tile[1] === pick?.tile?.[1] && m.side === pick.side)
                || moves.find(m => m.tile[0] === pick?.tile?.[0] && m.tile[1] === pick?.tile?.[1])
                || moves[0]
        return Engine.playTile(next, mv.tile, mv.side)
      })
      busyRef.current = false
    }, BOT_DELAY)
    return () => { clearTimeout(t); busyRef.current = false }
  }, [st, setup])

  // you can't play: draw from the pile if there is one
  useEffect(() => {
    if (!st || st.status !== 'playing' || st.turn !== 0) return
    if (Engine.canPlay(st)) return
    if (st.usePile && st.pile.length) {
      const t = setTimeout(() => setSt(p => (p && p.turn === 0 ? Engine.drawOrPass(p) : p)), 400)
      return () => clearTimeout(t)
    }
  }, [st])

  // round over — count it and deal again
  useEffect(() => {
    if (!st || st.status !== 'over' || !setup) return
    setTally(t => (st.winner === 0 ? { ...t, won: t.won + 1 } : { ...t, lost: t.lost + 1 }))
    const t = setTimeout(() => deal(setup), 2000)
    return () => clearTimeout(t)
  }, [st?.status])

  function playMove(tile, side) {
    setSt(prev => (prev && prev.status === 'playing' && prev.turn === 0 ? Engine.playTile(prev, tile, side) : prev))
    setSelected(null)
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
        <button className="sc-btn ghost" onClick={() => navigate(-1)}>Back</button>
      </div>
    )
  }

  const moves = st ? Engine.legalMoves(st, 0) : []
  const playable = moves.map(m => m.tile).filter((t, i, arr) => arr.findIndex(x => x[0] === t[0] && x[1] === t[1]) === i)
  const isMyTurn = !!st && st.status === 'playing' && st.turn === 0

  return (
    <div className="game-layout">
      <div className="top-bar">
        <button className="sc-back" onClick={() => navigate(-1)}>← Back</button>
        <div className="sc-head">
          <span className="sc-chapter">Practice · {setup.label}</span>
          <span className="sc-progress">won {tally.won} — lost {tally.lost}</span>
        </div>
        {st?.usePile && <span className="sc-pile">Pile {st.pile.length}</span>}
        {st?.status === 'over' && (
          <span className="sc-score">{st.winner === 0 ? 'You won' : 'You lost'} — dealing…</span>
        )}
      </div>

      <Board
        boardData={st?.board}
        selectedTile={selected}
        isMyTurn={isMyTurn}
        onDropZone={(side) => selected && playMove(selected.tile, side)}
        onDragPlace={(tile, _idx, side) => playMove(tile, side)}
      />

      <PlayerHand
        hand={st?.hands?.[0] || []}
        isMyTurn={isMyTurn}
        playableTiles={playable}
        selectedIdx={selected?.idx ?? null}
        onSelect={(tile, idx) => setSelected({ tile, idx })}
        onPass={() => setSt(p => (p && p.turn === 0 ? Engine.drawOrPass(p) : p))}
        hasTilesOnBoard={!!st?.board?.tiles?.length}
      />
    </div>
  )
}
