import './OpponentHands.css'
import TileBack from './TileBack'

export default function OpponentHands({ players, myInfo, roomData }) {
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
              <div className="opponent-name">{p.nickname}</div>
              <div className={`opponent-tiles opponent-tiles-${pos}`}>
                {Array.from({ length: count }).map((_, i) => (
                  // every opponent's tiles stand upright, as a hand is held,
                  // showing the back of the equipped skin
                  <div key={i} className="opponent-tile vertical"><TileBack /></div>
                ))}
              </div>
            </div>
          )
        })}
    </>
  )
}
