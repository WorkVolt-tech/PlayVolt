import React from 'react';
import { PlayerAvatar } from '../components/PlayerAvatar.jsx';

// Host-only sheet during a match: see who is connected and remove players.
export function ManagePlayers({ game, busy, onRemove, onClose }) {
  const players = (game.players || []).filter((player) => player.active);
  return <div className="sheet-backdrop" onClick={onClose}>
    <div className="sheet surface" role="dialog" aria-modal="true" aria-label="Manage players" onClick={(e) => e.stopPropagation()}>
      <div className="panel-title"><h2>Players</h2><button type="button" className="sheet-close" onClick={onClose} aria-label="Close">✕</button></div>
      <p className="field-help">Remove a player who has left or lost connection so the game can continue. Removed players can't rejoin this room.</p>
      <div className="player-list">
        {players.map((player) => <div className="player-item" key={player.id}>
          <PlayerAvatar player={player} />
          <div className="player-info"><div className="player-name">{player.name}{player.id === game.me ? ' (YOU)' : ''}</div>
            <div className="player-description">{player.id === game.hostId ? <span className="host-badge">★ HOST</span> : 'PLAYER ' + player.seat}</div>
          </div>
          {player.away ? <span className="ready-pill away">◌ AWAY</span> : <span className="ready-pill">● ONLINE</span>}
          {player.id !== game.me && <button type="button" className="remove-btn" disabled={busy}
            aria-label={`Remove ${player.name}`} onClick={() => onRemove(player)}>✕</button>}
        </div>)}
      </div>
    </div>
  </div>;
}
