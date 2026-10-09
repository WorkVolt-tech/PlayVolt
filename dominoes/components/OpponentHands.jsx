import './OpponentHands.css'
import TileBack from './TileBack'
import { SeatAvatar, hasSeatAvatar } from '../lib/avatars'

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

  // Position relative to MY seat, following the turn order (counter-clockwise).
  //   4 players: right, across, left.   3 players: right, left.   2 players: across.
  // Placed by each opponent's ORDER around the table, not their raw seat
  // number: Story and Practice show a 2-player opponent at seat 2 (across),
  // multiplayer uses seats 0 and 1 — both must land across from you.
  const others = players
    .filter(p => p.seat !== mySeat)
    .map(p => p.seat)
    .sort((a, b) => (((a - mySeat) % 4) + 4) % 4 - (((b - mySeat) % 4) + 4) % 4)
  const SPOTS = { 1: ['top'], 2: ['right', 'left'], 3: ['right', 'top', 'left'] }[others.length] || ['right', 'top', 'left']
  function getPosition(theirSeat) {
    const i = others.indexOf(theirSeat)
    return i >= 0 ? (SPOTS[i] || null) : null
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
                // A bot's own picture, or a player's trophy avatar; initials otherwise.
                const small = typeof window !== 'undefined' && (window.innerHeight < 500 || window.innerWidth < 480)
                const picSize = small ? 24 : 34
                const pic = hasSeatAvatar(p) ? <SeatAvatar player={p} size={picSize} /> : null
                return (
                  <div className="seat-plate">
                    <div className={`seat-ring ${pic ? 'has-pic' : ''}`}
                      style={{ background: ring, ...(pic ? { width: picSize + 6, height: picSize + 6, minWidth: 0, minHeight: 0 } : {}) }}>
                      {pic || <div className="seat-initials">{initials(p.nickname)}</div>}
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
                    // each player's backs in THEIR OWN skin, when known
                    ? <div key={i} className="opponent-tile vertical"><TileBack skin={p.tile_skin || undefined} /></div>
                    : <div key={i} className="opponent-tile horizontal"><TileBack skin={p.tile_skin || undefined} turn={pos === 'left' ? 90 : -90} /></div>
                ))}
              </div>
            </div>
          )
        })}
    </>
  )
}
