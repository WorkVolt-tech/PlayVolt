// Client-side view rules from src/game/selectors.js (what the phone shows and enables).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attemptsDescending, canSubmitGuess, formatClock, isValidDraft, nextAttempt, placeColor, publicGuesses, statusText,
} from '../../src/game/selectors.js';

const mk = (o = {}) => ({ mode: 'classic', status: 'playing', me: 'a', turnId: 'a', round: 1, guesses: [], ...o });
const gs = (playerId, attempt, revealed = true) => ({ playerId, attempt, revealed, colors: [0, 0, 0, 0] });
const ok = (game, remainingMs = null) => canSubmitGuess(game, { busy: false, remainingMs });

test('Classic: only on your turn, up to four guesses', () => {
  assert.equal(ok(mk()), true);
  assert.equal(ok(mk({ turnId: 'b' })), false);
  assert.equal(ok(mk({ guesses: [1, 2, 3, 4].map((i) => gs('a', i)) })), false);
  assert.equal(canSubmitGuess(mk(), { busy: true, remainingMs: null }), false);
});

test('Reveal modes: one guess per round, blocked once the timer reaches zero', () => {
  const g = mk({ mode: 'timed-reveal', turnId: null, round: 2, guesses: [gs('a', 1)] });
  assert.equal(nextAttempt(g), 2);
  assert.equal(ok(g, 5000), true);
  assert.equal(ok(g, 0), false);
  assert.equal(ok({ ...g, guesses: [gs('a', 1), gs('a', 2, false)] }, 5000), false);
  assert.equal(statusText({ ...g, guesses: [gs('a', 2, false)] }, { busy: false, canSubmit: false }), 'WAIT FOR THE REVEAL');
});

test('Rush: eight guesses, next attempt counts your own guesses', () => {
  const seven = mk({ mode: 'rush', turnId: null, guesses: [1, 2, 3, 4, 5, 6, 7].map((i) => gs('a', i)) });
  assert.equal(nextAttempt(seven), 8);
  assert.equal(ok(seven, 1000), true);
  assert.equal(ok({ ...seven, guesses: [...seven.guesses, gs('a', 8)] }, 1000), false);
});

test('nothing can be submitted outside a live match', () => {
  assert.equal(ok(mk({ status: 'lobby' })), false);
  assert.equal(ok(mk({ status: 'finished' })), false);
  assert.equal(ok(null), false);
});

test('the shared board shows only revealed guesses', () => {
  const list = [gs('a', 1), gs('b', 1, false), gs('b', 2)];
  assert.deepEqual(publicGuesses(list).map((x) => x.playerId + x.attempt), ['a1', 'b2']);
  assert.deepEqual(publicGuesses(list, 'b').map((x) => x.attempt), [2]);
  assert.deepEqual(attemptsDescending(list), [2, 1]);
});

test('placing colors fills the next empty slot and allows repeats', () => {
  let s = { draft: [null, null, null, null], selected: 0 };
  for (const c of [3, 3, 1]) s = placeColor(s.draft, s.selected, c);
  assert.deepEqual(s, { draft: [3, 3, 1, null], selected: 3 });
  s = placeColor([1, null, 2, 2], 0, 4);
  assert.equal(s.selected, 1, 'wraps to the remaining empty slot');
  s = placeColor([1, 1, 1, 1], 3, 0);
  assert.equal(s.selected, 0, 'full row moves to the next slot');
});

test('saved drafts are validated before restoring', () => {
  assert.equal(isValidDraft([0, null, 5, 2]), true);
  assert.equal(isValidDraft([0, 6, 7, 1]), true, 'orange and pink (8-color games)');
  assert.equal(isValidDraft([0, 8, 1, 1]), false);
  assert.equal(isValidDraft([0, 1, 1]), false);
  assert.equal(isValidDraft('x'), false);
});

test('timer formatting rounds up to whole seconds', () => {
  assert.deepEqual(formatClock(180000), ['03', '00']);
  assert.deepEqual(formatClock(95001), ['01', '36']);
  assert.deepEqual(formatClock(400), ['00', '01']);
});

test('player progress uses only public data and marks sealed, thinking, turn and winners', async () => {
  const { playerProgress } = await import('../../src/game/selectors.js');
  const players = [
    { id: 'a', seat: 1, active: true, submitted: true },
    { id: 'b', seat: 2, active: true, submitted: false },
    { id: 'c', seat: 3, active: false, submitted: false },
  ];
  const guesses = [
    { playerId: 'a', attempt: 1, colors: [0, 1, 2, 3], pins: 2, spins: 1, revealed: true },
    { playerId: 'a', attempt: 2, colors: [5, 5, 5, 5], pins: null, spins: null, revealed: false },
    { playerId: 'b', attempt: 1, colors: null, pins: 0, spins: 0, revealed: true },
  ];
  const [a, b, c] = playerProgress(mk({ mode: 'reveal', round: 2, turnId: null, players, guesses }));
  assert.equal(a.sealed, true);
  assert.equal(a.used, 2);
  assert.equal(a.guesses.length, 1, 'the sealed guess itself is never included');
  assert.ok(a.guesses.every((x) => x.revealed));
  assert.equal(a.best, 2);
  assert.equal(b.thinking, true);
  assert.equal(b.best, null, 'a missed guess does not count as a score');
  assert.equal(c.left, true);
  assert.equal(c.thinking, false);

  const classic = playerProgress(mk({ turnId: 'b', players, guesses: [] }));
  assert.deepEqual(classic.map((x) => x.isTurn), [false, true, false]);
  const done = playerProgress(mk({ status: 'finished', winners: ['a', 'b'], players, guesses: [] }));
  assert.deepEqual(done.map((x) => x.won), [true, true, false]);
  assert.ok(done.every((x) => !x.isTurn && !x.thinking));
});

test('match events: start, new round, own scored guess, your turn, end — nothing on first load', async () => {
  const { matchEvents } = await import('../../src/game/selectors.js');
  const base = { code: 'A', puzzle: 1, me: 'a', mode: 'reveal', status: 'playing', round: 1, turnId: null, winners: [], guesses: [] };
  assert.deepEqual(matchEvents(null, base), []);
  assert.deepEqual(matchEvents({ ...base, status: 'lobby', puzzle: 0 }, base).map((e) => e.type), ['start']);
  const revealed = { ...base, round: 2, guesses: [
    { playerId: 'a', attempt: 1, colors: [0, 1, 2, 3], pins: 2, spins: 1, revealed: true },
    { playerId: 'b', attempt: 1, colors: [0, 0, 0, 0], pins: 1, spins: 0, revealed: true }] };
  assert.deepEqual(matchEvents(base, revealed), [{ type: 'round', round: 2 }, { type: 'scored', pins: 2, spins: 1 }]);
  assert.deepEqual(matchEvents(revealed, revealed), [], 'polling the same state fires nothing');
  const classic = { ...base, mode: 'classic', turnId: 'b' };
  assert.deepEqual(matchEvents(classic, { ...classic, turnId: 'a' }).map((e) => e.type), ['turn']);
  assert.deepEqual(matchEvents(base, { ...base, status: 'finished', winners: ['a'] }), [{ type: 'end', won: true }]);
  assert.deepEqual(matchEvents(revealed, { ...base, puzzle: 2 }), [], 'a rematch does not replay old events');
});

test('who leads on rounds won (crown): most wins among players still here; ties share it', async () => {
  const { winLeaders } = await import('../../src/game/selectors.js');
  assert.deepEqual([...winLeaders([{ id: 'a', wins: 0 }, { id: 'b', wins: 0 }])], [], 'nobody until a round is won');
  assert.deepEqual([...winLeaders([{ id: 'a', wins: 2 }, { id: 'b', wins: 3 }, { id: 'c' }])], ['b']);
  assert.deepEqual([...winLeaders([{ id: 'a', wins: 2 }, { id: 'b', wins: 2 }])].sort(), ['a', 'b']);
  assert.deepEqual([...winLeaders([{ id: 'a', wins: 5, active: false }, { id: 'b', wins: 1 }])], ['b'], 'someone who left loses the crown');
});
