import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyBoard} from '../src/rules.js';
import {applyGravityShift,completedLines,playGravityTurn,emptyRivalry,registerRivalry,boardStanding} from '../src/arcadeModes.js';
const width=7,height=6,count=2;
const base=()=>({board:emptyBoard(width,height),turn:1,status:'playing',winner:null,moveCount:0,
 scores:[0,0],gravity:{drops:0,nextDirection:'left',lastShift:null},rivalry:emptyRivalry(count)});
test('horizontal compression moves occupied chips left and re-settles downward',()=>{
 const b=emptyBoard(width,height);
 b[40]=1;b[41]=2; // bottom-row columns 5 and 6
 const result=applyGravityShift(b,width,height,'left');
 assert.equal(result[35],1);assert.equal(result[36],2);
 assert.equal(result[40],0);assert.equal(result[41],0);
});
test('right gravity compresses rows right while preserving order',()=>{
 const b=emptyBoard(width,height);
 b[35]=1;b[36]=2;
 const result=applyGravityShift(b,width,height,'right');
 assert.equal(result[40],1);assert.equal(result[41],2);
});
test('gravity shifts after fourth legal drop and switches direction',()=>{
 let s=base();
 for(let i=0;i<4;i++){
  s=playGravityTurn(s,i,count,width,height);
  if(i<3)assert.equal(s.gravity.lastShift,null);
 }
 assert.equal(s.gravity.drops,4);
 assert.equal(s.gravity.lastShift,'left');
 assert.equal(s.gravity.nextDirection,'right');
 assert.equal(s.turn,1);
});
test('gravity never shifts after a direct winning connection',()=>{
 let s=base();
 s.gravity.drops=3;
 s.board[35]=1;s.board[36]=1;s.board[37]=1; // three across on bottom
 const n=playGravityTurn(s,3,count,width,height);
 assert.equal(n.winner,1);assert.equal(n.status,'finished');
 assert.equal(n.gravity.lastShift,null);
});
test('simultaneous wins after gravity shift produce a draw',()=>{
 const b=emptyBoard(width,height);
 for(let x=0;x<4;x++){b[35+x]=1;b[28+x]=2;}
 assert.deepEqual(completedLines(b,width,height,2,4),[1,2]);
});
test('a legal block increases rivalry stats and records denial',()=>{
 const s=base();
 s.board[35]=2;s.board[36]=2;s.board[37]=2;
 const n=playGravityTurn(s,3,count,width,height);
 const tracked=registerRivalry(s,n,count,width,height,'gravity');
 assert.equal(tracked.rivalry.blocks[0],1);
 assert.equal(tracked.rivalry.deniedBy[1].includes(1),true);
 assert.match(tracked.lastEvent,/DENIED/i);
});
test('scoreboard orders territory by real score, other modes by momentum',()=>{
 const b=emptyBoard(width,height);
 b[35]=1;b[36]=1;
 const players=[{seat:1,name:'First',score:2},{seat:2,name:'Second',score:5}];
 const territory=boardStanding({board:b,width,height,players,mode:'territory',winLength:4});
 assert.equal(territory[0].name,'Second');assert.equal(territory[0].metric,5);
 const classic=boardStanding({board:b,width,height,players,mode:'classic',winLength:4});
 assert.equal(classic[0].name,'First');assert.equal(classic[0].metric,2);
});
