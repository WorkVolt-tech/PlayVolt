import React, { useEffect, useState } from 'react';
import { CodeBoard } from '../components/CodeBoard.jsx';
import { canSubmitGuess, guessLimit, myGuesses, nextAttempt, placeColor, remainingTime, statusText } from '../game/selectors.js';
import { Scoreboard } from '../shared/Scoreboard.jsx';
import { FinishPanel } from './FinishPanel.jsx';
import { GuessPanel } from './GuessPanel.jsx';
import { MatchRoomBar, MatchStatus, ViewTabs } from './MatchHeader.jsx';
import { PlayerStrip } from './PlayerStrip.jsx';

const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;

// An in-progress or finished match on a player's phone: My Board + Everyone's Guesses.
export function Match({ state, onShare }) {
  const { game, busy, clock, offset, view, setView, draft, setDraft, selected, setSelected, resetDraft, act } = state;
  const [fullscreen, setFullscreen] = useState(false);
  const host = game.hostId === game.me;
  const mine = myGuesses(game);
  const limit = guessLimit(game.mode);
  const attempt = nextAttempt(game);
  const remainingMs = remainingTime(game, clock, offset);
  const canSubmit = canSubmitGuess(game, { busy, remainingMs });
  const boardOpen = view === 'results';

  // The full-screen board owns scrolling while it is open.
  useEffect(() => {
    if (!boardOpen) return;
    document.body.classList.add('board-open');
    return () => document.body.classList.remove('board-open');
  }, [boardOpen]);
  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }
  function closeBoard() {
    if (document.fullscreenElement) void document.exitFullscreen();
    setView('play');
  }

  function addColor(value) {
    if (!canSubmit) return;
    const next = placeColor(draft, selected, value);
    setDraft(next.draft);
    setSelected(next.selected);
  }
  function submitGuess() {
    if (!canSubmit || draft.some((value) => value === null)) return;
    void act('guess', { colors: [...draft], puzzle: game.puzzle, attempt });
  }
  const playAgain = host && <button className="primary-btn" disabled={busy}
    onClick={() => void act('replay')}>PLAY AGAIN<span>→</span></button>;

  return <>
    <MatchRoomBar game={game} onShare={onShare} />
    <MatchStatus game={game} statusText={statusText(game, { busy, canSubmit })} remainingMs={remainingMs} />
    <PlayerStrip game={game} />
    <ViewTabs view={view} setView={setView} />
    {game.status === 'finished'
      ? <FinishPanel game={game} onViewResults={() => setView('results')}>{playAgain}</FinishPanel>
      : <GuessPanel mine={mine} limit={limit} attempt={attempt} canSubmit={canSubmit}
          draft={draft} selected={selected} onSelect={setSelected}
          onColor={addColor} onClear={resetDraft} onSubmit={submitGuess} />}
    {game.status === 'finished' && <div className="surface history-panel">
      <div className="panel-title"><h2>MY GUESSES</h2><span>{mine.length} SUBMITTED</span></div>
      <CodeBoard mine={mine} limit={limit} attempt={attempt} canSubmit={false}
        draft={draft} selected={selected} onSelect={setSelected} />
    </div>}
    {boardOpen && <Scoreboard game={game} remainingMs={remainingMs} actions={playAgain}
      nav={<div className="board-nav">
        <button type="button" className="board-back" onClick={closeBoard}>← My board</button>
        {canFullscreen && <button type="button" className="board-fs" onClick={toggleFullscreen}
          aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}>{fullscreen ? '⤡' : '⤢'}</button>}
      </div>} />}
  </>;
}
