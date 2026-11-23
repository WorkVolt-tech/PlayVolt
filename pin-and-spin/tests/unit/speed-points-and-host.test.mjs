import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countsReadyForLobby, pointsLeaders, winLeaders } from '../../src/game/selectors.js';

const p = (id, { points = 0, wins = 0, ready = false, active = true } = {}) =>
  ({ id, points, wins, ready, active });

test('promoted host counts as ready even when old ready flag is false', () => {
  const host = p('new-host');
  const friend = p('friend', { ready: true });
  assert.equal(host.ready, false);
  assert.equal([host, friend].every((x) => countsReadyForLobby(x, 'new-host')), true);
  assert.equal([host, p('unready')].every((x) => countsReadyForLobby(x, 'new-host')), false);
  assert.equal(countsReadyForLobby(null, 'new-host'), false);
});

test('points leaderboard ignores players who left and preserves win leaderboard', () => {
  const players = [
    p('fast', { points: 10, wins: 1 }),
    p('slow', { points: 9, wins: 1 }),
    p('old-winner', { points: 6, wins: 4 }),
    p('left', { points: 90, wins: 10, active: false }),
  ];
  assert.deepEqual([...pointsLeaders(players)], ['fast']);
  assert.deepEqual([...winLeaders(players)], ['old-winner']);
  assert.equal(pointsLeaders([p('a'), p('b')]).size, 0);
});

test('tied total points have multiple leaders, while unrelated win counts stay unchanged', () => {
  const players = [p('a', { points: 19, wins: 2 }), p('b', { points: 19, wins: 0 })];
  assert.deepEqual([...pointsLeaders(players)].sort(), ['a', 'b']);
  assert.deepEqual([...winLeaders(players)], ['a']);
});
