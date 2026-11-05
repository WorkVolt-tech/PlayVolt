import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDay, msToTomorrow, shareText } from '../../src/solo/solo.js';

test('the daily puzzle follows the player’s own calendar day', () => {
  assert.equal(localDay(new Date(2026, 10, 5, 23, 59)), '2026-11-05');
  assert.equal(localDay(new Date(2026, 0, 2, 0, 1)), '2026-01-02');
  assert.equal(msToTomorrow(new Date(2026, 10, 5, 23, 59, 0)), 60000);
});

test('the share text shows clues only, never the colors', () => {
  const game = { number: 5, maxTries: 6, status: 'won', guesses: [
    { colors: [0, 1, 2, 3], pins: 1, spins: 2 }, { colors: [1, 0, 1, 4], pins: 4, spins: 0 }] };
  assert.equal(shareText(game, 'https://x.dev'), 'Pin & Spin Daily #5 2/6\n🟢⚪⚪⚫\n🟢🟢🟢🟢\nhttps://x.dev');
  assert.match(shareText({ ...game, status: 'lost' }), /X\/6/);
});
