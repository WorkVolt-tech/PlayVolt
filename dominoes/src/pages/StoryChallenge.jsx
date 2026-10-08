import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { CHAPTERS, NORMAL_CIRCUIT } from '../story/chapters'
import * as Engine from '../story/storyEngine'
import { chooseTile, getPersonality, isExpertBot } from '../lib/botAI'
import Board from '../components/Board'
import PlayerHand from '../components/PlayerHand'
import OpponentHands from '../components/OpponentHands'
import KnockAnimation, { knockKey } from '../components/KnockAnimation'
import TileBack from '../components/TileBack'
import ReshuffleOffer, { countDoubles } from '../components/ReshuffleOffer'
import { botsCountForTrophies } from '../lib/trophies'
import DekabessOverlay from '../components/DekabessOverlay'
import { canPlayOnSide, pipCount } from '../hooks/useGameState'
import '../pages/Game.css'
import './StoryChallenge.css'

// ── Story challenge screen ───────────────────────────────────────────────────
// Plays one chapter, challenge by challenge, using the story engine. The board
// and hand are the SAME components multiplayer uses, so the feel is identical.
// Nothing here writes to a room — only the result goes to the database.

// Story pace: bots take 1.8s per move — a little slower than the live game,
// so you can follow what each opponent plays. A knock plays out in full
// before anyone moves again, and drawing from the pile is quicker.
const BOT_DELAY = 1800
const DRAW_DELAY = 450

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
  const [st, setSt] = useState(saved?.st ?? null)
  const [selected, setSelected] = useState(null)
  const [pileOpen, setPileOpen] = useState(false)   // the pick-a-tile sheet
  // Open the pile by itself the moment you have nothing to play
  useEffect(() => {
    const must = !!st && st.status === 'playing' && st.turn === 0 &&
                 !!st.usePile && st.pile.length > 0 && !Engine.canPlay(st)
    if (must) setPileOpen(true)
    else setPileOpen(false)
  }, [st])
  // Rounds already counted toward the best-of-three, by deal — so a refresh
  // straight after a round can't count it twice.
  const counted = useRef(new Set(saved?.counted || []))
  // Challenges already written to your account on this device.
  const recordedKeys = useRef(new Set(saved?.recorded || []))
  // Restoring a round in play: skip the automatic first deal.
  const resumeRound = useRef(!!saved?.st)

  const [wins, setWins] = useState(saved?.wins ?? 0)        // rounds won, for best-of-three
  const [losses, setLosses] = useState(saved?.losses ?? 0)
  const [result, setResult] = useState(null) // challenge finished
  const [partner, setPartner] = useState(saved?.partner ?? null)   // chosen teammate, when the challenge says 'pick'
  const [story, setStory] = useState(saved?.introSeen ? null : 'intro')   // 'intro' | null | 'outro'
  const [unlocked, setUnlocked] = useState([])   // bots this player has earned
  const [saving, setSaving] = useState(false)
  const busyRef = useRef(false)
  const [knock, setKnock] = useState(null)             // { name, position } while it plays
  const [opener, setOpener] = useState(null)           // "Round 2 · Ti-Sak opens", briefly
  const [roundPanel, setRoundPanel] = useState(null)   // a finished round, mid-series
  const [showDek, setShowDek] = useState(false)        // the Dekabess animation
  const [boardDek, setBoardDek] = useState(null)       // the board's Dekabess, while it plays
  const [passingSeats, setPassingSeats] = useState(new Set())
  const knockQueue = useRef([])
  // start from the end of a restored log, so a refresh doesn't replay knocks
  const seenLog = useRef(saved?.st?.log?.length || 0)

  const challenge = chapter?.challenges?.[index] || null
  const needsPartner = challenge?.partner === 'pick' && !partner

  useEffect(() => {
    if (!user) return
    let off = false
    ;(async () => {
      const { data } = await db.rpc('ensure_story_progress')
      const row = Array.isArray(data) ? data[0] : data
      if (off) return
      // Ordinary bots are always available; experts once earned.
      const earned = row?.unlocked_bots || []
      const pool = [...NORMAL_CIRCUIT, ...earned.filter(b => !NORMAL_CIRCUIT.includes(b))]
      setUnlocked(pool.filter(b => b !== chapter?.featured))

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
  const lastIndex = useRef(index)
  useEffect(() => {
    if (lastIndex.current === index) return      // first load: keep a restored partner
    lastIndex.current = index
    setPartner(null)
  }, [index])

  // remember where we are, so a refresh picks up here
  useEffect(() => {
    try {
      localStorage.setItem(posKey, JSON.stringify({
        index, wins, losses, introSeen: story !== 'intro',
        st, partner,
        counted: [...counted.current],
        recorded: [...recordedKeys.current],
      }))
    } catch { /* storage unavailable */ }
  }, [posKey, index, wins, losses, story, st, partner])

  const clearSaved = useCallback(() => {
    try { localStorage.removeItem(posKey) } catch { /* ignore */ }
  }, [posKey])

  // ── set up a round ─────────────────────────────────────────────────────────
  // Who opens: the first round of a challenge follows the doubles rule (in
  // the engine — 6-6, else the highest double, played; else you, any tile).
  // Every round after, the previous round's winner opens with any tile.
  const deal = useCallback((opts = {}) => {
    if (!challenge) return
    if (challenge.partner === 'pick' && !partner) return   // wait for the pick
    const winnerOpens = Number.isInteger(opts.starter) && opts.starter >= 0
    const cfg = challenge.type === 'puzzle'
      ? { seats: 4, deal: challenge.deal, objective: challenge.objective, moves: challenge.moves }
      : {
          seats: challenge.seats || 4,
          pile: !!challenge.pile,
          objective: challenge.objective || { kind: 'win' },
          ...(winnerOpens ? { starter: opts.starter } : { forceDoubleSix: true }),
        }
    const fresh = Engine.settleTurn(Engine.startGame(cfg))
    setSt({ ...fresh, dealId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` })
    setSelected(null)
  }, [challenge, partner])

  useEffect(() => {
    // After a refresh, the saved round is already on the table — don't deal
    // over it. Every later change (next challenge, a partner picked) deals.
    if (resumeRound.current) { resumeRound.current = false; return }
    deal()
  }, [deal])

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

  // ── Five doubles: reshuffle or play on ────────────────────────────────────
  // Open before the round's first tile, while you hold 5+ doubles and haven't
  // decided. Never with a partner — anything goes in partner games.
  const myDoubles = countDoubles(st?.hands?.[0])
  const offerOpen = !!st && challenge?.type !== 'puzzle' && !challenge?.partner && st.status === 'playing' && !(st.board?.tiles?.length)
    && !(st.log || []).length && myDoubles >= 5 && !st.doublesDecided
  const playOn = () => setSt(prev => (prev ? { ...prev, doublesDecided: true, fiveDoubles: true } : prev))

  useEffect(() => {
    if (!st || st.status !== 'playing' || st.turn === 0 || busyRef.current || knock || opener || offerOpen) return
    busyRef.current = true
    const drawing = !Engine.canPlay(st) && st.usePile && st.pile.length > 0
    const timer = setTimeout(() => {
      setSt(prev => {
        if (!prev || prev.status !== 'playing' || prev.turn === 0) return prev
        // ONE action per turn: draw one tile, or knock once, or play.
        if (!Engine.canPlay(prev)) return Engine.drawOrPass(prev)
        const next = prev

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
        if (isExpertBot(pers)) ctx.hands = next.hands
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
    }, drawing ? DRAW_DELAY : BOT_DELAY)
    return () => { clearTimeout(timer); busyRef.current = false }
  }, [st, seatBot, challenge, knock, opener])

  // You, with nothing to play and nothing to draw: you knock — and you SEE it.
  // (With tiles left in the pile, the pick-a-tile sheet opens instead.)
  // In a puzzle there's nobody else to hand the turn to, so a dead end ends
  // the attempt and you can try again.
  useEffect(() => {
    if (!st || st.status !== 'playing' || st.turn !== 0 || knock || offerOpen) return
    if (Engine.canPlay(st)) return
    if (st.usePile && st.pile.length > 0) return
    const t = setTimeout(() => setSt(p => {
      if (!p || p.turn !== 0 || p.status !== 'playing' || Engine.canPlay(p)) return p
      if (challenge?.type === 'puzzle') return { ...p, status: 'over', winner: -1 }
      return Engine.drawOrPass(p)
    }), BOT_DELAY)
    return () => clearTimeout(t)
  }, [st, knock, challenge])

  const knockName = seat => (seat === 0 ? 'You' : (seatBot(seat) || 'Player'))
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

  // ── Narration ─────────────────────────────────────────────────────────────
  const nameAt = seat => (seat === 0 ? 'You' : (seatBot(seat) || 'Player'))

  // Who won a round, and how — said plainly, as a table would.
  const describeRound = useCallback((state) => {
    if (!state || state.status !== 'over') return null
    const w = state.winner
    if (w === -1) return { title: 'Dead end', how: 'Nothing left to play — try the puzzle again.', mine: false }
    const who = nameAt(w)
    const title = w === 0 ? 'You win the round' : `${who} wins the round`
    let how
    if (state.dekabess) how = `Dekabess — ${w === 0 ? 'you' : who} went out on a tile matching both ends.`
    else if (state.blocked) {
      const pips = state.hands.map((h, seat) => `${nameAt(seat)} ${pipCount(h)}`).join(' · ')
      how = `The table jammed — nobody could play. Fewest pips wins: ${pips}.`
    } else how = `${w === 0 ? 'You' : who} went out first.`
    return { title, how, mine: w === 0 }
  }, [seatBot])

  // A new deal: say who opens, and give it a moment before anyone moves.
  useEffect(() => {
    if (!st || st.status !== 'playing' || challenge?.type === 'puzzle') return
    if ((st.log || []).length > 0) return            // only at the very start of a round
    const roundNo = challenge?.rounds === 3 ? wins + losses + 1 : null
    const who = st.turn === 0 ? 'You open' : `${nameAt(st.turn)} opens`
    setOpener(roundNo ? `Round ${roundNo} · ${who}` : who)
    const t = setTimeout(() => setOpener(null), 2000)
    return () => clearTimeout(t)
  }, [st?.dealId])

  // ── a round ended ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!st || st.status !== 'over' || result) return
    const best = challenge?.rounds === 3
    const outcome = { ...Engine.evaluateObjective(st), round: describeRound(st) }
    if (st.dekabess && st.winner >= 0) setBoardDek(`story-${st.dealId || Date.now()}`)   // board first, then the celebration
    if (!best) { setResult(outcome); return }

    // A round already counted (you refreshed right after it) isn't counted again
    const already = !!st.dealId && counted.current.has(st.dealId)
    // A Dekabess counts as two wins — the same house rule the table's streak
    // and the tournament use. In a best-of-three that settles the series.
    const worth = st.dekabess ? 2 : 1
    const w = already ? wins : wins + (outcome.won ? worth : 0)
    const l = already ? losses : losses + (outcome.won ? 0 : worth)
    if (!already) {
      if (st.dealId) counted.current.add(st.dealId)
      setWins(w); setLosses(l)
      // five-doubles trophies: you played the round instead of reshuffling
      const opponents = Array.from({ length: (st.seats ?? 4) - 1 }, (_, i) => seatBot(i + 1))
      if (st.fiveDoubles && botsCountForTrophies(opponents)) {
        db.rpc('record_feat', { p_kind: 'five_doubles' }).then(() => {})
        if (st.winner === 0) db.rpc('record_feat', { p_kind: 'five_doubles_won' }).then(() => {})
      }
    }
    if (w >= 2 || l >= 2) setResult({ ...outcome, met: w >= 2, stars: w >= 2 ? (l === 0 ? 3 : 2) : 0 })
    else setRoundPanel({ ...outcome.round, wins: w, losses: l, winner: st.winner })
  }, [st, result, challenge, wins, losses, deal, describeRound])

  // ── save as soon as it's won ───────────────────────────────────────────────
  // This used to happen when you pressed "Next challenge". Press "Leave"
  // instead — or close the tab — and a chapter you had actually finished was
  // never recorded. The result is now saved the moment it's earned; the
  // buttons only decide where you go next.
  useEffect(() => {
    if (!result?.met || !user || !challenge) return
    const key = `${chapter.id}:${challenge.id}`
    if (recordedKeys.current.has(key)) return       // already saved, even across a refresh
    recordedKeys.current.add(key)
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
        // the opening tile has to be one the rules allow (the required double)
        const ok = Engine.legalMoves(prev, 0).some(m => m.tile[0] === tile[0] && m.tile[1] === tile[1])
        if (!ok) return prev
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


  // Partner challenges: change partner between rounds, or before trying again.
  // The new partner sits down for the next deal.
  const partnerSwap = challenge?.partner === 'pick' && unlocked.length > 1 ? (
    <div className="sc-partner-swap">
      <div className="sc-partner-swap-label">Partner for the next round</div>
      <div className="sc-picks">
        {unlocked.map(b => (
          <button key={b} className={`sc-btn ${b === partner ? '' : 'ghost'}`} onClick={() => setPartner(b)}>{b}</button>
        ))}
      </div>
    </div>
  ) : null

  const playable = st ? Engine.legalMoves(st, 0).map(m => m.tile) : []
  const uniquePlayable = playable.filter((t, i) => playable.findIndex(x => x[0]===t[0] && x[1]===t[1]) === i)

  // Who played the newest tile (for the slide): the game's own move log says.
  const lastPlay = [...(st?.log || [])].reverse().find(e => e.action === 'play')
  const slideFrom = lastPlay
    ? ((st?.seats ?? 4) === 2 ? (lastPlay.seat === 0 ? 'bottom' : 'top') : ['bottom', 'right', 'top', 'left'][lastPlay.seat])
    : null
  const isMyTurn = !!st && st.status === 'playing' && st.turn === 0 && !offerOpen
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
    engineSeat: seat,
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
          {fakePlayers.filter(p => challenge?.type !== 'puzzle' || p.engineSeat === 0).map(p => (
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
        {challenge.rounds === 3 && <span className="sc-score">{wins} — {losses}</span>}
        {st?.usePile && <span className="sc-pile">Pile {st.pile.length}</span>}
      </div>

      {challenge.brief && <div className="sc-brief">{challenge.brief}</div>}

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
        {/* In a puzzle only you play; the other seats just hold the puzzle's
            remaining tiles, so they aren't shown. */}
        {challenge?.type !== 'puzzle' && (
          <OpponentHands players={fakePlayers} myInfo={fakeMe} roomData={fakeRoom} />
        )}
        <Board
          dekabessKey={boardDek}
          dekabessFrom={st?.winner >= 0 ? ((st?.seats ?? 4) === 2 ? (st.winner === 0 ? 'bottom' : 'top') : ['bottom', 'right', 'top', 'left'][st.winner]) : 'top'}
          onDekabessDone={() => { setBoardDek(null); setShowDek(true) }}
          freshFrom={slideFrom}
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

      {offerOpen && (
        <ReshuffleOffer
          doubles={myDoubles}
          onReshuffle={() => (st.forceDoubleSix ? deal() : deal({ starter: st.turn }))}
          onContinue={playOn}
        />
      )}

      {knock && (
        <KnockAnimation
          key={knockKey(knock)}
          playerName={knock.name}
          position={knock.position}
          onDone={() => setKnock(knockQueue.current.shift() || null)}
        />
      )}

      <PlayerHand
        hand={st?.hands?.[0] || []}
        isMyTurn={isMyTurn}
        playableTiles={uniquePlayable}
        selectedIdx={selected?.idx ?? null}
        onSelect={selectTile}
        onPass={() => setSt(prev => (prev && prev.turn === 0 ? Engine.drawOrPass(prev) : prev))}
        hasTilesOnBoard={!!st?.board?.tiles?.length}
      />

      {opener && <div className="sc-opener">{opener}</div>}

      {showDek && st?.winner >= 0 && (
        <DekabessOverlay playerName={nameAt(st.winner)} onDone={() => setShowDek(false)} />
      )}

      {roundPanel && !result && !showDek && !boardDek && (
        <div className="sc-overlay">
          <div className="sc-card">
            <h2>{roundPanel.title}</h2>
            <p>{roundPanel.how}</p>
            <div className="sc-series">
              {(st?.seats ?? 4) === 2
                ? <>You <strong>{roundPanel.wins}</strong> — <strong>{roundPanel.losses}</strong> {nameAt(1)}</>
                : <>Rounds won <strong>{roundPanel.wins}</strong> · lost <strong>{roundPanel.losses}</strong></>}
              <span> · best of three</span>
            </div>
            {partnerSwap}
            <div className="sc-actions">
              <button className="sc-btn" onClick={() => { const starter = roundPanel.winner; setRoundPanel(null); deal({ starter }) }}>Next round</button>
              <button className="sc-btn ghost" onClick={() => navigate('/story')}>Leave</button>
            </div>
          </div>
        </div>
      )}

      {result && !showDek && !boardDek && (
        <div className="sc-overlay">
          <div className="sc-card">
            <h2>{result.met ? 'Challenge complete' : 'Not this time'}</h2>
            {result.round && challenge?.type !== 'puzzle' && (
              <p className="sc-round-line"><strong>{result.round.title}.</strong> {result.round.how}</p>
            )}
            <p>
              {result.met
                ? (challenge?.type === 'puzzle'
                    ? (result.dekabess ? 'Solved — Dekabess!' : result.blocked ? 'Solved — the table jammed in your favour.' : 'Solved.')
                    : (challenge?.rounds === 3
                        ? `You took the series ${wins}–${losses}${result.dekabess ? ' — a Dekabess counts as two' : ''}.`
                        : 'You won.'))
                : (challenge?.type === 'puzzle' ? 'That line didn’t get there.'
                    : (challenge?.rounds === 3
                        ? `They took the series ${losses}–${wins}${result.dekabess ? ' — a Dekabess counts as two' : ''}.`
                        : 'Objective not met.'))}
            </p>
            {result.met && <div className="sc-stars">{'★'.repeat(result.stars)}{'☆'.repeat(3 - result.stars)}</div>}
            {!result.met && partnerSwap}
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
