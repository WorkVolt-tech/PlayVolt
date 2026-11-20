import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeChipFlights,shouldAnimateBoard} from '../src/arcadeMotion.js';
const blank=()=>Array(42).fill(0);
test('a new confirmed chip falls from above the correct column',()=>{
 const before=blank(),after=blank();after[35+3]=2;
 const flights=arcadeChipFlights(before,after,7,6);
 assert.equal(flights.length,1);
 assert.deepEqual([flights[0].row,flights[0].column,flights[0].seat],[5,3,2]);
 assert.ok(flights[0].duration>=400);
});
test('two same-column drops animate in server-accepted order',()=>{
 const before=blank(),after=blank();after[35]=3;after[28]=1;
 const flights=arcadeChipFlights(before,after,7,6,{
  speedOrder:[{seat:3,place:1},{seat:1,place:2}]
 });
 assert.deepEqual(flights.map(p=>p.seat),[3,1]);
 assert.ok(flights[1].delay>flights[0].delay);
});
test('initial state, rematch and different board dimensions do not animate',()=>{
 const a={board:blank(),width:7,height:6,matchNumber:1};
 assert.equal(shouldAnimateBoard(null,a),false);
 assert.equal(shouldAnimateBoard(a,{...a,matchNumber:2}),false);
 assert.equal(shouldAnimateBoard(a,{...a,width:9}),false);
 assert.equal(shouldAnimateBoard(a,{...a,board:blank()}),true);
 assert.equal(arcadeChipFlights(blank(),blank(),7,6).length,0);
});
test('Chaos Blast and Bottom Drop effects do not create fake falling chips',()=>{
 const before=blank(),after=blank();after[35]=2;
 assert.deepEqual(arcadeChipFlights(before,after,7,6,{blast:true}),[]);
 assert.deepEqual(arcadeChipFlights(before,after,7,6,{floorCleared:true}),[]);
 assert.deepEqual(arcadeChipFlights(before,after,7,6,{reset:true}),[]);
});
test('catch-up frames with many chips snap to correct board rather than guess',()=>{
 const before=blank(),after=Array(42).fill(0);
 for(let i=0;i<9;i++)after[41-i]=i%2+1;
 assert.deepEqual(arcadeChipFlights(before,after,7,6),[]);
});
test('existing chips, barriers and won matches remain server-owned',()=>{
 const before=blank(),after=blank();before[35]=3;after[35]=3;
 after[36]=9;const copy=after.slice();
 const flights=arcadeChipFlights(before,after,7,6);
 assert.deepEqual(flights.map(x=>[x.index,x.seat]),[[36,9]]);
 assert.deepEqual(after,copy);
 assert.deepEqual(before[35],3);
});
