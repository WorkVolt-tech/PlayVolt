import { useEffect, useRef } from 'react'
import './KnockAnimation.css'

// ── The knock ────────────────────────────────────────────────────────────────
// A hand comes in from the player's side, raps the table twice, and leaves.
//
// It's ONE CSS animation the browser runs by itself. (It used to be seven
// timers each moving the hand to its next position; on a busy phone those
// timers fire late and bunch up, so in-between positions were never drawn —
// the hand would skip the actual knock.)
//
// Every knock must be its own element: render it with key={knockKey(knock)},
// so two knocks in a row each start from the beginning.

// load the hand picture up front, so the first knock isn't waiting on it
if (typeof Image !== 'undefined') { const img = new Image(); img.src = '/handknock.webp' }

// A stable, unique key per knock object (each knock is a new object).
const ids = new WeakMap(); let next = 0
export function knockKey(knock) {
  if (!knock || typeof knock !== 'object') return 'none'
  if (!ids.has(knock)) ids.set(knock, ++next)
  return `knock-${ids.get(knock)}`
}

// position: 'bottom' | 'left' | 'top' | 'right'
const ROT = {
  bottom: 'rotate(0deg)',
  left:   'rotate(90deg)',
  top:    'rotate(180deg) scaleX(-1)',
  right:  'rotate(-90deg) scaleX(-1)',
}
// rest, knock (toward the table) and exit offsets, in the hand's own frame
const MOVES = {
  bottom: ['translateY(-10px)', 'translateY(-40px)', 'translateY(60px)'],
  left:   ['translateX(10px)',  'translateX(40px)',  'translateX(-60px)'],
  top:    ['translateY(10px)',  'translateY(40px)',  'translateY(-60px)'],
  right:  ['translateX(-10px)', 'translateX(-40px)', 'translateX(60px)'],
}
const PLACE = {
  bottom: { bottom: 160, left: '50%', transform: 'translateX(-50%)' },
  left:   { left: 40,   top: '50%',  transform: 'translateY(-50%)' },
  top:    { top: 60,    left: '50%', transform: 'translateX(-50%)' },
  right:  { right: 40,  top: '50%',  transform: 'translateY(-50%)' },
}
const DURATION = 1500

export default function KnockAnimation({ playerName, position = 'bottom', onDone }) {
  const done = useRef(false)
  const finish = () => {
    if (done.current) return
    done.current = true
    onDone?.()
  }
  // Safety net: if the browser never reports the animation's end (a hidden
  // tab, reduced motion), the queue still moves on.
  useEffect(() => {
    const t = setTimeout(finish, DURATION + 400)
    return () => clearTimeout(t)
  }, [])

  const pos = ROT[position] ? position : 'bottom'
  const [rest, knock, exit] = MOVES[pos]
  const vars = {
    '--knock-rot': ROT[pos],
    '--knock-rest': rest,
    '--knock-hit': knock,
    '--knock-exit': exit,
    '--knock-ms': `${DURATION}ms`,
  }

  return (
    <div className="knock-wrap" style={{ ...PLACE[pos], ...vars }}>
      {(pos === 'bottom' || pos === 'top') && <div className="knock-name">{playerName} passes</div>}
      <img
        src="/handknock.webp" alt="" draggable={false}
        className="knock-hand-img"
        onAnimationEnd={finish}
      />
      {(pos === 'left' || pos === 'right') && <div className="knock-name">{playerName} passes</div>}
    </div>
  )
}
