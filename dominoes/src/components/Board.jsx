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
// In other words: doubles are ALWAYS perpendicular to the current run.
function tileDims(isDouble, direction) {
  const horizontalRun = isHorizontalDirection(direction)

  if (horizontalRun) {
    return isDouble
      ? { w: TW, h: TH, isVert: true }
      : { w: TH, h: TW, isVert: false }
  }

  return isDouble
    ? { w: TH, h: TW, isVert: false }
    : { w: TW, h: TH, isVert: true }
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
    isDouble: firstIsDouble,
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

    const nextDims = tileDims(isDouble, nextDirection)
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
      const fallbackDims = tileDims(isDouble, nextDirection)
      nextPoint = stepPosition(current, fallbackDims, nextDirection)

      current = {
        x: nextPoint.x,
        y: nextPoint.y,
        pw: fallbackDims.w,
        ph: fallbackDims.h,
        isVert: fallbackDims.isVert,
        isDouble,
        flowDir: nextDirection,
      }
    } else {
      current = {
        x: nextPoint.x,
        y: nextPoint.y,
        pw: nextDims.w,
        ph: nextDims.h,
        isVert: nextDims.isVert,
        isDouble,
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
function BoardTile({ entry, pos }) {
  const { isDouble, isVert, flowDir } = pos

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
      boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
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

// ─── Board component ──────────────────────────────────────────────────────────
export default function Board({ boardData, selectedTile, dragging, isMyTurn, onDropZone, onDragPlace }) {
  const areaRef = useRef(null)
  const [dims, setDims] = useState({ w: 800, h: 400 })
  const [dragOver, setDragOver] = useState(null)
  const draggingRef = useRef(null)
  const onDragPlaceRef = useRef(onDragPlace)

  useEffect(() => { onDragPlaceRef.current = onDragPlace }, [onDragPlace])
  useEffect(() => { draggingRef.current = dragging }, [dragging])

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

  // Touch drop listener for the empty board.
  useEffect(() => {
    const el = areaRef.current
    if (!el) return

    const onTouchBoard = () => {
      const data = draggingRef.current
      if (!hasTilesRef.current && data) {
        onDragPlaceRef.current(data.tile, data.idx, 'first')
      }
    }

    el.addEventListener('tile-touch-drop-board', onTouchBoard)
    return () => el.removeEventListener('tile-touch-drop-board', onTouchBoard)
  }, [])

  const positions = hasTiles ? computeSnakePositions(tiles, dims.w, dims.h) : []
  const canLeft = selectedTile && isMyTurn && canPlayOnSide(selectedTile.tile, 'left', boardData)
  const canRight = selectedTile && isMyTurn && canPlayOnSide(selectedTile.tile, 'right', boardData)

  const posL = positions[0]
  const posR = positions[positions.length - 1]

  // "left" and "right" are logical chain ends, not permanent screen directions.
  const leftOutDirection = posL ? oppositeDirection(posL.flowDir) : DIR.LEFT
  const rightOutDirection = posR ? posR.flowDir : DIR.RIGHT

  function handleDrop(e, side) {
    e.preventDefault()
    setDragOver(null)

    const data = draggingRef.current
    if (!data) return

    onDragPlace(data.tile, data.idx, side)
  }

  return (
    <div
      className="board-area"
      ref={areaRef}
      onDragOver={e => {
        if (!hasTiles && isMyTurn) e.preventDefault()
      }}
      onDrop={e => {
        e.preventDefault()
        const data = draggingRef.current

        if (!hasTiles && isMyTurn && data) {
          onDragPlace(data.tile, data.idx, 'first')
        }
      }}
    >
      {!hasTiles && (
        <div className="board-hint">
          <span className="board-hint-text">
            {isMyTurn ? 'Select a tile to place it' : 'Waiting for first tile…'}
          </span>
        </div>
      )}

      {positions.map((pos, i) => (
        <BoardTile key={i} entry={tiles[i]} pos={pos} />
      ))}

      {canLeft && posL && (
        <div
          className={`drop-zone ${dragOver === 'left' ? 'drag-over' : ''}`}
          style={getDropZoneStyle(posL, leftOutDirection, dims.w, dims.h)}
          onClick={() => onDropZone('left')}
          onDragOver={e => {
            e.preventDefault()
            setDragOver('left')
          }}
          onDragLeave={() => setDragOver(null)}
          onDrop={e => handleDrop(e, 'left')}
        >
          {dropZoneLabel('left', leftOutDirection)}
        </div>
      )}

      {canRight && posR && (
        <div
          className={`drop-zone ${dragOver === 'right' ? 'drag-over' : ''}`}
          style={getDropZoneStyle(posR, rightOutDirection, dims.w, dims.h)}
          onClick={() => onDropZone('right')}
          onDragOver={e => {
            e.preventDefault()
            setDragOver('right')
          }}
          onDragLeave={() => setDragOver(null)}
          onDrop={e => handleDrop(e, 'right')}
        >
          {dropZoneLabel('right', rightOutDirection)}
        </div>
      )}
    </div>
  )
}
