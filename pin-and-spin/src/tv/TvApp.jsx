import React, { useEffect, useState } from 'react';
import { MatchAnnouncer } from '../components/MatchAnnouncer.jsx';
import { remainingTime } from '../game/selectors.js';
import { Scoreboard } from '../shared/Scoreboard.jsx';
import { play } from '../sound/sfx.js';
import { useGameSounds } from '../sound/useGameSounds.js';
import { TvLobby } from './TvLobby.jsx';
import { useDisplay } from './useDisplay.js';

// The shared big screen (laptop, smart-TV browser). Read-only: phones are the controllers.
export function TvApp() {
  const { game, error, clock, offset } = useDisplay();
  const [started, setStarted] = useState(false);
  useGameSounds(game, { audience: 'tv' });
  const remainingMs = game ? remainingTime(game, clock, offset) : null;
  const secondsLeft = remainingMs === null ? null : Math.ceil(remainingMs / 1000);

  useEffect(() => { document.title = game ? `Pin & Spin · Room ${game.code} · TV` : 'Pin & Spin · TV'; }, [game]);
  useEffect(() => {
    if (game?.status === 'playing' && secondsLeft !== null && secondsLeft > 0 && secondsLeft <= 10) play('tap-ui-tick');
  }, [secondsLeft, game?.status]);

  // One click turns on sound (browsers require it) and full screen.
  function start() {
    setStarted(true);
    void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  return <div className="tv">
    <div className="ambient" aria-hidden="true" />
    <header className="tv-top">
      <div className="brand">Pin &amp; <span>Spin</span></div>
      {game && <span className="tv-room">Room <strong>{game.code}</strong></span>}
      <span className="tv-badge">📺 TV DISPLAY</span>
    </header>
    {error && <div className="tv-message"><h1>Pin &amp; Spin TV</h1><p>{error}</p></div>}
    {!error && !game && <div className="tv-message"><h1>Connecting to the room…</h1></div>}
    {!error && game?.status === 'lobby' && <TvLobby game={game} />}
    {!error && game && game.status !== 'lobby' && <>
      <MatchAnnouncer game={game} audience="tv" />
      <Scoreboard game={game} remainingMs={remainingMs} showFilter={false}
        nav={<span className="tv-board-kicker">Live board · phones are the controllers</span>} />
    </>}
    {!started && !error && <button type="button" className="tv-start" onClick={start}>
      🔊 Start sound &amp; full screen
    </button>}
  </div>;
}
