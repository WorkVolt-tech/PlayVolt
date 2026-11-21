import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyBoard} from '../src/rules.js';
import {initPowerState,playPowerTurn,activateDouble,powerTargetAllowed} from '../src/powerRules.js';
const width=7,height=6,count=2;
const initial=()=>({board:emptyBoard(width,height),turn:1,status:'playing',winner:null,power:initPowerState(count)});
test('a legal drop generates energy and passes the turn',()=>{
 const next=playPowerTurn(initial(),3,count,width,height);
 assert.equal(next.board[38],1);
 assert.equal(next.power.energy[0],10);
 assert.equal(next.turn,2);
});
test('shield protects an occupied chip, costing energy',()=>{
 let state=initial();
 state.board[38]=1;state.power.energy[0]=70;
 const next=playPowerTurn(state,3,count,width,height,'shield');
 assert.equal(next.power.energy[0],0);
 assert.deepEqual(next.power.shields,[38]);
 assert.equal(next.turn,2);
});
test('freeze prevents dropping in its column and expires on owner next turn',()=>{
 let state=initial();state.power.energy[0]=80;
 const frozen=playPowerTurn(state,3,count,width,height,'freeze');
 assert.equal(frozen.power.frozen.column,3);
 assert.equal(powerTargetAllowed({...frozen,turn:2,...frozen.power},'drop',3,width,height),false);
 const next=playPowerTurn(frozen,2,count,width,height);
 assert.equal(next.turn,1);
 assert.equal(next.power.frozen,null);
});
test('bomb removes adjacent same-row chips and respects shields',()=>{
 let state=initial();
 state.board[35]=2;state.board[36]=1;state.board[37]=2;
 state.power.energy[0]=100;state.power.shields=[37];
 const next=playPowerTurn(state,1,count,width,height,'bomb');
 assert.equal(next.board[35],0);
 assert.equal(next.board[36],0);
 assert.equal(next.board[37],2);
 assert.equal(next.power.shields.length,0);
});
test('double drop consumes 100 energy and grants exactly two placements',()=>{
 let state=initial();state.power.energy[0]=100;
 state=activateDouble(state,count);
 assert.equal(state.power.doublePending,2);
 assert.equal(state.power.energy[0],0);
 state=playPowerTurn(state,1,count,width,height,'double');
 assert.equal(state.turn,1);
 assert.equal(state.power.doublePending,1);
 state=playPowerTurn(state,2,count,width,height,'double');
 assert.equal(state.turn,2);
 assert.equal(state.power.doublePending,0);
});
