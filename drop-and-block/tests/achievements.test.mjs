import test from 'node:test';
import assert from 'node:assert/strict';
import {TROPHIES, TROPHY_BY_CODE, MODES} from '../src/achievements.js';
test('all unique server trophy codes are represented in the game gallery',()=>{
 assert.equal(TROPHIES.length,12);
 assert.equal(new Set(TROPHIES.map(t=>t.code)).size,TROPHIES.length);
 assert.equal(Object.keys(TROPHY_BY_CODE).length,TROPHIES.length);
 for (const item of TROPHIES) {
  assert.ok(item.title && item.icon && item.description && item.tier);
  assert.ok(['Bronze','Silver','Gold','Platinum'].includes(item.tier));
 }
});
test('every ranked mode uses a database-compatible filter',()=>{
 assert.deepEqual(MODES.map(x=>x.value),['all','classic','territory','elimination','collapse','chaos']);
});
