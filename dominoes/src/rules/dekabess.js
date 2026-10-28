// ════════════════════════════════════════════════════════════════════════════
// THE RULES OF DEKABESS — one copy, used by every mode
// ----------------------------------------------------------------------------
// Online tables (hooks/useGameState.js), the on-device engine for Solo,
// Challenge, Story and Practice (story/storyEngine.js), and every screen read
// their rules from here, so the modes can't drift apart. (Goud stake games are
// run by the server, dekabess_stakes.sql, with the same rules.) No screens, no
// database: just the rules. tests/rules-consistency.test.mjs checks that every
// mode uses this file and that the on-device engine agrees with it.
// ════════════════════════════════════════════════════════════════════════════
import { isTableBlocked } from '../lib/blockedGame'
export { isTableBlocked }

// ── Tiles, dealing, legal moves, Dekabess ───────────────────────────────────
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function generateDominoSet() {
  const tiles = []
  for (let a = 0; a <= 6; a++)
    for (let b = a; b <= 6; b++) tiles.push([a, b])
  return tiles
}

// ── Dealing for 2, 3 or 4 players (every tile dealt) ──
//   4 players: 7 each.  3 players: the 0-0 is set aside, 9 each.  2 players: 14 each.
// ── The pile variant (2 or 3 players): 7 tiles each, the rest face down in a
//    pile — a player who can't play draws instead of knocking.
export function dealTable(n = 4, variant = 'all') {
  if (variant === 'pile' && n < 4) {
    const tiles = shuffle(generateDominoSet())
    const hands = Array.from({ length: n }, (_, i) => tiles.slice(i * 7, i * 7 + 7))
    return { hands, pile: tiles.slice(n * 7) }
  }
  return { hands: dealHands(n), pile: [] }
}

export function dealHands(n = 4) {
  let tiles = shuffle(generateDominoSet())
  if (n === 3) {
    tiles = tiles.filter(t => !(t[0] === 0 && t[1] === 0))
    return [0, 1, 2].map(i => tiles.slice(i * 9, i * 9 + 9))
  }
  if (n === 2) return [0, 1].map(i => tiles.slice(i * 14, i * 14 + 14))
  return [0, 1, 2, 3].map(i => tiles.slice(i * 7, i * 7 + 7))
}

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function pipCount(hand) {
  return (hand || []).reduce((s, t) => s + t[0] + t[1], 0)
}

export function getPlayableTiles(hand, boardData, roomData) {
  // Round 1, first tile: must play 6-6 — or, with a pile, the double the room
  // names (the 6-6 may be in the pile; then the highest double opens)
  if (!boardData?.tiles?.length) {
    if (Array.isArray(roomData?.opening_tile)) {
      const [a, b] = roomData.opening_tile
      const req = hand.filter(t => (t[0] === a && t[1] === b) || (t[0] === b && t[1] === a))
      if (req.length) return req
    }
    if (roomData?.round === 1) {
      const doubleSix = hand.filter(t => t[0] === 6 && t[1] === 6)
      return doubleSix.length ? doubleSix : hand
    }
    return hand
  }
  const { left_end: L, right_end: R } = boardData
  return hand.filter(t => t[0] === L || t[1] === L || t[0] === R || t[1] === R)
}

export function canPlayOnSide(tile, side, boardData) {
  if (!boardData?.tiles?.length) return true
  const end = side === 'left' ? boardData.left_end : boardData.right_end
  return tile[0] === end || tile[1] === end
}

export function checkDekabess(tile, boardData) {
  if (!tile || tile[0] === tile[1] || !boardData) return false
  const { left_end: L, right_end: R } = boardData
  return (tile[0] === L && tile[1] === R) || (tile[1] === L && tile[0] === R)
}

function computeNewStreak(streak, resolvedSeat, isDek, mode) {
  const winnerKey = mode === 'asosye'
    ? (resolvedSeat === 0 || resolvedSeat === 2 ? 'A' : 'B')
    : resolvedSeat
  const sameWinner = mode === 'asosye' ? streak.team === winnerKey : streak.seat === winnerKey
  if (sameWinner) return { ...streak, count: streak.count + (isDek ? 2 : 1) }
  return { seat: resolvedSeat, team: winnerKey, count: isDek ? 2 : 1 }
}

// ── Main hook ───────────────────────────────────────────────────────────────

// ── A blocked round ─────────────────────────────────────────────────────────
// Nobody can play and nothing is left to draw: the lowest pip count wins; a
// tie goes to the lowest seat. hands: [seat] -> tiles (only the seats playing).
export function blockedWinner(hands) {
  let best = 0, bestPips = Infinity
  for (let s = 0; s < hands.length; s++) {
    const p = pipCount(hands[s] || [])
    if (p < bestPips) { bestPips = p; best = s }
  }
  return best
}

// ── Streaks and the Vyèj ─────────────────────────────────────────────────────
// A round won adds 1 to the winner's streak, a Dekabess adds 2; another
// winner (in Asosyé: the other team) starts their own count. 4 is a Vyèj.
// teamOf: how this mode writes a team — online 'A'/'B' (the default), Solo 0/1.
export const VYEJ = 4
export const teamLetter = seat => (seat % 2 === 0 ? 'A' : 'B')
export function nextStreak(streak, winner, isDek, { teams = false, teamOf = teamLetter } = {}) {
  const s = streak || { seat: null, team: null, count: 0 }
  const add = isDek ? 2 : 1
  const same = teams ? (s.team !== null && s.team !== undefined && s.team === teamOf(winner)) : s.seat === winner
  if (same) return { ...s, count: s.count + add }
  return { seat: winner, team: teams ? teamOf(winner) : winner, count: add }
}
export const isVyej = streak => (streak?.count || 0) >= VYEJ

// ── Who opens ───────────────────────────────────────────────────────────────
// A new game: whoever holds the 6-6 — or, when not every tile is dealt, the
// highest double dealt. (No double at all: seat 0.) Later rounds: the winner,
// and in Asosyé the winning team chooses between the winner and the partner.
export function firstOpener(hands) {
  for (let d = 6; d >= 0; d--) {
    const holder = hands.findIndex(h => (h || []).some(t => t[0] === d && t[1] === d))
    if (holder >= 0) return { seat: holder, tile: [d, d] }
  }
  return { seat: 0, tile: null }
}
// ── Who should open (Asosyé) ─────────────────────────────────────────────────
// When the winning team is two bots, they let the stronger hand open: a long
// run of one number (control of the table), doubles to lay down, and fewer
// pips to get caught with. Higher = better hand to open with.
export function openerStrength(hand) {
  const count = Array(7).fill(0)
  let doubles = 0, pipTotal = 0
  for (const t of hand || []) {
    pipTotal += t[0] + t[1]
    if (t[0] === t[1]) { doubles++; count[t[0]]++ }
    else { count[t[0]]++; count[t[1]]++ }
  }
  return Math.max(0, ...count) * 3 + doubles * 2 - pipTotal / 12
}
// the winner keeps the opening unless the partner's hand is clearly stronger
export function pickOpener(winnerSeat, winnerHand, partnerSeat, partnerHand) {
  return openerStrength(partnerHand) > openerStrength(winnerHand) + 0.5 ? partnerSeat : winnerSeat
}

// ── Where each player sits (as seen from my seat) ───────────────────────────
// 2 players: across. 3 players: right and left. 4 players: right, across, left.
export function seatSide(seat, mySeat, n) {
  const k = Math.max(2, Math.min(4, n || 4))
  const diff = ((seat - mySeat) % k + k) % k
  if (diff === 0) return 'bottom'
  if (k === 2) return 'top'
  if (k === 3) return diff === 1 ? 'right' : 'left'
  return ['bottom', 'right', 'top', 'left'][diff]
}
