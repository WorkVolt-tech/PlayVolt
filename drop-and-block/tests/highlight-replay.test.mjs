import test from 'node:test';
import assert from 'node:assert/strict';
import {highlightSteps,replayTimeline,highlightLabel} from '../src/replayModel.js';
const mk=(n)=>({width:7,height:6,completeSnapshots:true,moves:Array.from({length:n},(_,i)=>({
 step:i+1,seat:i%2+1,column:i%7,kind:'drop',earned:0,round:1,floorClears:0,event:'',
 boardAfter:Array(42).fill(0),playersAfter:[]
}))});
test('highlight reel always contains the final move in order and respects the limit',()=>{
 const d=mk(30);
 d.moves[7].earned=1;
 d.moves[12].kind='blast';
 d.moves[15].event='Player eliminated!';
 d.moves[16].round=2;
 d.moves[24].floorClears=1;
 const steps=highlightSteps(d);
 assert.deepEqual(steps,[...new Set(steps)].sort((a,b)=>a-b));
 assert.ok(steps.includes(30));assert.ok(steps.includes(8));assert.ok(steps.includes(13));
 assert.ok(steps.includes(16));assert.ok(steps.length<=14);
 assert.deepEqual(replayTimeline(d,'highlights'),[0,...steps]);
 assert.equal(replayTimeline(d,'full').length,31);
});
test('short unremarkable matches still have a meaningful final stretch',()=>{
 const d=mk(4);
 assert.deepEqual(highlightSteps(d),[1,2,3,4]);
 assert.equal(highlightLabel(d,4),'Final move');
});
test('highlight mode gracefully rejects incomplete historical snapshots',()=>{
 const d=mk(6);
 d.moves[1].boardAfter=null;
 assert.deepEqual(highlightSteps(d),[]);
 assert.deepEqual(replayTimeline(d,'highlights'),[]);
});
test('special moves get an explanatory label',()=>{
 const d=mk(5);
 d.moves[1].kind='block';
 d.moves[2].kind='blast';
 d.moves[3].earned=1;
 assert.equal(highlightLabel(d,2),'Barrier');
 assert.equal(highlightLabel(d,3),'Blast!');
 assert.equal(highlightLabel(d,4),'Scoring line');
});
