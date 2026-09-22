// ── Bot AI Engine ─────────────────────────────────────────────────────────────
// Each personality picks a { tile, side } from the playable tiles.
//
//   chooseTile(personality, playable, hand, board, ctx?) → { tile, side }
//
// ctx (optional, supplied by the game):
//   opponentTileCounts  tiles each opponent holds (public — shown on screen)
//   tileCountsBySeat    same, indexed by seat 0-3 (public)
//   seat, mode          the bot's seat and the game mode
//   hands               EVERY player's real tiles — passed ONLY to Ti-Jòj / Ti-Tid / Ti-Sere
//
// All three personalities share one evaluation of what a move does to the
// bot's OWN hand. Earlier versions only looked at opponents' options, and
// when a single tile was playable they always took the first side it fit —
// which regularly stranded the bot's own doubles (e.g. holding 1-1 with a 1
// on the board, closing that 1 with another tile instead of playing 1-1).

// ── Helpers ───────────────────────────────────────────────────────────────────

// All 28 domino tiles
const ALL_TILES = []
for (let a = 0; a <= 6; a++)
  for (let b = a; b <= 6; b++)
    ALL_TILES.push([a, b])

const key       = t => `${t[0]}-${t[1]}`
const sameTile  = (a, b) => a[0] === b[0] && a[1] === b[1]
const isDouble  = t => t[0] === t[1]
const hasNum    = (t, n) => t[0] === n || t[1] === n
const pips      = t => t[0] + t[1]

// Tiles not on the board and not in my hand (i.e. in other players' hands)
function unknownTiles(board, myHand) {
  const played = new Set((board?.tiles || []).map(e => key(e.tile)))
  const mine   = new Set(myHand.map(key))
  return ALL_TILES.filter(t => !played.has(key(t)) && !mine.has(key(t)))
}

// How many unknown tiles contain number n?
function numberFreq(n, unknown) {
  return unknown.filter(t => hasNum(t, n)).length
}

// After playing tile on side, what are the new board ends?
function newEnds(tile, side, board) {
  if (!board?.tiles?.length) return { L: tile[0], R: tile[1] }
  const end = side === 'left' ? board.left_end : board.right_end
  const newOpen = tile[1] === end ? tile[0] : tile[1]
  return {
    L: side === 'left'  ? newOpen : board.left_end,
    R: side === 'right' ? newOpen : board.right_end,
  }
}

// Can a tile play on given ends?
function canPlay(tile, L, R) {
  return hasNum(tile, L) || hasNum(tile, R)
}

// Estimate how many unknown tiles can play on ends L, R
function opponentOptionsCount(L, R, unknown) {
  return unknown.filter(t => canPlay(t, L, R)).length
}

// Is tile a Dekabess candidate on ends L, R?
function isDekabess(tile, L, R) {
  if (isDouble(tile)) return false
  if (L === R) return false
  return (tile[0] === L && tile[1] === R) || (tile[1] === L && tile[0] === R)
}

// Every valid (tile, side) pair — both sides are considered when a tile fits
// on both, because the side changes which numbers stay open.
function getMoves(playable, board) {
  const moves = []
  for (const tile of playable) {
    if (!board?.tiles?.length) {
      moves.push({ tile, side: 'first' })
      continue
    }
    const onLeft  = hasNum(tile, board.left_end)
    const onRight = hasNum(tile, board.right_end)
    if (onLeft)  moves.push({ tile, side: 'left' })
    // Same resulting board when both ends are equal — only list it once.
    if (onRight && !(onLeft && board.left_end === board.right_end))
      moves.push({ tile, side: 'right' })
  }
  return moves
}

// ── Shared evaluation ─────────────────────────────────────────────────────────

// Ways number n could come back onto an end later: tiles containing n still
// in other hands, plus my own non-double tiles containing n.
function reopeners(n, unknown, myRemaining) {
  const fromOthers = unknown.filter(t => hasNum(t, n) && !isDouble(t)).length
  const fromMine   = myRemaining.filter(t => hasNum(t, n) && !isDouble(t)).length
  return fromOthers + fromMine
}

// How much danger is an opponent in of going out soon?
//   1 tile left → very urgent, 2 → urgent, otherwise normal.
function dangerMultiplier(ctx) {
  const counts = ctx?.opponentTileCounts
  if (!counts?.length) return 1
  const min = Math.min(...counts)
  if (min <= 1) return 4
  if (min === 2) return 2
  return 1
}

// Score one move. Higher = better. Weights define the personality.
function evaluate(move, hand, board, unknown, ctx, W) {
  const { L, R } = newEnds(move.tile, move.side, board)
  const remaining = hand.filter(t => !sameTile(t, move.tile))
  let score = 0

  // 1) Keep MY remaining tiles playable on the new ends.
  score += remaining.filter(t => canPlay(t, L, R)).length * W.ownOption

  // 2) Doubles still in my hand. A double can only be played on a matching
  //    end, so if its number is no longer on an end, it needs another tile to
  //    bring that number back. Fewer ways back = more danger; zero = dead.
  for (const d of remaining.filter(isDouble)) {
    const n = d[0]
    if (n === L || n === R) continue                  // still playable next turn
    const ways = reopeners(n, unknown, remaining)
    if (ways === 0) score -= W.deadDouble             // stranded for the round
    else score -= W.doubleAtRisk / ways
  }

  // 3) Block opponents: fewer tiles they could play on the new ends.
  //    Weighted up when an opponent is about to go out — this is the one
  //    case where sacrificing my own flexibility (even a double) can be right.
  score -= opponentOptionsCount(L, R, unknown) * W.block * dangerMultiplier(ctx)

  // 4) Shed pips: if the round gets blocked, lowest pip total wins.
  score += pips(move.tile) * W.pip

  return score
}

// Pick the best move; ties broken by highest pips, then deterministically.
function bestMove(moves, hand, board, ctx, W, jitter = 0) {
  const unknown = unknownTiles(board, hand)
  let best = null, bestScore = -Infinity
  for (const m of moves) {
    let s = evaluate(m, hand, board, unknown, ctx, W)
    if (jitter) s += (Math.random() - 0.5) * jitter
    if (s > bestScore || (s === bestScore && best && pips(m.tile) > pips(best.tile))) {
      best = m; bestScore = s
    }
  }
  return best
}

// ── Personalities ─────────────────────────────────────────────────────────────

// STRATEGIST: balanced — protects its own hand, blocks when it's cheap to.
const STRATEGIST_W = { ownOption: 2, deadDouble: 40, doubleAtRisk: 12, block: 1, pip: 0.15 }

function strategist(playable, hand, board, ctx) {
  const moves = getMoves(playable, board)
  if (moves.length === 1) return moves[0]

  // With 2 tiles left, if the other one could Dekabess, keep it for last.
  if (hand.length === 2 && board?.tiles?.length) {
    const L = board.left_end, R = board.right_end
    const dekCandidate = hand.find(t => isDekabess(t, L, R))
    if (dekCandidate) {
      const others = moves.filter(m => !sameTile(m.tile, dekCandidate))
      if (others.length) return bestMove(others, hand, board, ctx, STRATEGIST_W)
    }
  }

  return bestMove(moves, hand, board, ctx, STRATEGIST_W)
}

// GAMBLER: chases Dekabess, sheds doubles early, a little unpredictable.
const GAMBLER_W = { ownOption: 1.5, deadDouble: 40, doubleAtRisk: 8, block: 0.5, pip: 0.3 }

function gambler(playable, hand, board, ctx) {
  const moves = getMoves(playable, board)
  if (moves.length === 1) return moves[0]

  // Dekabess right now with the last tile
  if (board?.tiles?.length && hand.length === 1) {
    const L = board.left_end, R = board.right_end
    const dek = moves.find(m => isDekabess(m.tile, L, R))
    if (dek) return dek
  }

  // Set up a Dekabess for the next play
  if (board?.tiles?.length && hand.length === 2) {
    for (const m of moves) {
      const { L, R } = newEnds(m.tile, m.side, board)
      const remaining = hand.filter(t => !sameTile(t, m.tile))
      if (remaining.some(t => isDekabess(t, L, R))) return m
    }
  }

  // Shed doubles first — still its trademark — choosing the best double move
  const doubleMoves = moves.filter(m => isDouble(m.tile))
  if (doubleMoves.length) return bestMove(doubleMoves, hand, board, ctx, GAMBLER_W)

  // Otherwise the best move with some randomness, so it stays unpredictable
  return bestMove(moves, hand, board, ctx, GAMBLER_W, 6)
}

// BLOCKER: squeezes opponents hard — but never by strangling its own hand
// unless an opponent is about to go out.
const BLOCKER_W = { ownOption: 1, deadDouble: 40, doubleAtRisk: 12, block: 2, pip: 0.3 }

function blocker(playable, hand, board, ctx) {
  const moves = getMoves(playable, board)
  if (moves.length === 1) return moves[0]
  return bestMove(moves, hand, board, ctx, BLOCKER_W)
}


// ── Lookahead search (Ti-Jòj, Ti-Tid & Ti-Sere) ──────────────────────────────────────
// Plays the round forward several turns and picks the move whose future is
// best for this bot's side. Rules modelled exactly as the game plays them:
// turn passes clockwise, a player with no legal tile passes, four passes in
// a row blocks the round (lowest pips wins, ties to the lowest seat), first
// to empty their hand wins, and going out by matching both ends is Dekabess.
//
// Everyone else's moves are predicted with sensible play (predictMove), and
// the bot plans its own moves around those predictions. In asosyé the
// partner across the table counts as our side when scoring outcomes.

function movesFor(hand, L, R, empty) {
  if (empty) return hand.map(t => ({ tile: t, side: 'first' }))
  const out = []
  for (const t of hand) {
    const onL = t[0] === L || t[1] === L
    const onR = t[0] === R || t[1] === R
    if (onL) out.push({ tile: t, side: 'left' })
    if (onR && !(onL && L === R)) out.push({ tile: t, side: 'right' })
  }
  // Try strong-looking moves first so the search prunes more
  out.sort((a, b) => (isDouble(b.tile) - isDouble(a.tile)) || (pips(b.tile) - pips(a.tile)))
  return out
}

function endsAfter(tile, side, L, R, empty) {
  if (empty) return [tile[0], tile[1]]
  const end = side === 'left' ? L : R
  const open = tile[1] === end ? tile[0] : tile[1]
  return side === 'left' ? [open, R] : [L, open]
}

const handPips = h => h.reduce((s, t) => s + t[0] + t[1], 0)
const WIN = 1000, BLOCK_WIN = 800

// Static judgement of an unfinished position, from our side's point of view.
function leafValue(st, mine) {
  let v = 0
  let myMin = 99, oppMin = 99, myPips = 0, oppPips = 0
  for (let s = 0; s < 4; s++) {
    const h = st.hands[s]
    const playable = st.empty ? h.length : h.filter(t => canPlay(t, st.L, st.R)).length
    if (mine(s)) { myMin = Math.min(myMin, h.length); myPips += handPips(h); v += playable * 4 }
    else         { oppMin = Math.min(oppMin, h.length); oppPips += handPips(h); v -= playable * 4 }
  }
  v += (oppMin - myMin) * 30          // closest to going out matters most
  v += (oppPips - myPips) * 0.3       // pips decide a blocked round
  // Our doubles that can never come back onto an end
  for (let s = 0; s < 4; s++) {
    if (!mine(s)) continue
    for (const d of st.hands[s]) {
      if (!isDouble(d) || d[0] === st.L || d[0] === st.R) continue
      const n = d[0]
      let alive = false
      for (let k = 0; k < 4 && !alive; k++)
        for (const t of st.hands[k]) if (!isDouble(t) && hasNum(t, n)) { alive = true; break }
      if (!alive) v -= 25
    }
  }
  return v
}

function blockedWinner(hands) {
  let best = 0, bestPips = Infinity
  for (let s = 0; s < 4; s++) {
    const p = handPips(hands[s])
    if (p < bestPips) { bestPips = p; best = s }   // strict < keeps lowest seat on ties
  }
  return best
}

// What would player p sensibly play here? The same judgement the regular
// bots use (keep your own tiles playable, cut others' options, protect your
// doubles, shed pips) — used to PREDICT everyone except the bot itself.
function predictMove(st, p, moves) {
  const hand = st.hands[p]
  let best = moves[0], bestS = -Infinity
  for (const m of moves) {
    const [nL, nR] = endsAfter(m.tile, m.side, st.L, st.R, st.empty)
    let s = 0
    for (const t of hand) if (t !== m.tile && (hasNum(t, nL) || hasNum(t, nR))) s += 2
    for (let k = 0; k < 4; k++) {
      if (k === p) continue
      for (const t of st.hands[k]) if (hasNum(t, nL) || hasNum(t, nR)) s -= 1
    }
    s += pips(m.tile) * 0.15
    for (const d of hand) {
      if (d === m.tile || !isDouble(d) || d[0] === nL || d[0] === nR) continue
      let ways = 0
      for (let k = 0; k < 4; k++)
        for (const t of st.hands[k]) if (t !== m.tile && !isDouble(t) && hasNum(t, d[0])) ways++
      s -= ways === 0 ? 40 : 12 / ways
    }
    if (s > bestS) { bestS = s; best = m }
  }
  return best
}

// Look ahead. The bot branches over ITS OWN options; every other player
// (opponents, and a partner in asosyé) is predicted with predictMove. That
// matches how the round really unfolds and lets the search reach far ahead —
// often the end of the round. Returns null if the node budget ran out.
function makeSearch(mine, me, budget, style) {
  const dekBonus = style.dekBonus
  const knockBonus = style.knockBonus || 0
  let nodes = 0
  // `knocks` = passes forced on the other side so far along this line
  function value(st, depth, ply, knocks) {
    if (++nodes > budget) return null
    if (depth === 0) return leafValue(st, mine) + knocks * knockBonus
    const p = st.turn
    const hand = st.hands[p]
    const moves = movesFor(hand, st.L, st.R, st.empty)

    if (!moves.length) {                                  // forced pass
      const k = knocks + (mine(p) ? 0 : 1)
      if (st.passes + 1 >= 4) {
        const w = blockedWinner(st.hands)
        return (mine(w) ? BLOCK_WIN - ply : -BLOCK_WIN + ply) + k * knockBonus
      }
      const sp = st.passes, sTurn = st.turn
      st.passes = sp + 1; st.turn = (p + 1) % 4
      const v = value(st, depth - 1, ply + 1, k)
      st.passes = sp; st.turn = sTurn
      return v
    }

    const options = p === me ? moves : [predictMove(st, p, moves)]
    let best = -Infinity
    for (const m of options) {
      const i = hand.indexOf(m.tile)
      hand.splice(i, 1)
      const sL = st.L, sR = st.R, sE = st.empty, sP = st.passes, sT = st.turn
      let v
      if (hand.length === 0) {
        const dek = !sE && !isDouble(m.tile) && sL !== sR &&
          ((m.tile[0] === sL && m.tile[1] === sR) || (m.tile[1] === sL && m.tile[0] === sR))
        const amount = WIN + (dek ? dekBonus : 0)
        v = (mine(p) ? amount - ply : -amount + ply) + knocks * knockBonus   // win sooner, lose later
      } else {
        const [nL, nR] = endsAfter(m.tile, m.side, sL, sR, sE)
        st.L = nL; st.R = nR; st.empty = false; st.passes = 0; st.turn = (p + 1) % 4
        v = value(st, depth - 1, ply + 1, knocks)
        st.L = sL; st.R = sR; st.empty = sE; st.passes = sP; st.turn = sT
      }
      hand.splice(i, 0, m.tile)
      if (v === null) return null
      if (v > best) best = v
    }
    return best
  }
  return { value, used: () => nodes }
}

// Score every root move by searching the future after it.
function rootScores(st, rootMoves, mine, depth, budget, style) {
  const search = makeSearch(mine, st.turn, budget, style)
  const scores = []
  const p = st.turn, hand = st.hands[p]
  for (const m of rootMoves) {
    const i = hand.findIndex(t => sameTile(t, m.tile))
    const [tile] = hand.splice(i, 1)
    const sL = st.L, sR = st.R, sE = st.empty, sP = st.passes, sT = st.turn
    let v
    if (hand.length === 0) {
      const dek = !sE && !isDouble(tile) && sL !== sR &&
        ((tile[0] === sL && tile[1] === sR) || (tile[1] === sL && tile[0] === sR))
      v = WIN + (dek ? style.dekBonus : 0)
    } else {
      const [nL, nR] = endsAfter(tile, m.side, sL, sR, sE)
      st.L = nL; st.R = nR; st.empty = false; st.passes = 0; st.turn = (p + 1) % 4
      v = search.value(st, depth - 1, 1, 0)
      st.L = sL; st.R = sR; st.empty = sE; st.passes = sP; st.turn = sT
    }
    hand.splice(i, 0, tile)
    if (v === null) return null            // out of budget at this depth
    scores.push(v)
  }
  return scores
}

// Deepen until the budget runs out; keep the deepest finished answer.
function deepScores(st, rootMoves, mine, budget, style) {
  let last = null
  for (let depth = 2; depth <= 28; depth += 2) {
    const s = rootScores(st, rootMoves, mine, depth, budget, style)
    if (!s) break
    last = s
  }
  return last
}

function teamCheck(ctx) {
  const me = ctx.seat
  const partner = ctx.mode === 'asosye' ? (me + 2) % 4 : -1
  return s => s === me || s === partner
}

function buildState(hands, board, turn, passes) {
  return {
    hands,
    L: board?.tiles?.length ? board.left_end : null,
    R: board?.tiles?.length ? board.right_end : null,
    empty: !board?.tiles?.length,
    turn,
    passes: passes || 0,
  }
}

// Root moves limited to what the game says is playable right now.
function legalRootMoves(playable, board) {
  return getMoves(playable, board)
}

// Tie-break equal search scores with the shared single-move judgement.
function pickBest(moves, scores, hand, board, ctx) {
  const unknown = unknownTiles(board, hand)
  let bi = 0
  for (let i = 1; i < moves.length; i++) {
    if (scores[i] > scores[bi]) bi = i
    else if (scores[i] === scores[bi]) {
      const a = evaluate(moves[i], hand, board, unknown, ctx, STRATEGIST_W)
      const b = evaluate(moves[bi], hand, board, unknown, ctx, STRATEGIST_W)
      if (a > b) bi = i
    }
  }
  return moves[bi]
}

// ── Ti-Jòj, Ti-Tid & Ti-Sere ──────────────────────────────────────────────────────────
// Both see every player's real tiles, predict what each player will do, and
// plan their own moves so the following plays fall their way.
//   Ti-Jòj — plays purely to win the round.
//   Ti-Tid — loves making you knock: still plays to win, but prefers the line
//            that forces opponents to pass the most (closing the numbers
//            they're holding).
//   Ti-Sere — the strangler: blocks hard so you knock constantly, and doesn't
//            care about finishing by Dekabess — he just shuts you out.
const SEER_BUDGET = 60000
const TIJOJ_STYLE = { dekBonus: 300, knockBonus: 0 }
const TITID_STYLE = { dekBonus: 300, knockBonus: 100 }
const TISERE_STYLE = { dekBonus: 0, knockBonus: 250 }

function seer(playable, hand, board, ctx, style) {
  const moves = legalRootMoves(playable, board)
  if (moves.length === 1) return moves[0]
  // Without the real hands, fall back to the strategist's judgement.
  if (!ctx?.hands || ctx.seat === undefined) return strategist(playable, hand, board, ctx)
  const hands = [0, 1, 2, 3].map(s => (s === ctx.seat ? hand : (ctx.hands[s] || [])).map(t => [t[0], t[1]]))
  const st = buildState(hands, board, ctx.seat, ctx.consecutivePasses)
  const rootHand = st.hands[ctx.seat]
  const rootMoves = moves.map(m => ({ tile: rootHand.find(t => sameTile(t, m.tile)), side: m.side }))
  const scores = deepScores(st, rootMoves, teamCheck(ctx), SEER_BUDGET, style)
  if (!scores) return strategist(playable, hand, board, ctx)
  return pickBest(moves, scores, hand, board, ctx)
}

const tijoj = (playable, hand, board, ctx) => seer(playable, hand, board, ctx, TIJOJ_STYLE)
const titid = (playable, hand, board, ctx) => seer(playable, hand, board, ctx, TITID_STYLE)
const tisere = (playable, hand, board, ctx) => seer(playable, hand, board, ctx, TISERE_STYLE)

// Which personalities are given every player's real tiles by the game.
export function seesAllHands(personality) {
  return personality === 'tijoj' || personality === 'titid' || personality === 'tisere'
}

// ── Personality map ───────────────────────────────────────────────────────────
export const PERSONALITIES = {
  strategist,
  gambler,
  blocker,
  tijoj,
  titid,
  tisere,
}

// Default assignment by bot name
export function getPersonality(nickname) {
  // Accents stripped so "Ti-Jòj" and "Ti-Joj" both match.
  const n = (nickname || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (n.includes('ti-joj'))                         return 'tijoj'
  if (n.includes('ti-tid'))                         return 'titid'
  if (n.includes('ti-sere'))                        return 'tisere'
  if (n.includes('ti-djo') || n.includes('djo'))    return 'strategist'
  if (n.includes('ti-cam') || n.includes('ticam')) return 'gambler'
  if (n.includes('ti-jean') || n.includes('jean'))   return 'blocker'
  return 'strategist' // default for new bots
}

export function chooseTile(personality, playable, hand, board, ctx) {
  const fn = PERSONALITIES[personality] || strategist
  return fn(playable, hand, board, ctx)
}
