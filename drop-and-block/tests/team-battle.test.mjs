import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyBoard,dimensions,drop,teamOfSeat,teamLinePoints,playTeamTurn} from '../src/rules.js';
import {TROPHIES,MODES} from '../src/achievements.js';

const fresh=(count=4,width=9,height=8)=>({board:emptyBoard(width,height),turn:1,
  winner:null,winnerTeam:null,status:'playing',scores:Array(count).fill(0)});

test('odd and even seats are balanced between two teams',()=>{
 assert.equal(teamOfSeat(1),1);
 assert.equal(teamOfSeat(3),1);
 assert.equal(teamOfSeat(8),2);
 assert.equal(teamOfSeat(0),null);
 assert.equal(teamOfSeat(9),null);
});
test('different teammates can complete a mixed-color horizontal line',()=>{
 const state=fresh();
 const width=9,height=8;
 state.board[7*width+0]=1;
 state.board[7*width+1]=3;
 state.board[7*width+2]=1;
 state.turn=3;
 const next=playTeamTurn(state,3,4,width,height);
 assert.equal(next.winner,3);
 assert.equal(next.winnerTeam,1);
 assert.equal(next.status,'finished');
 assert.equal(next.turn,null);
});
test('opposing chip interrupts same-team four',()=>{
 const state=fresh(),width=9,height=8;
 state.board[7*width+0]=1;
 state.board[7*width+1]=2;
 state.board[7*width+2]=3;
 state.turn=1;
 const next=playTeamTurn(state,3,4,width,height);
 assert.equal(next.status,'playing');
 assert.equal(next.winnerTeam,null);
});
test('mixed-color teammates complete vertical and diagonal lines',()=>{
 const w=9,h=8;
 const v=emptyBoard(w,h);
 for(let y=7;y>=5;y--)v[y*w+0]=(y%2===0?1:3);
 v[4*w+0]=1;
 assert.equal(teamLinePoints(v,w,h,0,4,1),1);
 const diag=emptyBoard(w,h);
 [[0,7,1],[1,6,3],[2,5,1],[3,4,3]].forEach(([x,y,seat])=>{diag[y*w+x]=seat;});
 assert.equal(teamLinePoints(diag,w,h,3,4,3),1);
});
test('full board without a team four is a draw (including mixed chips)',()=>{
 const s=fresh(4,4,4);
 const pattern=[[1,1,2,2],[2,2,1,1],[1,1,2,2],[2,2,1,1]];
 for(let y=0;y<4;y++)for(let x=0;x<4;x++)s.board[y*4+x]=pattern[y][x];
 s.board[0]=0;
 s.turn=1;
 const next=playTeamTurn(s,0,4,4,4);
 assert.equal(next.status,'finished');
 assert.equal(next.winnerTeam,null);
});
test('different sizes support 2v2,3v3,4v4 and all original modes remain available',()=>{
 assert.deepEqual([4,6,8].map(dimensions),[[9,8],[12,9],[14,10]]);
 assert.equal(TROPHIES.length,13);
 assert.ok(TROPHIES.some(t=>t.code==='team_win'));
 assert.ok(MODES.some(x=>x.value==='team'));
});
