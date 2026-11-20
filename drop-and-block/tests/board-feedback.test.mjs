import test from 'node:test';
import assert from 'node:assert/strict';
import {winningCells,lastMoveCell,matchSummary} from '../src/boardFeedback.js';
const make=(w,h)=>Array(w*h).fill(0);
test('last placed piece and barrier are outlined only while present',()=>{
 const b=make(7,6);b[5*7+2]=1;
 assert.equal(lastMoveCell(b,7,6,{seat:1,column:2,row:5,kind:'drop'}),37);
 assert.equal(lastMoveCell(b,7,6,{seat:1,column:2,row:5,kind:'blast'}),null);
 b[37]=9;
 assert.equal(lastMoveCell(b,7,6,{seat:1,column:2,row:5,kind:'block'}),37);
 assert.equal(lastMoveCell(b,7,6,{seat:1,column:2,row:5,kind:'drop'}),null);
});
test('winner four-in-a-row must pass through the final chip',()=>{
 const b=make(7,6);
 for(let x=0;x<=3;x++)b[5*7+x]=1;
 const last={seat:1,column:3,row:5,kind:'drop'};
 assert.deepEqual(winningCells(b,7,6,1,'classic',last),[35,36,37,38]);
 assert.deepEqual(winningCells(b,7,6,2,'classic',last),[]);
 assert.deepEqual(winningCells(b,7,6,1,'territory',last),[]);
 assert.deepEqual(winningCells(b,7,6,1,'classic',{...last,kind:'blast'}),[]);
});
test('Team Battle winning streak accepts mixed seat colors from the same team',()=>{
 const b=make(9,8);
 [1,3,1,3].forEach((seat,x)=>{b[7*9+x]=seat;});
 assert.deepEqual(winningCells(b,9,8,3,'team',{seat:3,column:3,row:7,kind:'drop'}),[63,64,65,66]);
 assert.deepEqual(winningCells(b,9,8,3,'classic',{seat:3,column:3,row:7,kind:'drop'}),[]);
 b[64]=2;
 assert.deepEqual(winningCells(b,9,8,3,'team',{seat:3,column:3,row:7,kind:'drop'}),[]);
});
test('diagonal and vertical streaks include all relevant winning cells',()=>{
 const b=make(7,6);
 [[0,5],[1,4],[2,3],[3,2]].forEach(([x,y])=>{b[y*7+x]=4;});
 assert.deepEqual(winningCells(b,7,6,4,'elimination',{seat:4,column:3,row:2,kind:'drop'}),[17,23,29,35]);
 const v=make(7,6);
 for(let y=2;y<6;y++)v[y*7+4]=2;
 assert.deepEqual(winningCells(v,7,6,2,'collapse',{seat:2,column:4,row:2,kind:'drop'}),[18,25,32,39]);
});
test('no false highlight after elimination reset or bottom-row collapse',()=>{
 const reset=make(9,8);
 const last={seat:1,column:2,row:3,kind:'drop'};
 assert.equal(lastMoveCell(reset,9,8,last),null);
 assert.deepEqual(winningCells(reset,9,8,1,'elimination',last),[]);
 assert.deepEqual(winningCells([],9,8,1,'classic',last),[]);
});
test('match results handle draws, territories, and team victories',()=>{
 const players=[{seat:1,name:'A',score:3},{seat:2,name:'B',score:2},
 {seat:3,name:'C',score:1},{seat:4,name:'D',score:0}];
 assert.equal(matchSummary({status:'playing',players}),null);
 assert.equal(matchSummary({status:'finished',winnerSeat:1,mode:'classic',players}).title,'A WINS!');
 assert.equal(matchSummary({status:'finished',winnerSeat:1,mode:'territory',players}).subtitle,'Top score: 3 points');
 assert.equal(matchSummary({status:'finished',winnerSeat:3,mode:'team',players}).winners.length,2);
 assert.equal(matchSummary({status:'finished',winnerSeat:null,mode:'territory',players}).draw,true);
});
