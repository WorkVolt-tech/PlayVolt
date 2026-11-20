import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard,playChaosTurn,blastColumn } from '../src/rules.js';

const fresh = (count=2) => ({board:emptyBoard(7,6),turn:1,status:'playing',winner:null,
  scores:Array(count).fill(0),chaosBlockUsed:Array(count).fill(false),chaosBlastUsed:Array(count).fill(false)});
test('Barrier drops a neutral piece, consumes a turn and cannot be reused',()=>{
  const one=playChaosTurn(fresh(),2,2,7,6,'block');
  assert.equal(one.board[5*7+2],9);
  assert.deepEqual(one.chaosBlockUsed,[true,false]);
  assert.equal(one.turn,2);
  const same={...one,turn:1};
  assert.strictEqual(playChaosTurn(same,3,2,7,6,'block'),same);
});
test('Blast removes bottommost chip and drops higher pieces',()=>{
  const state=fresh();
  state.board[5*7+3]=1;state.board[4*7+3]=9;state.board[3*7+3]=2;
  const result=playChaosTurn(state,3,2,7,6,'blast');
  assert.equal(result.board[5*7+3],9);
  assert.equal(result.board[4*7+3],2);
  assert.equal(result.board[3*7+3],0);
  assert.deepEqual(result.chaosBlastUsed,[true,false]);
  assert.strictEqual(blastColumn(emptyBoard(7,6),7,6,3),null);
});
test('Blast does not itself declare a winner, even after gravity shifts chips',()=>{
  const state=fresh();
  for(let i=0;i<4;i++)state.board[5*7+i]=i===3?2:1;
  const result=playChaosTurn(state,3,2,7,6,'blast');
  assert.equal(result.status,'playing');assert.equal(result.winner,null);
});
test('Only normal drops connect four to win in Chaos',()=>{
  const state=fresh();
  for(let c=0;c<3;c++)state.board[5*7+c]=1;
  const won=playChaosTurn(state,3,2,7,6,'drop');
  assert.equal(won.status,'finished');assert.equal(won.winner,1);
});
test('Power inventories reset for new local matches',()=>{
  const one=playChaosTurn(fresh(),0,2,7,6,'block');
  assert.equal(one.chaosBlockUsed[0],true);
  const second=fresh();
  assert.deepEqual(second.chaosBlockUsed,[false,false]);
});
