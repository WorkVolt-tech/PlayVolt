import { useRef, useEffect, useState } from 'react'
import { canPlayOnSide } from '../hooks/useGameState'
import './Board.css'

const TW = 28
const TH = 56
const GAP = 3
const MARGIN = 56
const CORNER_STEPS = 3

function renderDims(entry, inCorner) {
  const isDbl = entry.tile[0] === entry.tile[1]
  // Doubles always vertical; corner turn tile always vertical; otherwise horizontal
  if (isDbl || inCorner) return { w: TW, h: TH }
  return { w: TH, h: TW }
}

function computeSnakePositions(tiles, W, H) {
  if (!tiles || tiles.length === 0) return []

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

  const cx = W / 2
  const cy = H / 2
  return walk(tiles, 0, cx, cy, 1)
}

function Tile({ entry, pos }) {
  const isDbl = entry.tile[0] === entry.tile[1]
  const inCorner = pos.dir === 0
  const renderVertical = isDbl || inCorner  // doubles and corner tiles are vertical

  let displayTile = [...entry.tile]
  if (!isDbl) {
    const logicalFlip = !!entry.flipped
    const visualMirror = pos.dir === -1
    if (logicalFlip !== visualMirror) displayTile = [entry.tile[1], entry.tile[0]]
  }

  const [top, bottom] = displayTile
  const isVert = renderVertical

  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x - pos.pw / 2,
        top: pos.y - pos.ph / 2,
        width: pos.pw,
        height: pos.ph,
        background: '#fffef8',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        display: 'grid',
        gridTemplateRows: isVert ? '1fr 1fr' : 'none',
        gridTemplateColumns: isVert ? 'none' : '1fr 1fr',
        overflow: 'hidden',
        zIndex: 1,
      }}
    >
      {/* Divider */}
      <div style={{
        position: 'absolute',
        ...(isVert
          ? { left: '10%', right: '10%', top: '50%', height: 1, transform: 'translateY(-50%)' }
          : { top: '10%', bottom: '10%', left: '50%', width: 1, transform: 'translateX(-50%)' }
        ),
        background: 'rgba(26,24,20,0.3)',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={`/tiles-white/${top}.png`}
          alt={String(top)}
          style={{
            width: '70%', height: '70%', objectFit: 'contain',
            ...(!isVert && top === 6 ? { transform: 'rotate(90deg)' } : {}),
          }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={`/tiles-white/${bottom}.png`}
          alt={String(bottom)}
          style={{
            width: '70%', height: '70%', objectFit: 'contain',
            ...(!isVert && bottom === 6 ? { transform: 'rotate(90deg)' } : {}),
          }}
        />
      </div>
    </div>
  )
}

export default function Board({ boardData, selectedTile, dragging, isMyTurn, onDropZone, onDragPlace }) {
  const areaRef = useRef(null)
  const [dims, setDims] = useState({ w: 800, h: 300 })
  const [dragOver, setDragOver] = useState(null)
  const onDragPlaceRef = useRef(onDragPlace)
  const hasTilesRef = useRef(false)

  useEffect(() => { onDragPlaceRef.current = onDragPlace }, [onDragPlace])
  const draggingRef = useRef(null)
  useEffect(() => { draggingRef.current = dragging }, [dragging])

  const tiles = boardData?.tiles || []
  const hasTiles = tiles.length > 0
  hasTilesRef.current = hasTiles

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setDims({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    function onTileDrop() {
      if (!hasTilesRef.current && draggingRef.current) {
        const data = draggingRef.current
        onDragPlaceRef.current(data.tile, data.idx, 'first')
      }
    }
    el.addEventListener('tile-drop-board', onTileDrop)
    return () => el.removeEventListener('tile-drop-board', onTileDrop)
  }, [])

  const positions = hasTiles ? computeSnakePositions(tiles, dims.w, dims.h) : []
  const canLeft  = selectedTile && isMyTurn && canPlayOnSide(selectedTile.tile, 'left', boardData)
  const canRight = selectedTile && isMyTurn && canPlayOnSide(selectedTile.tile, 'right', boardData)
  const posL = positions[0]
  const posR = positions[positions.length - 1]

  function handleDragOver(e, side) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(side)
  }

  function handleDrop(e, side) {
    e.preventDefault()
    setDragOver(null)
    const data = draggingRef.current
    if (!data) return
    onDragPlace(data.tile, data.idx, side)
  }

  function handleTileDrop(side) {
    const data = draggingRef.current
    if (!data) return
    onDragPlace(data.tile, data.idx, side)
  }

  return (
    <div
      className="board-area"
      ref={areaRef}
      onDragOver={e => { if (!hasTiles && isMyTurn) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
      onDrop={e => {
        e.preventDefault()
        if (!hasTiles && isMyTurn && draggingRef.current) {
          onDragPlace(draggingRef.current.tile, draggingRef.current.idx, 'first')
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
        <Tile key={i} entry={tiles[i]} pos={pos} />
      ))}

      {canLeft && posL && (
        <div
          className={`drop-zone ${dragOver === 'left' ? 'drag-over' : ''}`}
          style={{ left: Math.max(4, posL.x - posL.pw / 2 - 76), top: posL.y - 22, width: 68, height: 44 }}
          onClick={() => onDropZone('left')}
          onDragOver={e => handleDragOver(e, 'left')}
          onDragLeave={() => setDragOver(null)}
          onDrop={e => handleDrop(e, 'left')}
          onTileDrop={() => handleTileDrop('left')}
        >← Left</div>
      )}

      {canRight && posR && (
        <div
          className={`drop-zone ${dragOver === 'right' ? 'drag-over' : ''}`}
          style={{ left: Math.min(dims.w - 76, posR.x + posR.pw / 2 + 4), top: posR.y - 22, width: 68, height: 44 }}
          onClick={() => onDropZone('right')}
          onDragOver={e => handleDragOver(e, 'right')}
          onDragLeave={() => setDragOver(null)}
          onDrop={e => handleDrop(e, 'right')}
          onTileDrop={() => handleTileDrop('right')}
        >Right →</div>
      )}
    </div>
  )
}
