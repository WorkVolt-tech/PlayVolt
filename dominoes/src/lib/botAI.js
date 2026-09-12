// ── Bot AI Engine ─────────────────────────────────────────────────────────────
// Each personality is a pure function:
//   chooseTile(playable, hand, board, allPlayers, mySeats) → tile

// ── Helpers ───────────────────────────────────────────────────────────────────

// All 28 domino tiles
const ALL_TILES = []
for (let a = 0; a <= 6; a++)
  for (let b = a; b <= 6; b++)
    ALL_TILES.push([a, b])

// Numbers still unplayed (not on board, not in my hand)
function unknownTiles(board, myHand) {
  const played = new Set((board?.tiles || []).map(e => `${e.tile[0]}-${e.tile[1]}`))
  const mine   = new Set(myHand.map(t => `${t[0]}-${t[1]}`))
  return ALL_TILES.filter(t => !played.has(`${t[0]}-${t[1]}`) && !mine.has(`${t[0]}-${t[1]}`))
}

// How many unknown tiles contain number n?
function numberFreq(n, unknown) {
  return unknown.filter(t => t[0] === n || t[1] === n).length
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
  return tile[0] === L || tile[1] === L || tile[0] === R || tile[1] === R
}

// Estimate how many unknown tiles can play on ends L, R
function opponentOptionsCount(L, R, unknown) {
  return unknown.filter(t => canPlay(t, L, R)).length
}

// Score a tile+side move — lower opponent options = better blocking
function blockingScore(tile, side, board, unknown) {
  const { L, R } = newEnds(tile, side, board)
  return -opponentOptionsCount(L, R, unknown) // negative = fewer options = better
}

// Is tile a Dekabess candidate on ends L, R?
function isDekabess(tile, L, R) {
  if (tile[0] === tile[1]) return false
  if (L === R) return false
  return (tile[0] === L && tile[1] === R) || (tile[1] === L && tile[0] === R)
}

// Get all valid (tile, side) pairs from playable tiles
function getMoves(playable, board) {
  const moves = []
  for (const tile of playable) {
    if (!board?.tiles?.length) {
      moves.push({ tile, side: 'first' })
      continue
    }
    if (tile[0] === board.left_end || tile[1] === board.left_end)
      moves.push({ tile, side: 'left' })
    if (tile[0] === board.right_end || tile[1] === board.right_end)
      moves.push({ tile, side: 'right' })
  }
  return moves
}

// ── Personalities ─────────────────────────────────────────────────────────────

// STRATEGIST: Minimizes opponent options, avoids holding risky doubles
function strategist(playable, hand, board) {
  if (playable.length === 1) return { tile: playable[0], side: getSide(playable[0], board) }
  const unknown = unknownTiles(board, hand)
  const moves   = getMoves(playable, board)

  // If we have 2 tiles left and one could Dekabess — save it
  if (hand.length === 2 && board?.tiles?.length) {
    const L = board.left_end, R = board.right_end
    const dekCandidate = hand.find(t => isDekabess(t, L, R))
    if (dekCandidate) {
      const other = playable.find(t => `${t[0]}-${t[1]}` !== `${dekCandidate[0]}-${dekCandidate[1]}`)
      if (other) return { tile: other, side: getSide(other, board) }
    }
  }

  // Score each move: blocking power + double danger
  const scored = moves.map(m => {
    const isDouble = m.tile[0] === m.tile[1]
    const freq = numberFreq(m.tile[0], unknown)
    // Doubles with many remaining tiles of that number are dangerous to hold
    const doubleRisk = isDouble ? freq * 2 : 0
    const block = blockingScore(m.tile, m.side, board, unknown)
    return { ...m, score: block - doubleRisk }
  })

  scored.sort((a, b) => a.score - b.score) // lower = better blocking
  return scored[0]
}

// GAMBLER: Chases Dekabess, plays doubles early, takes risks
function gambler(playable, hand, board) {
  if (playable.length === 1) return { tile: playable[0], side: getSide(playable[0], board) }
  const moves = getMoves(playable, board)

  // Check for Dekabess NOW
  if (board?.tiles?.length && hand.length === 1) {
    const L = board.left_end, R = board.right_end
    const dek = moves.find(m => isDekabess(m.tile, L, R))
    if (dek) return dek
  }

  // Look for a move that sets up Dekabess on next play
  if (board?.tiles?.length && hand.length === 2) {
    for (const m of moves) {
      const { L, R } = newEnds(m.tile, m.side, board)
      const remaining = hand.filter(t => `${t[0]}-${t[1]}` !== `${m.tile[0]}-${m.tile[1]}`)
      if (remaining.some(t => isDekabess(t, L, R))) return m
    }
  }

  // Otherwise play doubles first (clear risky tiles)
  const doubleMoves = moves.filter(m => m.tile[0] === m.tile[1])
  if (doubleMoves.length > 0) {
    return doubleMoves.sort((a, b) => (b.tile[0]*2) - (a.tile[0]*2))[0] // highest double
  }

  // Then play random non-double
  return moves[Math.floor(Math.random() * moves.length)]
}

// BLOCKER: Focuses on preventing opponents from finishing
function blocker(playable, hand, board) {
  if (playable.length === 1) return { tile: playable[0], side: getSide(playable[0], board) }
  const unknown = unknownTiles(board, hand)
  const moves   = getMoves(playable, board)

  // Find the move that gives opponents fewest options
  const scored = moves.map(m => ({
    ...m,
    score: blockingScore(m.tile, m.side, board, unknown)
  }))
  scored.sort((a, b) => a.score - b.score) // lower score = fewer opponent options

  // Also prefer playing highest pip to drain hand fast
  const best = scored[0]
  const tied = scored.filter(m => m.score === best.score)
  if (tied.length > 1) {
    return tied.sort((a, b) => (b.tile[0]+b.tile[1]) - (a.tile[0]+a.tile[1]))[0]
  }
  return best
}

// Helper: get side for a tile on current board
function getSide(tile, board) {
  if (!board?.tiles?.length) return 'first'
  if (tile[0] === board.left_end || tile[1] === board.left_end) return 'left'
  return 'right'
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
  if (n.includes('djo'))    return 'strategist'
  if (n.includes('ti-cam') || n.includes('ticam')) return 'gambler'
  if (n.includes('jean'))   return 'blocker'
  return 'strategist' // default for new bots
}

export function chooseTile(personality, playable, hand, board) {
  const fn = PERSONALITIES[personality] || strategist
  return fn(playable, hand, board)
}
