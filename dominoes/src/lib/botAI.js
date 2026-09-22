// ── Bot AI Engine ─────────────────────────────────────────────────────────────
// Each personality picks a { tile, side } from the playable tiles.
//
//   chooseTile(personality, playable, hand, board, ctx?) → { tile, side }
//
// ctx is optional:  { opponentTileCounts: number[] }  — tiles each opponent
// holds (public information, visible on every player's screen). When an
// opponent is close to going out, blocking them becomes more important.
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

// ── Personality map ───────────────────────────────────────────────────────────
export const PERSONALITIES = {
  strategist,
  gambler,
  blocker,
}

// Default assignment by bot name
export function getPersonality(nickname) {
  const n = (nickname || '').toLowerCase()
  if (n.includes('ti-djo') || n.includes('djo'))    return 'strategist'
  if (n.includes('ti-cam') || n.includes('ticam')) return 'gambler'
  if (n.includes('ti-jean') || n.includes('jean'))   return 'blocker'
  return 'strategist' // default for new bots
}

export function chooseTile(personality, playable, hand, board, ctx) {
  const fn = PERSONALITIES[personality] || strategist
  return fn(playable, hand, board, ctx)
}
