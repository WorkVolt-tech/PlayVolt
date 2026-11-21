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

test('double mode cannot be used before activation and allows both successive placements',()=>{
 let state=initial();
 assert.strictEqual(playPowerTurn(state,3,count,width,height,'double'),state);
 state.power.energy[0]=100;
 state=activateDouble(state,count);
 const before=state.turn;
 state=playPowerTurn(state,3,count,width,height,'double');
 assert.equal(state.turn,before);
 assert.equal(state.board[38],1);
 assert.equal(state.power.doublePending,1);
 assert.match(state.lastEvent,/second column/i);
 state=playPowerTurn(state,4,count,width,height,'double');
 assert.equal(state.board[39],1);
 assert.equal(state.turn,2);
 assert.equal(state.power.doublePending,0);
});
test('double drop cannot spend the same ability twice or mix in other powers',()=>{
 let state=initial();state.power.energy[0]=100;
 state=activateDouble(state,count);
 assert.strictEqual(activateDouble(state,count),state);
 assert.strictEqual(playPowerTurn(state,3,count,width,height,'drop'),state);
 assert.strictEqual(playPowerTurn(state,3,count,width,height,'freeze'),state);
});
test('freeze keeps chips in place and blocks normal and double drops for everyone',()=>{
 let state=initial();
 state.board[38]=1;
 state.power.energy[0]=80;
 const frozen=playPowerTurn(state,3,count,width,height,'freeze');
 assert.equal(frozen.board[38],1);
 assert.equal(frozen.power.frozen.column,3);
 assert.strictEqual(playPowerTurn(frozen,3,count,width,height),frozen);
 const other=playPowerTurn(frozen,4,count,width,height);
 assert.equal(other.turn,1);
 assert.equal(other.power.frozen,null);
});

test('bomb shatters a frozen target column, destroys hit chips, and unlocks it',()=>{
 const state=initial();
 state.board[36]=2;state.board[37]=1;state.board[38]=2;
 state.turn=2;
 state.power.energy[1]=100;
 state.power.frozen={column:2,owner:1};
 const next=playPowerTurn(state,2,count,width,height,'bomb');
 assert.equal(next.power.frozen,null);
 assert.equal(next.board[36],0);
 assert.equal(next.board[37],0);
 assert.equal(next.board[38],0);
 assert.match(next.lastEvent,/ICE SHATTERED/);
 assert.equal(powerTargetAllowed({...next,turn:1,...next.power},'drop',2,width,height),true);
});
test('bomb blast next to frozen column shatters ice but keeps distant chips',()=>{
 const state=initial();
 state.board[36]=1;state.board[37]=2;state.board[38]=1;
 state.board[39]=2;state.board[40]=2;
 state.power.energy[0]=100;
 state.power.frozen={column:3,owner:1};
 const next=playPowerTurn(state,2,count,width,height,'bomb');
 assert.equal(next.power.frozen,null);
 assert.equal(next.board[36],0);
 assert.equal(next.board[37],0);
 assert.equal(next.board[38],0);
 assert.equal(next.board[39],2);
 assert.equal(next.board[40],2);
});
test('bomb can break an empty frozen column without deleting unrelated chips',()=>{
 const state=initial();
 state.power.energy[0]=100;
 state.power.frozen={column:3,owner:1};
 assert.equal(powerTargetAllowed({...state,...state.power},'bomb',3,width,height),true);
 const next=playPowerTurn(state,3,count,width,height,'bomb');
 assert.equal(next.power.frozen,null);
 assert.equal(next.power.energy[0],0);
 assert.match(next.lastEvent,/ICE SHATTERED/);
});
test('bomb does not thaw a frozen column outside its blast width',()=>{
 const state=initial();
 state.board[35]=2;state.power.energy[0]=100;
 state.power.frozen={column:3,owner:1};
 const next=playPowerTurn(state,0,count,width,height,'bomb');
 assert.equal(next.power.frozen?.column,3);
});
