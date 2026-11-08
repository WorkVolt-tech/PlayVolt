import React, { useEffect, useState } from 'react';
import { CodeBoard } from '../components/CodeBoard.jsx';
import { canSubmitGuess, guessLimit, myGuesses, nextAttempt, placeColor, remainingTime, statusText } from '../game/selectors.js';
import { MiniBoards } from '../shared/MiniBoards.jsx';
import { Scoreboard } from '../shared/Scoreboard.jsx';
import { FinishPanel } from './FinishPanel.jsx';
import { GuessPanel } from './GuessPanel.jsx';
import { useAdminView, usePeek } from '../admin.js';
import { MatchRoomBar, MatchStatus, ViewTabs } from './MatchHeader.jsx';
import { ManagePlayers } from './ManagePlayers.jsx';
import { ShowOnTv } from './ShowOnTv.jsx';
import { MatchAnnouncer } from '../components/MatchAnnouncer.jsx';
import { play } from '../sound/sfx.js';

const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;

// An in-progress or finished match on a player's phone: My Board + Everyone's Guesses.
export function Match({ state, onShare, onRemove, onLeave }) {
  const { game, busy, clock, offset, view, setView, draft, setDraft, selected, setSelected, resetDraft, act, pairTv } = state;
  const [fullscreen, setFullscreen] = useState(false);
  const [boardFocus, setBoardFocus] = useState('all');
  const [managing, setManaging] = useState(false);
  const [tvOpen, setTvOpen] = useState(false);
  // Admin view (PlayVolt admins only): the secret shown faintly in your empty slots.
  const adminOn = useAdminView();
  const peek = usePeek(adminOn && game.status === 'playing', { code: game.code }, game.puzzle);
  const host = game.hostId === game.me;
  const mine = myGuesses(game);
  const limit = guessLimit(game.mode);
  const attempt = nextAttempt(game);
  const remainingMs = remainingTime(game, clock, offset);
  const canSubmit = canSubmitGuess(game, { busy, remainingMs });
  const boardOpen = view === 'results';
  const secondsLeft = remainingMs === null ? null : Math.ceil(remainingMs / 1000);

  // Countdown tick for the last ten seconds of any timer.
  useEffect(() => {
    if (game.status === 'playing' && secondsLeft !== null && secondsLeft > 0 && secondsLeft <= 10) play('tap-ui-tick');
  }, [secondsLeft, game.status]);
  function openBoard(focus = 'all') { play('drawer-open'); setBoardFocus(focus); setView('results'); }
  function changeView(next) { if (next !== view) play(next === 'results' ? 'drawer-open' : 'tab-switch'); setView(next); }

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
    play('drawer-close');
    setBoardFocus('all');
    if (document.fullscreenElement) void document.exitFullscreen();
    setView('play');
  }

  function addColor(value) {
    if (!canSubmit) return;
    play('pop-bubble');
    const next = placeColor(draft, selected, value);
    setDraft(next.draft);
    setSelected(next.selected);
  }
  function submitGuess() {
    if (!canSubmit || draft.some((value) => value === null)) return;
    play('message-sent-swish');
    void act('guess', { colors: [...draft], puzzle: game.puzzle, attempt });
  }
  const playAgain = host && <button className="primary-btn" disabled={busy}
    onClick={() => { play('click-crisp-primary'); void act('replay'); }}>PLAY AGAIN<span>→</span></button>;

  return <>
    <MatchAnnouncer game={game} />
    <MatchRoomBar game={game} onShare={onShare} onLeave={onLeave} onPlayers={host ? () => { play('drawer-open'); setManaging(true); } : null}
      onTv={game.displayToken ? () => { play('drawer-open'); setTvOpen(true); } : null} />
    {tvOpen && <ShowOnTv game={game} pairTv={pairTv} onClose={() => { play('drawer-close'); setTvOpen(false); }} />}
    {managing && host && <ManagePlayers game={game} busy={busy} onRemove={onRemove} onClose={() => { play('drawer-close'); setManaging(false); }} />}
    <MatchStatus game={game} statusText={statusText(game, { busy, canSubmit })} remainingMs={remainingMs} />
    <MiniBoards game={game} onOpen={(id) => openBoard(id)} />
    <ViewTabs view={view} setView={changeView} />
    {game.status === 'finished'
      ? <FinishPanel game={game} onViewResults={() => openBoard()}>{playAgain}</FinishPanel>
      : <GuessPanel mine={mine} limit={limit} attempt={attempt} canSubmit={canSubmit}
          draft={draft} selected={selected} onSelect={(i) => { play('tap-ui-tick'); setSelected(i); }}
          onColor={addColor} onClear={() => { play('swipe'); resetDraft(); }} onSubmit={submitGuess} peek={peek}
          colorCount={game.colors === 8 ? 8 : 6} />}
    {game.status === 'finished' && <div className="surface history-panel">
      <div className="panel-title"><h2>MY GUESSES</h2><span>{mine.length} SUBMITTED</span></div>
      <CodeBoard mine={mine} limit={limit} attempt={attempt} canSubmit={false}
        draft={draft} selected={selected} onSelect={setSelected} />
    </div>}
    {boardOpen && <Scoreboard key={boardFocus} initialFocus={boardFocus} game={game} remainingMs={remainingMs} actions={playAgain}
      nav={<div className="board-nav">
        <button type="button" className="board-back" onClick={closeBoard}>← My board</button>
        {canFullscreen && <button type="button" className="board-fs" onClick={toggleFullscreen}
          aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}>{fullscreen ? '⤡' : '⤢'}</button>}
      </div>} />}
  </>;
}
