// Tile dimensions
export const TW = 28   // short side (portrait width / landscape height)
export const TH = 56   // long side
export const GAP = 3

// Generate a full domino set [0,0]..[6,6]
export function generateDominoSet() {
  const tiles = []
  for (let a = 0; a <= 6; a++)
    for (let b = a; b <= 6; b++) tiles.push([a, b])
  return tiles
}

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Pip count for a hand
export function pipCount(hand) {
  return (hand || []).reduce((s, t) => s + t[0] + t[1], 0)
}

// Which tiles in hand are playable given current board ends
export function getPlayableTiles(hand, boardData) {
  if (!boardData || !Array.isArray(boardData.tiles) || boardData.tiles.length === 0) return hand
  const { left_end: left, right_end: right } = boardData
  return hand.filter(t => t[0] === left || t[1] === left || t[0] === right || t[1] === right)
}

export function canPlayOnSide(tile, side, boardData) {
  if (!boardData || !boardData.tiles || boardData.tiles.length === 0) return true
  const end = side === 'left' ? boardData.left_end : boardData.right_end
  return tile[0] === end || tile[1] === end
}

// Check if placing this tile as the last one is a Dekabess
export function isDekabess(tile, boardData) {
  if (!tile || tile[0] === tile[1] || !boardData) return false
  const { left_end: left, right_end: right } = boardData
  return (tile[0] === left && tile[1] === right) || (tile[1] === left && tile[0] === right)
}

// Streak logic
export function computeNewStreak(streak, resolvedSeat, isDekabessMove, mode) {
  const winnerKey = mode === 'asosye'
    ? (resolvedSeat === 0 || resolvedSeat === 2 ? 'A' : 'B')
    : resolvedSeat

  const sameWinner = mode === 'asosye'
    ? streak.team === winnerKey
    : streak.seat === winnerKey

  if (sameWinner) {
    return { ...streak, count: streak.count + (isDekabessMove ? 2 : 1) }
  }
  return { seat: resolvedSeat, team: winnerKey, count: isDekabessMove ? 2 : 1 }
}

// ─── Snake board layout ───────────────────────────────────────────────────────
const CORNER_STEPS = 1
// MARGIN scales with screen width — tighter on mobile

function renderDims(entry, inCorner) {
  const isDouble = entry.tile[0] === entry.tile[1]
  return inCorner
    ? (isDouble ? { w: TH, h: TW } : { w: TW, h: TH })
    : (isDouble ? { w: TW, h: TH } : { w: TH, h: TW })
}

function walk(tiles, startX, startY, initDir, W) {
  const MARGIN = Math.max(24, W * 0.06)
  const pos = []
  let x = startX, y = startY, dir = initDir, cornerLeft = 0

  for (let i = 0; i < tiles.length; i++) {
    const entry = tiles[i]
    const inCorner = cornerLeft > 0
    const { w, h } = renderDims(entry, inCorner)
    pos.push({ x, y, dir: inCorner ? 0 : dir, pw: w, ph: h })

    if (i === tiles.length - 1) break
    const next = tiles[i + 1]

    if (inCorner) {
      cornerLeft--
      const nextInCorner = cornerLeft > 0
      const { w: nw, h: nh } = renderDims(next, nextInCorner)
      if (!nextInCorner) {
        // Shift so new row's right edge aligns with corner's right edge
        x = x + TW / 2 - nw / 2
      }
      y = y + h / 2 + GAP + nh / 2
    } else {
      const { w: nw, h: nh } = renderDims(next, false)
      const nextX = x + dir * (w / 2 + GAP + nw / 2)

      if (nextX - nw / 2 < MARGIN || nextX + nw / 2 > W - MARGIN) {
        const firstCornerDims = renderDims(next, true)
        x = x + dir * (w / 2 - firstCornerDims.w / 2)
        dir *= -1
        cornerLeft = CORNER_STEPS - 1
        y = y + h / 2 + GAP + firstCornerDims.h / 2
      } else {
        x = nextX
      }
    }
  }
  return pos
}

export function computeSnakePositions(tiles, W, H) {
  if (!tiles || tiles.length === 0) return []

  // First pass from origin to measure bounding box
  const raw = walk(tiles, 0, 0, 1, W)

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  raw.forEach(p => {
    minX = Math.min(minX, p.x - p.pw / 2)
    maxX = Math.max(maxX, p.x + p.pw / 2)
    minY = Math.min(minY, p.y - p.ph / 2)
    maxY = Math.max(maxY, p.y + p.ph / 2)
  })

  // Center the chain in the available space
  const chainW = maxX - minX
  const chainH = maxY - minY
  const offsetX = (W - chainW) / 2 - minX
  const offsetY = (H - chainH) / 2 - minY

  raw.forEach(p => { p.x += offsetX; p.y += offsetY })
  return raw
}
