import { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

const DragContext = createContext(null)

const dropZones = new Map()

export function registerDropZone(id, handler) {
  dropZones.set(id, handler)
}

export function unregisterDropZone(id) {
  dropZones.delete(id)
}

export function DragProvider({ children }) {
  const [dragging, setDragging] = useState(null)
  // Ghost position is tracked in a ref and written straight to the DOM on each
  // move — NOT React state. Routing every touchmove through setState re-renders
  // the whole drag tree (Board, every tile, every drop zone) up to 60x/sec; on
  // a phone those renders fall behind the finger and the ghost jumps ahead.
  const posRef = useRef({ x: 0, y: 0 })
  const ghostRef = useRef(null)
  const [isTouch, setIsTouch] = useState(false)

  const draggingRef = useRef(null)

  const startDrag = useCallback((data, clientX, clientY, touch = false) => {
    draggingRef.current = data
    setDragging(data)
    setIsTouch(touch)

    posRef.current = { x: clientX, y: clientY }
    if (ghostRef.current) {
      ghostRef.current.style.left = `${clientX}px`
      ghostRef.current.style.top = `${clientY}px`
    }
  }, [])

  const endDrag = useCallback((clientX, clientY) => {
    if (!draggingRef.current) return

    const data = draggingRef.current

    let dropped = false

    dropZones.forEach((handler, id) => {
      if (dropped) return

      const el = document.querySelector(
        `[data-dropzone-id="${id}"]`
      )

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

    // The lookup above depends on a DropZone element being in the DOM at the
    // exact moment of release. Those zones are conditionally rendered from
    // boardData, so any realtime reload landing mid-gesture unmounts them and
    // the drop silently does nothing. When nothing matched, fall back to
    // coordinate-based resolution — the same approach the desktop native-drop
    // path already uses via resolveNearestDropSide.
    if (!dropped) {
      document.dispatchEvent(new CustomEvent('tile-drop-fallback', {
        detail: { data, clientX, clientY },
      }))
    }

    draggingRef.current = null
    setDragging(null)
    setIsTouch(false)
  }, [])

  useEffect(() => {
    function setGhostPos(x, y) {
      posRef.current = { x, y }
      if (ghostRef.current) {
        ghostRef.current.style.left = `${x}px`
        ghostRef.current.style.top = `${y}px`
      }
    }

    function onMouseMove(e) {
      if (!draggingRef.current) return
      setGhostPos(e.clientX, e.clientY)
    }

    function onMouseUp(e) {
      endDrag(
        e.clientX,
        e.clientY
      )
    }

    function onTouchMove(e) {
      if (!draggingRef.current) return

      e.preventDefault()

      const t = e.touches[0]

      if (!t) return

      setGhostPos(t.clientX, t.clientY)
    }

    function onTouchEnd(e) {
      if (!draggingRef.current) return

      const t = e.changedTouches[0]

      if (!t) return

      endDrag(
        t.clientX,
        t.clientY
      )
    }

    window.addEventListener(
      'mousemove',
      onMouseMove
    )

    window.addEventListener(
      'mouseup',
      onMouseUp
    )

    window.addEventListener(
      'touchmove',
      onTouchMove,
      { passive: false }
    )

    window.addEventListener(
      'touchend',
      onTouchEnd
    )

    return () => {
      window.removeEventListener(
        'mousemove',
        onMouseMove
      )

      window.removeEventListener(
        'mouseup',
        onMouseUp
      )

      window.removeEventListener(
        'touchmove',
        onTouchMove
      )

      window.removeEventListener(
        'touchend',
        onTouchEnd
      )
    }
  }, [endDrag])

  const dragGhost = dragging ? (
    <div
      ref={ghostRef}
      style={{
        /*
         * IMPORTANT:
         *
         * This gets rendered directly into document.body
         * using createPortal().
         *
         * That prevents any rotated/transformed game
         * container from changing its coordinates.
         */

        position: 'fixed',

        /* first paint only — every later move writes straight to this node */
        left: `${posRef.current.x}px`,
        top: `${posRef.current.y}px`,

        /*
         * Put the exact CENTER of the domino
         * beneath the mouse/finger.
         */
        transform: 'translate(-50%, -50%)',

        width: 28,
        height: 56,

        background: '#fffef8',

        borderRadius: 5,

        border: '2px solid #c9a84c',

        boxShadow:
          '0 8px 24px rgba(0,0,0,0.5)',

        pointerEvents: 'none',

        zIndex: 2147483647,

        opacity: 0.9,

        display: 'flex',

        flexDirection: 'column',

        alignItems: 'center',

        justifyContent: 'space-around',

        padding: '4px 0',

        boxSizing: 'border-box',

        /*
         * Make absolutely sure the floating tile
         * itself isn't inheriting rotation/scaling.
         */
        margin: 0,
      }}
    >
      <img
        src={`/tiles-white/${dragging.tile[0]}.png`}
        alt=""
        draggable={false}
        style={{
          width: '70%',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      />

      <div
        style={{
          width: '80%',
          height: 1,
          background:
            'rgba(0,0,0,0.2)',
          pointerEvents: 'none',
        }}
      />

      <img
        src={`/tiles-white/${dragging.tile[1]}.png`}
        alt=""
        draggable={false}
        style={{
          width: '70%',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      />
    </div>
  ) : null

  return (
    <DragContext.Provider
      value={{
        dragging,
        draggingRef,
        posRef,
        startDrag,
        endDrag,
      }}
    >
      {children}

      {dragGhost &&
        typeof document !== 'undefined' &&
        createPortal(
          dragGhost,
          document.body
        )}
    </DragContext.Provider>
  )
}

export function useDrag() {
  return useContext(DragContext)
}

export function Draggable({
  children,
  data,
  disabled,
}) {
  const {
    startDrag,
    dragging,
  } = useDrag()

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

      if (!t) return

      startDrag(
        data,
        t.clientX,
        t.clientY,
        true
      )
    }

    el.addEventListener(
      'mousedown',
      onMouseDown
    )

    el.addEventListener(
      'touchstart',
      onTouchStart,
      { passive: false }
    )

    return () => {
      el.removeEventListener(
        'mousedown',
        onMouseDown
      )

      el.removeEventListener(
        'touchstart',
        onTouchStart
      )
    }
  }, [
    data,
    disabled,
    startDrag,
  ])

  return (
    <div
      ref={ref}
      style={{
        cursor:
          disabled
            ? 'default'
            : 'grab',

        display: 'contents',

        ...(isDragging
          ? {
              filter:
                'brightness(1.2)',
              transform:
                'scale(1.1)',
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
  const id =
    useRef(
      `dz-${++zoneCounter}`
    ).current

  const onDropRef =
    useRef(onDrop)

  useEffect(() => {
    onDropRef.current = onDrop
  }, [onDrop])

  useEffect(() => {
    registerDropZone(
      id,
      (data) =>
        onDropRef.current(data)
    )

    return () =>
      unregisterDropZone(id)
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
