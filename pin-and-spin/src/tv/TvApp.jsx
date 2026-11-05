import React, { useCallback, useEffect, useState } from 'react';
import { MatchAnnouncer } from '../components/MatchAnnouncer.jsx';
import { remainingTime } from '../game/selectors.js';
import { play, unlockNow } from '../sound/sfx.js';
import { useGameSounds } from '../sound/useGameSounds.js';
import { TvBoard } from './TvBoard.jsx';
import { TvLobby } from './TvLobby.jsx';
import { useDisplay } from './useDisplay.js';
import { TvPair } from './TvPair.jsx';
import { backToPairing, inTvApp, openTvLink, readTvLink } from './tvLink.js';

// The shared big screen (laptop, smart-TV browser). Read-only: phones are the controllers.
// /tv shows a 4-letter pairing code; /?tv=ROOM#token shows that room's live board.
export function TvApp() {
  const [link, setLink] = useState(readTvLink);
  const paired = useCallback((next) => { openTvLink(next); setLink(next); }, []);
  const changeRoom = useCallback(() => { backToPairing(); setLink(null); }, []);
  // The TV app is already full screen and may play sound without a click.
  const [started, setStarted] = useState(inTvApp);
  useEffect(() => { if (inTvApp()) unlockNow(); }, []);
  // One click turns on sound (browsers require it) and full screen.
  function start() {
    setStarted(true);
    void document.documentElement.requestFullscreen?.().catch(() => {});
  }
  return <div className="tv">
    <div className="ambient" aria-hidden="true" />
    {link ? <TvRoom key={link.code + link.token} link={link} onChangeRoom={changeRoom} />
      : <>
        <header className="tv-top">
          <div className="brand">Pin &amp; <span>Spin</span></div>
          <span className="tv-badge">📺 TV DISPLAY</span>
        </header>
        <TvPair onPaired={paired} />
      </>}
    {!started && <button type="button" className="tv-start" onClick={start}>
      🔊 Start sound &amp; full screen
    </button>}
  </div>;
}

function TvRoom({ link, onChangeRoom }) {
  const { game, error, clock, offset } = useDisplay(link);
  useGameSounds(game, { audience: 'tv' });
  const remainingMs = game ? remainingTime(game, clock, offset) : null;
  const secondsLeft = remainingMs === null ? null : Math.ceil(remainingMs / 1000);

  const board = !error && game && game.status !== 'lobby';
  // The live board fills exactly one screen (no page scrolling).
  useEffect(() => {
    document.documentElement.classList.toggle('tv-fit', Boolean(board));
    return () => document.documentElement.classList.remove('tv-fit');
  }, [board]);

  useEffect(() => { document.title = game ? `Pin & Spin · Room ${game.code} · TV` : 'Pin & Spin · TV'; }, [game]);
  useEffect(() => {
    if (game?.status === 'playing' && secondsLeft !== null && secondsLeft > 0 && secondsLeft <= 10) play('tap-ui-tick');
  }, [secondsLeft, game?.status]);

  return <>
    <header className="tv-top">
      <div className="brand">Pin &amp; <span>Spin</span></div>
      {game && <span className="tv-room">Room <strong>{game.code}</strong></span>}
      <span className="tv-badge">📺 TV DISPLAY</span>
    </header>
    {error && <div className="tv-message"><h1>Pin &amp; Spin TV</h1><p>{error}</p>
      <button type="button" className="primary-btn tv-change" onClick={onChangeRoom} autoFocus>Connect another room</button></div>}
    {!error && !game && <div className="tv-message"><h1>Connecting to the room…</h1></div>}
    {!error && game?.status === 'lobby' && <TvLobby game={game} />}
    {board && <>
      <MatchAnnouncer game={game} audience="tv" />
      <TvBoard game={game} remainingMs={remainingMs} />
    </>}
  </>;
}
