import React, { useEffect, useState } from 'react';
import { db } from './supabase.js';
import { GameArea } from './App.jsx';
import { VersionAlert } from './VersionAlert.jsx';
import { readTvLink, buildJoinUrl } from './tvLink.js';

const modeNames = { classic: 'CLASSIC', territory: 'TERRITORY', elimination: 'ELIMINATION', collapse: 'BOTTOM DROP' };
const icons = ['', '◆', '●', '▲', '■', '★', '⬡', '✦', '✳'];

export function TvApp() {
  const [link] = useState(() => readTvLink(window.location));
  const [game, setGame] = useState(null);
  const [error, setError] = useState(link ? '' : 'Open TV Display from a Drop & Block room to get a secure screen link.');
  const [lastUpdated, setLastUpdated] = useState(0);

  useEffect(() => {
    if (!link) return undefined;
    let active = true;
    let fetching = false;
    const refresh = async () => {
      if (fetching || !active) return;
      fetching = true;
      try {
        const { data, error: rpcError } = await db.rpc('drop_block_tv_state', {
          p_code: link.code, p_token: link.token
        });
        if (rpcError) throw rpcError;
        if (active) {
          setGame(data);
          setError('');
          setLastUpdated(Date.now());
        }
      } catch (e) {
        if (active) setError(e.message || 'Connection lost. Reconnecting…');
      } finally { fetching = false; }
    };
    void refresh();
    const timer = setInterval(refresh, 1600);
    const onFocus = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [link?.code, link?.token]);

  const joinUrl = link ? buildJoinUrl(window.location, link.code) : null;
  return <div className="tv-shell">
    <header className="tv-topbar">
      <span className="tv-logo">DROP <em>&</em> BLOCK <small>BY PLAYVOLT</small></span>
      <span className="tv-readonly">TV DISPLAY · VIEW ONLY</span>
    </header>
    <main className="tv-layout">
      <section className="tv-stage">
        <div className="tv-mode-label">{game ? modeNames[game.mode] || 'MULTIPLAYER' : 'CONNECTING TO YOUR GAME'}</div>
        {game ? <>
          <GameArea game={game} readOnly onDrop={() => {}} busy />
          {game.status === 'lobby' && <div className="tv-waiting">Waiting for the host to start · {game.players.length}/{game.maxPlayers} players</div>}
        </> : <div className="tv-waiting">Waiting for your room's board…</div>}
        {error && <p className="tv-error" role="status">{error}</p>}
      </section>
      <aside className="tv-sidebar">
        <span className="tv-side-label">JOIN FROM YOUR PHONE</span>
        <div className="tv-room-code">{link?.code || '------'}</div>
        <p>Open Drop &amp; Block on your phone, sign in with PlayVolt, and enter this room code.</p>
        {joinUrl && <a className="tv-join-address" href={joinUrl}>{new URL(joinUrl).host}</a>}
        <div className="tv-divider" />
        <h2>PLAYERS</h2>
        {game?.players?.length ? <div className="tv-player-list">{game.players.map(p =>
          <div key={p.seat} className={'tv-player tv-seat-' + p.seat + (p.eliminated?' tv-eliminated':'') + (p.seat === game.turnSeat?' tv-current':'')}>
            <span className={'tv-marker seat-'+p.seat}>{icons[p.seat]}</span>
            <span className="tv-player-name">{p.name}</span>
            <strong>{p.eliminated?'OUT':game.mode==='territory'?p.score+' pts':p.seat===game.turnSeat?'PLAYING':''}</strong>
          </div>
        )}</div> : <p className="tv-empty">Players will appear here when they join.</p>}
        <div className="tv-status">{game?.status==='playing'?'● MATCH LIVE':game?.status==='finished'?'✓ MATCH FINISHED':'◌ WAITING IN LOBBY'}</div>
        <span className="tv-footer-note">Read-only TV view · All moves stay on players’ phones</span>
      </aside>
    </main>
    <VersionAlert autoUpdate />
  </div>;
}
