import React from 'react';
import { PlayerAvatar } from '../components/PlayerAvatar.jsx';
import { guessLimit, playerProgress } from '../game/selectors.js';

// Compact, glanceable progress for every player during a match (public data only).
export function PlayerStrip({ game }) {
  const limit = guessLimit(game.mode);
  const lanes = playerProgress(game).filter((lane) => !lane.left || lane.guesses.length);
  return <div className="player-strip" aria-label="Players">
    {lanes.map((lane) => {
      const state = lane.won ? 'won' : lane.left ? 'left' : lane.isTurn ? 'turn' : lane.sealed ? 'in' : lane.thinking ? 'thinking' : '';
      const label = { won: '🏆 WON', left: 'LEFT', turn: 'TURN', in: '✓ IN', thinking: '…' }[state] || `${lane.used}/${limit}`;
      return <div key={lane.player.id} className={'strip-chip ' + state + (lane.player.id === game.me ? ' me' : '')}
        aria-label={`${lane.player.name}: ${label}${lane.best !== null ? `, best ${lane.best} Pins` : ''}`}>
        <PlayerAvatar player={lane.player} size="sm" />
        <span className="strip-name">{lane.player.id === game.me ? 'You' : lane.player.name}</span>
        <span className="strip-state">{label}</span>
        {lane.best !== null && <span className="strip-best" aria-hidden="true">{Array.from({ length: 4 }, (_, i) =>
          <i key={i} className={i < lane.best ? 'on' : ''} />)}</span>}
      </div>;
    })}
  </div>;
}
