import test from 'node:test';
import assert from 'node:assert/strict';
import {speedRoundState} from '../src/speedRound.js';
const game={mode:'speed',status:'playing',roundNumber:3,
 players:[{seat:1},{seat:2},{seat:3}],speedPlayedSeats:[2]};
test('all players may submit at the beginning of a speed round',()=>{
 const g={...game,speedPlayedSeats:[]};
 for(let seat=1;seat<=3;seat++)assert.equal(speedRoundState(g,seat).canSubmit,true);
 assert.equal(speedRoundState(g,1).playedCount,0);
});
test('one chip per player until everyone finishes that round',()=>{
 assert.equal(speedRoundState(game,2).canSubmit,false);
 assert.equal(speedRoundState(game,1).canSubmit,true);
 assert.equal(speedRoundState(game,3).canSubmit,true);
 assert.equal(speedRoundState(game,2).alreadyPlayed,true);
 assert.equal(speedRoundState({...game,speedPlayedSeats:[1,2,3]},1).playedCount,3);
});
test('new round clears participation and re-enables everyone',()=>{
 const next={...game,roundNumber:4,speedPlayedSeats:[]};
 assert.equal(speedRoundState(next,2).canSubmit,true);
 assert.equal(speedRoundState(next,3).round,4);
});
test('stopped matches, non-members and other modes cannot use speed inputs',()=>{
 assert.equal(speedRoundState({...game,status:'finished'},1).canSubmit,false);
 assert.equal(speedRoundState(game,99).canSubmit,false);
 assert.equal(speedRoundState({...game,mode:'classic'},1).canSubmit,false);
 assert.equal(speedRoundState({...game,speedPlayedSeats:[2,2,42,0,'1']},2).playedCount,1);
});
