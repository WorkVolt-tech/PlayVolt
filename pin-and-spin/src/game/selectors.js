// Pure helpers that derive view state from a server snapshot. No React, no network:
// safe to reuse in a future shared (TV) display and easy to unit test.

export const isSimultaneous = (mode) => mode === 'reveal' || mode === 'timed-reveal';
export const guessLimit = (mode) => (mode === 'rush' ? 8 : 4);
export const myGuesses = (game) => (game?.guesses || []).filter((guess) => guess.playerId === game?.me);

// The attempt number the current player would submit next.
export function nextAttempt(game) {
  if (!game) return 1;
  return isSimultaneous(game.mode) ? game.round : myGuesses(game).length + 1;
}

// Milliseconds left on the server deadline, corrected by the server/device clock offset.
export function remainingTime(game, clock, offset) {
  return game?.deadline ? Math.max(0, new Date(game.deadline).getTime() - clock - offset) : null;
}

export function formatClock(ms) {
  const seconds = Math.ceil(ms / 1000);
  return [String(Math.floor(seconds / 60)).padStart(2, '0'), String(seconds % 60).padStart(2, '0')];
}

export function canSubmitGuess(game, { busy, remainingMs }) {
  if (!game) return false;
  const mine = myGuesses(game);
  return game.status === 'playing' && !busy &&
    (remainingMs === null || remainingMs > 0) &&
    (game.mode !== 'classic' || game.turnId === game.me) &&
    mine.length < guessLimit(game.mode) &&
    (!isSimultaneous(game.mode) || !mine.some((guess) => guess.attempt === game.round));
}

export function statusText(game, { busy, canSubmit }) {
  const mine = myGuesses(game);
  const guessedThisRound = mine.some((guess) => guess.attempt === game?.round);
  return !game || game.status === 'lobby' ? 'ROOM LOBBY'
    : game.status === 'finished' ? 'GAME OVER'
    : busy ? 'SENDING YOUR MOVE…'
    : game.mode === 'classic' && game.turnId !== game.me ? 'WAIT YOUR TURN'
    : isSimultaneous(game.mode) && guessedThisRound ? 'WAIT FOR THE REVEAL'
    : mine.length >= guessLimit(game.mode) ? 'ALL GUESSES USED'
    : !canSubmit ? 'ROUND ENDING' : 'MAKE YOUR MOVE';
}

// Only guesses the server has marked public. The shared board must never show anything else.
export function publicGuesses(guesses, playerFilter = 'all') {
  return (guesses || []).filter((guess) =>
    guess.revealed && (playerFilter === 'all' || guess.playerId === playerFilter));
}

// Distinct rounds/tries, newest first.
export function attemptsDescending(guesses) {
  return [...new Set(guesses.map((guess) => guess.attempt))].sort((a, b) => b - a);
}

export function isValidDraft(colors) {
  return Array.isArray(colors) && colors.length === 4 &&
    colors.every((c) => c === null || Number.isInteger(c) && c >= 0 && c < 6);
}

// Fill the selected slot, then move to the next empty slot (wrapping), else the next slot.
export function placeColor(draft, selected, value) {
  const next = [...draft];
  next[selected] = value;
  const empty = [1, 2, 3, 4].map((step) => (selected + step) % 4).find((index) => next[index] === null);
  return { draft: next, selected: empty === undefined ? (selected + 1) % 4 : empty };
}

// Public per-player progress for the strip and the shared board. Uses only data the
// server already made public: revealed guesses and each player's "submitted" flag.
export function playerProgress(game) {
  const revealed = publicGuesses(game?.guesses);
  const winners = game?.winners || [];
  const playing = game?.status === 'playing';
  return (game?.players || []).map((player) => {
    const own = revealed.filter((guess) => guess.playerId === player.id).sort((a, b) => a.attempt - b.attempt);
    const sealed = isSimultaneous(game.mode) && playing && player.submitted &&
      !own.some((guess) => guess.attempt === game.round);
    const scored = own.filter((guess) => guess.colors);
    return {
      player,
      guesses: own,
      used: own.length + (sealed ? 1 : 0),
      sealed,
      best: scored.length ? Math.max(...scored.map((guess) => guess.pins || 0)) : null,
      won: winners.includes(player.id),
      isTurn: playing && game.mode === 'classic' && game.turnId === player.id,
      thinking: playing && isSimultaneous(game.mode) && player.active && !player.submitted,
      left: !player.active,
      away: !!player.active && !!player.away,
    };
  });
}
