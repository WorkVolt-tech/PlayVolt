import test from 'node:test';
import assert from 'node:assert/strict';
import {canPlayColumn,wideBoardMinWidth} from '../src/boardInteraction.js';
const blank=(w,h)=>Array(w*h).fill(0);
test('mobile board supports wide-board scrolling; spectator screens stay fitted',()=>{
 assert.equal(wideBoardMinWidth(7),0);
 assert.equal(wideBoardMinWidth(9),0);
 assert.equal(wideBoardMinWidth(12),480);
 assert.equal(wideBoardMinWidth(14),560);
 assert.equal(wideBoardMinWidth(14,true),0);
});
test('a column can be tapped only on the current turn and when it has space',()=>{
 const a=blank(7,6);
 assert.equal(canPlayColumn(a,7,6,2,'drop',false,1,1),true);
 assert.equal(canPlayColumn(a,7,6,2,'drop',false,1,2),false);
 assert.equal(canPlayColumn(a,7,6,2,'drop',true),false);
 a[2]=1;
 assert.equal(canPlayColumn(a,7,6,2,'drop'),false);
 assert.equal(canPlayColumn(a,7,6,3,'drop'),true);
});
test('Chaos blast requires a bottom piece; barriers use open columns',()=>{
 const a=blank(7,6);
 assert.equal(canPlayColumn(a,7,6,2,'blast'),false);
 a[5*7+2]=3;
 assert.equal(canPlayColumn(a,7,6,2,'blast'),true);
 assert.equal(canPlayColumn(a,7,6,2,'block'),true);
 a[2]=9;
 assert.equal(canPlayColumn(a,7,6,2,'block'),false);
 assert.equal(canPlayColumn(a,7,6,2,'blast'),true);
});
test('invalid column indices and malformed boards never enable a drop target',()=>{
 assert.equal(canPlayColumn(null,7,6,0),false);
 assert.equal(canPlayColumn([],7,6,0),false);
 assert.equal(canPlayColumn(blank(7,6),7,6,-1),false);
 assert.equal(canPlayColumn(blank(7,6),7,6,7),false);
 assert.equal(canPlayColumn(blank(7,6),7,6,1.5),false);
});
