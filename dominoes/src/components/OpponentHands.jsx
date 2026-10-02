import './OpponentHands.css'
import TileBack from './TileBack'

// Initials for a seat plate: "Ti-Djo" → "TD", "Maxo" → "MA".
function initials(name = '') {
  const parts = String(name).split(/[\s\-_.]+/).filter(Boolean)
  const s = parts.length > 1 ? parts[0][0] + parts[1][0] : String(name).slice(0, 2)
  return s.toUpperCase()
}

// turnClock (optional, multiplayer): { start, limit } in ms. When given, the
// active player's plate shows the time left as a gold ring that drains.
export default function OpponentHands({ players, myInfo, roomData, turnClock }) {
  const mySeat = myInfo?.seat ?? 0

  // Position relative to MY seat (counter-clockwise: 1=right, 2=top, 3=left)
  function getPosition(theirSeat) {
    const diff = ((theirSeat - mySeat) + 4) % 4
    if (diff === 1) return 'right'
    if (diff === 2) return 'top'
    if (diff === 3) return 'left'
    return null
  }

  return (
    <>
      {players
        .filter(p => p.seat !== mySeat)
        .map(p => {
          const pos = getPosition(p.seat)
          if (!pos) return null
          const count = Array.isArray(p.hand) ? p.hand.length : 0
          const isActive = roomData?.current_turn === p.seat
          return (
            <div key={p.seat} className={`opponent-area opponent-${pos} ${isActive ? 'is-turn' : ''}`}>
              {(() => {
                // Seat plate: initials in a circle, the name beside it. On the
                // active player, a ring — draining with the turn clock when
                // there is one, solid gold when there isn't.
                let ring = 'rgba(255,255,255,0.12)'
                if (isActive) {
                  if (turnClock?.start && turnClock?.limit && !p.is_ai) {   // bots never time out
                    const left = Math.max(0, Math.min(1, 1 - (Date.now() - turnClock.start) / turnClock.limit))
                    const deg = Math.round(left * 360)
                    const col = left <= 0.125 ? '#e0605c' : '#e8c96a'
                    ring = `conic-gradient(${col} 0deg ${deg}deg, rgba(255,255,255,0.12) ${deg}deg 360deg)`
                  } else {
                    ring = '#e8c96a'
                  }
                }
                return (
                  <div className="seat-plate">
                    <div className="seat-ring" style={{ background: ring }}>
                      <div className="seat-initials">{initials(p.nickname)}</div>
                    </div>
                    <div className="opponent-name">{p.nickname}</div>
                  </div>
                )
              })()}
              <div className={`opponent-tiles opponent-tiles-${pos}`}>
                {Array.from({ length: count }).map((_, i) => (
                  // Across the table, tiles stand upright; to your left and
                  // right they lie sideways, as you'd see those hands held.
                  // Backs show the equipped skin, turned with the tile.
                  pos === 'top'
                    ? <div key={i} className="opponent-tile vertical"><TileBack /></div>
                    : <div key={i} className="opponent-tile horizontal"><TileBack turn={pos === 'left' ? 90 : -90} /></div>
                ))}
              </div>
            </div>
          )
        })}
    </>
  )
}
