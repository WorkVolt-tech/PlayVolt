import React from 'react';
import { MODES } from '../game/constants.js';
import { Peg } from '../components/Peg.jsx';
import { PlayerAvatar } from '../components/PlayerAvatar.jsx';
import { QrCode } from './QrCode.jsx';

// The TV before a match: how to join, who is in, and who is ready.
export function TvLobby({ game }) {
  const players = (game.players || []).filter((p) => p.active);
  const ready = players.filter((p) => p.ready).length;
  const joinUrl = `${location.origin}${location.pathname}?room=${game.code}`;
  const mode = MODES[game.mode];
  return <div className="tv-lobby">
    <section className="tv-join">
      <div className="tv-join-text">
        <p className="tv-kicker">Join on your phone</p>
        <strong className="tv-code">{game.code}</strong>
        <p className="tv-url">{location.host}</p>
        <p className="tv-hint">Scan the code, or open the site and enter the room code.</p>
      </div>
      <QrCode text={joinUrl} label={`QR code to join room ${game.code}`} />
    </section>
    <section className="tv-mode">
      <Peg value={mode.color} tiny />
      <div><strong>{mode.label}</strong><span>{mode.hint}</span></div>
    </section>
    <section className="tv-players">
      {players.map((p) => <div className={'tv-player' + (p.ready ? ' ready' : '') + (p.away ? ' away' : '')} key={p.id}>
        <PlayerAvatar player={p} size="lg" />
        <strong>{p.name}</strong>
        <span>{p.id === game.hostId ? '★ HOST' : p.away ? 'AWAY' : p.ready ? 'READY' : 'WAITING'}</span>
      </div>)}
      {Array.from({ length: Math.max(0, 2 - players.length) }, (_, i) => <div className="tv-player empty" key={'e' + i}>
        <span className="tv-empty-seat">＋</span><strong>Waiting…</strong><span>&nbsp;</span>
      </div>)}
    </section>
    <p className="tv-status">{players.length < 2 ? 'Waiting for at least two players' :
      ready === players.length ? 'Everyone is ready — the host can start the game!' : `${ready} of ${players.length} ready`}</p>
  </div>;
}
