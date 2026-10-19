import { useEffect, useState } from 'react'
import './OpponentHands.css'
import TileBack from './TileBack'
import TileFace from './TileFace'
import { useAdminView, fetchRoomHands } from '../lib/adminView'
import { SeatAvatar, hasSeatAvatar } from '../lib/avatars'

// Initials for a seat plate: "Ti-Djo" → "TD", "Maxo" → "MA".
function initials(name = '') {
  const parts = String(name).split(/[\s\-_.]+/).filter(Boolean)
  const s = parts.length > 1 ? parts[0][0] + parts[1][0] : String(name).slice(0, 2)
  return s.toUpperCase()
}

// turnClock (optional, multiplayer): { start, limit } in ms. When given, the
// active player's plate shows the time left as a gold ring that drains.
export default function OpponentHands({ players, myInfo, roomData, turnClock, onAddFriend, friendStates = {} }) {
  // Admin view (lib/adminView.js): opponents' tiles face-up. Online, the hands
  // come from the database (admin_room_hands, which answers only an admin);
  // in Solo / Practice / Story the bots' hands are already on this device.
  const adminOn = useAdminView()
  const roomId = roomData?.id
  const [roomHands, setRoomHands] = useState(null)
  useEffect(() => {
    if (!adminOn || !roomId) { setRoomHands(null); return }
    let gone = false
    const load = () => fetchRoomHands(roomId).then(h => { if (!gone && h) setRoomHands(h) })
    load()
    const t = setInterval(load, 3000)
    const stop = () => { gone = true; clearInterval(t) }
    return stop
  }, [adminOn, roomId, roomData?.current_turn, roomData?.round])
  function shownHand(p) {
    if (!adminOn) return null
    const h = roomId ? roomHands?.[p.seat] : p.hand
    return Array.isArray(h) && h.every(t => Array.isArray(t)) ? h : null
  }

  const mySeat = myInfo?.seat ?? 0


  // Position relative to MY seat, following the turn order (counter-clockwise).
  //   4 players: right, across, left.   3 players: right, left.   2 players: across.
  const n = Math.max(2, Math.min(4, players.length || 4))
  function getPosition(theirSeat) {
    const diff = ((theirSeat - mySeat) % n + n) % n
    if (n === 2) return diff === 1 ? 'top' : null
    if (n === 3) return diff === 1 ? 'right' : diff === 2 ? 'left' : null
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
          const faceUp = shownHand(p)
          const count = faceUp ? faceUp.length : (Array.isArray(p.hand) ? p.hand.length : 0)
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
                    {onAddFriend && !p.is_ai && p.user_id && (() => {
                      const state = friendStates[p.user_id]
                      const label = state === 'working' ? '…'
                        : state === 'sent' ? 'Sent ✓'
                          : state === 'friends' ? 'Friends ✓'
                            : state === 'error' ? 'Retry'
                              : '+ Friend'
                      return (
                        <button
                          type="button"
                          className="opponent-friend-btn"
                          disabled={state === 'working' || state === 'sent' || state === 'friends'}
                          onClick={e => { e.stopPropagation(); onAddFriend(p) }}
                          aria-label={`Add ${p.nickname} as a friend`}
                        >
                          {label}
                        </button>
                      )
                    })()}
                  </div>
                )
              })()}
              <div className={`opponent-tiles opponent-tiles-${pos}`}>
                {faceUp ? faceUp.map((t, i) => (
                  pos === 'top'
                    ? <div key={i} className="opponent-tile vertical"><TileFace a={t[0]} b={t[1]} vertical /></div>
                    : <div key={i} className="opponent-tile horizontal"><TileFace a={t[0]} b={t[1]} vertical={false} /></div>
                )) : Array.from({ length: count }).map((_, i) => (
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