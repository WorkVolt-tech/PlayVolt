import React, { useState } from 'react';
import { MODES } from '../game/constants.js';
import { Peg } from '../components/Peg.jsx';
import { PlayerAvatar } from '../components/PlayerAvatar.jsx';
import { play } from '../sound/sfx.js';
import { ShowOnTv } from './ShowOnTv.jsx';
import { InviteFriends } from '../social/InviteFriends.jsx';

// Waiting room: code/invite, chosen mode, players and ready/start controls.
export function Lobby({ game, busy, act, pairTv, signedIn, onCopy, onShare, onRemove }) {
  const activePlayers = (game.players || []).filter((player) => player.active);
  const me = activePlayers.find((player) => player.id === game.me);
  const host = game.hostId === game.me;
  const allReady = activePlayers.length >= 2 && activePlayers.every((player) => player.ready);
  const readyCount = activePlayers.filter((player) => player.ready).length;
  const [tvOpen, setTvOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  return <>
    <h1 className="page-title">Your room</h1>
    <div className="surface lobby-code"><strong>{game.code}</strong><div className="invite-actions">
      <button className="outline-btn" onClick={() => { play('select-item'); onCopy(game.code, 'Room code copied!'); }}>▣ Copy Code</button>
      <button className="outline-btn" onClick={() => { play('select-item'); onShare(); }}>↗ Share link</button>
    </div>
      {<button type="button" className="primary-btn full invite-friends-btn" onClick={() => { play('drawer-open'); setInviting(true); }}>
        👥 Invite friends <span>→</span></button>}
      {game.displayToken && <button type="button" className="outline-btn full tv-button" onClick={() => { play('drawer-open'); setTvOpen(true); }}>
        📺 Show on TV</button>}
    </div>
    {inviting && <InviteFriends game={game} signedIn={signedIn} onClose={() => { play('drawer-close'); setInviting(false); }} />}
    {tvOpen && <ShowOnTv game={game} pairTv={pairTv} onClose={() => { play('drawer-close'); setTvOpen(false); }} />}
    <div className="surface lobby-mode"><Peg value={MODES[game.mode].color} tiny />
      <div><strong>{MODES[game.mode].label}</strong><p>{MODES[game.mode].hint}</p></div></div>
    <div className="surface">
      <div className="panel-title"><h2>Players</h2><span>{readyCount} READY · {activePlayers.length} / {MODES[game.mode].maxPlayers}</span></div>
      {game.mode === 'classic' && <p className="classic-note">↪ Classic is a 2-player duel. For more friends, start a Reveal, Timed Reveal or Rush room.</p>}
      {game.mode !== 'classic' && <p className="classic-note colors-note">{activePlayers.length > 3
        ? <><Peg value={6} tiny /><Peg value={7} tiny /> 4+ players: 8 colors this game (orange and pink join).</>
        : '4 or more players play with 8 colors instead of 6.'}</p>}
      <div className="player-list">
        {activePlayers.map((player) => <div className="player-item" key={player.id}>
          <PlayerAvatar player={player} />
          <div className="player-info"><div className="player-name">{player.name}{player.id === game.me ? ' (YOU)' : ''}</div>
            <div className="player-description">{player.id === game.hostId ? <span className="host-badge">★ HOST</span> : 'PLAYER ' + player.seat}</div>
          </div>
          {player.away
            ? <span className="ready-pill away">◌ AWAY</span>
            : <span className={'ready-pill' + (player.ready ? '' : ' wait')}>
                {player.ready ? '● READY' : '○ WAITING'}
              </span>}
          {host && player.id !== game.me && <button type="button" className="remove-btn" disabled={busy}
            aria-label={`Remove ${player.name}`} onClick={() => onRemove(player)}>✕</button>}
        </div>)}
        {activePlayers.length < 2 && <div className="player-item open-seat">
          <span className="open-seat-icon">＋</span>
          <div className="player-info"><div className="player-name">Waiting for a friend…</div>
            <div className="player-description">Share the code or invite link</div></div>
        </div>}
      </div>
      <div className="ready-meter" role="progressbar" aria-label="Players ready" aria-valuemin={0}
        aria-valuemax={activePlayers.length} aria-valuenow={readyCount}>
        <span style={{ width: `${activePlayers.length ? readyCount / activePlayers.length * 100 : 0}%` }} />
      </div>
      <p className="lobby-help">{activePlayers.length < 2
        ? 'Invite at least one friend with your room code to start.'
        : allReady ? 'Everybody is ready. Time to crack the code!' : 'Wait for everybody to mark themselves ready.'}</p>
      {!host && <button className="outline-btn full" disabled={busy}
          onClick={() => { play(me?.ready ? 'toggle-switch-off' : 'toggle-switch-on'); void act('ready', { ready: !me?.ready }); }}>
          {me?.ready ? 'NOT READY' : "I'M READY"}
        </button>}
      {host && <button className="primary-btn" disabled={busy || !allReady}
          onClick={() => { play('click-crisp-primary'); void act('start', { maxColors: 8 }); }}>Start Game<span>→</span></button>}
    </div>
  </>;
}
