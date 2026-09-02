import { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react'

const DragContext = createContext(null)

export function DragProvider({ children }) {
  const [dragging, setDragging] = useState(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const draggingRef = useRef(null)

  const startDrag = useCallback((data, e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    draggingRef.current = data
    setDragging(data)
    setPos({ x: clientX, y: clientY })
  }, [])

  const endDrag = useCallback(() => {
    draggingRef.current = null
    setDragging(null)
  }, [])

  useEffect(() => {
    function onMove(e) {
      if (!draggingRef.current) return
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      setPos({ x: clientX, y: clientY })
    }
    function onUp() {
      if (draggingRef.current) endDrag()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [endDrag])

  return (
    <DragContext.Provider value={{ dragging, draggingRef, pos, startDrag, endDrag }}>
      {children}
      {/* Ghost tile following cursor */}
      {dragging && (
        <div style={{
          position: 'fixed',
          left: pos.x - 28,
          top: pos.y - 28,
          width: 28,
          height: 56,
          background: '#fffef8',
          borderRadius: 5,
          border: '2px solid #c9a84c',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          zIndex: 9999,
          opacity: 0.9,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-around',
          padding: '4px 0',
        }}>
          <img src={`/tiles-white/${dragging.tile[0]}.png`} alt="" draggable={false}
            style={{ width: '70%', pointerEvents: 'none' }} />
          <div style={{ width: '80%', height: 1, background: 'rgba(0,0,0,0.2)' }} />
          <img src={`/tiles-white/${dragging.tile[1]}.png`} alt="" draggable={false}
            style={{ width: '70%', pointerEvents: 'none' }} />
        </div>
      )}
    </DragContext.Provider>
  )
}

export function useDrag() {
  return useContext(DragContext)
}

// Wrap a tile to make it draggable
export function Draggable({ children, data, disabled }) {
  const { startDrag } = useDrag()

  function onMouseDown(e) {
    if (disabled) return
    e.preventDefault()
    startDrag(data, e)
  }

  function onTouchStart(e) {
    if (disabled) return
    startDrag(data, e)
  }

  return (
    <div
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      style={{ cursor: disabled ? 'default' : 'grab', display: 'contents' }}
    >
      {children}
    </div>
  )
}

// Wrap a drop target
export function DropZone({ onDrop, children, style, className }) {
  const { draggingRef, endDrag } = useDrag()
  const ref = useRef(null)

  function onMouseUp(e) {
    const data = draggingRef.current
    if (!data) return
    endDrag()
    onDrop(data)
  }

  function onTouchEnd(e) {
    const data = draggingRef.current
    if (!data) return
    const t = e.changedTouches[0]
    const el = document.elementFromPoint(t.clientX, t.clientY)
    if (ref.current && ref.current.contains(el)) {
      endDrag()
      onDrop(data)
    }
  }

  return (
    <div
      ref={ref}
      style={style}
      className={className}
      onMouseUp={onMouseUp}
      onTouchEnd={onTouchEnd}
    >
      {children}
    </div>
  )
}
