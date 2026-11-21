import test from 'node:test';
import assert from 'node:assert/strict';
import {appendLocalMove,localReplayDetail} from '../src/localReplayModel.js';
import {canPlayReplay,replayFrame,replayTimeline} from '../src/replayModel.js';
import {winRuleDisplay} from '../src/winRule.js';

test('local accepted move records immutable snapshots and works with replay frame',()=>{
 const a=Array(42).fill(0),b=a.slice();b[35]=1;
 const old={board:a,scores:[0,0],eliminated:[false,false]};
 const next={board:b,scores:[0,0],eliminated:[false,false],roundNumber:1};
 const history=appendLocalMove([],old,next,{seat:1,column:0,row:5,width:7,height:6});
 b[35]=9;
 assert.equal(history[0].boardAfter[35],1);
 const detail=localReplayDetail({history,status:'playing',scores:[0,0]},{width:7,height:6,mode:'classic',count:2});
 assert.equal(detail.winLength,4);
 assert.equal(canPlayReplay(detail),true);
 assert.equal(replayFrame(detail,1).board[35],1);
 assert.equal(replayFrame(detail,0).board[35],0);
 assert.deepEqual(replayTimeline(detail,'full'),[0,1]);
});
test('local replay keeps elimination snapshots and final score',()=>{
 const old={scores:[0,0,0,0]},b=Array(72).fill(0),next={
  board:b,scores:[1,0,0,0],eliminated:[false,false,false,true],
  roundNumber:2,lastEvent:'Player 4 eliminated'
 };
 const hist=appendLocalMove([],old,next,{seat:1,column:2,row:7,width:9,height:8});
 const detail=localReplayDetail({history:hist,winner:1,status:'finished',scores:next.scores},
  {width:9,height:8,mode:'elimination',count:4});
 assert.equal(detail.winLength,3);
 assert.equal(detail.players[0].won,true);
 assert.equal(replayFrame(detail,1).event,'Player 4 eliminated');
 assert.equal(replayFrame(detail,1).players[3].eliminated,true);
});
test('lobby dynamic and match frozen rule labels are unambiguous',()=>{
 assert.equal(winRuleDisplay({mode:'classic',lobby:true,playerCount:3}).headline,'CONNECT 4');
 assert.equal(winRuleDisplay({mode:'classic',lobby:true,playerCount:4}).headline,'CONNECT 3');
 assert.equal(winRuleDisplay({mode:'team',lobby:true,playerCount:8}).headline,'CONNECT 4');
 assert.equal(winRuleDisplay({mode:'territory',winLength:3}).outcome,'TO SCORE');
 assert.equal(winRuleDisplay({mode:'elimination',winLength:3}).outcome,'TO ELIMINATE');
 assert.equal(winRuleDisplay({mode:'classic',winLength:4,playerCount:8}).headline,'CONNECT 4');
});
