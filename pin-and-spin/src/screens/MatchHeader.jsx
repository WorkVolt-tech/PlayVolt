import React from 'react';
import { MODES } from '../game/constants.js';
import { formatClock, isSimultaneous } from '../game/selectors.js';

export function MatchRoomBar({ game, onShare, onPlayers, onTv }) {
  const activeCount = (game.players || []).filter((player) => player.active).length;
  return <div className="match-room-bar">
    <span className="match-room-code">Room <strong>{game.code}</strong></span>
    <button className="outline-btn small" onClick={onShare}>Invite ↗</button>
    {onPlayers && <button className="outline-btn small" onClick={onPlayers}>Players</button>}
    {onTv && <button className="outline-btn small" onClick={onTv} aria-label="Show on TV">📺</button>}
    <span className="match-room-details">{MODES[game.mode]?.label || 'Game'} · {activeCount} players</span>
  </div>;
}

// Mode/round label, the player's status line and the server-synchronized countdown.
export function MatchStatus({ game, statusText, remainingMs }) {
  const [minutes, seconds] = remainingMs !== null ? formatClock(remainingMs) : [];
  return <div className="match-meta">
    <div><span>{game.mode === 'rush' ? 'RUSH MODE' :
      isSimultaneous(game.mode) ? 'ROUND ' + game.round + ' / 4' : 'CLASSIC · 4 TRIES EACH'}</span>
      <strong>{statusText}</strong>
    </div>
    {remainingMs !== null && game.status === 'playing' &&
      <div className={'timer' + (remainingMs <= 20000 ? ' urgent' : '')}>
        {minutes}:
        {seconds}
      </div>}
  </div>;
}

export function ViewTabs({ view, setView }) {
  return <div className="view-tabs" role="tablist" aria-label="Match views">
    <button type="button" className={'view-tab' + (view === 'play' ? ' active' : '')}
      role="tab" aria-selected={view === 'play'} onClick={() => setView('play')}>MY BOARD</button>
    <button type="button" className={'view-tab' + (view === 'results' ? ' active' : '')}
      role="tab" aria-selected={view === 'results'} onClick={() => setView('results')}>
      EVERYONE'S GUESSES</button>
  </div>;
}
