import { useRef } from 'react'
import DominoTile from './DominoTile'
import { Draggable } from './DragDrop'
import './PlayerHand.css'

export default function PlayerHand({
  hand, isMyTurn, playableTiles, selectedIdx,
  onSelect, onPass, hasTilesOnBoard,
}) {
  const canPass = isMyTurn && playableTiles.length === 0 && hasTilesOnBoard

  // ── The deal ──────────────────────────────────────────────────────────────
  // When two or more tiles arrive at once, it's a new deal: give the hand
  // fresh keys so every tile slides in, one after another. Drawing a single
  // tile from the pile doesn't count. (Purely visual.)
  const deal = useRef({ hand: null, n: 0 })
  if (deal.current.hand !== hand) {
    const prev = deal.current.hand || []
    const sig = t => `${Math.min(t[0], t[1])}-${Math.max(t[0], t[1])}`
    const had = new Set(prev.map(sig))
    const arrived = (hand || []).filter(t => !had.has(sig(t))).length
    deal.current = { hand, n: deal.current.n + (arrived >= 2 ? 1 : 0) }
  }
  const dealN = deal.current.n

  return (
    <div className="hand-area">
      <div className="hand-label">Your Hand</div>
      <div className="hand-tiles">
        {hand.map((tile, idx) => {
          const canPlay = isMyTurn && playableTiles.some(t => t[0] === tile[0] && t[1] === tile[1])
          const isSelected = selectedIdx === idx
          return (
            <div key={`${dealN}-${idx}`} className="hand-deal" style={{ animationDelay: `${idx * 70}ms` }}>
            <Draggable data={{ tile, idx }} disabled={!canPlay}>
              <DominoTile
                top={tile[0]}
                bottom={tile[1]}
                isVertical={true}
                playable={canPlay}
                selected={isSelected}
                notPlayable={isMyTurn && !canPlay}
                onClick={canPlay ? () => onSelect(tile, idx) : undefined}
              />
            </Draggable>
            </div>
          )
        })}
      </div>
      <div className="action-bar">
        <button className="btn-pass" disabled={!canPass} onClick={onPass}>Pass</button>
      </div>
    </div>
  )
}
