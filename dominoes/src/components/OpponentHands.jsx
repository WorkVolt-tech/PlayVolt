import './OpponentHands.css'

export default function OpponentHands({ players, myInfo, roomData }) {
  const positions = {
    1: 'right',
    2: 'top',
    3: 'left',
  }

  return (
    <>
      {players
        .filter(p => p.seat !== myInfo.seat)
        .map(p => {
          const pos = positions[p.seat]
          if (!pos) return null
          const count = Array.isArray(p.hand) ? p.hand.length : 0
          const isActive = roomData?.current_turn === p.seat
          return (
            <div key={p.seat} className={`opponent-area opponent-${pos} ${isActive ? 'is-turn' : ''}`}>
              <div className="opponent-name">{p.nickname}</div>
              <div className={`opponent-tiles opponent-tiles-${pos}`}>
                {Array.from({ length: count }).map((_, i) => (
                  <div key={i} className={`opponent-tile ${pos === 'top' ? 'horizontal' : 'vertical'}`} />
                ))}
              </div>
            </div>
          )
        })}
    </>
  )
}
