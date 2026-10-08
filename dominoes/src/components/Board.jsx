import { useRef, useEffect, useState } from 'react'
import { canPlayOnSide } from '../hooks/useGameState'
import { DropZone, useDrag } from './DragDrop'
import TileFace from './TileFace'
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
// ── Lanes for the players' hands ────────────────────────────────────────────
// Opponents' hands sit at the table's edge. The chain must never run under
// them, so the board lays the chain out inside the area that's left — like a
// player's spot at a real table — and shifts it into place.
// reserve = { left, right, top, bottom } in px, measured from the hands.
const NO_RESERVE = { left: 0, right: 0, top: 0, bottom: 0 }
// scale < 1 shrinks the tiles so a long chain fits the table: the chain is
// laid out exactly as usual on a proportionally larger imaginary table,
// then the whole layout is scaled down — every turn and gap stays the same.
function computeSnakePositions(tiles, W, H, reserve = NO_RESERVE, scale = 1) {
  const r = reserve || NO_RESERVE
  const w = Math.max(160, (W || 0) - r.left - r.right)
  const h = Math.max(120, (H || 0) - r.top - r.bottom)
  if (scale === 1) {
    if (!r.left && !r.top) return layoutSnake(tiles, w, h)
    return layoutSnake(tiles, w, h).map(p => ({ ...p, x: p.x + r.left, y: p.y + r.top }))
  }
  return layoutSnake(tiles, w / scale, h / scale).map(p => ({
    ...p, x: p.x * scale + r.left, y: p.y * scale + r.top, pw: p.pw * scale, ph: p.ph * scale,
  }))
}

// The largest tile size (from full size down) at which the whole chain fits
// the table without scrolling. Steps down gently; the floor keeps tiles
// recognisable. Only if even the floor can't fit does the table scroll.
const FIT_STEPS = [1, 0.92, 0.85, 0.78, 0.72, 0.66, 0.6, 0.55, 0.5, 0.46, 0.42, 0.38, 0.35]
function fitScale(tiles, W, H, reserve) {
  if (!tiles?.length) return 1
  // the same room below the chain that the scroll rule asks for (28px), so
  // "fits" here always means "no scrolling" there
  const pad = 6, below = 28
  for (const sc of FIT_STEPS) {
    const ps = computeSnakePositions(tiles, W, H, reserve, sc)
    const fits = ps.every(p => p.y - p.ph / 2 >= pad && p.y + p.ph / 2 + below <= H && p.x - p.pw / 2 >= pad && p.x + p.pw / 2 <= W - pad)
    if (fits) return sc
  }
  return FIT_STEPS[FIT_STEPS.length - 1]
}

function layoutSnake(tiles, W, H) {
  if (!tiles || tiles.length === 0) return []

  // Protect the layout from a transient 0px ResizeObserver measurement —
  // but ONLY that. The height used to be floored at 260px, so on a phone held
  // sideways (a table ~150px tall) the chain was centred as if there were
  // 260px, which put it at the bottom edge, under the hand.
  const boardW = W > 40 ? W : 280      // (only against a transient 0px measurement)
  const boardH = H > 40 ? H : 260
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
// Where a freshly played tile slides in from: the side of the table its
// player sits on ('bottom' = you). Distances are in px, toward the table edge.
const SLIDE_FROM = { bottom: [0, 260], top: [0, -260], left: [-300, 0], right: [300, 0] }

function BoardTile({ entry, pos, ghost = false, highlighted = false, fresh = false, freshFrom = null, travel = null, jolt = null, hidden = false }) {
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
    <div
      className={travel ? 'dek-travel' : jolt ? 'tile-jolt' : fresh ? (SLIDE_FROM[freshFrom] ? 'tile-fresh tile-slide' : 'tile-fresh') : undefined} style={{
        ...(fresh && !travel && !jolt && SLIDE_FROM[freshFrom] ? { '--slide-x': `${SLIDE_FROM[freshFrom][0]}px`, '--slide-y': `${SLIDE_FROM[freshFrom][1]}px` } : {}),
        ...(travel ? { '--tx': `${travel.dx}px`, '--ty': `${travel.dy}px`, zIndex: 60 } : {}),
        ...(jolt ? { '--jx': `${jolt.x}px`, '--jy': `${jolt.y}px`, '--jr': `${jolt.r}deg` } : {}),
        // visibility, not opacity: the tile's own drop-in/slide animation sets
        // opacity and would override it, leaving the original showing
        ...(hidden ? { visibility: 'hidden' } : {}),
      position: 'absolute',
      left: pos.x - pos.pw / 2,
      top: pos.y - pos.ph / 2,
      width: pos.pw,
      height: pos.ph,
      background: 'transparent',
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
      {/* the face, in the equipped skin (drawn in code, not pictures) */}
      <TileFace a={first} b={second} vertical={isVert} />
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
function computeDropPreview(tiles, positions, candidateTile, side, W, H, boardData, reserve = NO_RESERVE, scale = 1) {
  if (!candidateTile || !positions.length) return null

  // Calculate correct flip — same logic as confirmPlace
  let flipped = false
  if (boardData && boardData.tiles?.length) {
    const end = side === 'left' ? boardData.left_end : boardData.right_end
    if (side === 'right') {
      flipped = candidateTile[1] === end
    } else {
      flipped = candidateTile[0] === end
    }
  }
  const candidate = { tile: candidateTile, flipped }

  if (side === 'right') {
    const simulated = computeSnakePositions([...tiles, candidate], W, H, reserve, scale)
    if (simulated.length < 2) return null

    const simulatedAnchor = simulated[simulated.length - 2]
    const actualAnchor = positions[positions.length - 1]
    const preview = simulated[simulated.length - 1]

    const shifted = shiftedPosition(
      preview,
      actualAnchor.x - simulatedAnchor.x,
      actualAnchor.y - simulatedAnchor.y,
    )
    return shifted ? { ...shifted, flipped } : null
  }

  if (side === 'left') {
    const simulated = computeSnakePositions([candidate, ...tiles], W, H, reserve, scale)
    if (simulated.length < 2) return null

    // simulated[1] is the original first tile. Pin it to its currently drawn
    // position, then shift the new simulated first tile by the same amount.
    const simulatedAnchor = simulated[1]
    const actualAnchor = positions[0]
    const preview = simulated[0]

    const shifted2 = shiftedPosition(
      preview,
      actualAnchor.x - simulatedAnchor.x,
      actualAnchor.y - simulatedAnchor.y,
    )
    return shifted2 ? { ...shifted2, flipped } : null
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
// ── The Dekabess on the table ────────────────────────────────────────────────
// When dekabessKey changes, the board plays its part before the celebration:
// the winning tile travels to the other end of the chain and back, then the
// hand slams the table twice and every tile jumps — then settles back exactly
// where it was. onDekabessDone is called when it's over.
const DEK_TRAVEL_MS = 1800      // slow enough to follow the tile to the far end and back
const DEK_SLAM_MS = 1300

// The hand comes in from the Dekabess player's side of the table, turned
// toward the table like the knock: 'bottom' = you.
const SLAM_TURN = { bottom: '0deg', left: '90deg', top: '180deg', right: '-90deg' }

export default function Board({ boardData, selectedTile, isMyTurn, onDropZone, onDragPlace, freshFrom = null, dekabessKey = null, onDekabessDone = null, dekabessFrom = 'top' }) {
  const { draggingRef, endDrag } = useDrag()

  // Tap-to-place: tapping a highlighted side places the SELECTED tile there.
  // The screens have always handed the board an onDropZone for this, but the
  // board never called it — so dragging was the only way to play a tile.
  const onDropZoneRef = useRef(onDropZone)
  onDropZoneRef.current = onDropZone
  const lastDropAt = useRef(0)
  function tapSide(side) {
    if (!isMyTurn) return
    // A drag that ends over a zone also produces a click — ignore that one.
    if (Date.now() - lastDropAt.current < 500) return
    onDropZoneRef.current?.(side)
  }

  function commitDrop(data, side) {
    lastDropAt.current = Date.now()
    if (!data?.tile) return
    const idx = typeof data.idx === 'number' ? data.idx : 0
    onDragPlaceRef.current?.(data.tile, idx, side)
  }

  // Listen for custom-drop events on our drop zones
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    function onCustomDrop(e) {
      const side = e.target?.closest?.('[data-drop-side]')?.dataset?.dropSide
      if (!side) return
      const data = draggingRef.current
      if (data) commitDrop(data, side)
    }
    el.addEventListener('custom-drop', onCustomDrop, true)
    return () => el.removeEventListener('custom-drop', onCustomDrop, true)
  }, [])
  const areaRef = useRef(null)
  const [dims, setDims] = useState({ w: 800, h: 400 })

  // Where the opponents' hands are, so the chain stays out of their lanes.
  // Measured from the hands themselves (they're drawn beside the board), so
  // it adapts: a two-player game only reserves the strip across the table.
  // On a short table (a phone on its side) the top strip isn't reserved —
  // height is too scarce there — only the sides.
  const [reserve, setReserve] = useState(NO_RESERVE)
  useEffect(() => {
    const area = areaRef.current
    const host = area?.parentElement
    if (!area || !host) return
    let raf = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const a = area.getBoundingClientRect()
        const r = { left: 0, right: 0, top: 0, bottom: 0 }
        const pad = 6
        const box = sel => {
          const el = host.querySelector(sel)
          const b = el && el.getBoundingClientRect()
          return b && b.width > 0 && b.height > 0 ? b : null
        }
        const L = box('.opponent-area.opponent-left')
        const R = box('.opponent-area.opponent-right')
        const T = box('.opponent-area.opponent-top')
        if (L) r.left  = Math.round(Math.max(0, L.right - a.left) + pad)
        if (R) r.right = Math.round(Math.max(0, a.right - R.left) + pad)
        if (T && a.height >= 320) r.top = Math.round(Math.max(0, T.bottom - a.top) + pad)
        setReserve(prev => (prev.left === r.left && prev.right === r.right && prev.top === r.top) ? prev : r)
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(area)
    ro.observe(host)
    const watchHands = () => host.querySelectorAll('.opponent-area').forEach(el => ro.observe(el))
    watchHands()
    // hands appear, shrink as tiles are played, and change with the table
    const mo = new MutationObserver(() => { watchHands(); measure() })
    mo.observe(host, { childList: true, subtree: true })
    return () => { ro.disconnect(); mo.disconnect(); cancelAnimationFrame(raf) }
  }, [])
  const [dragOver, setDragOver] = useState(null)

  // Native HTML5 drag data recovered from dataTransfer. This is intentionally
  // separate from the parent `dragging` prop so previews can still appear when
  // the parent drag state is delayed or absent.
  const [nativeDragging, setNativeDragging] = useState(null)

  const selectedTileRef = useRef(null)
  const onDragPlaceRef = useRef(onDragPlace)
  const boardDataRef = useRef(boardData)

  useEffect(() => { onDragPlaceRef.current = onDragPlace }, [onDragPlace])
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
        // no selected-tile fallback for the opening tile
        const dragged = mergeDragPayload(e?.detail?.dragging || e?.detail, draggingRef.current, null)
        if (dragged?.tile) placeDraggedDomino(dragged, 'first')
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

  // resolveNearestDropSide closes over `positions` and `dims`, which change
  // every render. Keep a ref to the latest one so the listener below never
  // uses a stale first-render closure.
  const resolveSideRef = useRef(null)
  useEffect(() => { resolveSideRef.current = resolveNearestDropSide })

  // Fallback for touch releases where no DropZone element was in the DOM at
  // the moment of release. Those zones are conditionally rendered from
  // boardData, so a realtime reload landing mid-gesture unmounts them and the
  // drop silently does nothing — which is why this only bites in multiplayer
  // (other clients write constantly) and never in solo (the bot only writes on
  // its own turn). Desktop is unaffected because the native-drop path already
  // resolves by coordinates. This gives touch the same treatment.
  // isMyTurn is enforced upstream in Game.jsx's onDragPlace handler.
  useEffect(() => {
    const onFallback = (e) => {
      const { data: raw, clientX, clientY } = e.detail || {}

      const data = mergeDragPayload(
        raw,
        draggingRef.current,
        selectedTileRef.current,
      )
      if (!data?.tile) return

      // The tile must actually be released OVER THE BOARD. Without this, any
      // release — including a plain tap on a tile still sitting in your hand —
      // counted as a drop, and on an empty board it played the first tile
      // immediately with no way to change your mind.
      const area = areaRef.current
      if (!area || typeof clientX !== 'number' || typeof clientY !== 'number') return
      const rect = area.getBoundingClientRect()
      const overBoard =
        clientX >= rect.left && clientX <= rect.right &&
        clientY >= rect.top  && clientY <= rect.bottom
      if (!overBoard) return

      if (!hasTilesRef.current) {
        const dragged = mergeDragPayload(raw, draggingRef.current, null)
        if (dragged?.tile) placeDraggedDomino(dragged, 'first')
        return
      }

      const side = resolveSideRef.current?.({ clientX, clientY }, data)
      if (side === 'left' || side === 'right') {
        placeDraggedDomino(data, side)
      }
    }

    document.addEventListener('tile-drop-fallback', onFallback)
    return () => document.removeEventListener('tile-drop-fallback', onFallback)
  }, [])

  // tiles shrink only as much as the chain needs to fit the table
  const fit = hasTiles ? fitScale(tiles, dims.w, dims.h, reserve) : 1
  const positions = hasTiles ? computeSnakePositions(tiles, dims.w, dims.h, reserve, fit) : []

  // ── Which tile was just played ────────────────────────────────────────────
  // Only when the chain grows by one: the new tile is at whichever end
  // changed. A background re-read of the same board keeps the highlight; a
  // new round clears it. (Purely visual — nothing here touches play.)
  const lastSeen = useRef({ tiles: null, fresh: -1 })
  if (lastSeen.current.tiles !== tiles) {
    const prev = lastSeen.current.tiles
    const sig = e => (e?.tile ? `${e.tile[0]}-${e.tile[1]}` : '')
    let fresh = -1
    if (Array.isArray(prev) && Array.isArray(tiles)) {
      if (tiles.length === prev.length + 1) {
        fresh = prev.length === 0 || sig(tiles[0]) !== sig(prev[0]) ? 0 : tiles.length - 1
      } else if (tiles.length === prev.length) {
        fresh = lastSeen.current.fresh
      }
    }
    lastSeen.current = { tiles, fresh }
  }
  const freshIdx = lastSeen.current.fresh

  // ── Dekabess sequence ──
  const [dekPhase, setDekPhase] = useState(null)       // null | 'travel' | 'slam'
  const dekDone = useRef(onDekabessDone)
  dekDone.current = onDekabessDone
  useEffect(() => {
    if (!dekabessKey) return
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || !(boardData?.tiles?.length > 1)) { dekDone.current?.(); return }
    setDekPhase('travel')
    const t1 = setTimeout(() => setDekPhase('slam'), DEK_TRAVEL_MS)
    const t2 = setTimeout(() => { setDekPhase(null); dekDone.current?.() }, DEK_TRAVEL_MS + DEK_SLAM_MS)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [dekabessKey])
  // the winning tile is the one just played (or, after a refresh, an end)
  const dekIdx = tiles?.length ? (freshIdx >= 0 ? freshIdx : tiles.length - 1) : -1
  const dekOther = dekIdx === 0 ? (tiles?.length || 1) - 1 : 0
  // each tile jumps its own way (fixed per tile, so it looks natural)
  const joltFor = i => {
    const a = Math.sin(i * 12.9898 + 4.1) * 43758.5453, b = Math.sin(i * 78.233 + 1.7) * 12345.6789
    const fa = a - Math.floor(a), fb = b - Math.floor(b)
    return { x: Math.round((fa - 0.5) * 10), y: -Math.round(6 + fb * 9), r: Math.round((fb - 0.5) * 14) }
  }

  // When the chain is taller than the table (a phone on its side), the table
  // scrolls. This marker sits a margin below the lowest tile so you can scroll
  // all the way to it.
  const chainBottom = positions.length
    ? Math.max(...positions.map(p => p.y + p.ph / 2)) + 28
    : 0
  const needsScroll = chainBottom > (dims.h || 0) + 1
  const dekCenter = positions.length
    ? { x: positions.reduce((t, p) => t + p.x, 0) / positions.length, y: positions.reduce((t, p) => t + p.y, 0) / positions.length }
    : { x: dims.w / 2, y: dims.h / 2 }

  // Use the newest available drag source for previews. `dragging` is preferred,
  // then native dataTransfer recovery, then selectedTile for click placement.
  const activePlay =
    normalizeDragPayload(draggingRef?.current) ||
    normalizeDragPayload(nativeDragging) ||
    normalizeDragPayload(selectedTile)

  const activeTile = activePlay?.tile || null

  // The OPENING tile is never placed from a selection. On an empty board the
  // preview and its drop zone only appear while a tile is actually being
  // dragged — so picking the wrong tile, then touching the table, can't play
  // it. (Once tiles are down, tap-to-place via the side drop zones still works.)
  const draggedPlay =
    normalizeDragPayload(draggingRef?.current) ||
    normalizeDragPayload(nativeDragging)
  const draggedTile = draggedPlay?.tile || null

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
    ? computeDropPreview(tiles, positions, activeTile, 'left', dims.w, dims.h, boardData, reserve, fit)
    : null

  const previewRight = canRight
    ? computeDropPreview(tiles, positions, activeTile, 'right', dims.w, dims.h, boardData, reserve, fit)
    : null

  const firstPreview = !hasTiles && draggedTile
    ? (() => {
        const isDouble = draggedTile[0] === draggedTile[1]
        const d = tileDims(isDouble, DIR.RIGHT)

        return {
          x: reserve.left + (dims.w - reserve.left - reserve.right) / 2,
          y: reserve.top + (dims.h - reserve.top - reserve.bottom) / 2,
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
    // the table can scroll on short screens: convert to table coordinates
    const x = e.clientX - rect.left + (areaRef.current.scrollLeft || 0)
    const y = e.clientY - rect.top + (areaRef.current.scrollTop || 0)
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
      const dragged = mergeDragPayload(readTransferPayload(e?.dataTransfer), draggingRef.current, null)
      if (dragged?.tile) placeDraggedDomino(dragged, 'first')
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
      className={`board-area ${draggingRef?.current || nativeDragging ? 'drag-active' : ''}`}
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

      {/* lets the table scroll down to just below the lowest tile */}
      {needsScroll && (
        <div aria-hidden="true" style={{ position: 'absolute', left: 0, top: chainBottom, width: 1, height: 1, pointerEvents: 'none' }} />
      )}

      {positions.map((pos, i) => (
        // The newest tile gets its own key, so its drop-in plays every time —
        // even when two tiles in a row land at the same end.
        <BoardTile
          key={i === freshIdx ? `fresh-${tiles.length}-${tiles[i]?.tile?.join('')}` : i}
          entry={tiles[i]}
          pos={pos}
          fresh={i === freshIdx}
          freshFrom={i === freshIdx ? freshFrom : null}
          jolt={dekPhase === 'slam' ? joltFor(i) : null}
          hidden={dekPhase === 'travel' && i === dekIdx}
        />
      ))}

      {/* Dekabess: the winning tile's trip to the other end and back */}
      {dekPhase === 'travel' && dekIdx >= 0 && positions[dekIdx] && positions[dekOther] && (
        <BoardTile
          key={`dek-travel-${dekabessKey}`}
          entry={tiles[dekIdx]}
          pos={positions[dekIdx]}
          travel={{ dx: positions[dekOther].x - positions[dekIdx].x, dy: positions[dekOther].y - positions[dekIdx].y }}
        />
      )}

      {/* Dekabess: the hand slamming the table twice */}
      {dekPhase === 'slam' && (
        <div className="dek-slam-wrap" style={{ left: dekCenter.x, top: dekCenter.y }} aria-hidden="true">
          <div className="dek-slam-arm" style={{ rotate: SLAM_TURN[dekabessFrom] || SLAM_TURN.top }}>
            <img className="dek-slam" src="/handslam.webp" alt="" draggable={false} />
          </div>
        </div>
      )}

      {!hasTiles && firstPreview && (
        <>
          <BoardTile
            entry={{ tile: draggedTile, flipped: false }}
            pos={firstPreview}
            ghost
            highlighted={dragOver === 'first'}
          />

          <DropZone
            onDrop={data => commitDrop(data, 'first')}
            className={`domino-drop-target ${dragOver === 'first' ? 'drag-over' : ''}`}
            style={getDropHitStyle(firstPreview, dims.w, dims.h)}
          />
        </>
      )}

      {canLeft && previewLeft && (
        <>
          <BoardTile
            entry={{ tile: activeTile, flipped: previewLeft.flipped ?? false }}
            pos={previewLeft}
            ghost
            highlighted={dragOver === 'left'}
          />

          <DropZone
            onDrop={data => commitDrop(data, 'left')}
            onTap={() => tapSide('left')}
            className={`domino-drop-target ${dragOver === 'left' ? 'drag-over' : ''}`}
            style={getDropHitStyle(previewLeft, dims.w, dims.h)}
          />
        </>
      )}

      {canRight && previewRight && (
        <>
          <BoardTile
            entry={{ tile: activeTile, flipped: previewRight.flipped ?? false }}
            pos={previewRight}
            ghost
            highlighted={dragOver === 'right'}
          />

          <DropZone
            onDrop={data => commitDrop(data, 'right')}
            onTap={() => tapSide('right')}
            className={`domino-drop-target ${dragOver === 'right' ? 'drag-over' : ''}`}
            style={getDropHitStyle(previewRight, dims.w, dims.h)}
          />
        </>
      )}
    </div>
  )
}
