import { useRef, useEffect, useState } from 'react'
import { canPlayOnSide } from '../hooks/useGameState'
import './Board.css'

// ─── Constants ────────────────────────────────────────────────────────────────
const TW = 28   // tile short side
const TH = 56   // tile long side
const GAP = 3

// ─── Orientation rules ────────────────────────────────────────────────────────
// In a horizontal run:
//   - normal tile  → horizontal (TH wide, TW tall)
//   - double       → vertical   (TW wide, TH tall)  [perpendicular to run]
// At a corner turn (vertical step):
//   - normal tile  → vertical   (TW wide, TH tall)  [perpendicular to run]
//   - double       → horizontal (TH wide, TW tall)  [perpendicular to run]
// Rule: doubles are ALWAYS perpendicular to the current run direction
function tileDims(isDouble, isCorner) {
  if (isCorner) {
    return isDouble
      ? { w: TH, h: TW }   // double at corner → horizontal
      : { w: TW, h: TH }   // normal at corner → vertical
  }
  return isDouble
    ? { w: TW, h: TH }     // double in run → vertical
    : { w: TH, h: TW }     // normal in run → horizontal
}

// ─── Snake layout ─────────────────────────────────────────────────────────────
function computeSnakePositions(tiles, W, H) {
  if (!tiles || tiles.length === 0) return []

  const MARGIN = Math.max(28, W * 0.07)
  const pos = []
  let x = 0, y = 0, dir = 1, cornerLeft = 0

  for (let i = 0; i < tiles.length; i++) {
    const entry = tiles[i]
    const isDouble = entry.tile[0] === entry.tile[1]
    const isCorner = cornerLeft > 0
    const { w, h } = tileDims(isDouble, isCorner)

    pos.push({ x, y, dir: isCorner ? 0 : dir, pw: w, ph: h, isCorner, isDouble })

    if (i === tiles.length - 1) break
    const next = tiles[i + 1]
    const nextIsDouble = next.tile[0] === next.tile[1]

    if (isCorner) {
      // Coming out of corner — step down, then resume horizontal
      cornerLeft--
      const nextIsCorner = cornerLeft > 0
      const { w: nw, h: nh } = tileDims(nextIsDouble, nextIsCorner)
      // Align outer edge of new row with outer edge of corner tile
      if (!nextIsCorner) {
        x = x + TW / 2 - nw / 2
      }
      y = y + h / 2 + GAP + nh / 2
    } else {
      // Horizontal run — try to step sideways
      const { w: nw, h: nh } = tileDims(nextIsDouble, false)
      const nextX = x + dir * (w / 2 + GAP + nw / 2)

      if (nextX - nw / 2 < MARGIN || nextX + nw / 2 > W - MARGIN) {
        // Hit edge — place corner tile below current, flush with outer wall
        const { w: cw, h: ch } = tileDims(nextIsDouble, true)
        x = x + dir * (w / 2 - cw / 2)
        dir *= -1
        cornerLeft = 0  // 1 corner tile only
        y = y + h / 2 + GAP + ch / 2
      } else {
        x = nextX
      }
    }
  }

  // Center the whole chain in the board area
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  pos.forEach(p => {
    minX = Math.min(minX, p.x - p.pw / 2)
    maxX = Math.max(maxX, p.x + p.pw / 2)
    minY = Math.min(minY, p.y - p.ph / 2)
    maxY = Math.max(maxY, p.y + p.ph / 2)
  })
  const ox = (W - (maxX - minX)) / 2 - minX
  const oy = (H - (maxY - minY)) / 2 - minY
  pos.forEach(p => { p.x += ox; p.y += oy })
  return pos
}

// ─── Single tile renderer ─────────────────────────────────────────────────────
function BoardTile({ entry, pos }) {
  const { isDouble, isCorner } = pos
  const isVert = isCorner
    ? !isDouble   // corner: normal→vertical, double→horizontal
    : isDouble    // run: double→vertical, normal→horizontal

  let [top, bottom] = entry.tile
  if (!isDouble) {
    const logicalFlip = !!entry.flipped
    const visualMirror = pos.dir === -1
    if (logicalFlip !== visualMirror) { top = entry.tile[1]; bottom = entry.tile[0] }
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
        <img src={`/tiles-white/${top}.png`} alt={String(top)}
          style={{ width: '70%', height: '70%', objectFit: 'contain',
            ...(!isVert && top === 6 ? { transform: 'rotate(90deg)' } : {}) }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={`/tiles-white/${bottom}.png`} alt={String(bottom)}
          style={{ width: '70%', height: '70%', objectFit: 'contain',
            ...(!isVert && bottom === 6 ? { transform: 'rotate(90deg)' } : {}) }} />
      </div>
    </div>
  )
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

  // Touch drop listener
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const onTouchBoard = () => {
      const data = draggingRef.current
      if (!hasTilesRef.current && data) onDragPlaceRef.current(data.tile, data.idx, 'first')
    }
    const onTouchZone = (e) => {
      const side = e.currentTarget?.dataset?.side
      const data = draggingRef.current
      if (side && data) onDragPlaceRef.current(data.tile, data.idx, side)
    }
    el.addEventListener('tile-touch-drop-board', onTouchBoard)
    return () => el.removeEventListener('tile-touch-drop-board', onTouchBoard)
  }, [])

  const tiles = boardData?.tiles || []
  const hasTiles = tiles.length > 0
  const hasTilesRef = useRef(hasTiles)
  useEffect(() => { hasTilesRef.current = hasTiles }, [hasTiles])

  const positions = hasTiles ? computeSnakePositions(tiles, dims.w, dims.h) : []
  const canLeft  = selectedTile && isMyTurn && canPlayOnSide(selectedTile.tile, 'left', boardData)
  const canRight = selectedTile && isMyTurn && canPlayOnSide(selectedTile.tile, 'right', boardData)
  const posL = positions[0]
  const posR = positions[positions.length - 1]

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
      onDragOver={e => { if (!hasTiles && isMyTurn) e.preventDefault() }}
      onDrop={e => {
        e.preventDefault()
        const data = draggingRef.current
        if (!hasTiles && isMyTurn && data) onDragPlace(data.tile, data.idx, 'first')
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
          style={{ left: Math.max(4, posL.x - posL.pw / 2 - 76), top: posL.y - 22, width: 68, height: 44 }}
          onClick={() => onDropZone('left')}
          onDragOver={e => { e.preventDefault(); setDragOver('left') }}
          onDragLeave={() => setDragOver(null)}
          onDrop={e => handleDrop(e, 'left')}
        >← Left</div>
      )}

      {canRight && posR && (
        <div
          className={`drop-zone ${dragOver === 'right' ? 'drag-over' : ''}`}
          style={{ left: Math.min(dims.w - 76, posR.x + posR.pw / 2 + 4), top: posR.y - 22, width: 68, height: 44 }}
          onClick={() => onDropZone('right')}
          onDragOver={e => { e.preventDefault(); setDragOver('right') }}
          onDragLeave={() => setDragOver(null)}
          onDrop={e => handleDrop(e, 'right')}
        >Right →</div>
      )}
    </div>
  )
}
