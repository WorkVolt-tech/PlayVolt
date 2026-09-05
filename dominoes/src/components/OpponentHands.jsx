import './OpponentHands.css'

function FaceDownTile({ orientation }) {
  return (
    <div className={`opponent-tile ${orientation}`} />
  )
}

// Sidebar opponent (left or right of board)
export function SideOpponent({ player, side, isActive }) {
  const count = Array.isArray(player?.hand) ? player.hand.length : 0
  return (
    <div className={`side-opponent side-opponent-${side} ${isActive ? 'is-turn' : ''}`}>
      <div className="opponent-name">{player?.nickname}</div>
      <div className="side-opponent-tiles">
        {Array.from({ length: count }).map((_, i) => (
          <FaceDownTile key={i} orientation="vertical" />
        ))}
      </div>
    </div>
  )
}

// Top opponent (above board)
export function TopOpponent({ player, isActive }) {
  const count = Array.isArray(player?.hand) ? player.hand.length : 0
  return (
    <div className={`top-opponent ${isActive ? 'is-turn' : ''}`}>
      <div className="opponent-name">{player?.nickname}</div>
      <div className="top-opponent-tiles">
        {Array.from({ length: count }).map((_, i) => (
          <FaceDownTile key={i} orientation="horizontal" />
        ))}
      </div>
    </div>
  )
}
