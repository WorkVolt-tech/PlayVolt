import React, { useEffect, useState } from 'react';
import { db } from './supabase.js';
import { GameArea } from './App.jsx';
import { VersionAlert } from './VersionAlert.jsx';
import { readTvLink, buildJoinUrl } from './tvLink.js';
import {AvatarBadge,ChipDisc} from './looks.jsx';

const modeNames = { classic: 'CLASSIC', territory: 'TERRITORY', elimination: 'ELIMINATION', collapse: 'BOTTOM DROP', chaos: 'CHAOS', team: 'TEAM BATTLE' };
const icons = ['', '◆', '●', '▲', '■', '★', '⬡', '✦', '✳', '⬢'];

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
        <div className="tv-mode-label">{game ? (modeNames[game.mode] || 'MULTIPLAYER') + ' · MATCH ' + (game.matchNumber || 1) : 'CONNECTING TO YOUR GAME'}</div>
        {game ? <>
          {game.status==='cancelled'&&game.endReason==='closed_lobby'
            ? <div className="tv-closed-state">This room was closed by the host.</div>
            : <GameArea game={game} readOnly onDrop={() => {}} busy boardTheme={game.hostBoardTheme}/>}
          {game.status === 'lobby' && <div className="tv-waiting">{game.matchNumber > 1 ? 'Rematch lobby · Players getting ready' : 'Waiting for the host to start'} · {game.players.length}/{game.maxPlayers} players</div>}
          {game.status==='cancelled'&&game.endReason==='stalled_no_contest'&&
            <div className="tv-waiting">No Contest · No winner or trophies awarded. The host may start a rematch.</div>}
        </> : <div className="tv-waiting">Waiting for your room's board…</div>}
        {error && <p className="tv-error" role="status">{error}</p>}
      </section>
      <aside className="tv-sidebar">
        <span className="tv-side-label">JOIN FROM YOUR PHONE</span>
        <div className="tv-room-code">{link?.code || '------'}</div>
        {game?.status==='cancelled'
          ? <p>This room is not accepting moves or new players. {game.endReason==='stalled_no_contest'?'The host may start a rematch.':'The room is closed.'}</p>
          : <p>Open Drop &amp; Block on your phone, sign in with PlayVolt, and enter this room code.</p>}
        {joinUrl && <a className="tv-join-address" href={joinUrl}>{new URL(joinUrl).host}</a>}
        <div className="tv-divider" />
        <h2>PLAYERS</h2>
        {game?.players?.length ? <div className="tv-player-list">{game.players.map(p =>
          <div key={p.seat} className={'tv-player tv-seat-' + p.seat + (p.eliminated?' tv-eliminated':'') + (p.seat === game.turnSeat?' tv-current':'')}>
            <AvatarBadge id={p.avatarStyle||'sentinel'} small/><ChipDisc seat={p.seat} style={p.chipStyle||'round'} compact/>
            <span className="tv-player-name">{p.name}
              {p.online!==undefined&&<small className={'player-presence '+(p.online?'online':'away')}>{p.online?'● Online':'○ Away'}{p.timedOutTurns?' · '+p.timedOutTurns+' missed':''}</small>}
            </span>
            <strong>{p.eliminated?'OUT':game.mode==='team'?(p.seat%2===1?'GOLD':'BLUE'):game.mode==='territory'?p.score+' pts':game.mode==='chaos'?'⬢'+(p.chaosBlockUsed?'0':'1')+' ✹'+(p.chaosBlastUsed?'0':'1'):p.seat===game.turnSeat?'PLAYING':''}</strong>
          </div>
        )}</div> : <p className="tv-empty">Players will appear here when they join.</p>}
        <div className="tv-status">{game?.status==='playing'?'● MATCH LIVE':game?.status==='finished'?'✓ MATCH FINISHED':game?.status==='cancelled'?(game.endReason==='stalled_no_contest'?'⊘ NO CONTEST':'⊘ ROOM CLOSED'):'◌ WAITING IN LOBBY'}</div>
        <span className="tv-footer-note">Read-only TV view · All moves stay on players’ phones</span>
      </aside>
    </main>
    <VersionAlert autoUpdate />
  </div>;
}
