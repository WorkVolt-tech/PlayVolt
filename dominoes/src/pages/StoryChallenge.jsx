import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { CHAPTERS } from '../story/chapters'
import * as Engine from '../story/storyEngine'
import { chooseTile, getPersonality, seesAllHands } from '../lib/botAI'
import Board from '../components/Board'
import PlayerHand from '../components/PlayerHand'
import OpponentHands from '../components/OpponentHands'
import { canPlayOnSide } from '../hooks/useGameState'
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

  // Where we were, kept on the device so a refresh doesn't start the chapter
  // over. Cleared when the chapter is finished or abandoned.
  const posKey = `story_pos:${chapterId}`
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(posKey) || 'null') } catch { return null }
  })()

  const [index, setIndex] = useState(saved?.index ?? 0)
  const [st, setSt] = useState(null)
  const [selected, setSelected] = useState(null)
  const [wins, setWins] = useState(saved?.wins ?? 0)        // rounds won, for best-of-three
  const [losses, setLosses] = useState(saved?.losses ?? 0)
  const [result, setResult] = useState(null) // challenge finished
  const [partner, setPartner] = useState(null)   // chosen teammate, when the challenge says 'pick'
  const [story, setStory] = useState(saved?.introSeen ? null : 'intro')   // 'intro' | null | 'outro'
  const [unlocked, setUnlocked] = useState([])   // bots this player has earned
  const [saving, setSaving] = useState(false)
  const busyRef = useRef(false)

  const challenge = chapter?.challenges?.[index] || null
  const needsPartner = challenge?.partner === 'pick' && !partner

  useEffect(() => {
    if (!user) return
    let off = false
    ;(async () => {
      const { data } = await db.rpc('ensure_story_progress')
      const row = Array.isArray(data) ? data[0] : data
      if (off) return
      setUnlocked((row?.unlocked_bots || []).filter(b => b !== chapter?.featured))

      // With nothing saved on this device, start at the first challenge the
      // account hasn't already completed.
      if (!saved && chapter) {
        const done = row?.completed_challenges?.[String(chapter.id)] || []
        if (done.length) {
          const next = chapter.challenges.findIndex(c => !done.includes(c.id))
          if (next > 0) setIndex(next)
        }
      }
    })()
    return () => { off = true }
  }, [user, chapter])

  // a new challenge clears the previous pick
  useEffect(() => { setPartner(null) }, [index])

  // remember where we are, so a refresh picks up here
  useEffect(() => {
    try {
      localStorage.setItem(posKey, JSON.stringify({
        index, wins, losses, introSeen: story !== 'intro',
      }))
    } catch { /* storage unavailable */ }
  }, [posKey, index, wins, losses, story])

  const clearSaved = useCallback(() => {
    try { localStorage.removeItem(posKey) } catch { /* ignore */ }
  }, [posKey])

  // ── set up a round ─────────────────────────────────────────────────────────
  const deal = useCallback(() => {
    if (!challenge) return
    if (challenge.partner === 'pick' && !partner) return   // wait for the pick
    const cfg = challenge.type === 'puzzle'
      ? { seats: 4, deal: challenge.deal, objective: challenge.objective, moves: challenge.moves }
      : {
          seats: challenge.seats || 4,
          pile: !!challenge.pile,
          objective: challenge.objective || { kind: 'win' },
        }
    setSt(Engine.settleTurn(Engine.startGame(cfg)))
    setSelected(null)
  }, [challenge, partner])

  useEffect(() => { deal() }, [deal])

  // Who sits where. Seat 0 is always the player.
  //   2 seats  -> opponent at 1
  //   4 seats, no partner -> opponents at 1, 2, 3
  //   4 seats with a partner -> partner across at 2, opponents at 1 and 3
  const seatBot = useCallback((seat) => {
    if (!challenge || challenge.type === 'puzzle') return null
    const names = challenge.opponents || []
    if ((challenge.seats || 4) === 2) return seat === 1 ? names[0] : null
    const mate = challenge.partner === 'pick' ? partner : challenge.partner
    if (mate) {
      if (seat === 2) return mate
      return seat === 1 ? names[0] : names[1]
    }
    return [null, names[0], names[1], names[2]][seat]
  }, [challenge, partner])

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
        // A cooperating table: every bot treats the other bots' win as its own.
        if (challenge.coop) ctx.allySeats = [1, 2, 3].filter(x => x < (challenge.seats || 4))
        // With a teammate, seats 0 and 2 are one side — the bot at 2 plays for us.
        if (!challenge.coop && (challenge.partner === 'pick' || challenge.partner)) {
          ctx.mode = 'asosye'
        }
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
  }, [st, seatBot, challenge])

  // The player draws for themselves by tapping a tile in the pile — see
  // mustDraw below. Bots still draw automatically inside settleTurn.

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

  // ── save as soon as it's won ───────────────────────────────────────────────
  // This used to happen when you pressed "Next challenge". Press "Leave"
  // instead — or close the tab — and a chapter you had actually finished was
  // never recorded. The result is now saved the moment it's earned; the
  // buttons only decide where you go next.
  const savedResultRef = useRef(null)
  useEffect(() => {
    if (!result?.met || !user || !challenge) return
    const key = `${chapter.id}:${challenge.id}`
    if (savedResultRef.current === key) return      // already saved this one
    savedResultRef.current = key
    const last = index === (chapter.challenges.length - 1)
    ;(async () => {
      const { error } = await db.rpc('record_challenge', {
        p_chapter: chapter.id,
        p_challenge: challenge.id,
        p_stars: result.stars,
        p_complete_chapter: last,
        p_unlock_bot: last ? (chapter.unlocks || null) : null,
      })
      if (error) console.error('[story] could not save progress:', error.message)
    })()
  }, [result, user, chapter, challenge, index])

  async function finishChallenge() {
    if (!result || saving) return
    setSaving(true)
    const last = index === (chapter.challenges.length - 1)
    setSaving(false)
    setResult(null); setWins(0); setLosses(0)
    if (result.met && !last) setIndex(i => i + 1)
    else if (result.met && last) { clearSaved(); setStory('outro') }
    else deal()   // failed — try again
  }

  // Place a tile. The side is checked against the board first — the same
  // guard the live game applies — so a stray drop can't make an illegal move.
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
        if (!use) return prev            // not a legal placement — ignore it
      } else {
        use = 'first'
      }
      const next = Engine.playTile(prev, tile, use)
      return next.status === 'playing' && challenge?.type === 'puzzle'
        ? { ...next, turn: 0 }        // puzzles: only the player moves
        : next
    })
    setSelected(null)
  }

  // Tapping a tile behaves as it does in a normal game: tap again to
  // deselect. Nothing is placed until you drag it to the table.
  function selectTile(tile, idx) {
    if (!isMyTurn) return
    if (selected?.idx === idx) { setSelected(null); return }
    setSelected({ tile, idx })
    // Selecting never places a tile, even on an empty board.
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

  // ── chapter opening ───────────────────────────────────────────────────────
  if (story === 'intro' && chapter.intro) {
    return (
      <div className="sc-story">
        <div className="sc-story-card">
          <div className="sc-story-chapter">Chapter {chapter.id}</div>
          <h1 className="sc-story-title">{chapter.title}</h1>
          {chapter.featured && <div className="sc-story-foe">vs {chapter.featured}</div>}
          <div className="sc-story-text">
            {chapter.intro.split('\n\n').map((para, i) => <p key={i}>{para}</p>)}
          </div>
          <div className="sc-actions">
            <button className="sc-btn" onClick={() => setStory(null)}>Sit down</button>
            <button className="sc-btn ghost" onClick={() => { clearSaved(); navigate('/story') }}>Not yet</button>
          </div>
        </div>
      </div>
    )
  }

  // ── chapter finished ──────────────────────────────────────────────────────
  if (story === 'outro') {
    return (
      <div className="sc-story">
        <div className="sc-story-card">
          <div className="sc-story-chapter">Chapter {chapter.id} complete</div>
          <h1 className="sc-story-title">{chapter.title}</h1>
          <div className="sc-story-text">
            {(chapter.outro || '').split('\n\n').map((para, i) => <p key={i}>{para}</p>)}
          </div>
          {chapter.unlocks && (
            <div className="sc-unlock">{chapter.unlocks} unlocked</div>
          )}
          <div className="sc-actions">
            <button className="sc-btn" onClick={() => navigate('/story')}>Back to the map</button>
          </div>
        </div>
      </div>
    )
  }

  if (needsPartner) {
    return (
      <div className="sc-empty">
        <p>Choose your partner. They sit across from you.</p>
        {unlocked.length === 0 && <p className="sc-dim">You haven’t unlocked anyone yet — beat some chapters first.</p>}
        <div className="sc-picks">
          {unlocked.map(b => (
            <button key={b} className="sc-btn" onClick={() => setPartner(b)}>{b}</button>
          ))}
        </div>
        <button className="sc-btn ghost" onClick={() => navigate('/story')}>Back to the map</button>
      </div>
    )
  }

  const playable = st ? Engine.legalMoves(st, 0).map(m => m.tile) : []
  const uniquePlayable = playable.filter((t, i) => playable.findIndex(x => x[0]===t[0] && x[1]===t[1]) === i)
  const isMyTurn = !!st && st.status === 'playing' && st.turn === 0
  // you may only draw when you have nothing to play
  const mustDraw = isMyTurn && !!st?.usePile && st.pile.length > 0 && !Engine.canPlay(st)

  // Present the engine's state in the shape the game's own components expect,
  // so story mode looks and behaves exactly like a normal table.
  const seatNames = [0, 1, 2, 3].map(seat => {
    if (seat === 0) return 'You'
    return seatBot(seat) || (challenge.type === 'puzzle' ? `Seat ${seat + 1}` : '—')
  })
  // In a 1v1 the only opponent is seat 1, which the table layout would place
  // on your RIGHT. With nobody else at the table they belong across from you,
  // so for display only they're shown as seat 2 (the "top" chair).
  const twoSeat = (st?.seats ?? 4) === 2
  const shown = seat => (twoSeat && seat === 1 ? 2 : seat)
  const fakePlayers = (st?.hands || []).map((h, seat) => ({
    seat: shown(seat),
    nickname: seatNames[seat],
    hand: h,
    is_ai: seat !== 0,
  }))
  const fakeRoom = {
    current_turn: shown(st?.turn ?? 0),
    game_mode: challenge.partner ? 'asosye' : 'chien',
    status: st?.status === 'over' ? 'round_end' : 'playing',
  }
  const fakeMe = { seat: 0 }

  return (
    <div className="game-layout">
      <div className="top-bar">
        <div className="top-bar-left">
          <button className="sc-back" onClick={() => navigate('/story')}>← Map</button>
          <span className="sc-chapter">Ch {chapter.id}</span>
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
            </div>
          ))}
        </div>
        {challenge.rounds === 3 && <span className="sc-score">{wins} — {losses}</span>}
        {st?.usePile && <span className="sc-pile">Pile {st.pile.length}</span>}
      </div>

      {challenge.brief && <div className="sc-brief">{challenge.brief}</div>}

      <div className="board-container">
        {st?.usePile && st.pile.length > 0 && (
          <div className={`pile-stack ${mustDraw ? 'active' : ''}`}>
            <div className="pile-tiles">
              {st.pile.map((_, i) => (
                <button
                  key={i}
                  className="pile-tile"
                  disabled={!mustDraw}
                  onClick={() => setSt(prev => (prev && prev.turn === 0 ? Engine.drawFrom(prev, i) : prev))}
                  title={mustDraw ? 'Take this one' : 'Draw pile'}
                />
              ))}
            </div>
            <span className="pile-count">{st.pile.length}</span>
            <span className="pile-label">{mustDraw ? 'pick one' : 'pile'}</span>
          </div>
        )}
        <OpponentHands players={fakePlayers} myInfo={fakeMe} roomData={fakeRoom} />
        <Board
          boardData={st?.board}
          selectedTile={selected}
          isMyTurn={isMyTurn}
          onDropZone={side => {
            if (!selected) return
            playMove(selected.tile, side)
          }}
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

      <PlayerHand
        hand={st?.hands?.[0] || []}
        isMyTurn={isMyTurn}
        playableTiles={uniquePlayable}
        selectedIdx={selected?.idx ?? null}
        onSelect={selectTile}
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
              <button className="sc-btn ghost" onClick={() => {
                if (result.met && index === chapter.challenges.length - 1) { clearSaved(); setStory('outro') }
                else navigate('/story')
              }}>Leave</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
