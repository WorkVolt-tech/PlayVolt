import React, { useMemo } from 'react';
import { Empty } from '../components/Empty.jsx';
import { PegRow } from '../components/Peg.jsx';
import { attemptsDescending, publicGuesses } from '../game/selectors.js';
import { GuessRow } from './GuessRow.jsx';

// The shared results board ("Everyone's Guesses").
// It reads ONLY public data from the server snapshot (revealed guesses, players, and the
// answer once finished) and owns no player controls, so a future TV/display screen can
// render it unchanged from a display-token snapshot. Player-only actions (Play Again)
// are passed in as children by the controller.
export function EveryonesGuesses({ game, playerFilter, onPlayerFilter, children }) {
  const players = game.players || [];
  const visibleGuesses = useMemo(() => publicGuesses(game.guesses, playerFilter), [game.guesses, playerFilter]);
  const people = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  return <div className="surface results-panel">
    <div className="panel-title"><h2>THE SCOREBOARD</h2><span>{visibleGuesses.length} REVEALED</span></div>
    <p className="field-help">Public guesses appear here. In Reveal modes, guesses stay private until their round is revealed.</p>
    <label className="field-label" htmlFor="playerFilter">SHOW GUESSES FOR</label>
    <select id="playerFilter" className="player-filter" value={playerFilter}
      onChange={(event) => onPlayerFilter(event.target.value)}>
      <option value="all">All players</option>
      {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
    </select>
    {visibleGuesses.length === 0
      ? <Empty>Nothing has been revealed yet. Everyone's public results will appear here.</Empty>
      : attemptsDescending(visibleGuesses).map((round) => <div className="round-group" key={round}>
          <h3>ROUND / TRY {round}</h3>
          <div className="guess-list">
            {visibleGuesses.filter((guess) => guess.attempt === round).map((guess) =>
              <GuessRow guess={guess} key={guess.playerId + '-' + guess.attempt}
                label={people.get(guess.playerId)?.name || 'Player'} />)}
          </div>
        </div>)}
    {game.status === 'finished' && Array.isArray(game.answer) &&
      <div className="surface finish-panel">
        <p className="field-label">FINAL SECRET COMBINATION</p>
        <PegRow colors={game.answer} />
        {children}
      </div>}
  </div>;
}
