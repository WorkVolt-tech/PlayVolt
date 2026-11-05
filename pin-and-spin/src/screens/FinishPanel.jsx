import React from 'react';
import { PegRow } from '../components/Peg.jsx';

// Winner announcement and secret reveal on the player's own board.
export function FinishPanel({ game, people, children, onViewResults }) {
  const winners = game.winners || [];
  return <div className="surface finish-panel">
    <span className="trophy">✦</span><p className="eyebrow">MATCH COMPLETE</p>
    <h2>{winners.length
      ? (winners.includes(game.me) ? 'YOU CRACKED IT!' : 'CODE CRACKED!')
      : 'NO WINNER THIS TIME'}</h2>
    <p>{winners.length
      ? (winners.map((id) => people.get(id)?.name || 'Player').join(' & ') +
        (winners.length > 1 ? ' share the win!' : ' wins the match!'))
      : 'Nobody solved the combination this time.'}</p>
    <p className="field-label">SECRET COMBINATION</p>
    <PegRow colors={game.answer} />
    {children}
    <button className="outline-btn full" onClick={onViewResults}>
      VIEW EVERYONE'S GUESSES
    </button>
  </div>;
}
