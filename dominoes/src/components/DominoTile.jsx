import { useRef, useEffect } from 'react'
import './DominoTile.css'

export default function DominoTile({
  top, bottom, isVertical = true,
  playable = false, selected = false, notPlayable = false,
  onClick, style, className = '',
  draggable = false, onDragStart, onDragEnd,
}) {
  const ref = useRef(null)

  let cls = 'domino-tile'
  if (isVertical) cls += ' vertical'
  else cls += ' horizontal'
  if (playable) cls += ' playable'
  if (selected) cls += ' selected'
  if (notPlayable) cls += ' not-playable'
  if (className) cls += ' ' + className

  // Touch drag — non-passive so we can preventDefault scroll
  useEffect(() => {
    const el = ref.current
    if (!el || !draggable) return

    function onTouchStart(e) {
      if (onDragStart) onDragStart()
    }

    function onTouchMove(e) {
      e.preventDefault()
      const t = e.touches[0]
      document.querySelectorAll('.drop-zone').forEach(dz => dz.classList.remove('drag-over'))
      const elUnder = document.elementFromPoint(t.clientX, t.clientY)
      const dz = elUnder?.closest('.drop-zone')
      if (dz) dz.classList.add('drag-over')
    }

    function onTouchEnd(e) {
      const t = e.changedTouches[0]
      document.querySelectorAll('.drop-zone').forEach(dz => dz.classList.remove('drag-over'))
      const elUnder = document.elementFromPoint(t.clientX, t.clientY)
      const dz = elUnder?.closest('.drop-zone')
      if (dz) dz.dispatchEvent(new CustomEvent('tile-touch-drop', { bubbles: true }))
      const board = elUnder?.closest('.board-area')
      if (board && !dz) board.dispatchEvent(new CustomEvent('tile-touch-drop-board', { bubbles: true }))
      if (onDragEnd) onDragEnd()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [draggable, onDragStart, onDragEnd])

  return (
    <div
      ref={ref}
      className={cls}
      style={style}
      onClick={onClick}
      draggable={draggable}
      onDragStart={draggable ? (e) => {
        e.dataTransfer.effectAllowed = 'move'
        if (onDragStart) {
          const payload = onDragStart()
          if (payload) {
            const json = JSON.stringify({ tile: payload.tile, idx: payload.idx })
            e.dataTransfer.setData('application/x-domino', json)
            e.dataTransfer.setData('application/json', json)
            e.dataTransfer.setData('text/plain', json)
          }
        }
      } : undefined}
      onDragEnd={draggable ? () => { if (onDragEnd) onDragEnd() } : undefined}
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
