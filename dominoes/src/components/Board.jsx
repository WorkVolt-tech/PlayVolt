import { useRef, useEffect, useState, useCallback } from 'react'
import DominoTile from './DominoTile'
import { computeSnakePositions, canPlayOnSide } from '../lib/game'
import './Board.css'

export default function Board({ boardData, selectedTile, isMyTurn, onDropZone }) {
  const areaRef = useRef(null)
  const [dims, setDims] = useState({ w: 800, h: 300 })

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

  const canLeft  = selectedTile && isMyTurn && canPlayOnSide(selectedTile.tile, 'left', boardData)
  const canRight = selectedTile && isMyTurn && canPlayOnSide(selectedTile.tile, 'right', boardData)

  const posL = positions[0]
  const posR = positions[positions.length - 1]

  return (
    <div className="board-area" ref={areaRef}>
      {!hasTiles && (
        <div className="board-hint">
          <span className="board-hint-text">
            {isMyTurn ? 'Click a tile to place it' : 'Waiting for first tile…'}
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
          className="drop-zone"
          style={{
            left:   Math.max(4, posL.x - posL.pw / 2 - 76),
            top:    posL.y - 22,
            width:  68,
            height: 44,
          }}
          onClick={() => onDropZone('left')}
        >
          ← Left
        </div>
      )}
      {canRight && posR && (
        <div
          className="drop-zone"
          style={{
            left:   Math.min(dims.w - 76, posR.x + posR.pw / 2 + 4),
            top:    posR.y - 22,
            width:  68,
            height: 44,
          }}
          onClick={() => onDropZone('right')}
        >
          Right →
        </div>
      )}
    </div>
  )
}
