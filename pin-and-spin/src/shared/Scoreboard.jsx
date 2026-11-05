import React, { useState } from 'react';
import { MODES } from '../game/constants.js';
import { Feedback } from '../components/Feedback.jsx';
import { PegRow } from '../components/Peg.jsx';
import { PlayerAvatar } from '../components/PlayerAvatar.jsx';
import { Empty } from '../components/Empty.jsx';
import { formatClock, guessLimit, isSimultaneous, playerProgress } from '../game/selectors.js';
import { WinnerBanner } from './WinnerBanner.jsx';

// "Everyone's Guesses": the full-screen shared results board.
// Built for a phone today and a TV later. It renders ONLY public data from the server
// snapshot (revealed guesses, submitted flags, winners, and the answer once finished)
// and holds no player controls: the controller passes navigation/actions via props.
export function Scoreboard({ game, remainingMs, nav, actions, initialFocus = 'all' }) {
  const [focus, setFocus] = useState(initialFocus);
  const lanes = playerProgress(game).filter((lane) => lane.guesses.length || lane.sealed || !lane.left);
  const shown = focus === 'all' ? lanes : lanes.filter((lane) => lane.player.id === focus);
  const limit = guessLimit(game.mode);
  const simultaneous = isSimultaneous(game.mode);
  const playing = game.status === 'playing';
  const active = lanes.filter((lane) => !lane.left);
  const submittedCount = active.filter((lane) => lane.player.submitted).length;
  const hasTimer = playing && remainingMs !== null && remainingMs !== undefined;
  const [minutes, seconds] = hasTimer ? formatClock(remainingMs) : [];
  const revealedTotal = lanes.reduce((n, lane) => n + lane.guesses.length, 0);

  return <div className="board-screen" role="region" aria-label="Everyone's guesses">
    <header className="board-head">
      {nav}
      <div className="board-title">
        <h1>Everyone’s Guesses</h1>
        <p>{MODES[game.mode]?.label} · Room {game.code}</p>
      </div>
      {hasTimer && <div className={'timer board-timer' + (remainingMs <= 20000 ? ' urgent' : '')}>{minutes}:{seconds}</div>}
    </header>

    <div className="board-status">
      {playing
        ? <span className="status-pill">{simultaneous ? `ROUND ${game.round} / 4` : game.mode === 'rush' ? 'RUSH · LIVE' : 'CLASSIC · LIVE'}</span>
        : <span className="status-pill done">FINAL RESULTS</span>}
      {playing && simultaneous && <span className="status-text">{submittedCount} of {active.length} locked in · reveal when everyone submits{game.mode === 'timed-reveal' ? ' or time runs out' : ''}</span>}
      {playing && !simultaneous && <span className="status-text">Guesses appear the moment they are played</span>}
      <span className="board-legend inline"><span><i className="pin-dot" /> Pin</span><span><i className="spin-dot" /> Spin</span></span>
    </div>

    {game.status === 'finished' && <WinnerBanner game={game} compact>{actions}</WinnerBanner>}

    {lanes.length > 1 && <div className="lane-filter" role="group" aria-label="Show players">
      <button type="button" className={focus === 'all' ? 'on' : ''} aria-pressed={focus === 'all'} onClick={() => setFocus('all')}>All players</button>
      {lanes.map(({ player }) => <button type="button" key={player.id} className={focus === player.id ? 'on' : ''}
        aria-pressed={focus === player.id} onClick={() => setFocus(focus === player.id ? 'all' : player.id)}>{player.name}</button>)}
    </div>}

    {revealedTotal === 0 && !lanes.some((lane) => lane.sealed) &&
      <Empty>Nothing has been revealed yet. {simultaneous ? 'Guesses stay sealed until the round reveals.' : 'Guesses appear here as soon as they are played.'}</Empty>}

    <div className="lanes">
      {shown.map((lane) => <section key={lane.player.id}
        className={'lane' + (lane.won ? ' won' : '') + (lane.isTurn ? ' turn' : '') + (lane.left ? ' left' : '')}>
        <header className="lane-head">
          <PlayerAvatar player={lane.player} />
          <div className="lane-name">
            <strong>{lane.player.name}{lane.player.id === game.me ? ' (you)' : ''}</strong>
            <small>{lane.won ? 'WINNER' : lane.left ? 'LEFT THE ROOM' : lane.isTurn ? 'PLAYING NOW'
              : lane.thinking ? 'THINKING…' : lane.sealed ? 'LOCKED IN' : `${lane.used} / ${limit} TRIES`}</small>
          </div>
        </header>
        <ol className="lane-rows">
          {lane.guesses.map((guess, i) => <li className="lane-row" key={guess.attempt} style={{ '--i': i }}>
            <span className="lane-try">{simultaneous ? 'R' : '#'}{guess.attempt}</span>
            {guess.colors ? <PegRow colors={guess.colors} tiny /> : <span className="missed-row">No guess in time</span>}
            {guess.colors ? <Feedback guess={guess} /> : <span className="count-missed">MISSED</span>}
          </li>)}
          {lane.sealed && <li className="lane-row sealed-row">
            <span className="lane-try">R{game.round}</span>
            <span className="sealed-balls" role="img" aria-label="Guess sealed until the reveal">{[0, 1, 2, 3].map((i) => <i key={i} />)}</span>
            <span className="count-missed">SEALED</span>
          </li>}
          {!lane.guesses.length && !lane.sealed && <li className="lane-empty">No guesses yet</li>}
        </ol>
      </section>)}
    </div>
  </div>;
}
