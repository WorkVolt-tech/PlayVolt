import React from 'react';
import { MODES } from '../game/constants.js';
import { Peg } from '../components/Peg.jsx';
import { PlayerAvatar } from '../components/PlayerAvatar.jsx';
import { QrCode } from './QrCode.jsx';
import { WinsBadge, LeaderLine, PointsBadge, PointsLeaderLine } from '../components/WinsBadge.jsx';
import { winLeaders, pointsLeaders } from '../game/selectors.js';

// The TV before a match: how to join, who is in, and who is ready.
export function TvLobby({ game }) {
  const players = (game.players || []).filter((p) => p.active);
  const leaders = winLeaders(players);
  const speedLeaders = pointsLeaders(players);
  const countsReady = (player) => player.ready || player.id === game.hostId;
  const ready = players.filter(countsReady).length;
  const joinUrl = `${location.origin}/?room=${encodeURIComponent(game.code)}&install=1`;
  const mode = MODES[game.mode];
  return <div className="tv-lobby">
    <section className="tv-join">
      <div className="tv-join-text">
        <p className="tv-kicker">Join on your phone</p>
        <strong className="tv-code">{game.code}</strong>
        <p className="tv-url">{location.host}</p>
        <p className="tv-hint">Scan to open or install Pin & Spin, then join this room.</p>
      </div>
      <QrCode text={joinUrl} label={`QR code to join room ${game.code}`} />
    </section>
    <section className="tv-mode">
      <Peg value={mode.color} tiny />
      <div><strong>{mode.label}</strong><span>{mode.hint}</span></div>
      <PointsLeaderLine players={players} leaders={speedLeaders} />
      <LeaderLine players={players} leaders={leaders} />
    </section>
    <section className="tv-players">
      {players.map((p) => <div className={'tv-player' + (countsReady(p) ? ' ready' : '') + (p.away ? ' away' : '')} key={p.id}>
        <PlayerAvatar player={p} size="lg" />
        <div className="tv-player-identity">
          <strong className="tv-player-name" title={p.name}>{p.name}</strong>
          <div className="tv-player-tallies">
            <WinsBadge player={p} leaders={leaders} />
            <PointsBadge player={p} leaders={speedLeaders} />
          </div>
        </div>
        <span>{p.id === game.hostId ? '★ HOST' : p.away ? 'AWAY' : countsReady(p) ? 'READY' : 'WAITING'}</span>
      </div>)}
      {Array.from({ length: Math.max(0, 2 - players.length) }, (_, i) => <div className="tv-player empty" key={'e' + i}>
        <span className="tv-empty-seat">＋</span><strong>Waiting…</strong><span>&nbsp;</span>
      </div>)}
    </section>
    <p className="tv-status">{players.length < 2 ? 'Waiting for at least two players' :
      ready === players.length ? 'Everyone is ready — the host can start the game!' : `${ready} of ${players.length} ready`}</p>
  </div>;
}
