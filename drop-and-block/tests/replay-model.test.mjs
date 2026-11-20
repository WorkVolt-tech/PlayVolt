import test from 'node:test';
import assert from 'node:assert/strict';
import {clampStep,replayFrame,canPlayReplay,outcomeLabel,modeLabels} from '../src/replayModel.js';
const detail={width:2,height:2,completeSnapshots:true,players:[{seat:1,score:7}],
 moves:[{boardAfter:[0,0,1,0],step:1,seat:1,column:0,kind:'drop',round:1,floorClears:0,event:'',playersAfter:[{seat:1,score:1,eliminated:false}]},
  {boardAfter:[0,0,0,1],step:2,seat:2,column:1,kind:'blast',round:2,floorClears:1,event:'Board reset',playersAfter:[{seat:1,score:1,eliminated:true}]}]};
test('replay uses recorded board snapshots, never inferred physics',()=>{
 const f=replayFrame(detail,2);
 assert.deepEqual(f.board,[0,0,0,1]);
 assert.equal(f.round,2);assert.equal(f.floorClears,1);
 assert.equal(f.event,'Board reset');assert.equal(f.players[0].eliminated,true);
});
test('the starting frame is the empty board with initial player state',()=>{
 const f=replayFrame(detail,0);assert.deepEqual(f.board,[0,0,0,0]);
 assert.equal(f.round,1);assert.equal(f.players[0].score,0);
});
test('scrub is clamped and malformed archived moves cannot mislead players',()=>{
 assert.equal(clampStep(-50,2),0);assert.equal(clampStep(500,2),2);
 assert.equal(clampStep('no',2),0);assert.equal(canPlayReplay(detail),true);
 assert.equal(canPlayReplay({...detail,completeSnapshots:false}),false);
 assert.equal(canPlayReplay({...detail,moves:[{boardAfter:[1,0]}]}),false);
});
test('outcomes and all seven modes remain readable',()=>{
 assert.equal(outcomeLabel('win'),'Victory');assert.equal(outcomeLabel('loss'),'Defeat');
 assert.equal(outcomeLabel('draw'),'Draw');assert.equal(Object.keys(modeLabels).length,7);
});
