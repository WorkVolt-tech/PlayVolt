import test from 'node:test';
import assert from 'node:assert/strict';
import {MARKS,AVATARS,BOARD_IDS,CHIP_IDS,safeBoard,safeChip,safeAvatar} from '../src/looksData.js';
test('default cosmetics and all 28 preview variants have a trusted rendering',()=>{
 assert.equal(BOARD_IDS.size,7);
 assert.equal(CHIP_IDS.size,8);
 assert.equal(Object.keys(AVATARS).length,13);
 assert.ok(BOARD_IDS.has('deep-navy'));
 assert.ok(CHIP_IDS.has('round'));
 assert.ok(Object.hasOwn(AVATARS,'sentinel'));
 assert.equal(BOARD_IDS.size+CHIP_IDS.size+Object.keys(AVATARS).length,28);
});
test('unknown cosmetic IDs fail closed to known default appearances',()=>{
 assert.equal(safeBoard('bad-board'), 'deep-navy');
 assert.equal(safeChip('bad-chip'), 'round');
 assert.equal(safeAvatar('fake-avatar'),'sentinel');
 assert.equal(safeBoard('<script>alert(1)</script>'),'deep-navy');
});
test('the eight players retain distinct numbered marks, plus neutral blocker',()=>{
 assert.equal(MARKS.length,10);
 assert.equal(new Set(MARKS.slice(1,9)).size,8);
 assert.equal(MARKS[9],'⬢');
});
