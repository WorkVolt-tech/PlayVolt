// Classic turn order shown on the TV and phones: random starter, then round by seat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inTurnOrder, ordinal, playerProgress } from '../../src/game/selectors.js';

const P = (id, seat, o = {}) => ({ id, name: id.toUpperCase(), seat, ready: true, active: true, ...o });
const G = (playerId, attempt) => ({ playerId, attempt, revealed: true, colors: [0, 1, 2, 3], pins: 0, spins: 0 });
const order = (game) => inTurnOrder(game, playerProgress(game)).map((l) => `${l.order ?? '-'}${l.player.id}`).join(' ');
const players = [P('a', 1), P('b', 2), P('c', 3), P('d', 4)];

test('at the start, the random starter (whose turn it is) is 1st, then by seat', () => {
  assert.equal(order({ mode: 'classic', status: 'playing', turnId: 'c', players, guesses: [] }), '1c 2d 3a 4b');
});

test('mid-round, the starter is found from the guess counts', () => {
  // c started; c and d have played, now it is a's turn.
  const game = { mode: 'classic', status: 'playing', turnId: 'a', players, guesses: [G('c', 1), G('d', 1)] };
  assert.equal(order(game), '1c 2d 3a 4b');
  // Second round: c played twice, everyone else once, now d's turn.
  const later = { ...game, turnId: 'd', guesses: [G('c', 1), G('d', 1), G('a', 1), G('b', 1), G('c', 2)] };
  assert.equal(order(later), '1c 2d 3a 4b');
});

test('the finished board keeps the same order', () => {
  const game = { mode: 'classic', status: 'finished', turnId: null, winners: ['a'], players,
    guesses: [G('b', 1), G('c', 1), G('d', 1), G('a', 1)] };
  // Everyone has 1 guess: no step, no turn → seat order from the first seat.
  assert.equal(order(game), '1a 2b 3c 4d');
  const won = { ...game, winners: ['d'], guesses: [G('b', 1), G('c', 1), G('d', 1), G('a', 1), G('b', 2), G('c', 2), G('d', 2)] };
  assert.equal(order(won), '1b 2c 3d 4a');
});

test('players who left go last, without a number; simultaneous modes keep seat order', () => {
  const left = [P('a', 1), P('b', 2, { active: false }), P('c', 3)];
  assert.equal(order({ mode: 'classic', status: 'playing', turnId: 'c', players: left, guesses: [] }), '1c 2a -b');
  assert.equal(order({ mode: 'reveal', status: 'playing', round: 1, players, guesses: [] }), '-a -b -c -d');
  assert.equal(order({ mode: 'classic', status: 'lobby', players, guesses: [] }), '-a -b -c -d');
});

test('ordinals', () => {
  assert.deepEqual([1, 2, 3, 4, 10, 11, 12, 13, 21].map(ordinal), ['1st', '2nd', '3rd', '4th', '10th', '11th', '12th', '13th', '21st']);
});
