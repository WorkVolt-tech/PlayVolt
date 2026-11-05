import React from 'react';
import { WinnerBanner } from '../shared/WinnerBanner.jsx';

// Winner announcement and secret reveal on the player's own board.
export function FinishPanel({ game, children, onViewResults }) {
  const winners = game.winners || [];
  const headline = winners.includes(game.me)
    ? (winners.length > 1 ? 'SHARED VICTORY!' : 'YOU CRACKED IT!')
    : null;
  return <div className="surface finish-panel">
    <WinnerBanner game={game} headline={headline}>
      {children}
      <button className="outline-btn full" onClick={onViewResults}>
        VIEW EVERYONE'S GUESSES
      </button>
    </WinnerBanner>
  </div>;
}
