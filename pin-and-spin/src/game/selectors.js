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

// Balls in this game's code: 4, or 5-6 in big groups (migration 017; 5 in some story levels).
export function codeSlots(game) {
  return [5, 6].includes(game?.slots) ? game.slots : 4;
}

export function isValidDraft(colors, slots = 4) {
  return Array.isArray(colors) && colors.length === slots &&
    colors.every((c) => c === null || Number.isInteger(c) && c >= 0 && c < 8); // 8 colors with 4+ players
}

// Fill the selected slot, then move to the next empty slot (wrapping), else the next slot.
export function placeColor(draft, selected, value) {
  const next = [...draft];
  const n = next.length; // 4 balls, or 5 in story World 4
  next[selected] = value;
  const empty = Array.from({ length: n }, (_, i) => (selected + i + 1) % n).find((index) => next[index] === null);
  return { draft: next, selected: empty === undefined ? (selected + 1) % n : empty };
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

// What just happened between two server snapshots, for announcements and vibration.
// Returns [] on first load and across rematches so nothing fires spuriously.
export function matchEvents(prev, next) {
  if (!prev || !next || prev.code !== next.code) return [];
  const events = [];
  if (prev.status === 'lobby' && next.status === 'playing') events.push({ type: 'start' });
  if (prev.puzzle !== next.puzzle) return events;
  const playing = next.status === 'playing';
  if (playing && isSimultaneous(next.mode) && next.round > prev.round) events.push({ type: 'round', round: next.round });
  const seen = new Set((prev.guesses || []).filter((g) => g.revealed).map((g) => g.playerId + ':' + g.attempt));
  for (const g of next.guesses || []) {
    if (g.playerId === next.me && g.revealed && g.colors && !seen.has(g.playerId + ':' + g.attempt)) {
      events.push({ type: 'scored', pins: g.pins, spins: g.spins });
    }
  }
  if (playing && next.mode === 'classic' && next.turnId === next.me && prev.turnId !== next.me) events.push({ type: 'turn' });
  if (prev.status === 'playing' && next.status === 'finished') {
    events.push({ type: 'end', won: (next.winners || []).includes(next.me) });
  }
  return events;
}

// Classic turn order. The server picks a random starter, then turns go round by seat.
// The snapshot has no "starter", so it is worked out from the guess counts: walking round
// the seats, the starter is where the count steps up (earlier players have one more guess).
// Returns lanes (from playerProgress) sorted in turn order, each with `order` (1 = first).
// Other modes are simultaneous: lanes keep seat order and get no `order`.
export function inTurnOrder(game, lanes) {
  const bySeat = [...lanes].sort((a, b) => a.player.seat - b.player.seat);
  if (game?.mode !== 'classic' || game.status === 'lobby') return bySeat;
  const active = bySeat.filter((lane) => !lane.left);
  const n = active.length;
  if (!n) return bySeat;
  let start = active.findIndex((lane, i) => active[(i - 1 + n) % n].guesses.length < lane.guesses.length);
  if (start < 0) start = Math.max(0, active.findIndex((lane) => lane.player.id === game.turnId));
  const ordered = [...active.slice(start), ...active.slice(0, start)].map((lane, i) => ({ ...lane, order: i + 1 }));
  return [...ordered, ...bySeat.filter((lane) => lane.left)];
}
export const ordinal = (n) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

// Rounds won in this room (migration 015): who leads. The ids of the player(s) with the most
// wins, among players still in the room; nobody until someone has won a round.
export function winLeaders(players) {
  const here = (players || []).filter((p) => p.active !== false);
  const best = Math.max(0, ...here.map((p) => Number(p.wins) || 0));
  return best > 0 ? new Set(here.filter((p) => (Number(p.wins) || 0) === best).map((p) => p.id)) : new Set();
}
