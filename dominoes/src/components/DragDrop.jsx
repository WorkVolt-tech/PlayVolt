import { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

const DragContext = createContext(null)

const dropZones = new Map()

// Module-level flag so code outside the React tree (useGameState's realtime
// subscription) can tell whether a drag gesture is in progress right now,
// without needing to be a React consumer of drag state.
let dragActive = false
export function isDragActive() {
  return dragActive
}

export function registerDropZone(id, handler) {
  dropZones.set(id, handler)
}

export function unregisterDropZone(id) {
  dropZones.delete(id)
}

export function DragProvider({ children }) {
  const [dragging, setDragging] = useState(null)
  const [isTouch, setIsTouch] = useState(false)

  const draggingRef = useRef(null)
  // Ghost position is tracked here and written straight to the DOM on every
  // move — NOT via useState. Routing every touchmove through React state
  // re-renders the whole drag tree (Board, every tile, every drop zone) up
  // to 60x/sec, and on a phone that competes with any other re-render
  // (e.g. the board syncing another player's move) for the same frame,
  // causing missed/batched events and the ghost visibly jumping ahead of
  // the finger. Direct DOM mutation makes ghost-tracking immune to that.
  const posRef = useRef({ x: 0, y: 0 })
  const ghostRef = useRef(null)

  const startDrag = useCallback((data, clientX, clientY, touch = false) => {
    dragActive = true
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

    draggingRef.current = null
    dragActive = false
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
         *
         * Position is set here only for the very first paint —
         * every subsequent move updates ghostRef.current.style
         * directly (see setGhostPos above), bypassing React.
         */

        position: 'fixed',

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
