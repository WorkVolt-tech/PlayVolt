import { useEffect, useState } from 'react'
import './KnockAnimation.css'

// position: 'bottom' | 'left' | 'top' | 'right'
export default function KnockAnimation({ playerName, position = 'bottom', onDone }) {
  const [phase, setPhase] = useState('idle')

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('in'),      50),
      setTimeout(() => setPhase('knock1'),  200),
      setTimeout(() => setPhase('up1'),     450),
      setTimeout(() => setPhase('knock2'),  650),
      setTimeout(() => setPhase('up2'),     900),
      setTimeout(() => setPhase('out'),     1100),
      setTimeout(() => onDone(),            1500),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  // Rotation and origin based on where the player sits
  const rotations = {
    bottom: 0,
    left:   -90,
    top:    180,
    right:  90,
  }

  // Direction the hand moves to "knock" — toward the center
  const knockTranslate = {
    bottom: 'translateY(-40px)',
    left:   'translateX(40px)',
    top:    'translateY(40px)',
    right:  'translateX(-40px)',
  }
  const restTranslate = {
    bottom: 'translateY(-10px)',
    left:   'translateX(10px)',
    top:    'translateY(10px)',
    right:  'translateX(-10px)',
  }
  const exitTranslate = {
    bottom: 'translateY(60px)',
    left:   'translateX(-60px)',
    top:    'translateY(-60px)',
    right:  'translateX(60px)',
  }

  // Flip horizontally for right/top so fist faces toward board
  const flip = (position === 'right' || position === 'top') ? ' scaleX(-1)' : ''
  const rot = `rotate(${rotations[position]}deg)${flip}`

  const handStyle = {
    width: 90,
    transformOrigin: 'center center',
    filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.7))',
    transition: 'transform 0.18s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.25s',
    ...{
      idle:   { transform: `${rot} ${exitTranslate[position]}`, opacity: 0 },
      in:     { transform: `${rot} ${restTranslate[position]}`, opacity: 1 },
      knock1: { transform: `${rot} ${knockTranslate[position]}`, opacity: 1 },
      up1:    { transform: `${rot} ${restTranslate[position]}`, opacity: 1 },
      knock2: { transform: `${rot} ${knockTranslate[position]}`, opacity: 1 },
      up2:    { transform: `${rot} ${restTranslate[position]}`, opacity: 1 },
      out:    { transform: `${rot} ${exitTranslate[position]}`, opacity: 0 },
    }[phase],
  }

  // Position the container at the player's side
  const containerStyle = {
    position: 'fixed',
    zIndex: 400,
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    ...{
      bottom: { bottom: 160, left: '50%', transform: 'translateX(-50%)' },
      left:   { left: 40,   top: '50%',  transform: 'translateY(-50%)' },
      top:    { top: 60,    left: '50%', transform: 'translateX(-50%)' },
      right:  { right: 40,  top: '50%',  transform: 'translateY(-50%)' },
    }[position],
  }

  const labelStyle = {
    fontFamily: 'DM Mono, monospace',
    fontSize: '0.58rem',
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: 'var(--ivory-dim)',
    background: 'rgba(15,14,12,0.85)',
    padding: '3px 10px',
    borderRadius: 4,
    border: '1px solid var(--border)',
    whiteSpace: 'nowrap',
    transition: 'opacity 0.25s',
    opacity: phase === 'idle' || phase === 'out' ? 0 : 1,
  }

  return (
    <div style={containerStyle}>
      {(position === 'bottom' || position === 'top') && (
        <div style={labelStyle}>{playerName} passes</div>
      )}
      <img src="/handknock.webp" alt="" draggable={false} style={handStyle} />
      {(position === 'left' || position === 'right') && (
        <div style={labelStyle}>{playerName} passes</div>
      )}
    </div>
  )
}
