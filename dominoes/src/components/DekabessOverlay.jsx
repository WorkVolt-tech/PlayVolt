import { useEffect, useRef } from 'react'
import './DekabessOverlay.css'

export default function DekabessOverlay({ playerName, onDone }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const pieces = Array.from({ length: 150 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height,
      w: 8 + Math.random() * 12,
      h: 4 + Math.random() * 6,
      color: ['#c9a84c','#e8c96a','#fff','#4caa6e','#4c8cca','#c94c4c'][Math.floor(Math.random() * 6)],
      speed: 2 + Math.random() * 4,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.15,
      drift: (Math.random() - 0.5) * 2,
    }))

    let frame
    let running = true

    function draw() {
      if (!running) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      pieces.forEach(p => {
        p.y += p.speed
        p.x += p.drift
        p.angle += p.spin
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.angle)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      })
      frame = requestAnimationFrame(draw)
    }
    draw()

    const timer = setTimeout(() => { onDone() }, 3500)
    return () => { running = false; cancelAnimationFrame(frame); clearTimeout(timer) }
  }, [onDone])

  return (
    <div className="dekabess-overlay">
      <canvas ref={canvasRef} className="dekabess-canvas" />
      <div className="dekabess-content">
        <div className="dekabess-word">🎯 Dekabess!</div>
        <div className="dekabess-sub">{playerName} plays a Dekabess!</div>
        <div className="dekabess-counts">Counts as 2 wins!</div>
      </div>
    </div>
  )
}
