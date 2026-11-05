import React from 'react';
import { Confetti } from '../components/Confetti.jsx';
import { Peg } from '../components/Peg.jsx';
import { PlayerAvatar } from '../components/PlayerAvatar.jsx';

// Match result: winners (or none) and the secret, revealed ball by ball.
// Public information only; the controller may pass a personal headline ("YOU CRACKED IT!").
export function WinnerBanner({ game, headline, compact = false, children }) {
  const players = game.players || [];
  const winners = (game.winners || []).map((id) => players.find((p) => p.id === id)).filter(Boolean);
  const title = headline || (winners.length ? 'CODE CRACKED!' : 'NO WINNER THIS TIME');
  return <div className={'winner-banner' + (winners.length ? ' has-winner' : ' no-winner') + (compact ? ' compact' : '')}>
    {winners.length > 0 && <Confetti />}
    <span className="trophy" aria-hidden="true">{winners.length ? '🏆' : '✦'}</span>
    <p className="eyebrow">MATCH COMPLETE</p>
    <h2>{title}</h2>
    {winners.length > 0
      ? <div className="winner-list">
          <div className="winner-chips">
            {winners.map((p) => <span className="winner-chip" key={p.id}><PlayerAvatar player={p} size="sm" />{p.name}</span>)}
          </div>
          <p>{winners.length > 1 ? 'share the win!' : 'wins the match!'}</p>
        </div>
      : <p className="winner-note">Nobody solved the combination this time.</p>}
    <p className="field-label">SECRET COMBINATION</p>
    <div className="secret-reveal">
      {(game.answer || []).map((value, i) => <span className="secret-ball" key={i} style={{ '--i': i }}>
        <Peg value={value} tiny />
      </span>)}
    </div>
    {children}
  </div>;
}
