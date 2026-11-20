import test from 'node:test';
import assert from 'node:assert/strict';
import {speedStartPhase} from '../src/speedCountdown.js';
import {speedRoundState} from '../src/speedRound.js';
const open='2026-11-20T00:00:03.000Z',now='2026-11-20T00:00:00.000Z';
test('server-based three-two-one countdown and GO are deterministic',()=>{
 assert.deepEqual(speedStartPhase(open,now,0),{phase:'countdown',count:3});
 assert.deepEqual(speedStartPhase(open,now,1200),{phase:'countdown',count:2});
 assert.deepEqual(speedStartPhase(open,now,2200),{phase:'countdown',count:1});
 assert.deepEqual(speedStartPhase(open,now,3000),{phase:'go',count:0});
 assert.deepEqual(speedStartPhase(open,now,3600),{phase:'go',count:0});
 assert.deepEqual(speedStartPhase(open,now,4300),{phase:'active',count:0});
});
test('missing date data falls back to original running speed rounds',()=>{
 assert.equal(speedStartPhase(null,now).phase,'active');
 assert.equal(speedStartPhase('invalid',now).phase,'active');
 assert.equal(speedStartPhase(open,'invalid').phase,'active');
});
test('current order is separate from last completed race and ignores invalid seats',()=>{
 const game={mode:'speed',status:'playing',roundNumber:4,
  players:[{seat:1},{seat:2},{seat:3}],
  speedPlayedSeats:[3,1],
  speedOrder:[{seat:3,place:1},{seat:1,place:2},{seat:99,place:1}],
  speedPreviousOrder:[{seat:2,place:1},{seat:3,place:2},{seat:1,place:3}]};
 const state=speedRoundState(game,2);
 assert.equal(state.canSubmit,true);
 assert.equal(state.positionBySeat.get(3),1);
 assert.equal(state.positionBySeat.get(1),2);
 assert.equal(state.positionBySeat.has(99),false);
 assert.deepEqual(state.previousOrder.map(p=>p.seat),[2,3,1]);
 assert.equal(state.currentOrder.length,2);
});
test('all original speed inputs still lock after one submission',()=>{
 const state=speedRoundState({mode:'speed',status:'playing',
  players:[{seat:1},{seat:2}],speedPlayedSeats:[1]},1);
 assert.equal(state.alreadyPlayed,true);
 assert.equal(state.canSubmit,false);
});
