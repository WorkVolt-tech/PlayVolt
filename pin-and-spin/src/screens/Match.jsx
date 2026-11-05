import React, { useMemo, useState } from 'react';
import { CodeBoard } from '../components/CodeBoard.jsx';
import { canSubmitGuess, guessLimit, myGuesses, nextAttempt, placeColor, remainingTime, statusText } from '../game/selectors.js';
import { EveryonesGuesses } from '../shared/EveryonesGuesses.jsx';
import { FinishPanel } from './FinishPanel.jsx';
import { GuessPanel } from './GuessPanel.jsx';
import { MatchRoomBar, MatchStatus, ViewTabs } from './MatchHeader.jsx';

// An in-progress or finished match on a player's phone: My Board + Everyone's Guesses.
export function Match({ state, onShare }) {
  const { game, busy, clock, offset, view, setView, draft, setDraft, selected, setSelected, resetDraft, act } = state;
  const [playerFilter, setPlayerFilter] = useState('all');
  const players = game.players || [];
  const people = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const host = game.hostId === game.me;
  const mine = myGuesses(game);
  const limit = guessLimit(game.mode);
  const attempt = nextAttempt(game);
  const remainingMs = remainingTime(game, clock, offset);
  const canSubmit = canSubmitGuess(game, { busy, remainingMs });

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
    <ViewTabs view={view} setView={setView} />
    {view === 'play' && <>
      {game.status === 'finished'
        ? <FinishPanel game={game} people={people} onViewResults={() => setView('results')}>{playAgain}</FinishPanel>
        : <GuessPanel mine={mine} limit={limit} attempt={attempt} canSubmit={canSubmit}
            draft={draft} selected={selected} onSelect={setSelected}
            onColor={addColor} onClear={resetDraft} onSubmit={submitGuess} />}
      {game.status === 'finished' && <div className="surface history-panel">
        <div className="panel-title"><h2>MY GUESSES</h2><span>{mine.length} SUBMITTED</span></div>
        <CodeBoard mine={mine} limit={limit} attempt={attempt} canSubmit={false}
          draft={draft} selected={selected} onSelect={setSelected} />
      </div>}
    </>}
    {view === 'results' && <EveryonesGuesses game={game} playerFilter={playerFilter} onPlayerFilter={setPlayerFilter}>
      {playAgain}
    </EveryonesGuesses>}
  </>;
}
