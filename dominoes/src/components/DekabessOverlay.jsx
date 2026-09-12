import { useEffect, useRef, useState } from 'react'
import './DekabessOverlay.css'

export default function DekabessOverlay({ playerName, onDone }) {
  const canvasRef = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Fade in first, then start confetti
    const showTimer = setTimeout(() => setVisible(true), 50)
    const doneTimer = setTimeout(() => onDone(), 3800)
    return () => { clearTimeout(showTimer); clearTimeout(doneTimer) }
  }, [onDone])

  useEffect(() => {
    if (!visible) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 200,
      w: 8 + Math.random() * 10,
      h: 4 + Math.random() * 5,
      color: ['#c9a84c','#e8c96a','#fff','#4caa6e','#4c8cca','#c94c4c'][Math.floor(Math.random() * 6)],
      speed: 3 + Math.random() * 4,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.12,
      drift: (Math.random() - 0.5) * 1.5,
    }))

    let frame, running = true
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
    return () => { running = false; cancelAnimationFrame(frame) }
  }, [visible])

  return (
    <div className={`dekabess-overlay ${visible ? 'dekabess-visible' : ''}`}>
      <canvas ref={canvasRef} className="dekabess-canvas" />
      <div className={`dekabess-content ${visible ? 'dekabess-content-in' : ''}`}>
        <div className="dekabess-word">🎯 Dekabess!</div>
        <div className="dekabess-sub">{playerName} plays a Dekabess!</div>
        <div className="dekabess-counts">Counts as 2 wins!</div>
      </div>
    </div>
  )
}
