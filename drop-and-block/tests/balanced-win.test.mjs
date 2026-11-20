import test from 'node:test';
import assert from 'node:assert/strict';
import {balancedWinLength,emptyBoard,drop,playLocalTurn,playChaosTurn,playTeamTurn} from '../src/rules.js';
import {winningCells,matchSummary} from '../src/boardFeedback.js';

const board=()=>emptyBoard(9,8);
const line=(seat,length)=>{const b=board();for(let i=0;i<length;i++)b[7*9+i]=seat;return b;};
const state=(b,count=4,turn=1)=>({board:b,scores:Array(count).fill(0),turn,status:'playing',winner:null,
 eliminated:Array(count).fill(false),roundNumber:1,floorClears:0,
 chaosBlockUsed:Array(count).fill(false),chaosBlastUsed:Array(count).fill(false)});

test('Balanced is Connect 4 for 2–3 and Connect 3 for 4–8 starter counts',()=>{
 for(let n=2;n<=8;n++){
  assert.equal(balancedWinLength(n,'classic'),n<=3?4:3);
  assert.equal(balancedWinLength(n,'speed'),n<=3?4:3);
  assert.equal(balancedWinLength(n,'territory'),n<=3?4:3);
  assert.equal(balancedWinLength(n,'elimination'),n<=3?4:3);
  assert.equal(balancedWinLength(n,'collapse'),n<=3?4:3);
  assert.equal(balancedWinLength(n,'chaos'),n<=3?4:3);
  assert.equal(balancedWinLength(n,'team'),4);
 }
});
test('three player games do NOT award a line of three',()=>{
 const b=line(1,2);
 assert.equal(drop(b,9,8,2,1,4).points,0);
 assert.equal(playLocalTurn(state(b,3),2,3,'classic',9,8).status,'playing');
 assert.equal(playLocalTurn(state(line(1,3),3),3,3,'classic',9,8).status,'finished');
});
test('four to eight player Classic games finish on three own chips',()=>{
 for(let n=4;n<=8;n++){
  const r=playLocalTurn(state(line(1,2),n),2,n,'classic',9,8);
  assert.equal(r.status,'finished');
  assert.equal(r.winner,1);
  assert.equal(r.scores[0],1);
 }
});
test('Territory scores at three but continues until final score',()=>{
 const r=playLocalTurn(state(line(1,2),5),2,5,'territory',9,8);
 assert.equal(r.scores[0],1);
 assert.equal(r.status,'playing');
});
test('Elimination at four players knocks out a rival and resets the round',()=>{
 const r=playLocalTurn(state(line(1,2),4),2,4,'elimination',9,8);
 assert.deepEqual(r.eliminated,[false,true,false,false]);
 assert.deepEqual(r.board,board());
 assert.equal(r.roundNumber,2);
});
test('Bottom Drop and Chaos also use Connect 3 for 4+ players',()=>{
 const b=line(1,2);
 const collapse=playLocalTurn(state(b),2,4,'collapse',9,8);
 assert.equal(collapse.status,'finished');
 assert.equal(collapse.winner,1);
 const chaos=playChaosTurn(state(b),2,4,9,8);
 assert.equal(chaos.status,'finished');
 assert.equal(chaos.winner,1);
});
test('Team Battle always requires FOUR connected team chips',()=>{
 const b=board();
 b[7*9]=1;b[7*9+1]=3;
 const first=playTeamTurn(state(b,4,1),2,4,9,8);
 assert.equal(first.status,'playing');
 const next=playTeamTurn(state(first.board,4,3),3,4,9,8);
 assert.equal(next.status,'finished');
 assert.equal(next.winnerTeam,1);
});
test('a three-chip winner is highlighted only for Connect 3 games',()=>{
 const b=line(1,3),last={seat:1,column:2,row:7,kind:'drop'};
 assert.deepEqual(winningCells(b,9,8,1,'classic',last,3),[63,64,65]);
 assert.deepEqual(winningCells(b,9,8,1,'classic',last,4),[]);
 assert.deepEqual(winningCells(b,9,8,1,'territory',last,3),[]);
 assert.equal(matchSummary({status:'finished',winLength:3,mode:'classic',winnerSeat:1,
   players:[{seat:1,name:'Winner'}]}).subtitle,'Three connected. Victory!');
});
