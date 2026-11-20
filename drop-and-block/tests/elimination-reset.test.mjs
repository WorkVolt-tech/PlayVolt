import test from 'node:test';
import assert from 'node:assert/strict';
import {previousActiveSeat,playLocalTurn,emptyBoard} from '../src/rules.js';
import {eliminationResetState,eliminationGhostOpacity} from '../src/eliminationReset.js';

test('previous active seat wraps and skips eliminated opponents',()=>{
 assert.equal(previousActiveSeat(3,[false,false,false,false]),2);
 assert.equal(previousActiveSeat(1,[false,false,false,false]),4);
 assert.equal(previousActiveSeat(4,[false,true,false,false]),3);
 assert.equal(previousActiveSeat(3,[false,true,false,false]),1);
 assert.equal(previousActiveSeat(1,[false,true,false,true]),3);
 assert.equal(previousActiveSeat(1,[false,true,true,true]),null);
});
test('4-player local Connect 3 eliminates the player who could last block',()=>{
 const w=9,h=8,board=emptyBoard(w,h);
 board[7*w]=3;board[7*w+1]=3;
 const state={board,turn:3,scores:[0,0,0,0],status:'playing',
  eliminated:[false,false,false,false],roundNumber:1};
 const next=playLocalTurn(state,2,4,'elimination',w,h);
 assert.deepEqual(next.eliminated,[false,true,false,false]);
 assert.equal(next.turn,4);
 assert.equal(next.roundNumber,2);
 assert.deepEqual(next.board,emptyBoard(w,h));
 assert.equal(next.eliminationPreviousBoard[7*w+2],3);
 assert.equal(next.eliminationTargetSeat,2);
 assert.equal(next.eliminationScorerSeat,3);
 assert.ok(Date.parse(next.eliminationRoundOpensAt)>Date.now());
});
test('last surviving player wins and no next-round countdown is created',()=>{
 const w=9,h=8,board=emptyBoard(w,h);
 board[7*w]=1;board[7*w+1]=1;
 const state={board,turn:1,scores:[0,0,0,0],status:'playing',
  eliminated:[false,true,true,false],roundNumber:3};
 const next=playLocalTurn(state,2,4,'elimination',w,h);
 assert.equal(next.status,'finished');
 assert.equal(next.winner,1);
 assert.deepEqual(next.eliminated,[false,true,true,true]);
 assert.equal(next.eliminationRoundOpensAt,null);
});
test('frozen server-based countdown stages and restore behavior',()=>{
 const game={mode:'elimination',status:'playing',
  eliminationRoundOpensAt:'2026-11-20T15:00:03.000Z',
  serverNow:'2026-11-20T15:00:00.000Z',eliminationTargetSeat:2,
  eliminationScorerSeat:3};
 assert.deepEqual([0,1200,2500,3200].map(t=>eliminationResetState(game,t).phase),
  ['eliminated','clearing','countdown','ready']);
 assert.deepEqual([0,1200,2500,3200].map(t=>eliminationResetState(game,t).seconds),
  [3,2,1,0]);
 assert.equal(eliminationResetState({...game,status:'finished'}).active,false);
 assert.equal(eliminationResetState({...game,mode:'classic'}).active,false);
 assert.equal(eliminationGhostOpacity(0),1);
 assert.equal(eliminationGhostOpacity(.9),0);
});
