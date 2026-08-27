import { useRef } from 'react'
import { setDragging, clearDragging } from '../lib/dragDrop'
import './DominoTile.css'

export default function DominoTile({
  top, bottom, isVertical = true,
  playable = false, selected = false, notPlayable = false,
  onClick, style, className = '',
  // drag props
  draggable = false, dragData = null,
}) {
  const touchStartPos = useRef(null)
  const ghostRef = useRef(null)

  let cls = 'domino-tile'
  if (isVertical) cls += ' vertical'
  else cls += ' horizontal'
  if (playable) cls += ' playable'
  if (selected) cls += ' selected'
  if (notPlayable) cls += ' not-playable'
  if (className) cls += ' ' + className

  // ── Mouse drag ──────────────────────────────────────────────
  function handleDragStart(e) {
    if (!draggable || !dragData) return
    setDragging(dragData)
    e.dataTransfer.effectAllowed = 'move'
    // Make drag ghost transparent so we don't see the default
    const ghost = document.createElement('div')
    ghost.style.position = 'fixed'
    ghost.style.top = '-9999px'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    ghostRef.current = ghost
  }

  function handleDragEnd() {
    clearDragging()
    if (ghostRef.current) {
      document.body.removeChild(ghostRef.current)
      ghostRef.current = null
    }
  }

  // ── Touch drag ──────────────────────────────────────────────
  function handleTouchStart(e) {
    if (!draggable || !dragData) return
    const t = e.touches[0]
    touchStartPos.current = { x: t.clientX, y: t.clientY }
    setDragging(dragData)
  }

  function handleTouchMove(e) {
    if (!draggable || !dragData) return
    e.preventDefault() // prevent scroll while dragging
    const t = e.touches[0]
    // Find element under finger
    const el = document.elementFromPoint(t.clientX, t.clientY)
    // Highlight drop zones under finger
    document.querySelectorAll('.drop-zone').forEach(dz => dz.classList.remove('drag-over'))
    const dz = el?.closest('.drop-zone')
    if (dz) dz.classList.add('drag-over')
  }

  function handleTouchEnd(e) {
    if (!draggable || !dragData) return
    const t = e.changedTouches[0]
    // Find drop zone under finger
    const el = document.elementFromPoint(t.clientX, t.clientY)
    document.querySelectorAll('.drop-zone').forEach(dz => dz.classList.remove('drag-over'))
    const dz = el?.closest('.drop-zone')
    if (dz) {
      // Trigger the drop zone's onDrop
      dz.dispatchEvent(new CustomEvent('tile-drop', { bubbles: true }))
    }
    clearDragging()
  }

  return (
    <div
      className={cls}
      style={style}
      onClick={playable || onClick ? onClick : undefined}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="pip-half">
        <img
          className="pip-img"
          src={`/tiles-white/${top}.png`}
          alt={String(top)}
          style={!isVertical && top === 6 ? { transform: 'rotate(90deg)' } : undefined}
        />
      </div>
      <div className="pip-half">
        <img
          className="pip-img"
          src={`/tiles-white/${bottom}.png`}
          alt={String(bottom)}
          style={!isVertical && bottom === 6 ? { transform: 'rotate(90deg)' } : undefined}
        />
      </div>
    </div>
  )
}
