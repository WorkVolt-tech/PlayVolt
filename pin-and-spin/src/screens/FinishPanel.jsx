import React from 'react';
import { WinnerBanner } from '../shared/WinnerBanner.jsx';
import { LeaderLine } from '../components/WinsBadge.jsx';
import { winLeaders } from '../game/selectors.js';

// Winner announcement and secret reveal on the player's own board.
export function FinishPanel({ game, children, onViewResults }) {
  const winners = game.winners || [];
  const headline = winners.includes(game.me)
    ? (winners.length > 1 ? 'SHARED VICTORY!' : 'YOU CRACKED IT!')
    : null;
  return <div className="surface finish-panel">
    <WinnerBanner game={game} headline={headline}>
      {/* who has won the most rounds in this room so far */}
      <LeaderLine players={game.players || []} leaders={winLeaders(game.players)} me={game.me} />
      {children}
      <button className="outline-btn full" onClick={onViewResults}>
        VIEW EVERYONE'S GUESSES
      </button>
    </WinnerBanner>
  </div>;
}
