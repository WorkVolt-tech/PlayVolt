import { useRef, useEffect, useState } from 'react'
import { canPlayOnSide } from '../hooks/useGameState'
import './Board.css'

// ─── Constants ────────────────────────────────────────────────────────────────
const TW = 28   // tile short side
const TH = 56   // tile long side
const GAP = 3

const DIR = {
  RIGHT: 'RIGHT',
  DOWN: 'DOWN',
  LEFT: 'LEFT',
  UP: 'UP',
}

function isHorizontalDirection(direction) {
  return direction === DIR.RIGHT || direction === DIR.LEFT
}

function oppositeDirection(direction) {
  if (direction === DIR.RIGHT) return DIR.LEFT
  if (direction === DIR.LEFT) return DIR.RIGHT
  if (direction === DIR.DOWN) return DIR.UP
  return DIR.DOWN
}

// ─── Orientation rules ────────────────────────────────────────────────────────
// The domino's orientation is based on the CURRENT DIRECTION OF PLAY.
//
// Horizontal run (RIGHT / LEFT):
//   - normal tile → horizontal
//   - double      → vertical
//
// Vertical run (DOWN / UP):
//   - normal tile → vertical
//   - double      → horizontal
//
// In other words: doubles are perpendicular to a STRAIGHT run.
//
// EXCEPTION — if the double itself is the corner/turning domino, it follows
// the NEW direction of travel:
//   - turning into RIGHT / LEFT → double is horizontal
//   - turning into DOWN / UP   → double is vertical
function tileOrientation(isDouble, direction, isTurning = false) {
  const horizontalDirection = isHorizontalDirection(direction)

  if (isDouble && isTurning) {
    return horizontalDirection ? 'horizontal' : 'vertical'
  }

  if (isDouble) {
    return horizontalDirection ? 'vertical' : 'horizontal'
  }

  return horizontalDirection ? 'horizontal' : 'vertical'
}

function tileDims(isDouble, direction, isTurning = false) {
  const orientation = tileOrientation(isDouble, direction, isTurning)
  const isVert = orientation === 'vertical'

  return {
    w: isVert ? TW : TH,
    h: isVert ? TH : TW,
    isVert,
    orientation,
  }
}

// Calculate the next center point. For straight runs the tiles are placed
// end-to-end. At a 90° turn the new tile is tucked against the outer half of
// the previous tile so the bend reads like a real tabletop domino chain.
function stepPosition(current, nextDims, nextDirection) {
  const { x, y, pw, ph, flowDir } = current
  const { w: nw, h: nh } = nextDims

  // Straight continuation.
  if (flowDir === nextDirection) {
    if (nextDirection === DIR.RIGHT) {
      return { x: x + pw / 2 + GAP + nw / 2, y }
    }
    if (nextDirection === DIR.LEFT) {
      return { x: x - pw / 2 - GAP - nw / 2, y }
    }
    if (nextDirection === DIR.DOWN) {
      return { x, y: y + ph / 2 + GAP + nh / 2 }
    }
    return { x, y: y - ph / 2 - GAP - nh / 2 }
  }

  // RIGHT → DOWN: put the vertical run under the right half of the last tile.
  if (flowDir === DIR.RIGHT && nextDirection === DIR.DOWN) {
    return {
      x: x + pw / 2 - nw / 2,
      y: y + ph / 2 + GAP + nh / 2,
    }
  }

  // LEFT → DOWN: put the vertical run under the left half of the last tile.
  if (flowDir === DIR.LEFT && nextDirection === DIR.DOWN) {
    return {
      x: x - pw / 2 + nw / 2,
      y: y + ph / 2 + GAP + nh / 2,
    }
  }

  // DOWN → LEFT: start the new row from the lower-left end of the vertical run.
  if (flowDir === DIR.DOWN && nextDirection === DIR.LEFT) {
    return {
      x: x - pw / 2 - GAP - nw / 2,
      y: y + ph / 2 - nh / 2,
    }
  }

  // DOWN → RIGHT: start the new row from the lower-right end of the vertical run.
  if (flowDir === DIR.DOWN && nextDirection === DIR.RIGHT) {
    return {
      x: x + pw / 2 + GAP + nw / 2,
      y: y + ph / 2 - nh / 2,
    }
  }

  // UP support, mainly so endpoint/drop-zone direction remains future-proof.
  if (flowDir === DIR.RIGHT && nextDirection === DIR.UP) {
    return {
      x: x + pw / 2 - nw / 2,
      y: y - ph / 2 - GAP - nh / 2,
    }
  }

  if (flowDir === DIR.LEFT && nextDirection === DIR.UP) {
    return {
      x: x - pw / 2 + nw / 2,
      y: y - ph / 2 - GAP - nh / 2,
    }
  }

  if (flowDir === DIR.UP && nextDirection === DIR.LEFT) {
    return {
      x: x - pw / 2 - GAP - nw / 2,
      y: y - ph / 2 + nh / 2,
    }
  }

  if (flowDir === DIR.UP && nextDirection === DIR.RIGHT) {
    return {
      x: x + pw / 2 + GAP + nw / 2,
      y: y - ph / 2 + nh / 2,
    }
  }

  return { x, y }
}

function withinHorizontalBounds(candidate, dims, W, margin) {
  return (
    candidate.x - dims.w / 2 >= margin &&
    candidate.x + dims.w / 2 <= W - margin
  )
}

// ─── Snake layout ─────────────────────────────────────────────────────────────
function computeSnakePositions(tiles, W, H) {
  if (!tiles || tiles.length === 0) return []

  // Protect the layout from a transient 0px ResizeObserver measurement.
  const boardW = Math.max(W || 0, 280)
  const boardH = Math.max(H || 0, 260)
  const MARGIN = Math.max(22, Math.min(42, boardW * 0.055))

  // A vertical section should be a real run, not a single fake "corner" tile.
  // This normally gives us about two regular vertical dominoes before the next
  // horizontal row begins.
  const VERTICAL_RUN_TARGET = Math.max(TH + GAP, Math.min(TH * 1.55, boardH * 0.14))

  const positions = []
  let flowDir = DIR.RIGHT
  let horizontalDir = DIR.RIGHT
  let verticalTravel = 0

  const firstEntry = tiles[0]
  const firstIsDouble = firstEntry.tile[0] === firstEntry.tile[1]
  const firstDims = tileDims(firstIsDouble, flowDir)

  // Lay out against the usable bounds first. The finished chain is centered
  // afterward, so a short opening line still appears in the middle of the table.
  let current = {
    x: MARGIN + firstDims.w / 2,
    y: MARGIN + firstDims.h / 2,
    pw: firstDims.w,
    ph: firstDims.h,
    isVert: firstDims.isVert,
    orientation: firstDims.orientation,
    isDouble: firstIsDouble,
    isTurning: false,
    flowDir,
  }
  positions.push(current)

  for (let i = 1; i < tiles.length; i++) {
    const entry = tiles[i]
    const isDouble = entry.tile[0] === entry.tile[1]
    let nextDirection = flowDir

    if (flowDir === DIR.RIGHT || flowDir === DIR.LEFT) {
      // First test whether another tile fits in the current horizontal run.
      let testDims = tileDims(isDouble, flowDir)
      let testPoint = stepPosition(current, testDims, flowDir)

      if (!withinHorizontalBounds(testPoint, testDims, boardW, MARGIN)) {
        // We actually turn DOWN. From this point normal tiles are vertical and
        // doubles are horizontal until the vertical run finishes.
        nextDirection = DIR.DOWN
        verticalTravel = 0
      }
    } else if (flowDir === DIR.DOWN) {
      // Stay vertical long enough to visibly clear the previous row.
      if (verticalTravel >= VERTICAL_RUN_TARGET) {
        nextDirection = horizontalDir === DIR.RIGHT ? DIR.LEFT : DIR.RIGHT
        horizontalDir = nextDirection
        verticalTravel = 0
      }
    } else if (flowDir === DIR.UP) {
      // UP is supported for completeness; resume the opposite horizontal row.
      if (verticalTravel >= VERTICAL_RUN_TARGET) {
        nextDirection = horizontalDir === DIR.RIGHT ? DIR.LEFT : DIR.RIGHT
        horizontalDir = nextDirection
        verticalTravel = 0
      }
    }

    // If this tile is the actual turning/corner tile, doubles follow the NEW
    // direction instead of using the normal perpendicular-double rule.
    let isTurning = nextDirection !== flowDir
    let nextDims = tileDims(isDouble, nextDirection, isTurning)
    let nextPoint = stepPosition(current, nextDims, nextDirection)

    // If a horizontal row is being entered from a vertical run but the chosen
    // side is already too close to the wall, continue vertically instead of
    // forcing an overlap/out-of-bounds tile.
    if (
      (nextDirection === DIR.RIGHT || nextDirection === DIR.LEFT) &&
      !withinHorizontalBounds(nextPoint, nextDims, boardW, MARGIN)
    ) {
      nextDirection = DIR.DOWN
      verticalTravel = 0
      // Recalculate because the attempted turn may have been cancelled.
      isTurning = nextDirection !== flowDir
      const fallbackDims = tileDims(isDouble, nextDirection, isTurning)
      nextPoint = stepPosition(current, fallbackDims, nextDirection)

      current = {
        x: nextPoint.x,
        y: nextPoint.y,
        pw: fallbackDims.w,
        ph: fallbackDims.h,
        isVert: fallbackDims.isVert,
        orientation: fallbackDims.orientation,
        isDouble,
        isTurning,
        flowDir: nextDirection,
      }
    } else {
      current = {
        x: nextPoint.x,
        y: nextPoint.y,
        pw: nextDims.w,
        ph: nextDims.h,
        isVert: nextDims.isVert,
        orientation: nextDims.orientation,
        isDouble,
        isTurning,
        flowDir: nextDirection,
      }
    }

    positions.push(current)

    if (current.flowDir === DIR.DOWN || current.flowDir === DIR.UP) {
      verticalTravel += current.ph + GAP
    }

    flowDir = current.flowDir
  }

  // Center the completed chain as a group. This fixes the old layout's tendency
  // to collapse into a narrow center column while still keeping the whole snake
  // inside the visible board whenever it fits.
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  positions.forEach(p => {
    minX = Math.min(minX, p.x - p.pw / 2)
    maxX = Math.max(maxX, p.x + p.pw / 2)
    minY = Math.min(minY, p.y - p.ph / 2)
    maxY = Math.max(maxY, p.y + p.ph / 2)
  })

  const chainW = maxX - minX
  const chainH = maxY - minY
  const usableW = Math.max(0, boardW - MARGIN * 2)
  const usableH = Math.max(0, boardH - MARGIN * 2)

  const offsetX = chainW <= usableW
    ? (boardW - chainW) / 2 - minX
    : MARGIN - minX

  const offsetY = chainH <= usableH
    ? (boardH - chainH) / 2 - minY
    : MARGIN - minY

  positions.forEach(p => {
    p.x += offsetX
    p.y += offsetY
  })

  return positions
}

// ─── Single tile renderer ─────────────────────────────────────────────────────
function BoardTile({ entry, pos, ghost = false, highlighted = false }) {
  const { isDouble, flowDir, orientation } = pos
  const isVert = orientation ? orientation === 'vertical' : pos.isVert

  let [first, second] = entry.tile

  if (!isDouble) {
    // entry.flipped represents the logical orientation in the chain.
    // When the visual snake travels LEFT or UP, reverse the visual order so
    // matching halves still face the neighboring domino.
    const logicalFlip = !!entry.flipped
    const visualReverse = flowDir === DIR.LEFT || flowDir === DIR.UP

    if (logicalFlip !== visualReverse) {
      first = entry.tile[1]
      second = entry.tile[0]
    }
  }

  return (
    <div style={{
      position: 'absolute',
      left: pos.x - pos.pw / 2,
      top: pos.y - pos.ph / 2,
      width: pos.pw,
      height: pos.ph,
      background: '#fffef8',
      borderRadius: 5,
      border: ghost ? '1px dashed rgba(201,168,76,0.9)' : 'none',
      boxShadow: highlighted
        ? '0 0 0 3px rgba(201,168,76,0.20), 0 4px 14px rgba(0,0,0,0.45)'
        : ghost
          ? '0 0 0 2px rgba(201,168,76,0.10)'
          : '0 3px 10px rgba(0,0,0,0.5)',
      opacity: ghost ? (highlighted ? 0.88 : 0.48) : 1,
      pointerEvents: 'none',
      display: 'grid',
      gridTemplateRows: isVert ? '1fr 1fr' : 'none',
      gridTemplateColumns: isVert ? 'none' : '1fr 1fr',
      overflow: 'hidden',
      zIndex: 1,
    }}>
      {/* Divider */}
      <div style={{
        position: 'absolute',
        ...(isVert
          ? { left: '10%', right: '10%', top: '50%', height: 1, transform: 'translateY(-50%)' }
          : { top: '10%', bottom: '10%', left: '50%', width: 1, transform: 'translateX(-50%)' }
        ),
        background: 'rgba(26,24,20,0.25)',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={`/tiles-white/${first}.png`}
          alt={String(first)}
          style={{
            width: '70%',
            height: '70%',
            objectFit: 'contain',
            ...(!isVert && first === 6 ? { transform: 'rotate(90deg)' } : {}),
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={`/tiles-white/${second}.png`}
          alt={String(second)}
          style={{
            width: '70%',
            height: '70%',
            objectFit: 'contain',
            ...(!isVert && second === 6 ? { transform: 'rotate(90deg)' } : {}),
          }}
        />
      </div>
    </div>
  )
}


function shiftedPosition(pos, dx, dy) {
  if (!pos) return null
  return { ...pos, x: pos.x + dx, y: pos.y + dy }
}

// Build the EXACT position the current snake algorithm would use for a new
// domino, then translate that preview so the already-rendered endpoint stays
// fixed. This lets the player drag directly onto the place where the domino
// will land instead of aiming at a generic "Left" / "Right" button.
function computeDropPreview(tiles, positions, candidateTile, side, W, H) {
  if (!candidateTile || !positions.length) return null

  const candidate = { tile: candidateTile, flipped: false }

  if (side === 'right') {
    const simulated = computeSnakePositions([...tiles, candidate], W, H)
    if (simulated.length < 2) return null

    const simulatedAnchor = simulated[simulated.length - 2]
    const actualAnchor = positions[positions.length - 1]
    const preview = simulated[simulated.length - 1]

    return shiftedPosition(
      preview,
      actualAnchor.x - simulatedAnchor.x,
      actualAnchor.y - simulatedAnchor.y,
    )
  }

  if (side === 'left') {
    const simulated = computeSnakePositions([candidate, ...tiles], W, H)
    if (simulated.length < 2) return null

    // simulated[1] is the original first tile. Pin it to its currently drawn
    // position, then shift the new simulated first tile by the same amount.
    const simulatedAnchor = simulated[1]
    const actualAnchor = positions[0]
    const preview = simulated[0]

    return shiftedPosition(
      preview,
      actualAnchor.x - simulatedAnchor.x,
      actualAnchor.y - simulatedAnchor.y,
    )
  }

  return null
}

function getDropHitStyle(pos, boardW, boardH) {
  const pad = 14
  const minHit = 48
  const width = Math.max(minHit, pos.pw + pad * 2)
  const height = Math.max(minHit, pos.ph + pad * 2)

  return {
    left: Math.max(2, Math.min(boardW - width - 2, pos.x - width / 2)),
    top: Math.max(2, Math.min(boardH - height - 2, pos.y - height / 2)),
    width,
    height,
  }
}

function distanceSquaredToPos(x, y, pos) {
  const dx = x - pos.x
  const dy = y - pos.y
  return dx * dx + dy * dy
}

function getDropZoneStyle(pos, outwardDirection, boardW, boardH) {
  const ZW = 68
  const ZH = 44
  const OFFSET = 7

  let left = pos.x - ZW / 2
  let top = pos.y - ZH / 2

  if (outwardDirection === DIR.RIGHT) {
    left = pos.x + pos.pw / 2 + OFFSET
  } else if (outwardDirection === DIR.LEFT) {
    left = pos.x - pos.pw / 2 - OFFSET - ZW
  } else if (outwardDirection === DIR.DOWN) {
    top = pos.y + pos.ph / 2 + OFFSET
  } else if (outwardDirection === DIR.UP) {
    top = pos.y - pos.ph / 2 - OFFSET - ZH
  }

  return {
    left: Math.max(4, Math.min(boardW - ZW - 4, left)),
    top: Math.max(4, Math.min(boardH - ZH - 4, top)),
    width: ZW,
    height: ZH,
  }
}

function dropZoneLabel(side, direction) {
  const arrow = {
    [DIR.RIGHT]: '→',
    [DIR.LEFT]: '←',
    [DIR.DOWN]: '↓',
    [DIR.UP]: '↑',
  }[direction]

  return side === 'left' ? `${arrow} Left` : `Right ${arrow}`
}

// ─── Drag payload helpers ─────────────────────────────────────────────────────
//
// The previous drag/drop version depended entirely on the parent `dragging`
// prop being populated before the pointer reached the board. If that state was
// missing or one render late, Board never called preventDefault() in dragOver,
// so the browser refused to fire drop at all.
//
// This version accepts the drag at the BOARD level first, then resolves the
// domino from either:
//   1) the parent `dragging` prop/ref, or
//   2) HTML5 dataTransfer payloads.
//
// This makes Board a real drop receiver instead of depending on one React state
// timing path.
function sameTile(a, b) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length >= 2 &&
    b.length >= 2 &&
    Number(a[0]) === Number(b[0]) &&
    Number(a[1]) === Number(b[1])
  )
}

function normalizeTile(tile) {
  if (!Array.isArray(tile) || tile.length < 2) return null

  const a = Number(tile[0])
  const b = Number(tile[1])

  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return [a, b]
}

function normalizeDragPayload(value) {
  if (!value) return null

  // Already in the shape Board expects.
  if (typeof value === 'object' && !Array.isArray(value)) {
    const tile = normalizeTile(value.tile || value.domino || value.values)
    if (!tile) return null

    const rawIdx = value.idx ?? value.index ?? value.handIndex
    const parsedIdx = rawIdx === undefined || rawIdx === null || rawIdx === ''
      ? null
      : Number(rawIdx)

    return {
      tile,
      idx: Number.isInteger(parsedIdx) ? parsedIdx : null,
    }
  }

  // Allow a bare [a,b] payload.
  if (Array.isArray(value)) {
    const tile = normalizeTile(value)
    return tile ? { tile, idx: null } : null
  }

  if (typeof value !== 'string') return null

  const raw = value.trim()
  if (!raw) return null

  // JSON payloads:
  // {"tile":[6,4],"idx":2}
  // [6,4]
  try {
    const parsed = JSON.parse(raw)
    const normalized = normalizeDragPayload(parsed)
    if (normalized) return normalized
  } catch {
    // Not JSON — try a compact text domino format below.
  }

  // Compact payload fallback: 6|4, 6-4, 6,4, 6/4
  const match = raw.match(/^\s*(\d+)\s*[\|\-,/:]\s*(\d+)(?:\s*[\|\-,/:]\s*(\d+))?\s*$/)
  if (!match) return null

  const tile = [Number(match[1]), Number(match[2])]
  const idx = match[3] !== undefined ? Number(match[3]) : null

  return {
    tile,
    idx: Number.isInteger(idx) ? idx : null,
  }
}

function readTransferPayload(dataTransfer) {
  if (!dataTransfer) return null

  const preferredTypes = [
    'application/x-domino',
    'application/json',
    'text/plain',
    'text',
  ]

  for (const type of preferredTypes) {
    try {
      const raw = dataTransfer.getData(type)
      const parsed = normalizeDragPayload(raw)
      if (parsed) return parsed
    } catch {
      // Some browsers restrict reading drag data outside the drop event.
    }
  }

  return null
}

function mergeDragPayload(primary, fallback, selectedTile) {
  const p = normalizeDragPayload(primary)
  const f = normalizeDragPayload(fallback)
  const s = normalizeDragPayload(selectedTile)

  const result = p || f || s
  if (!result) return null

  // If the transfer only contains tile values, recover the hand index from the
  // React drag state / selected tile when they refer to the same domino.
  if (result.idx === null) {
    if (f?.idx !== null && sameTile(result.tile, f?.tile)) {
      result.idx = f.idx
    } else if (s?.idx !== null && sameTile(result.tile, s?.tile)) {
      result.idx = s.idx
    }
  }

  return result
}

// ─── Board component ──────────────────────────────────────────────────────────
export default function Board({ boardData, selectedTile, dragging, isMyTurn, onDropZone, onDragPlace }) {
  const areaRef = useRef(null)
  const [dims, setDims] = useState({ w: 800, h: 400 })
  const [dragOver, setDragOver] = useState(null)

  // Native HTML5 drag data recovered from dataTransfer. This is intentionally
  // separate from the parent `dragging` prop so previews can still appear when
  // the parent drag state is delayed or absent.
  const [nativeDragging, setNativeDragging] = useState(null)

  const draggingRef = useRef(null)
  const selectedTileRef = useRef(null)
  const onDragPlaceRef = useRef(onDragPlace)
  const boardDataRef = useRef(boardData)

  useEffect(() => { onDragPlaceRef.current = onDragPlace }, [onDragPlace])
  useEffect(() => { draggingRef.current = dragging }, [dragging])
  useEffect(() => { selectedTileRef.current = selectedTile }, [selectedTile])
  useEffect(() => { boardDataRef.current = boardData }, [boardData])

  useEffect(() => {
    const el = areaRef.current
    if (!el) return

    const ro = new ResizeObserver(([e]) => {
      setDims({ w: e.contentRect.width, h: e.contentRect.height })
    })

    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const tiles = boardData?.tiles || []
  const hasTiles = tiles.length > 0
  const hasTilesRef = useRef(hasTiles)

  useEffect(() => { hasTilesRef.current = hasTiles }, [hasTiles])

  function getEventDragData(e) {
    const transfer = readTransferPayload(e?.dataTransfer)
    return mergeDragPayload(
      transfer,
      draggingRef.current,
      selectedTileRef.current,
    )
  }

  function getPayloadIndex(data) {
    if (!data) return null
    if (Number.isInteger(data.idx)) return data.idx

    const liveDragging = normalizeDragPayload(draggingRef.current)
    if (liveDragging?.idx !== null && sameTile(data.tile, liveDragging.tile)) {
      return liveDragging.idx
    }

    const liveSelected = normalizeDragPayload(selectedTileRef.current)
    if (liveSelected?.idx !== null && sameTile(data.tile, liveSelected.tile)) {
      return liveSelected.idx
    }

    return null
  }

  function placeDraggedDomino(data, side) {
    if (!data?.tile || !onDragPlaceRef.current) return false

    const currentBoard = boardDataRef.current
    const currentTiles = currentBoard?.tiles || []

    if (side !== 'first') {
      if (!currentTiles.length) return false
      if (side !== 'left' && side !== 'right') return false
      if (!canPlayOnSide(data.tile, side, currentBoard)) return false
    } else if (currentTiles.length) {
      return false
    }

    const idx = getPayloadIndex(data)

    // onDragPlace historically receives (tile, handIndex, side). Do not silently
    // invent a hand index because that can remove the wrong domino from the hand.
    if (idx === null) {
      console.warn(
        'Domino drop reached Board, but no hand index was provided. ' +
        'The drag source should pass { tile: [a,b], idx } through the dragging prop ' +
        'or dataTransfer.'
      )
      return false
    }

    onDragPlaceRef.current(data.tile, idx, side)
    return true
  }

  // Keep support for the app's existing custom touch-drop event. Unlike the old
  // version, this now supports left/right targets too, not just the empty board.
  useEffect(() => {
    const el = areaRef.current
    if (!el) return

    const onTouchBoard = (e) => {
      const data = mergeDragPayload(
        e?.detail?.dragging || e?.detail,
        draggingRef.current,
        selectedTileRef.current,
      )
      if (!data) return

      if (!hasTilesRef.current) {
        placeDraggedDomino(data, 'first')
        return
      }

      const side =
        e?.target?.dataset?.dropSide ||
        e?.detail?.side ||
        null

      if (side === 'left' || side === 'right') {
        placeDraggedDomino(data, side)
      }
    }

    el.addEventListener('tile-touch-drop-board', onTouchBoard)
    return () => el.removeEventListener('tile-touch-drop-board', onTouchBoard)
  }, [])

  const positions = hasTiles ? computeSnakePositions(tiles, dims.w, dims.h) : []

  // Use the newest available drag source for previews. `dragging` is preferred,
  // then native dataTransfer recovery, then selectedTile for click placement.
  const activePlay =
    normalizeDragPayload(dragging) ||
    normalizeDragPayload(nativeDragging) ||
    normalizeDragPayload(selectedTile)

  const activeTile = activePlay?.tile || null

  const canLeft = !!(
    activeTile &&
    isMyTurn &&
    canPlayOnSide(activeTile, 'left', boardData)
  )

  const canRight = !!(
    activeTile &&
    isMyTurn &&
    canPlayOnSide(activeTile, 'right', boardData)
  )

  const previewLeft = canLeft
    ? computeDropPreview(tiles, positions, activeTile, 'left', dims.w, dims.h)
    : null

  const previewRight = canRight
    ? computeDropPreview(tiles, positions, activeTile, 'right', dims.w, dims.h)
    : null

  const firstPreview = !hasTiles && activeTile
    ? (() => {
        const isDouble = activeTile[0] === activeTile[1]
        const d = tileDims(isDouble, DIR.RIGHT)

        return {
          x: dims.w / 2,
          y: dims.h / 2,
          pw: d.w,
          ph: d.h,
          isVert: d.isVert,
          orientation: d.orientation,
          isDouble,
          isTurning: false,
          flowDir: DIR.RIGHT,
        }
      })()
    : null

  function recoverNativeDrag(e) {
    const recovered = readTransferPayload(e?.dataTransfer)
    if (!recovered) return

    const merged = mergeDragPayload(
      recovered,
      draggingRef.current,
      selectedTileRef.current,
    )

    if (
      merged &&
      (
        !nativeDragging ||
        !sameTile(nativeDragging.tile, merged.tile) ||
        nativeDragging.idx !== merged.idx
      )
    ) {
      setNativeDragging(merged)
    }
  }

  function handleTargetDrop(e, side) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(null)

    const data = getEventDragData(e)
    if (!data || !isMyTurn) return

    placeDraggedDomino(data, side)
    setNativeDragging(null)
  }

  function getDynamicPreview(data, side) {
    if (!data?.tile || !positions.length) return null

    const currentBoard = boardDataRef.current
    if (!canPlayOnSide(data.tile, side, currentBoard)) return null

    return computeDropPreview(
      currentBoard?.tiles || [],
      positions,
      data.tile,
      side,
      dims.w,
      dims.h,
    )
  }

  function resolveNearestDropSide(e, data) {
    if (!areaRef.current || !data?.tile || !positions.length) return null

    const rect = areaRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const candidates = []

    const left = getDynamicPreview(data, 'left')
    if (left) {
      candidates.push({
        side: 'left',
        d2: distanceSquaredToPos(x, y, left),
      })
    }

    const right = getDynamicPreview(data, 'right')
    if (right) {
      candidates.push({
        side: 'right',
        d2: distanceSquaredToPos(x, y, right),
      })
    }

    if (!candidates.length) return null

    candidates.sort((a, b) => a.d2 - b.d2)

    // Generous snap radius: the player drops near the intended open end; the
    // domino then snaps into the exact calculated legal position.
    const MAX_DISTANCE = 110

    return candidates[0].d2 <= MAX_DISTANCE * MAX_DISTANCE
      ? candidates[0].side
      : null
  }

  function handleBoardDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(null)
    console.log('[Board] drop fired, isMyTurn:', isMyTurn, 'draggingRef:', draggingRef.current)

    if (!isMyTurn) return

    const data = getEventDragData(e)
    console.log('[Board] resolved data:', data)
    if (!data) {
      setNativeDragging(null)
      return
    }

    if (!hasTiles) {
      placeDraggedDomino(data, 'first')
      setNativeDragging(null)
      return
    }

    // If the pointer is over an explicit target, prefer that target. Otherwise
    // snap to the nearest legal open end.
    const explicitSide = e.target?.closest?.('[data-drop-side]')?.dataset?.dropSide

    const side =
      explicitSide === 'left' || explicitSide === 'right'
        ? explicitSide
        : resolveNearestDropSide(e, data)

    if (side) {
      placeDraggedDomino(data, side)
    }

    setNativeDragging(null)
  }

  return (
    <div
      className={`board-area ${dragging || nativeDragging ? 'drag-active' : ''}`}
      ref={areaRef}
      onDragEnter={e => {
        if (!isMyTurn) return

        // Crucial: a valid HTML5 drop target must cancel dragEnter/dragOver.
        e.preventDefault()
        recoverNativeDrag(e)
      }}
      onDragOver={e => {
        if (!isMyTurn) return
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
        recoverNativeDrag(e)
      }}
      onDragLeave={e => {
        // Do not clear state while merely moving between children inside board.
        if (areaRef.current?.contains(e.relatedTarget)) return
        setDragOver(null)
        setNativeDragging(null)
      }}
      onDrop={handleBoardDrop}
    >
      {!hasTiles && (
        <div className="board-hint">
          <span className="board-hint-text">
            {isMyTurn ? 'Drag a tile here to start' : 'Waiting for first tile…'}
          </span>
        </div>
      )}

      {positions.map((pos, i) => (
        <BoardTile key={i} entry={tiles[i]} pos={pos} />
      ))}

      {!hasTiles && firstPreview && (
        <>
          <BoardTile
            entry={{ tile: activeTile, flipped: false }}
            pos={firstPreview}
            ghost
            highlighted={dragOver === 'first'}
          />

          <div
            className={`domino-drop-target ${dragOver === 'first' ? 'drag-over' : ''}`}
            data-drop-side="first"
            style={getDropHitStyle(firstPreview, dims.w, dims.h)}
            onDragEnter={e => {
              e.preventDefault()
              e.stopPropagation()
              recoverNativeDrag(e)
              setDragOver('first')
            }}
            onDragOver={e => {
              e.preventDefault()
              e.stopPropagation()
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
              recoverNativeDrag(e)
              setDragOver('first')
            }}
            onDragLeave={e => {
              if (e.currentTarget.contains(e.relatedTarget)) return
              setDragOver(null)
            }}
            onDrop={e => handleTargetDrop(e, 'first')}
            aria-label="Drop first domino here"
          />
        </>
      )}

      {canLeft && previewLeft && (
        <>
          <BoardTile
            entry={{ tile: activeTile, flipped: false }}
            pos={previewLeft}
            ghost
            highlighted={dragOver === 'left'}
          />

          <div
            className={`domino-drop-target ${dragOver === 'left' ? 'drag-over' : ''}`}
            data-drop-side="left"
            style={getDropHitStyle(previewLeft, dims.w, dims.h)}
            onClick={() => onDropZone?.('left')}
            onDragEnter={e => {
              e.preventDefault()
              e.stopPropagation()
              recoverNativeDrag(e)
              setDragOver('left')
            }}
            onDragOver={e => {
              e.preventDefault()
              e.stopPropagation()
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
              recoverNativeDrag(e)
              setDragOver('left')
            }}
            onDragLeave={e => {
              if (e.currentTarget.contains(e.relatedTarget)) return
              setDragOver(null)
            }}
            onDrop={e => handleTargetDrop(e, 'left')}
            aria-label="Drop domino on left open end"
          />
        </>
      )}

      {canRight && previewRight && (
        <>
          <BoardTile
            entry={{ tile: activeTile, flipped: false }}
            pos={previewRight}
            ghost
            highlighted={dragOver === 'right'}
          />

          <div
            className={`domino-drop-target ${dragOver === 'right' ? 'drag-over' : ''}`}
            data-drop-side="right"
            style={getDropHitStyle(previewRight, dims.w, dims.h)}
            onClick={() => onDropZone?.('right')}
            onDragEnter={e => {
              e.preventDefault()
              e.stopPropagation()
              recoverNativeDrag(e)
              setDragOver('right')
            }}
            onDragOver={e => {
              e.preventDefault()
              e.stopPropagation()
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
              recoverNativeDrag(e)
              setDragOver('right')
            }}
            onDragLeave={e => {
              if (e.currentTarget.contains(e.relatedTarget)) return
              setDragOver(null)
            }}
            onDrop={e => handleTargetDrop(e, 'right')}
            aria-label="Drop domino on right open end"
          />
        </>
      )}
    </div>
  )
}
