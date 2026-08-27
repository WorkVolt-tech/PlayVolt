// Snake board layout math only
export const TW = 28
export const TH = 56
export const GAP = 3

function renderDims(entry, inCorner) {
  const isDouble = entry.tile[0] === entry.tile[1]
  return inCorner
    ? (isDouble ? { w: TH, h: TW } : { w: TW, h: TH })
    : (isDouble ? { w: TW, h: TH } : { w: TH, h: TW })
}

export function computeSnakePositions(tiles, W, H) {
  const MARGIN = 56
  const CORNER_STEPS = 3

  function renderDims(entry, inCorner) {
    const isDbl = entry.tile[0] === entry.tile[1]
    return inCorner
      ? (isDbl ? { w: TH, h: TW } : { w: TW, h: TH })
      : (isDbl ? { w: TW, h: TH } : { w: TH, h: TW })
  }

  function walk(tiles, startIdx, startX, startY, initDir) {
    const pos = []
    let x = startX, y = startY, dir = initDir, cornerLeft = 0

    for (let i = startIdx; i < tiles.length; i++) {
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
        if (!nextInCorner && entry.tile[0] === entry.tile[1]) {
          x = x + dir * (TH - TW) / 2
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

  if (tiles.length === 0) return []
  const cx = W / 2
  const cy = H / 2
  return walk(tiles, 0, cx, cy, 1)
}
