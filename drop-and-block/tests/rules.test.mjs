import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard, drop, dimensions, playLocalTurn, clearBottomRow } from '../src/rules.js';

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


test('elimination removes the previous active opponent, skipping eliminated players', () => {
  const board = emptyBoard(7, 6);
  for (let col = 0; col < 3; col++) board[5 * 7 + col] = 1;
  const state = { board, scores: [0, 0, 0, 0], turn: 1, winner: null,
    status: 'playing', eliminated: [false, false, true, false], roundNumber: 1, floorClears: 0 };
  const next = playLocalTurn(state, 3, 4, 'elimination', 7, 6);
  assert.deepEqual(next.eliminated, [false, false, true, true]);
  assert.deepEqual(next.board, emptyBoard(7, 6));
  assert.equal(next.roundNumber, 2);
  assert.equal(next.turn, 2);
  assert.equal(next.status, 'playing');
  assert.equal(next.scores[0], 1);
});
test('elimination ends with a single survivor', () => {
  const board = emptyBoard(7, 6);
  for (let col = 0; col < 3; col++) board[5 * 7 + col] = 1;
  const state = { board, scores: [0, 0], turn: 1, winner: null,
    status: 'playing', eliminated: [false, false], roundNumber: 1 };
  const next = playLocalTurn(state, 3, 2, 'elimination', 7, 6);
  assert.equal(next.status, 'finished');
  assert.equal(next.winner, 1);
  assert.deepEqual(next.eliminated, [false, true]);
});
test('collapse clears the bottom row only on reaching second-highest row', () => {
  const board = emptyBoard(7, 6);
  for (let row = 2; row < 6; row++) board[row * 7] = row % 2 ? 1 : 2;
  const state = { board, scores: [0,0], turn: 1, winner: null, status: 'playing',
    eliminated: [false,false], roundNumber: 1, floorClears: 0 };
  const next = playLocalTurn(state, 0, 2, 'collapse', 7, 6);
  assert.equal(next.floorClears, 1);
  assert.deepEqual(next.board.slice(0, 7), Array(7).fill(0));
  assert.equal(next.board[5 * 7], board[4 * 7]);
  assert.equal(next.board[2 * 7], 1);
  assert.equal(next.status, 'playing');
});
test('collapse preserves chips above the cleared row and permits continued play', () => {
  const board=emptyBoard(7,6);
  board[4*7+3]=2; board[5*7+3]=1;
  const next=clearBottomRow(board,7,6);
  assert.equal(next[5*7+3],2);
  assert.equal(next[4*7+3],0);
  assert.equal(next.length,42);
});
test('collapse finishes normally on a connecting move before clearing the floor', () => {
  const board = emptyBoard(7, 6);
  for (let col = 0; col < 3; col++) board[5*7+col]=2;
  const s={board,scores:[0,0],turn:2,status:'playing',winner:null,eliminated:[false,false],floorClears:0};
  const next=playLocalTurn(s,3,2,'collapse',7,6);
  assert.equal(next.winner,2);
  assert.equal(next.floorClears,0);
});
