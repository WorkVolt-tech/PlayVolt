import React from 'react';
import { MODES } from '../game/constants.js';
import { Peg } from '../components/Peg.jsx';

// Waiting room: code/invite, chosen mode, players and ready/start controls.
export function Lobby({ game, busy, act, onCopy, onShare }) {
  const activePlayers = (game.players || []).filter((player) => player.active);
  const me = activePlayers.find((player) => player.id === game.me);
  const host = game.hostId === game.me;
  const allReady = activePlayers.length >= 2 && activePlayers.every((player) => player.ready);
  return <>
    <h1 className="page-title">Your room</h1>
    <div className="surface lobby-code"><strong>{game.code}</strong><div className="invite-actions">
      <button className="outline-btn" onClick={() => onCopy(game.code, 'Room code copied!')}>▣ Copy Code</button>
      <button className="outline-btn" onClick={onShare}>↗ Invite Friends</button>
    </div></div>
    <div className="surface lobby-mode"><Peg value={MODES[game.mode].color} tiny />
      <div><strong>{MODES[game.mode].label}</strong><p>{MODES[game.mode].hint}</p></div></div>
    <div className="surface">
      <div className="panel-title"><h2>Players</h2><span>{activePlayers.length} / 10 PLAYERS</span></div>
      <div className="player-list">
        {activePlayers.map((player) => <div className="player-item" key={player.id}>
          <span className="player-avatar">{(player.name || '?').slice(0,1).toUpperCase()}</span>
          <div className="player-info"><div className="player-name">{player.name}{player.id === game.me ? ' (YOU)' : ''}</div>
            <div className="player-description">{player.id === game.hostId ? 'HOST' : 'PLAYER ' + player.seat}</div>
          </div>
          <span className={'ready-pill' + (player.ready ? '' : ' wait')}>
            {player.ready ? '● READY' : '○ WAITING'}
          </span>
        </div>)}
      </div>
      <p className="lobby-help">{activePlayers.length < 2
        ? 'Invite at least one friend with your room code to start.'
        : allReady ? 'Everybody is ready. Time to crack the code!' : 'Wait for everybody to mark themselves ready.'}</p>
      {!host && <button className="outline-btn full" disabled={busy}
          onClick={() => void act('ready', { ready: !me?.ready })}>
          {me?.ready ? 'NOT READY' : "I'M READY"}
        </button>}
      {host && <button className="primary-btn" disabled={busy || !allReady}
          onClick={() => void act('start')}>Start Game<span>→</span></button>}
    </div>
  </>;
}
