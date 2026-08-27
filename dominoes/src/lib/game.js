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
  if (!tiles || tiles.length === 0) return []
  const MARGIN = 40
  const CORNER_STEPS = 1
  const pos = []
  let x = 0, y = 0, dir = 1, cornerLeft = 0

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
      if (!nextInCorner) x = x + TW / 2 - nw / 2
      y = y + h / 2 + GAP + nh / 2
    } else {
      const { w: nw } = renderDims(next, false)
      const nextX = x + dir * (w / 2 + GAP + nw / 2)
      if (nextX - nw / 2 < -W / 2 + MARGIN || nextX + nw / 2 > W / 2 - MARGIN) {
        const cd = renderDims(next, true)
        x = x + dir * (w / 2 - cd.w / 2)
        dir *= -1
        cornerLeft = CORNER_STEPS - 1
        y = y + h / 2 + GAP + cd.h / 2
      } else {
        x = nextX
      }
    }
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  pos.forEach(p => {
    minX = Math.min(minX, p.x - p.pw / 2); maxX = Math.max(maxX, p.x + p.pw / 2)
    minY = Math.min(minY, p.y - p.ph / 2); maxY = Math.max(maxY, p.y + p.ph / 2)
  })
  const ox = (W - (maxX - minX)) / 2 - minX
  const oy = (H - (maxY - minY)) / 2 - minY
  pos.forEach(p => { p.x += ox; p.y += oy })
  return pos
}
