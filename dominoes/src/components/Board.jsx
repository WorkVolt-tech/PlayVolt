import { useRef, useEffect, useState } from 'react'
import DominoTile from './DominoTile'
import { computeSnakePositions, canPlayOnSide } from '../lib/game'
import { getDragging, clearDragging } from '../lib/dragDrop'
import './Board.css'

export default function Board({ boardData, selectedTile, isMyTurn, onDropZone, onDragPlace }) {
  const areaRef = useRef(null)
  const [dims, setDims] = useState({ w: 800, h: 300 })
  const [dragOver, setDragOver] = useState(null) // 'left' | 'right' | null

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

  const tiles = boardData?.tiles || []
  const hasTiles = tiles.length > 0
  const positions = hasTiles ? computeSnakePositions(tiles, dims.w, dims.h) : []

  const dragging = getDragging()
  const canLeft  = (selectedTile || dragging) && isMyTurn && canPlayOnSide((selectedTile || dragging)?.tile, 'left', boardData)
  const canRight = (selectedTile || dragging) && isMyTurn && canPlayOnSide((selectedTile || dragging)?.tile, 'right', boardData)

  const posL = positions[0]
  const posR = positions[positions.length - 1]

  // ── Drag handlers for drop zones ─────────────────────────────
  function handleDragOver(e, side) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(side)
  }

  function handleDragLeave() {
    setDragOver(null)
  }

  function handleDrop(e, side) {
    e.preventDefault()
    setDragOver(null)
    const data = getDragging()
    if (!data) return
    clearDragging()
    onDragPlace(data.tile, data.idx, side)
  }

  // Touch drop — fired by DominoTile's touchend via custom event
  function handleTileDrop(e, side) {
    const data = getDragging()
    if (!data) return
    clearDragging()
    onDragPlace(data.tile, data.idx, side)
  }

  // ── Board-area drag (drop anywhere on board when no tiles yet) ──
  function handleBoardDragOver(e) {
    if (!hasTiles && isMyTurn) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
  }
  function handleBoardDrop(e) {
    e.preventDefault()
    if (!hasTiles && isMyTurn) {
      const data = getDragging()
      if (!data) return
      clearDragging()
      onDragPlace(data.tile, data.idx, 'first')
    }
  }

  return (
    <div
      className="board-area"
      ref={areaRef}
      onDragOver={handleBoardDragOver}
      onDrop={handleBoardDrop}
    >
      {!hasTiles && (
        <div className="board-hint">
          <span className="board-hint-text">
            {isMyTurn ? 'Drag or tap a tile to place it' : 'Waiting for first tile…'}
          </span>
        </div>
      )}

      {positions.map((pos, i) => {
        const entry = tiles[i]
        const isDbl = entry.tile[0] === entry.tile[1]
        const inCorner = pos.dir === 0
        const renderVertical = inCorner ? !isDbl : isDbl

        let displayTile = [...entry.tile]
        if (!isDbl) {
          const logicalFlip  = !!entry.flipped
          const visualMirror = pos.dir === -1
          if (logicalFlip !== visualMirror) displayTile = [entry.tile[1], entry.tile[0]]
        }

        return (
          <DominoTile
            key={i}
            top={displayTile[0]}
            bottom={displayTile[1]}
            isVertical={renderVertical}
            style={{
              position: 'absolute',
              left: pos.x - pos.pw / 2,
              top:  pos.y - pos.ph / 2,
              zIndex: i + 1,
              width: pos.pw,
              height: pos.ph,
            }}
          />
        )
      })}

      {/* Drop zones */}
      {canLeft && posL && (
        <div
          className={`drop-zone ${dragOver === 'left' ? 'drag-over' : ''}`}
          style={{
            left:   Math.max(4, posL.x - posL.pw / 2 - 76),
            top:    posL.y - 22,
            width:  68,
            height: 44,
          }}
          onClick={() => onDropZone('left')}
          onDragOver={e => handleDragOver(e, 'left')}
          onDragLeave={handleDragLeave}
          onDrop={e => handleDrop(e, 'left')}
          onTileDrop={e => handleTileDrop(e, 'left')}
        >
          ← Left
        </div>
      )}
      {canRight && posR && (
        <div
          className={`drop-zone ${dragOver === 'right' ? 'drag-over' : ''}`}
          style={{
            left:   Math.min(dims.w - 76, posR.x + posR.pw / 2 + 4),
            top:    posR.y - 22,
            width:  68,
            height: 44,
          }}
          onClick={() => onDropZone('right')}
          onDragOver={e => handleDragOver(e, 'right')}
          onDragLeave={handleDragLeave}
          onDrop={e => handleDrop(e, 'right')}
          onTileDrop={e => handleTileDrop(e, 'right')}
        >
          Right →
        </div>
      )}
    </div>
  )
}
