import { useEffect, useRef, useState } from 'react'
import './ReshuffleOffer.css'

// ── Five doubles: reshuffle or play on ───────────────────────────────────────
// A player dealt 5 or more doubles may call a reshuffle (never in partner
// games — anything goes with a partner). They have 10 seconds; not answering
// counts as playing on. The game waits while the offer is open.
//
// For the player holding the doubles: two buttons and a countdown.
// For everyone else (multiplayer): a note that the table is waiting.

export const OFFER_SECONDS = 10

export function countDoubles(hand) {
  return (hand || []).filter(t => Array.isArray(t) && t[0] === t[1]).length
}

export default function ReshuffleOffer({ doubles, onReshuffle, onContinue, waitingFor, seconds = OFFER_SECONDS }) {
  const [left, setLeft] = useState(seconds)
  const decided = useRef(false)
  const decide = fn => { if (decided.current) return; decided.current = true; fn?.() }

  useEffect(() => {
    const started = Date.now()
    const t = setInterval(() => {
      const remain = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000))
      setLeft(remain)
      if (remain <= 0) { clearInterval(t); if (!waitingFor) decide(onContinue) }   // no answer = play on
    }, 250)
    return () => clearInterval(t)
  }, [])

  if (waitingFor) {
    return (
      <div className="reshuffle-offer waiting">
        <div className="reshuffle-text">
          <strong>{waitingFor}</strong> was dealt 5 doubles and may call a reshuffle… <span className="reshuffle-count">{left}s</span>
        </div>
      </div>
    )
  }
  return (
    <div className="reshuffle-offer">
      <div className="reshuffle-text">
        You were dealt <strong>{doubles} doubles</strong>. Reshuffle, or play on?
        <span className="reshuffle-count">{left}s</span>
      </div>
      <div className="reshuffle-actions">
        <button className="reshuffle-btn primary" onClick={() => decide(onReshuffle)}>Reshuffle</button>
        <button className="reshuffle-btn" onClick={() => decide(onContinue)}>Play on</button>
      </div>
    </div>
  )
}
