import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSubmitGuess, guessLimit, matchEvents, nextRevealAt, myGuesses, playerProgress } from '../../src/game/selectors.js';

const players = [
  { id: 'a', name: 'Ana', seat: 1, active: true, submittedCount: 3 },
  { id: 'b', name: 'Ben', seat: 2, active: true, submittedCount: 2 },
];

function rush({ round = 1, status = 'playing' } = {}) {
  return {
    code: 'ABCDEF', mode: 'rush', status, round, me: 'a',
    players, winners: [],
    guesses: [
      { playerId: 'a', attempt: 1, colors: [0, 1, 2, 3], pins: 0, spins: 1, revealed: true },
      { playerId: 'a', attempt: 2, colors: [0, 1, 2, 4], pins: null, spins: null, revealed: false },
      { playerId: 'a', attempt: 3, colors: [0, 1, 3, 4], pins: null, spins: null, revealed: false },
      { playerId: 'b', attempt: 1, colors: [0, 2, 1, 3], pins: 1, spins: 0, revealed: true },
    ],
  };
}

test('Rush has five guesses, other game modes keep their limit', () => {
  assert.equal(guessLimit('rush'), 5);
  for (const mode of ['classic', 'reveal', 'timed-reveal']) assert.equal(guessLimit(mode), 4);
});

test('Rush players can continue making guesses without waiting for the next minute reveal', () => {
  const game = rush();
  assert.equal(myGuesses(game).length, 3);
  assert.equal(canSubmitGuess(game, { busy: false, remainingMs: 180000 }), true);
  assert.equal(canSubmitGuess(game, { busy: false, remainingMs: 0 }), false);
  assert.equal(canSubmitGuess({ ...game, guesses: [
    ...game.guesses,
    { playerId: 'a', attempt: 4, revealed: false },
    { playerId: 'a', attempt: 5, revealed: false },
  ] }, { busy: false, remainingMs: 180000 }), false);
});

test('TV and public boards reveal only announced rows and keep later rows sealed', () => {
  const [ana, ben] = playerProgress(rush());
  assert.deepEqual(ana.guesses.map((g) => g.attempt), [1]);
  assert.deepEqual(ana.sealedAttempts, [2, 3]);
  assert.equal(ana.used, 3);
  assert.deepEqual(ben.guesses.map((g) => g.attempt), [1]);
  assert.deepEqual(ben.sealedAttempts, [2]);
  assert.equal(ben.used, 2);
  assert.equal(ana.sealed, true);
});

test('Rush produces a per-minute reveal event, while normal reveal rounds still work', () => {
  const previous = rush({ round: 1 });
  const next = rush({ round: 2 });
  assert.ok(matchEvents(previous, next).some((e) => e.type === 'rush-reveal' && e.row === 2));
  const old = { ...previous, mode: 'reveal', round: 1 };
  const current = { ...next, mode: 'reveal', round: 2 };
  assert.ok(matchEvents(old, current).some((e) => e.type === 'round' && e.round === 2));
});

test('phones and TVs schedule each minute reveal and keep other deadlines unchanged', () => {
  const deadline = '2026-11-25T00:05:00Z';
  for (let round = 0; round < 5; round++) {
    assert.equal(nextRevealAt({ ...rush({ round }), deadline }),
      Date.parse('2026-11-25T00:00:00Z') + (round + 1) * 60000);
  }
  assert.equal(nextRevealAt({ ...rush(), mode: 'timed-reveal', deadline }), Date.parse(deadline));
  assert.equal(nextRevealAt({ ...rush({ status: 'finished' }), deadline }), null);
});
