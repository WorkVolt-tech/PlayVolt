// The TV live board must fit one screen: the grid never needs more than 2 rows of lanes
// for up to 10 players, so nothing has to scroll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tvGrid } from '../../src/tv/tvGrid.js';

test('player lanes are laid out in at most 2 rows for up to 10 players', () => {
  const expected = { 1: [1, 1], 2: [2, 1], 3: [2, 2], 4: [2, 2], 5: [3, 2], 6: [3, 2], 7: [4, 2], 8: [4, 2], 9: [5, 2], 10: [5, 2] };
  for (const [n, [cols, rows]] of Object.entries(expected)) {
    assert.deepEqual(tvGrid(Number(n)), { cols, rows }, `${n} players`);
    assert.ok(cols * rows >= Number(n));
  }
});
