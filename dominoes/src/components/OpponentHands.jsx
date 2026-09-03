import './OpponentHands.css'

// Shows face-down tiles for opponents at their positions
// Seat 0 = bottom (you), Seat 1 = left, Seat 2 = top, Seat 3 = right
export default function OpponentHands({ players, myInfo }) {
  const positions = {
    1: 'right',   // counter-clockwise: seat 1 is to your right
    2: 'top', 
    3: 'left',    // seat 3 is to your left
  }

  return (
    <>
      {players
        .filter(p => p.seat !== myInfo.seat)
        .map(p => {
          const pos = positions[p.seat]
          if (!pos) return null
          const count = Array.isArray(p.hand) ? p.hand.length : 0
          return (
            <div key={p.seat} className={`opponent-area opponent-${pos}`}>
              <div className="opponent-name">{p.nickname}</div>
              <div className={`opponent-tiles opponent-tiles-${pos}`}>
                {Array.from({ length: count }).map((_, i) => (
                  <div key={i} className={`opponent-tile ${pos === 'top' || pos === 'bottom' ? 'horizontal' : 'vertical'}`} />
                ))}
              </div>
            </div>
          )
        })}
    </>
  )
}
