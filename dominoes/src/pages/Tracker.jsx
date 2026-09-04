import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Draggable, DropZone, useDrag } from '../components/DragDrop'
import './Tracker.css'

// ── Snake layout (same as Board.jsx) ────────────────────────────────────────
const TW = 28, TH = 56, GAP = 3

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
function computeDropPreview(tiles, positions, candidateTile, side, W, H, boardData) {
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
    const simulated = computeSnakePositions([...tiles, candidate], W, H)
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
    const simulated = computeSnakePositions([candidate, ...tiles], W, H)
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


function BoardTileT({ entry, pos }) {
  const isDbl = entry.tile[0] === entry.tile[1]
  const isVert = pos.isVert
  let [top, bottom] = entry.tile
  if (!isDbl && entry.flipped) { top = entry.tile[1]; bottom = entry.tile[0] }
  return (
    <div style={{
      position: 'absolute',
      left: pos.x - pos.pw / 2, top: pos.y - pos.ph / 2,
      width: pos.pw, height: pos.ph,
      background: '#fffef8', borderRadius: 4,
      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
      display: 'grid',
      gridTemplateRows: isVert ? '1fr 1fr' : 'none',
      gridTemplateColumns: isVert ? 'none' : '1fr 1fr',
      overflow: 'hidden', zIndex: 1,
    }}>
      <div style={{ position: 'absolute',
        ...(isVert ? { left: '10%', right: '10%', top: '50%', height: 1, transform: 'translateY(-50%)' }
                   : { top: '10%', bottom: '10%', left: '50%', width: 1, transform: 'translateX(-50%)' }),
        background: 'rgba(26,24,20,0.25)', pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={`/tiles-white/${top}.png`} draggable={false}
          style={{ width: '70%', height: '70%', objectFit: 'contain', pointerEvents: 'none' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={`/tiles-white/${bottom}.png`} draggable={false}
          style={{ width: '70%', height: '70%', objectFit: 'contain', pointerEvents: 'none' }} />
      </div>
    </div>
  )
}

function TrackerBoard({ tiles, onDrop, leftEnd, rightEnd }) {
  const ref = useRef(null)
  const [dims, setDims] = useState({ w: 600, h: 240 })

  useEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setDims({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el); return () => ro.disconnect()
  }, [])

  const positions = computeSnakePositions(tiles, dims.w, dims.h)
  const posL = positions[0]
  const posR = positions[positions.length - 1]

  return (
    <div ref={ref} style={{
      position: 'relative', width: '100%', height: 240,
      background: 'var(--felt)',
      backgroundImage: 'radial-gradient(ellipse at 50% 50%, var(--felt) 0%, var(--felt2) 100%)',
      borderRadius: 8, overflow: 'hidden',
    }}>
      {tiles.length === 0 && (
        <DropZone
          onDrop={data => onDrop(data.tile, 'first')}
          style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.62rem', letterSpacing: '0.15em', color: 'rgba(240,234,216,0.18)', textTransform: 'uppercase' }}
        >
          Drag a tile here to start
        </DropZone>
      )}
      {positions.map((pos, i) => <BoardTileT key={i} entry={tiles[i]} pos={pos} />)}

      {tiles.length > 0 && posL && (
        <DropZone
          onDrop={data => onDrop(data.tile, 'left')}
          style={{
            position: 'absolute',
            left: Math.max(4, posL.x - posL.pw / 2 - 72),
            top: posL.y - 20,
            width: 64, height: 40,
            border: '2px dashed rgba(201,168,76,0.4)',
            background: 'transparent',
            borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.55rem', letterSpacing: '0.1em',
            color: 'rgba(201,168,76,0.5)',
            textTransform: 'uppercase', zIndex: 10, cursor: 'copy',
          }}
        >← {leftEnd}</DropZone>
      )}

      {tiles.length > 0 && posR && (
        <DropZone
          onDrop={data => onDrop(data.tile, 'right')}
          style={{
            position: 'absolute',
            left: Math.min(dims.w - 72, posR.x + posR.pw / 2 + 4),
            top: posR.y - 20,
            width: 64, height: 40,
            border: '2px dashed rgba(201,168,76,0.4)',
            background: 'transparent',
            borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.55rem', letterSpacing: '0.1em',
            color: 'rgba(201,168,76,0.5)',
            textTransform: 'uppercase', zIndex: 10, cursor: 'copy',
          }}
        >{rightEnd} →</DropZone>
      )}
    </div>
  )
}

const ALL_DOMINOES = []
for (let a = 0; a <= 6; a++)
  for (let b = a; b <= 6; b++)
    ALL_DOMINOES.push([a, b])

const PLAYERS = ['RP', 'MP', 'LP']

function TileImg({ tile, size = 40, style = {}, onClick, selected, dimmed, faceDown }) {
  const [a, b] = tile
  return (
    <div
      onClick={onClick}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        background: faceDown ? 'var(--surface2)' : 'var(--ivory)',
        border: selected ? '2px solid var(--gold)' : '1px solid var(--border)',
        borderRadius: 4,
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        opacity: dimmed ? 0.3 : 1,
        boxShadow: selected ? '0 0 10px rgba(201,168,76,0.5)' : '0 2px 6px rgba(0,0,0,0.4)',
        transition: 'all 0.15s',
        flexShrink: 0,
        width: size,
        height: size * 2,
        position: 'relative',
        ...style,
      }}
    >
      {!faceDown && (
        <>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={`/tiles-white/${a}.png`} draggable={false} style={{ width: '70%', pointerEvents: 'none' }} />
          </div>
          <div style={{ height: 1, background: 'rgba(26,24,20,0.25)', margin: '0 10%' }} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={`/tiles-white/${b}.png`} draggable={false} style={{ width: '70%', pointerEvents: 'none' }} />
          </div>
        </>
      )}
    </div>
  )
}

function PlayerTag({ name, active, tileCount, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 4,
      border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
      background: active ? 'rgba(201,168,76,0.1)' : 'var(--surface2)',
      color: active ? 'var(--gold)' : 'var(--ivory-dim)',
      fontSize: '0.65rem', letterSpacing: '0.1em',
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      <span>{name}</span>
      <span style={{ opacity: 0.6 }}>{tileCount}</span>
    </div>
  )
}

const PLAYER_COLORS = { RP: '#4c8cca', MP: '#4caa6e', LP: '#c94c4c', ME: 'var(--gold)' }

function DekabessGuide({ myHand, boardTiles, boardLeftEnd, boardRightEnd, playedLog, passes }) {
  const hasTiles = boardTiles.length > 0
  const usedKeys = new Set(playedLog.map(e => `${e.domino[0]}-${e.domino[1]}`))
  const myKeys   = new Set(myHand.map(t => `${t[0]}-${t[1]}`))
  const remaining = ALL_DOMINOES.filter(t => !usedKeys.has(`${t[0]}-${t[1]}`) && !myKeys.has(`${t[0]}-${t[1]}`))

  // Can tile t play on a given end?
  function playsOn(t, end) { return t[0] === end || t[1] === end }

  // After playing tile t on 'side', what are the new board ends?
  function newEnds(t, side) {
    if (!hasTiles) return { L: t[0], R: t[1] }
    const end = side === 'left' ? boardLeftEnd : boardRightEnd
    const newOpen = t[1] === end ? t[0] : t[1]
    return {
      L: side === 'left'  ? newOpen : boardLeftEnd,
      R: side === 'right' ? newOpen : boardRightEnd,
    }
  }

  // Is tile t a Dekabess on ends L/R? (non-double, matches both)
  function isDekabess(t, L, R) {
    if (t[0] === t[1]) return false
    if (L === R) return false
    return (t[0] === L && t[1] === R) || (t[1] === L && t[0] === R)
  }

  // ── Can I Dekabess RIGHT NOW (last tile in hand)? ──────────────────────
  const canDekabessNow = hasTiles && myHand.length === 1 && isDekabess(myHand[0], boardLeftEnd, boardRightEnd)

  // ── Which of my tiles IS the Dekabess tile right now (even if not last)? ─
  const dekabessReady = hasTiles ? myHand.filter(t => isDekabess(t, boardLeftEnd, boardRightEnd)) : []

  // ── Path to Dekabess: for each subset of plays, can I end with a Dekabess? ─
  // Strategy: find which tile I should SAVE as my last tile (the Dekabess tile)
  // Then figure out what to play now to make that happen
  const dekabessPlans = []
  if (hasTiles && myHand.length > 1) {
    myHand.forEach(keepTile => {
      if (keepTile[0] === keepTile[1]) return // doubles can't Dekabess
      const restOfHand = myHand.filter(t => `${t[0]}-${t[1]}` !== `${keepTile[0]}-${keepTile[1]}`)

      // What board ends would allow keepTile to Dekabess?
      // keepTile [a,b] needs ends to be {a,b}
      const needL = keepTile[0], needR = keepTile[1]
      const needL2 = keepTile[1], needR2 = keepTile[0]

      // For each tile I could play NOW, does it move toward {needL,needR}?
      const playableNow = restOfHand.filter(t =>
        !hasTiles || playsOn(t, boardLeftEnd) || playsOn(t, boardRightEnd)
      )

      playableNow.forEach(playNow => {
        const sides = []
        if (!hasTiles) sides.push('first')
        else {
          if (playsOn(playNow, boardLeftEnd)) sides.push('left')
          if (playsOn(playNow, boardRightEnd)) sides.push('right')
        }
        sides.forEach(side => {
          const ends = newEnds(playNow, side)
          // After playing playNow, can keepTile eventually Dekabess?
          // Check if keepTile matches the new ends
          const directDek = isDekabess(keepTile, ends.L, ends.R)
          if (directDek) {
            dekabessPlans.push({
              playNow, side, keepTile,
              newL: ends.L, newR: ends.R,
              stepsAway: 1,
              label: myHand.length === 2 ? 'Play this → Dekabess next!' : 'Play this → sets up Dekabess'
            })
          }
        })
      })
    })
  }

  // ── Simple win: best tile to play to empty hand fastest ────────────────
  // Play the tile with most pip value (get rid of big tiles)
  // But prioritize tiles that keep the most options open
  const playableNow = hasTiles
    ? myHand.filter(t => playsOn(t, boardLeftEnd) || playsOn(t, boardRightEnd))
    : myHand

  const bestToWin = [...playableNow].sort((a, b) => {
    // Prefer non-doubles (doubles are harder to place later)
    const aIsDouble = a[0] === a[1], bIsDouble = b[0] === b[1]
    if (aIsDouble && !bIsDouble) return 1
    if (!aIsDouble && bIsDouble) return -1
    // Then highest pip count
    return (b[0] + b[1]) - (a[0] + a[1])
  })

  const colors = { gold: 'var(--gold)', green: 'var(--green)', red: 'var(--red)', dim: 'var(--ivory-dim)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Dekabess NOW */}
      {canDekabessNow && (
        <div className="tracker-card" style={{ border: '2px solid var(--gold)', background: 'rgba(201,168,76,0.1)' }}>
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.4rem', color: 'var(--gold)', marginBottom: 8 }}>
            🎯 Play it — DEKABESS!
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--ivory-dim)', marginBottom: 10 }}>
            Your last tile matches both open ends. Play it for 2 wins!
          </div>
          <TileImg tile={myHand[0]} size={32} selected />
        </div>
      )}

      {/* Dekabess tile already in hand and playable */}
      {!canDekabessNow && dekabessReady.length > 0 && myHand.length > 1 && (
        <div className="tracker-card" style={{ border: '1px solid var(--gold)' }}>
          <div className="tracker-card-title" style={{ color: 'var(--gold)' }}>🎯 Save This for Dekabess</div>
          <div style={{ fontSize: '0.62rem', color: 'var(--ivory-dim)', marginBottom: 8 }}>
            This tile matches both ends right now. Save it as your last tile — play everything else first.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {dekabessReady.map(t => <TileImg key={`${t[0]}-${t[1]}`} tile={t} size={28} selected />)}
          </div>
        </div>
      )}

      {/* Dekabess plans */}
      {!canDekabessNow && dekabessPlans.length > 0 && (
        <div className="tracker-card">
          <div className="tracker-card-title">🧠 Path to Dekabess</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--ivory-dim)', marginBottom: 10 }}>
            Play these tiles to set up a Dekabess finish:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dekabessPlans.slice(0, 4).map((plan, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px', background: 'var(--surface2)', borderRadius: 8,
                border: '1px solid var(--border)'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.5rem', color: 'var(--ivory-dim)', marginBottom: 4 }}>PLAY NOW</div>
                  <TileImg tile={plan.playNow} size={24} />
                  <div style={{ fontSize: '0.5rem', color: 'var(--ivory-dim)', marginTop: 2 }}>→ {plan.side}</div>
                </div>
                <div style={{ color: 'var(--border)', fontSize: '1.2rem' }}>→</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.5rem', color: 'var(--gold)', marginBottom: 4 }}>DEKABESS WITH</div>
                  <TileImg tile={plan.keepTile} size={24} selected />
                </div>
                <div style={{ marginLeft: 'auto', fontSize: '0.55rem', color: 'var(--gold)', fontWeight: 700 }}>
                  {plan.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Dekabess path — suggest best play to just win */}
      {!canDekabessNow && dekabessPlans.length === 0 && (
        <div className="tracker-card">
          <div className="tracker-card-title">💡 No Dekabess Path — Best Play to Win</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--ivory-dim)', marginBottom: 10 }}>
            No Dekabess setup found. Focus on emptying your hand. Play in this order:
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {bestToWin.map((t, i) => (
              <div key={`${t[0]}-${t[1]}`} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.5rem', color: 'var(--ivory-dim)', marginBottom: 2 }}>#{i+1}</div>
                <TileImg tile={t} size={24} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Best play to win even when there IS a Dekabess path */}
      {bestToWin.length > 0 && dekabessPlans.length > 0 && !canDekabessNow && (
        <div className="tracker-card">
          <div className="tracker-card-title">🏆 Best Play to Simply Win (no Dekabess)</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {bestToWin.slice(0, 1).map(t => (
              <div key={`${t[0]}-${t[1]}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <TileImg tile={t} size={28} />
                <span style={{ fontSize: '0.62rem', color: 'var(--ivory-dim)' }}>
                  Highest value playable — gets rid of {t[0]+t[1]} pips
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hand overview */}
      {myHand.length > 0 && hasTiles && (
        <div className="tracker-card">
          <div className="tracker-card-title">Your Hand</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {myHand.map(t => {
              const canPlay = playsOn(t, boardLeftEnd) || playsOn(t, boardRightEnd)
              const isDek = isDekabess(t, boardLeftEnd, boardRightEnd)
              const inPlan = dekabessPlans.some(p => `${p.keepTile[0]}-${p.keepTile[1]}` === `${t[0]}-${t[1]}`)
              return (
                <div key={`${t[0]}-${t[1]}`} style={{ textAlign: 'center' }}>
                  <TileImg tile={t} size={22} selected={isDek || inPlan} dimmed={!canPlay} />
                  <div style={{ fontSize: '0.45rem', marginTop: 2,
                    color: isDek ? 'var(--gold)' : inPlan ? 'var(--green)' : canPlay ? 'var(--ivory-dim)' : 'var(--border)' }}>
                    {isDek ? '🎯' : inPlan ? 'save' : canPlay ? '✓' : '✗'}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: '0.55rem', color: 'var(--ivory-dim)' }}>
            <span><span style={{ color: 'var(--gold)' }}>🎯</span> Dekabess tile</span>
            <span><span style={{ color: 'var(--green)' }}>save</span> Keep for Dekabess</span>
            <span>✓ Playable &nbsp; ✗ Blocked</span>
          </div>
        </div>
      )}

      {!hasTiles && (
        <div className="tracker-card">
          <div style={{ fontSize: '0.65rem', color: 'var(--ivory-dim)', textAlign: 'center', padding: '1rem' }}>
            Place the first tile on the board to see Dekabess suggestions.
          </div>
        </div>
      )}
    </div>
  )
}


export default function Tracker() {
  const navigate = useNavigate()
  const saved = (() => { try { return JSON.parse(localStorage.getItem('dekabess_tracker') || 'null') } catch { return null } })()

  const [phase, setPhase] = useState(saved?.phase || 'setup')
  const [myHand, setMyHand] = useState(saved?.myHand || [])
  const [startingPlayer, setStartingPlayer] = useState(saved?.startingPlayer || 'ME')
  const [currentPlayer, setCurrentPlayer] = useState(saved?.currentPlayer || 'ME')
  const [playedLog, setPlayedLog] = useState(saved?.playedLog || [])
  const [passLog, setPassLog] = useState(saved?.passLog || [])
  const [passes, setPasses] = useState(() => {
    const p = saved?.passes || {}
    return { RP: new Set(p.RP || []), MP: new Set(p.MP || []), LP: new Set(p.LP || []) }
  })
  const [pendingPass, setPendingPass] = useState({ n1: '', n2: '' })
  const [selectedForPlay, setSelectedForPlay] = useState(null)
  const [activeTab, setActiveTab] = useState('game')
  const [boardTiles, setBoardTiles] = useState(saved?.boardTiles || [])
  const [boardLeftEnd, setBoardLeftEnd] = useState(saved?.boardLeftEnd ?? null)
  const [boardRightEnd, setBoardRightEnd] = useState(saved?.boardRightEnd ?? null)
  const [pendingSide, setPendingSide] = useState(null)

  // Save to localStorage immediately on every state change AND on beforeunload
  const getState = () => ({
    phase, myHand, startingPlayer, currentPlayer,
    playedLog, passLog,
    passes: { RP: [...passes.RP], MP: [...passes.MP], LP: [...passes.LP] },
    boardTiles, boardLeftEnd, boardRightEnd,
  })

  useEffect(() => {
    localStorage.setItem('dekabess_tracker', JSON.stringify(getState()))
  }, [phase, myHand, startingPlayer, currentPlayer, playedLog, passLog, passes, boardTiles, boardLeftEnd, boardRightEnd])

  useEffect(() => {
    function onUnload() {
      localStorage.setItem('dekabess_tracker', JSON.stringify(getState()))
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  })

  // Which tiles are used (in hand or played)
  const usedTiles = new Set([
    ...myHand.map(t => `${t[0]}-${t[1]}`),
    ...playedLog.map(e => `${e.domino[0]}-${e.domino[1]}`),
  ])

  const availableTiles = ALL_DOMINOES.filter(t => !usedTiles.has(`${t[0]}-${t[1]}`))

  // ── Setup: pick hand ─────────────────────────────────────────────────────
  function toggleHandTile(tile) {
    const key = `${tile[0]}-${tile[1]}`
    const inHand = myHand.some(t => `${t[0]}-${t[1]}` === key)
    if (inHand) {
      setMyHand(myHand.filter(t => `${t[0]}-${t[1]}` !== key))
    } else if (myHand.length < 7) {
      setMyHand([...myHand, tile])
    }
  }

  function startGame() {
    if (myHand.length !== 7) { alert('Select exactly 7 tiles!'); return }
    setCurrentPlayer(startingPlayer)
    setPhase('playing')
  }

  // ── Playing: my tile ─────────────────────────────────────────────────────
  function placeOnBoard(tile, side) {
    if (boardTiles.length === 0) {
      setBoardTiles([{ tile, flipped: false }])
      setBoardLeftEnd(tile[0])
      setBoardRightEnd(tile[1])
      return
    }
    const end = side === 'left' ? boardLeftEnd : boardRightEnd
    let flipped = false, newOpen
    if (side === 'right') {
      if (tile[1] === end) { flipped = true; newOpen = tile[0] } else { newOpen = tile[1] }
    } else {
      if (tile[0] === end) { flipped = true; newOpen = tile[1] } else { newOpen = tile[0] }
    }
    const entry = { tile, flipped }
    if (side === 'left') {
      setBoardTiles(prev => [entry, ...prev])
      setBoardLeftEnd(newOpen)
    } else {
      setBoardTiles(prev => [...prev, entry])
      setBoardRightEnd(newOpen)
    }
  }

  function handleTilePlay(tile, player) {
    // If board empty or only one side matches, auto-place
    if (boardTiles.length === 0) {
      placeOnBoard(tile, 'right')
      return
    }
    const cL = tile[0] === boardLeftEnd || tile[1] === boardLeftEnd
    const cR = tile[0] === boardRightEnd || tile[1] === boardRightEnd
    if (cL && cR && boardLeftEnd !== boardRightEnd) {
      setPendingSide({ tile, player })
    } else if (cL) {
      placeOnBoard(tile, 'left')
    } else if (cR) {
      placeOnBoard(tile, 'right')
    } else {
      placeOnBoard(tile, 'right') // fallback
    }
  }

  function playMyTile(tile) {
    const key = `${tile[0]}-${tile[1]}`
    setPlayedLog(prev => [...prev, { domino: tile, player: 'ME' }])
    setMyHand(prev => prev.filter(t => `${t[0]}-${t[1]}` !== key))
    handleTilePlay(tile, 'ME')
    nextTurn()
  }

  // ── Playing: opponent tile ───────────────────────────────────────────────
  function playOpponentTile() {
    if (!selectedForPlay) return
    const tile = selectedForPlay
    setPlayedLog(prev => [...prev, { domino: tile, player: currentPlayer }])
    setSelectedForPlay(null)
    handleTilePlay(tile, currentPlayer)
    nextTurn()
  }

  // ── Pass ─────────────────────────────────────────────────────────────────
  function doPass() {
    const p = currentPlayer
    const nums = []
    if (p !== 'ME') {
      const newPasses = { ...passes, [p]: new Set(passes[p]) }
      if (boardLeftEnd !== null) { newPasses[p].add(boardLeftEnd); nums.push(boardLeftEnd) }
      if (boardRightEnd !== null && boardRightEnd !== boardLeftEnd) { newPasses[p].add(boardRightEnd); nums.push(boardRightEnd) }
      setPasses(newPasses)
    }
    setPassLog(prev => [...prev, { player: p, nums }])
    nextTurn()
  }

  function nextTurn() {
    const order = ['ME', 'RP', 'MP', 'LP']
    const idx = order.indexOf(currentPlayer)
    setCurrentPlayer(order[(idx + 1) % 4])
  }

  // ── Predictions ──────────────────────────────────────────────────────────
  function getPredictions() {
    const used = new Set(playedLog.map(e => `${e.domino[0]}-${e.domino[1]}`))
    const myKeys = new Set(myHand.map(t => `${t[0]}-${t[1]}`))
    let globalAvail = ALL_DOMINOES.filter(t => !used.has(`${t[0]}-${t[1]}`) && !myKeys.has(`${t[0]}-${t[1]}`))

    const tilesLeft = { RP: 7, MP: 7, LP: 7 }
    playedLog.forEach(e => { if (e.player !== 'ME') tilesLeft[e.player]-- })

    const pred = { RP: [], MP: [], LP: [] }
    PLAYERS.forEach(p => {
      const impossible = new Set()
      globalAvail.forEach(t => {
        passes[p].forEach(n => {
          if (t[0] === n || t[1] === n) impossible.add(`${t[0]}-${t[1]}`)
        })
      })
      let avail = globalAvail.filter(t => !impossible.has(`${t[0]}-${t[1]}`))
      const shuffled = [...avail].sort(() => Math.random() - 0.5)
      pred[p] = shuffled.slice(0, tilesLeft[p])
      globalAvail = globalAvail.filter(t => !pred[p].some(pt => pt[0] === t[0] && pt[1] === t[1]))
    })
    return pred
  }

  const predictions = phase === 'playing' ? getPredictions() : null

  // ── Reset ────────────────────────────────────────────────────────────────
  function reset() {
    setPhase('setup'); setMyHand([]); setStartingPlayer('ME')
    setCurrentPlayer('ME'); setPlayedLog([]); setPassLog([])
    setPasses({ RP: new Set(), MP: new Set(), LP: new Set() })
    setPendingPass({ n1: '', n2: '' }); setSelectedForPlay(null)
    setBoardTiles([]); setBoardLeftEnd(null); setBoardRightEnd(null); setPendingSide(null)
    localStorage.removeItem('dekabess_tracker')
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (phase === 'setup') return (
    <div className="tracker-page">
      <div className="tracker-header">
        <div>
          <h1 className="tracker-title">Dekabess Tracker</h1>
          <p className="tracker-sub" style={{ margin: 0 }}>Track · Predict · Win</p>
        </div>
        <button className="tracker-btn-outline" onClick={() => navigate('/')}>← Back</button>
      </div>

      {/* Hand selection */}
      <div className="tracker-card">
        <div className="tracker-card-title">Your Hand ({myHand.length}/7)</div>
        {/* Selected hand preview */}
        {myHand.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {myHand.map(t => (
              <TileImg key={`${t[0]}-${t[1]}`} tile={t} size={28}
                selected onClick={() => toggleHandTile(t)} />
            ))}
          </div>
        )}
        {/* All tiles grid */}
        <div className="tracker-tile-grid">
          {ALL_DOMINOES.map(t => {
            const key = `${t[0]}-${t[1]}`
            const inHand = myHand.some(h => `${h[0]}-${h[1]}` === key)
            return (
              <TileImg
                key={key} tile={t} size={24}
                selected={inHand}
                dimmed={!inHand && myHand.length >= 7}
                onClick={() => toggleHandTile(t)}
              />
            )
          })}
        </div>
        {/* Starting player */}
        <div style={{ marginTop: 16, marginBottom: 8 }}>
          <div className="tracker-card-title">Who starts?</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['ME', 'RP', 'MP', 'LP'].map(p => (
              <button
                key={p}
                className={`tracker-player-btn ${startingPlayer === p ? 'selected' : ''}`}
                onClick={() => setStartingPlayer(p)}
              >{p}</button>
            ))}
          </div>
        </div>
        <button className="tracker-btn-primary" style={{ marginTop: 8 }} onClick={startGame}>
          Start Tracking →
        </button>
      </div>
    </div>
  )

  // Playing phase
  const allPlayers = ['ME', 'RP', 'MP', 'LP']
  const tileCounts = {
    ME: myHand.length,
    RP: 7 - playedLog.filter(e => e.player === 'RP').length,
    MP: 7 - playedLog.filter(e => e.player === 'MP').length,
    LP: 7 - playedLog.filter(e => e.player === 'LP').length,
  }

  return (
    <div className="tracker-page">
      <div className="tracker-header">
        <h1 className="tracker-title">Dekabess Tracker</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="tracker-btn-outline" onClick={reset}>New Game</button>
          <button className="tracker-btn-outline" onClick={() => navigate('/')}>← Menu</button>
        </div>
      </div>

      {/* Player status bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {allPlayers.map(p => (
          <PlayerTag key={p} name={p} active={p === currentPlayer}
            tileCount={tileCounts[p]} color={PLAYER_COLORS[p]} />
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
        {[['game', '🎮 Game'], ['guide', '🎯 Dekabess Guide']].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{
            flex: 1, padding: '0.6rem', background: 'none', border: 'none',
            borderBottom: `2px solid ${activeTab === id ? 'var(--gold)' : 'transparent'}`,
            color: activeTab === id ? 'var(--gold)' : 'var(--ivory-dim)',
            fontFamily: 'DM Mono, monospace', fontSize: '0.62rem',
            letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
            marginBottom: -1, transition: 'all 0.2s',
          }}>{label}</button>
        ))}
      </div>

      {activeTab === 'guide' && (
        <DekabessGuide
          myHand={myHand}
          boardTiles={boardTiles}
          boardLeftEnd={boardLeftEnd}
          boardRightEnd={boardRightEnd}
          playedLog={playedLog}
          passes={passes}
        />
      )}

      {activeTab === 'game' && (<>

      {/* Current turn */}
      <div className="tracker-card" style={{ borderColor: 'var(--gold)' }}>
        <div className="tracker-card-title" style={{ color: 'var(--gold)' }}>
          Current Turn: {currentPlayer}
        </div>

        {currentPlayer === 'ME' ? (
          <>
            <div style={{ fontSize: '0.65rem', color: 'var(--ivory-dim)', marginBottom: 8 }}>
              Drag or tap a tile to play it
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {myHand.map(t => {
                const canPlay = boardTiles.length === 0
                  ? true
                  : t[0] === boardLeftEnd || t[1] === boardLeftEnd || t[0] === boardRightEnd || t[1] === boardRightEnd
                return (
                  <Draggable key={`${t[0]}-${t[1]}`} data={{ tile: t }} disabled={!canPlay}>
                    <TileImg tile={t} size={28}
                      selected={canPlay}
                      dimmed={!canPlay}
                      onClick={canPlay ? () => playMyTile(t) : undefined}
                    />
                  </Draggable>
                )
              })}
            </div>
            {myHand.length === 0 && <div style={{ color: 'var(--gold)', fontSize: '0.75rem', marginBottom: 8 }}>Your hand is empty!</div>}
            <button className="tracker-btn-outline" onClick={doPass}>
              Pass
              {boardLeftEnd !== null && (
                <span style={{ marginLeft: 6, color: 'var(--gold)', fontSize: '0.6rem' }}>
                  (can't play {boardLeftEnd}{boardRightEnd !== boardLeftEnd ? ` or ${boardRightEnd}` : ''})
                </span>
              )}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: '0.65rem', color: 'var(--ivory-dim)', marginBottom: 8 }}>
              Drag tile {currentPlayer} played onto the board, or record a pass
            </div>
            {/* Available tiles to pick from */}
            <div className="tracker-tile-grid" style={{ marginBottom: 12 }}>
              {availableTiles.map(t => {
                const key = `${t[0]}-${t[1]}`
                const isSel = selectedForPlay && `${selectedForPlay[0]}-${selectedForPlay[1]}` === key
                const canPlay = boardTiles.length === 0
                  ? true
                  : t[0] === boardLeftEnd || t[1] === boardLeftEnd || t[0] === boardRightEnd || t[1] === boardRightEnd
                return (
                  <Draggable key={key} data={{ tile: t }} disabled={!canPlay}>
                    <TileImg tile={t} size={24}
                      selected={isSel}
                      dimmed={!canPlay}
                      onClick={canPlay ? () => setSelectedForPlay(isSel ? null : t) : undefined}
                    />
                  </Draggable>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="tracker-btn-outline" onClick={doPass}>
                Pass
                {boardLeftEnd !== null && (
                  <span style={{ marginLeft: 6, color: 'var(--gold)', fontSize: '0.6rem' }}>
                    (can't play {boardLeftEnd}{boardRightEnd !== boardLeftEnd ? ` or ${boardRightEnd}` : ''})
                  </span>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Side picker modal */}
      {pendingSide && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--gold)', borderRadius: 8, padding: '1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', letterSpacing: '0.15em', color: 'var(--ivory-dim)', marginBottom: '1rem' }}>
              Which side?
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="tracker-btn-primary" onClick={() => {
                placeOnBoard(pendingSide.tile, 'left')
                setPendingSide(null)
              }}>← Left</button>
              <button className="tracker-btn-primary" onClick={() => {
                placeOnBoard(pendingSide.tile, 'right')
                setPendingSide(null)
              }}>Right →</button>
              <button className="tracker-btn-outline" onClick={() => setPendingSide(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Board */}
      <div className="tracker-card">
        <div className="tracker-card-title">Board</div>
        <TrackerBoard tiles={boardTiles} onDrop={(tile, side) => { placeOnBoard(tile, side); setPlayedLog(prev => [...prev, { domino: tile, player: currentPlayer }]); if (currentPlayer === 'ME') setMyHand(prev => prev.filter(t => `${t[0]}-${t[1]}` !== `${tile[0]}-${tile[1]}`)); nextTurn() }} leftEnd={boardLeftEnd} rightEnd={boardRightEnd} />
        {boardTiles.length > 0 && (
          <div style={{ fontSize: '0.6rem', color: 'var(--ivory-dim)', marginTop: 6, letterSpacing: '0.1em' }}>
            Left end: <span style={{ color: 'var(--gold)' }}>{boardLeftEnd}</span>
            &nbsp;·&nbsp;
            Right end: <span style={{ color: 'var(--gold)' }}>{boardRightEnd}</span>
          </div>
        )}
      </div>

      {/* Predictions */}
      <div className="tracker-card">
        <div className="tracker-card-title">Possible Opponent Tiles</div>
        {PLAYERS.map(p => (
          <div key={p} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.15em', color: PLAYER_COLORS[p], marginBottom: 4 }}>
              {p} ({tileCounts[p]} tiles)
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {predictions[p].map(t => (
                <TileImg key={`${t[0]}-${t[1]}`} tile={t} size={20} />
              ))}
            </div>
          </div>
        ))}
      </div>

      </>) }

      {/* Logs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="tracker-card">
          <div className="tracker-card-title">Played Log</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
            {playedLog.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.65rem' }}>
                <span style={{ color: PLAYER_COLORS[e.player], minWidth: 28 }}>{e.player}</span>
                <TileImg tile={e.domino} size={18} />
              </div>
            ))}
          </div>
        </div>
        <div className="tracker-card">
          <div className="tracker-card-title">Pass Log</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
            {passLog.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.65rem' }}>
                <span style={{ color: PLAYER_COLORS[e.player], minWidth: 28 }}>{e.player}</span>
                <span style={{ color: 'var(--ivory-dim)' }}>passed on</span>
                {e.nums.map(n => (
                  <img key={n} src={`/tiles-white/${n}.png`} style={{ height: 20, pointerEvents: 'none' }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
