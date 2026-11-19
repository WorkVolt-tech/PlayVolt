import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard, drop, dimensions } from '../src/rules.js';

test('boards expand from 2 to 8 players', () => {
  assert.deepEqual(dimensions(2), [7, 6]);
  assert.deepEqual(dimensions(4), [9, 8]);
  assert.deepEqual(dimensions(6), [12, 9]);
  assert.deepEqual(dimensions(8), [14, 10]);
});
test('pieces obey gravity and reject full columns', () => {
  let board = emptyBoard(7, 6);
  for (let i = 0; i < 6; i++) {
    const move = drop(board, 7, 6, 0, 1);
    assert.equal(move.row, 5 - i);
    board = move.board;
  }
  assert.equal(drop(board, 7, 6, 0, 1), null);
});
test('horizontal, vertical, and diagonal connections score', () => {
  const w = 7, h = 6;
  for (const coords of [
    [[0,5],[1,5],[2,5],[3,5]],
    [[0,5],[0,4],[0,3],[0,2]],
    [[0,5],[1,4],[2,3],[3,2]]
  ]) {
    const board = emptyBoard(w,h);
    for (let i = 0; i < 3; i++) board[coords[i][1] * w + coords[i][0]] = 1;
    // diagonal support cells are a separate color, not counted as the line
    if (coords[3][1] !== 5 && coords[3][0] !== 0) {
      for (let x = 0; x < 4; x++) {
        const target = coords.find(c => c[0] === x)?.[1] ?? 6;
        for (let y = 5; y > target; y--) board[y*w+x] = 2;
      }
    }
    // Check score for a synthetic last placement at the desired gravity location.
    const last = coords[3];
    if (board[last[1]*w+last[0]] !== 0) continue;
    const result = drop(board,w,h,last[0],1);
    assert.equal(result?.points, 1);
  }
});
test('empty cells cannot be played from outside the board', () => {
  assert.equal(drop(emptyBoard(7,6),7,6,-1,1),null);
  assert.equal(drop(emptyBoard(7,6),7,6,7,1),null);
});
