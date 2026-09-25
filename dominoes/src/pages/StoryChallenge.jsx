import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { CHAPTERS } from '../story/chapters'
import * as Engine from '../story/storyEngine'
import { chooseTile, getPersonality, seesAllHands } from '../lib/botAI'
import Board from '../components/Board'
import PlayerHand from '../components/PlayerHand'
import '../pages/Game.css'
import './StoryChallenge.css'

// ── Story challenge screen ───────────────────────────────────────────────────
// Plays one chapter, challenge by challenge, using the story engine. The board
// and hand are the SAME components multiplayer uses, so the feel is identical.
// Nothing here writes to a room — only the result goes to the database.

const BOT_DELAY = 800

export default function StoryChallenge() {
  const { chapterId } = useParams()
  const navigate = useNavigate()
  const { user, isLoading } = useAuth()

  const chapter = CHAPTERS.find(c => String(c.id) === String(chapterId))
  const [index, setIndex] = useState(0)
  const [st, setSt] = useState(null)
  const [selected, setSelected] = useState(null)
  const [wins, setWins] = useState(0)        // rounds won, for best-of-three
  const [losses, setLosses] = useState(0)
  const [result, setResult] = useState(null) // challenge finished
  const [saving, setSaving] = useState(false)
  const busyRef = useRef(false)

  const challenge = chapter?.challenges?.[index] || null

  // ── set up a round ─────────────────────────────────────────────────────────
  const deal = useCallback(() => {
    if (!challenge) return
    const cfg = challenge.type === 'puzzle'
      ? { seats: 4, deal: challenge.deal, objective: challenge.objective, moves: challenge.moves }
      : {
          seats: challenge.seats || 4,
          pile: !!challenge.pile,
          objective: challenge.objective || { kind: 'win' },
        }
    setSt(Engine.settleTurn(Engine.startGame(cfg)))
    setSelected(null)
  }, [challenge])

  useEffect(() => { deal() }, [deal])

  // who sits where: seat 0 is the player, opponents fill the rest
  const seatBot = useCallback((seat) => {
    if (!challenge || challenge.type === 'puzzle') return null
    const names = challenge.opponents || []
    if ((challenge.seats || 4) === 2) return seat === 1 ? names[0] : null
    // 4 seats: partner (if any) sits across at seat 2
    if (seat === 2 && challenge.partner && challenge.partner !== 'pick') return challenge.partner
    const order = [names[0], challenge.partner ? null : names[1], names[2] ?? names[1]]
    return seat === 1 ? names[0] : seat === 2 ? names[1] : names[2]
  }, [challenge])

  // ── bots take their turns ──────────────────────────────────────────────────
  useEffect(() => {
    if (!st || st.status !== 'playing' || st.turn === 0 || busyRef.current) return
    busyRef.current = true
    const timer = setTimeout(() => {
      setSt(prev => {
        if (!prev || prev.status !== 'playing' || prev.turn === 0) return prev
        let next = Engine.settleTurn(prev)
        if (next.status !== 'playing' || next.turn === 0) return next

        const seat = next.turn
        const name = seatBot(seat) || 'Ti-Djo'
        const pers = getPersonality(name)
        const moves = Engine.legalMoves(next)
        const ctx = {
          seat,
          mode: 'chien',
          tileCountsBySeat: next.hands.map(h => h.length),
          opponentTileCounts: next.hands.map((h, i) => (i === seat ? null : h.length)).filter(x => x !== null),
        }
        if (seesAllHands(pers)) ctx.hands = next.hands
        const pick = chooseTile(pers, moves.map(m => m.tile), next.hands[seat], next.board, ctx)
        const move =
          moves.find(m => m.tile[0] === pick?.tile?.[0] && m.tile[1] === pick?.tile?.[1] && m.side === pick.side) ||
          moves.find(m => m.tile[0] === pick?.tile?.[0] && m.tile[1] === pick?.tile?.[1]) ||
          moves[0]
        return move ? Engine.playTile(next, move.tile, move.side) : next
      })
      busyRef.current = false
    }, BOT_DELAY)
    return () => { clearTimeout(timer); busyRef.current = false }
  }, [st, seatBot])

  // ── the player can't play: draw, or pass when the pile is empty ────────────
  useEffect(() => {
    if (!st || st.status !== 'playing' || st.turn !== 0) return
    if (Engine.canPlay(st)) return
    if (st.usePile && st.pile.length) {
      const t = setTimeout(() => setSt(prev => (prev && prev.turn === 0 ? Engine.drawOrPass(prev) : prev)), 450)
      return () => clearTimeout(t)
    }
  }, [st])

  // ── a round ended ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!st || st.status !== 'over' || result) return
    const best = challenge?.rounds === 3
    const outcome = Engine.evaluateObjective(st)
    if (!best) { setResult(outcome); return }

    const w = wins + (outcome.won ? 1 : 0)
    const l = losses + (outcome.won ? 0 : 1)
    setWins(w); setLosses(l)
    if (w >= 2 || l >= 2) setResult({ ...outcome, met: w >= 2, stars: w >= 2 ? (l === 0 ? 3 : 2) : 0 })
    else setTimeout(deal, 1200)
  }, [st, result, challenge, wins, losses, deal])

  // ── save and move on ───────────────────────────────────────────────────────
  async function finishChallenge() {
    if (!result || saving) return
    setSaving(true)
    const last = index === (chapter.challenges.length - 1)
    if (user && result.met) {
      const { error } = await db.rpc('record_challenge', {
        p_chapter: chapter.id,
        p_challenge: challenge.id,
        p_stars: result.stars,
        p_complete_chapter: last,
        p_unlock_bot: last ? (chapter.unlocks || null) : null,
      })
      if (error) console.error('[story] could not save progress:', error.message)
    }
    setSaving(false)
    setResult(null); setWins(0); setLosses(0)
    if (result.met && !last) setIndex(i => i + 1)
    else if (result.met && last) navigate('/story')
    else deal()   // failed — try again
  }

  function playMove(tile, side) {
    setSt(prev => {
      if (!prev || prev.status !== 'playing' || prev.turn !== 0) return prev
      const next = Engine.playTile(prev, tile, side)
      return next.status === 'playing' && challenge?.type === 'puzzle'
        ? { ...next, turn: 0 }        // puzzles: only the player moves
        : next
    })
    setSelected(null)
  }

  if (isLoading) return <div className="story-note">Loading…</div>
  if (!chapter) return <div className="story-note">Chapter not found. <button onClick={() => navigate('/story')}>Back</button></div>
  if (!challenge) {
    return (
      <div className="sc-empty">
        <p>This chapter doesn’t have its challenges written yet.</p>
        <button className="sc-btn" onClick={() => navigate('/story')}>Back to the map</button>
      </div>
    )
  }

  const playable = st ? Engine.legalMoves(st, 0).map(m => m.tile) : []
  const uniquePlayable = playable.filter((t, i) => playable.findIndex(x => x[0]===t[0] && x[1]===t[1]) === i)
  const isMyTurn = !!st && st.status === 'playing' && st.turn === 0

  return (
    <div className="game-layout">
      <div className="top-bar">
        <button className="sc-back" onClick={() => navigate('/story')}>← Map</button>
        <div className="sc-head">
          <span className="sc-chapter">Ch {chapter.id} · {chapter.title}</span>
          <span className="sc-progress">Challenge {index + 1}/{chapter.challenges.length}</span>
        </div>
        {challenge.rounds === 3 && <span className="sc-score">{wins} — {losses}</span>}
        {st?.usePile && <span className="sc-pile">Pile {st.pile.length}</span>}
      </div>

      {challenge.brief && <div className="sc-brief">{challenge.brief}</div>}

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
        playableTiles={uniquePlayable}
        selectedIdx={selected?.idx ?? null}
        onSelect={(tile, idx) => setSelected({ tile, idx })}
        onPass={() => setSt(prev => (prev && prev.turn === 0 ? Engine.drawOrPass(prev) : prev))}
        hasTilesOnBoard={!!st?.board?.tiles?.length}
      />

      {result && (
        <div className="sc-overlay">
          <div className="sc-card">
            <h2>{result.met ? 'Challenge complete' : 'Not this time'}</h2>
            <p>
              {result.met
                ? (result.dekabess ? 'Dekabess!' : result.blocked ? 'Won on pips.' : 'You went out first.')
                : 'Objective not met.'}
            </p>
            {result.met && <div className="sc-stars">{'★'.repeat(result.stars)}{'☆'.repeat(3 - result.stars)}</div>}
            <div className="sc-actions">
              <button className="sc-btn" disabled={saving} onClick={finishChallenge}>
                {result.met
                  ? (index === chapter.challenges.length - 1 ? 'Finish chapter' : 'Next challenge')
                  : 'Try again'}
              </button>
              <button className="sc-btn ghost" onClick={() => navigate('/story')}>Leave</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
