import { useRef, useEffect } from 'react'
import { setDragging, clearDragging } from '../lib/dragDrop'
import './DominoTile.css'

export default function DominoTile({
  top, bottom, isVertical = true,
  playable = false, selected = false, notPlayable = false,
  onClick, style, className = '',
  draggable = false, dragData = null,
}) {
  const ref = useRef(null)

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
  }

  function handleDragEnd() {
    clearDragging()
  }

  // ── Touch drag (non-passive so we can preventDefault) ───────
  useEffect(() => {
    const el = ref.current
    if (!el || !draggable) return

    function onTouchStart(e) {
      if (!dragData) return
      setDragging(dragData)
    }

    function onTouchMove(e) {
      if (!dragData) return
      e.preventDefault() // must be non-passive to work
      const t = e.touches[0]
      document.querySelectorAll('.drop-zone').forEach(dz => dz.classList.remove('drag-over'))
      const el = document.elementFromPoint(t.clientX, t.clientY)
      const dz = el?.closest('.drop-zone')
      if (dz) dz.classList.add('drag-over')
    }

    function onTouchEnd(e) {
      const t = e.changedTouches[0]
      document.querySelectorAll('.drop-zone').forEach(dz => dz.classList.remove('drag-over'))
      const el = document.elementFromPoint(t.clientX, t.clientY)
      const dz = el?.closest('.drop-zone')
      if (dz) dz.dispatchEvent(new CustomEvent('tile-drop', { bubbles: true }))
      // Also check board area for first tile placement
      const board = el?.closest('.board-area')
      if (board && !dz) board.dispatchEvent(new CustomEvent('tile-drop-board', { bubbles: true }))
      clearDragging()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [draggable, dragData])

  return (
    <div
      ref={ref}
      className={cls}
      style={style}
      onClick={playable || onClick ? onClick : undefined}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
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
