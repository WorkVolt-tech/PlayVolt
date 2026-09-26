// ── Story Mode engine ────────────────────────────────────────────────────────
//
// Runs a story match or puzzle ON THE DEVICE. No Supabase, no room rows, no
// realtime — a story game has nobody to sync with.
//
// The RULES are not reimplemented here: getPlayableTiles, canPlayOnSide,
// checkDekabess and pipCount are imported from the live game, so a tile that
// is legal in multiplayer is legal here, always.
//
// What this adds, which multiplayer doesn't have:
//   • 2-seat games (multiplayer is hard-wired to 4)
//   • a draw pile — "can't play" means draw, and only pass when it's empty
//   • preset deals for puzzles instead of a shuffle
//
// It is a plain state machine: call the functions, get a new state back.

import {
  generateDominoSet,
  shuffle,
  pipCount,
  getPlayableTiles,
  canPlayOnSide,
  checkDekabess,
} from '../hooks/useGameState'

// ── Setting up ───────────────────────────────────────────────────────────────

// cfg: { seats, pile, opponents, partner, deal, objective, moves, forceDoubleSix }
export function startGame(cfg = {}) {
  const seats = cfg.seats || 4
  const usePile = !!cfg.pile

  let hands, board, turn, pile
  if (cfg.deal) {
    // A puzzle: exact position, no shuffle.
    hands = cfg.deal.hands.map(h => h.map(t => [t[0], t[1]]))
    board = {
      tiles: (cfg.deal.board || []).map(e => ({ tile: [e.tile[0], e.tile[1]], flipped: !!e.flipped })),
      left_end: cfg.deal.left_end ?? null,
      right_end: cfg.deal.right_end ?? null,
    }
    turn = cfg.deal.turn ?? 0
    pile = (cfg.deal.pile || []).map(t => [t[0], t[1]])
  } else {
    const deck = shuffle(generateDominoSet())
    hands = []
    for (let s = 0; s < seats; s++) hands.push(deck.slice(s * 7, s * 7 + 7))
    pile = usePile ? deck.slice(seats * 7) : []
    board = { tiles: [], left_end: null, right_end: null }
    // Whoever holds 6-6 opens, as in a normal round
    turn = hands.findIndex(h => h.some(t => t[0] === 6 && t[1] === 6))
    if (turn < 0) turn = 0
  }

  return {
    seats,
    usePile,
    hands,
    pile,
    board,
    turn,
    passes: 0,
    moves: 0,
    status: 'playing',          // 'playing' | 'over'
    winner: null,
    blocked: false,
    dekabess: false,
    objective: cfg.objective || { kind: 'win' },
    moveLimit: cfg.moves || null,
    forceDoubleSix: !!cfg.forceDoubleSix,
    log: [],
  }
}

// ── Reading the state ────────────────────────────────────────────────────────

export function legalMoves(st, seat = st.turn) {
  const roomLike = { round: st.forceDoubleSix ? 1 : 2 }
  const playable = getPlayableTiles(st.hands[seat], st.board, roomLike)
  if (!st.board.tiles.length) return playable.map(tile => ({ tile, side: 'first' }))
  const out = []
  for (const tile of playable) {
    const onL = canPlayOnSide(tile, 'left', st.board)
    const onR = canPlayOnSide(tile, 'right', st.board)
    if (onL) out.push({ tile, side: 'left' })
    if (onR && !(onL && st.board.left_end === st.board.right_end)) out.push({ tile, side: 'right' })
  }
  return out
}

export const canPlay = (st, seat = st.turn) => legalMoves(st, seat).length > 0

// ── Playing ──────────────────────────────────────────────────────────────────

function applyTile(board, tile, side) {
  if (!board.tiles.length) {
    return { tiles: [{ tile, flipped: false }], left_end: tile[0], right_end: tile[1] }
  }
  const end = side === 'left' ? board.left_end : board.right_end
  const open = tile[1] === end ? tile[0] : tile[1]
  const flipped = tile[1] === end
  return side === 'left'
    ? { tiles: [{ tile, flipped }, ...board.tiles], left_end: open, right_end: board.right_end }
    : { tiles: [...board.tiles, { tile, flipped }], left_end: board.left_end, right_end: open }
}

export function playTile(st, tile, side) {
  if (st.status !== 'playing') return st
  const seat = st.turn
  const idx = st.hands[seat].findIndex(t => t[0] === tile[0] && t[1] === tile[1])
  if (idx < 0) return st

  // Dekabess is judged against the ends BEFORE the tile lands
  const wasDekabess = checkDekabess(tile, st.board)

  const hands = st.hands.map((h, i) => (i === seat ? h.filter((_, j) => j !== idx) : h))
  const board = applyTile(st.board, tile, side)
  const next = {
    ...st,
    hands,
    board,
    passes: 0,
    moves: st.moves + 1,
    turn: (seat + 1) % st.seats,
    log: [...st.log, { seat, action: 'play', tile, side }],
  }

  if (hands[seat].length === 0) {
    return { ...next, status: 'over', winner: seat, dekabess: wasDekabess, blocked: false }
  }
  return next
}

// Take a specific tile from the pile. Players pick which one they want —
// they're face down, so it's a choice of position, not of tile. You may only
// draw when you have nothing to play, as in a normal game.
export function drawFrom(st, index = 0) {
  if (st.status !== 'playing') return st
  const seat = st.turn
  if (!st.usePile || !st.pile.length) return st
  if (canPlay(st, seat)) return st            // you can play — no drawing
  const i = Math.max(0, Math.min(index, st.pile.length - 1))
  const drawn = st.pile[i]
  const pile = st.pile.filter((_, j) => j !== i)
  const hands = st.hands.map((h, k) => (k === seat ? [...h, drawn] : h))
  return { ...st, hands, pile, log: [...st.log, { seat, action: 'draw' }] }
}

// "Can't play" — draw from the pile if there is one, otherwise pass.
// Returns the new state; the seat keeps its turn while it is drawing.
export function drawOrPass(st) {
  if (st.status !== 'playing') return st
  const seat = st.turn

  if (st.usePile && st.pile.length && !canPlay(st, seat)) {
    return drawFrom(st, 0)
  }

  // Nothing to draw and nothing to play — pass.
  const passes = st.passes + 1
  const next = {
    ...st,
    passes,
    turn: (seat + 1) % st.seats,
    log: [...st.log, { seat, action: 'pass' }],
  }

  // Everyone passed in a row = the round is jammed. Lowest pips wins,
  // ties to the lowest seat — exactly as endRound resolves it.
  if (passes >= st.seats) {
    let best = 0, bestPips = Infinity
    for (let s = 0; s < st.seats; s++) {
      const p = pipCount(st.hands[s])
      if (p < bestPips) { bestPips = p; best = s }
    }
    return { ...next, status: 'over', winner: best, blocked: true, dekabess: false }
  }
  return next
}

// Advance whoever is to move when they have no choice: draw, draw, … then pass.
export function settleTurn(st) {
  let s = st
  let guard = 0
  while (s.status === 'playing' && !canPlay(s) && guard++ < 40) s = drawOrPass(s)
  return s
}

// ── Objectives ───────────────────────────────────────────────────────────────
// Judged for seat 0 — the player.

export function evaluateObjective(st) {
  if (st.status !== 'over') return { done: false }
  const o = st.objective
  const won = st.winner === 0
  const withinMoves = !st.moveLimit || st.moves <= st.moveLimit

  let met = false
  if (o.kind === 'win') met = won
  else if (o.kind === 'dekabess') met = won && st.dekabess
  else if (o.kind === 'block') met = won && st.blocked
  else if (o.kind === 'forcePass') {
    const target = o.seat ?? null
    const passes = st.log.filter(e => e.action === 'pass' && (target === null ? e.seat !== 0 : e.seat === target)).length
    met = passes >= (o.count || 1)
  }

  return {
    done: true,
    met,
    stars: met ? (withinMoves ? 3 : 2) : (won ? 1 : 0),
    won,
    blocked: st.blocked,
    dekabess: st.dekabess,
    moves: st.moves,
  }
}
