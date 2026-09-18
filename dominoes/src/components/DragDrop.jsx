import { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react'

const DragContext = createContext(null)

const dropZones = new Map()
export function registerDropZone(id, handler) { dropZones.set(id, handler) }
export function unregisterDropZone(id) { dropZones.delete(id) }

export function DragProvider({ children }) {
  const [dragging, setDragging] = useState(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [isTouch, setIsTouch] = useState(false)
  const draggingRef = useRef(null)

  const startDrag = useCallback((data, clientX, clientY, touch = false) => {
    draggingRef.current = data
    setDragging(data)
    setIsTouch(touch)
    setPos({ x: clientX, y: clientY })
  }, [])

  const endDrag = useCallback((clientX, clientY) => {
    if (!draggingRef.current) return
    const data = draggingRef.current

    let dropped = false
    dropZones.forEach((handler, id) => {
      if (dropped) return
      const el = document.querySelector(`[data-dropzone-id="${id}"]`)
      if (!el) return
      const rect = el.getBoundingClientRect()

      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        dropped = true
        handler(data)
      }
    })

    draggingRef.current = null
    setDragging(null)
    setIsTouch(false)
  }, [])

  useEffect(() => {
    function onMouseMove(e) {
      if (!draggingRef.current) return

      setPos({
        x: e.clientX,
        y: e.clientY,
      })
    }

    function onMouseUp(e) {
      endDrag(e.clientX, e.clientY)
    }

    function onTouchMove(e) {
      if (!draggingRef.current) return

      e.preventDefault()

      const t = e.touches[0]

      setPos({
        x: t.clientX,
        y: t.clientY,
      })
    }

    function onTouchEnd(e) {
      if (!draggingRef.current) return

      const t = e.changedTouches[0]

      endDrag(t.clientX, t.clientY)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [endDrag])

  return (
    <DragContext.Provider
      value={{
        dragging,
        draggingRef,
        pos,
        startDrag,
        endDrag,
      }}
    >
      {children}

      {/* Dragged domino stays centered directly under mouse/finger */}
      {dragging && (
        <div
          style={{
            position: 'fixed',

            // Pointer/finger position
            left: pos.x,
            top: pos.y,

            // Center domino directly under pointer/finger
            transform: 'translate(-50%, -50%)',

            width: 28,
            height: 56,
            background: '#fffef8',
            borderRadius: 5,
            border: '2px solid #c9a84c',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
            zIndex: 9999,
            opacity: isTouch ? 0.9 : 0.9,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-around',
            padding: '4px 0',
            boxSizing: 'border-box',
          }}
        >
          <img
            src={`/tiles-white/${dragging.tile[0]}.png`}
            alt=""
            draggable={false}
            style={{
              width: '70%',
              pointerEvents: 'none',
            }}
          />

          <div
            style={{
              width: '80%',
              height: 1,
              background: 'rgba(0,0,0,0.2)',
            }}
          />

          <img
            src={`/tiles-white/${dragging.tile[1]}.png`}
            alt=""
            draggable={false}
            style={{
              width: '70%',
              pointerEvents: 'none',
            }}
          />
        </div>
      )}
    </DragContext.Provider>
  )
}

export function useDrag() {
  return useContext(DragContext)
}

export function Draggable({ children, data, disabled }) {
  const { startDrag, dragging } = useDrag()
  const ref = useRef(null)

  const isDragging =
    dragging &&
    `${dragging.tile[0]}-${dragging.tile[1]}` ===
      `${data?.tile?.[0]}-${data?.tile?.[1]}`

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function onMouseDown(e) {
      if (disabled) return

      e.preventDefault()

      startDrag(
        data,
        e.clientX,
        e.clientY,
        false
      )
    }

    function onTouchStart(e) {
      if (disabled) return

      e.preventDefault()

      const t = e.touches[0]

      startDrag(
        data,
        t.clientX,
        t.clientY,
        true
      )
    }

    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('touchstart', onTouchStart, {
      passive: false,
    })

    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('touchstart', onTouchStart)
    }
  }, [data, disabled, startDrag])

  return (
    <div
      ref={ref}
      style={{
        cursor: disabled ? 'default' : 'grab',
        display: 'contents',

        // Highlight the tile being dragged
        ...(isDragging
          ? {
              filter: 'brightness(1.2)',
              transform: 'scale(1.1)',
            }
          : {}),
      }}
    >
      {children}
    </div>
  )
}

let zoneCounter = 0

export function DropZone({
  onDrop,
  children,
  style,
  className,
}) {
  const id = useRef(`dz-${++zoneCounter}`).current
  const onDropRef = useRef(onDrop)

  useEffect(() => {
    onDropRef.current = onDrop
  }, [onDrop])

  useEffect(() => {
    registerDropZone(
      id,
      (data) => onDropRef.current(data)
    )

    return () => unregisterDropZone(id)
  }, [id])

  return (
    <div
      data-dropzone-id={id}
      style={style}
      className={className}
    >
      {children}
    </div>
  )
}
