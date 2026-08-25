import DominoTile from './DominoTile'
import './PlayerHand.css'

export default function PlayerHand({ hand, isMyTurn, playableTiles, selectedIdx, onSelect, onPass, hasTilesOnBoard }) {
  const canPass = isMyTurn && playableTiles.length === 0 && hasTilesOnBoard

  return (
    <div className="hand-area">
      <div className="hand-label">Your Hand</div>
      <div className="hand-tiles">
        {hand.map((tile, idx) => {
          const canPlay = isMyTurn && playableTiles.some(t => t[0] === tile[0] && t[1] === tile[1])
          const isSelected = selectedIdx === idx
          return (
            <DominoTile
              key={idx}
              top={tile[0]}
              bottom={tile[1]}
              isVertical={true}
              playable={canPlay}
              selected={isSelected}
              notPlayable={isMyTurn && !canPlay}
              onClick={canPlay ? () => onSelect(tile, idx) : undefined}
            />
          )
        })}
      </div>
      <div className="action-bar">
        <button
          className="btn btn-pass"
          disabled={!canPass}
          onClick={onPass}
        >
          Pass
        </button>
      </div>
    </div>
  )
}
