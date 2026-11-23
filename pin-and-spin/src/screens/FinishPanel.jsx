import React from 'react';
import { WinnerBanner } from '../shared/WinnerBanner.jsx';
import { LeaderLine, PointsLeaderLine } from '../components/WinsBadge.jsx';
import { winLeaders, pointsLeaders } from '../game/selectors.js';

// Winner announcement and secret reveal on the player's own board.
export function FinishPanel({ game, children, onViewResults }) {
  const winners = game.winners || [];
  const ranked = (game.players || []).filter((p) => game.mode === 'rush'
    ? Number(p.lastPoints) > 0 : winners.includes(p.id))
    .sort((a, b) => (Number(b.lastPoints) || 0) - (Number(a.lastPoints) || 0));
  const headline = winners.includes(game.me)
    ? (winners.length > 1 ? 'SHARED VICTORY!' : 'YOU CRACKED IT!')
    : null;
  return <div className="surface finish-panel">
    <WinnerBanner game={game} headline={headline}>
      {ranked.some((p) => Number(p.lastPoints) > 0) &&
        <div className="speed-awards" aria-label="Correct-answer order points this puzzle">
          <strong>🏅 Correct-answer points · awarded by order</strong>
          {ranked.map((p, i) => <span key={p.id}>
            {i + 1}. {p.id === game.me ? 'You' : p.name} <b>+{p.lastPoints} pts</b>
          </span>)}
        </div>}
      <PointsLeaderLine players={game.players || []} leaders={pointsLeaders(game.players)} me={game.me} />
      <LeaderLine players={game.players || []} leaders={winLeaders(game.players)} me={game.me} />
      {children}
      <button className="outline-btn full" onClick={onViewResults}>
        VIEW EVERYONE'S GUESSES
      </button>
    </WinnerBanner>
  </div>;
}
