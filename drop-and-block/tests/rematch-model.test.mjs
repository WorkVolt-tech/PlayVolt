import test from 'node:test';
import assert from 'node:assert/strict';

// Pure presentation-state rules: kept separate from the database-owned
// authoritative state machine, which is tested by transactional SQL.
function nextMatch(matchNumber, seats) {
  const next = matchNumber + 1;
  return {matchNumber:next,startingSeat:seats[(next-1)%seats.length]};
}
test('rematch starter rotates through the existing seats', () => {
  const seats=[1,2,3,4];
  assert.deepEqual(nextMatch(1,seats),{matchNumber:2,startingSeat:2});
  assert.deepEqual(nextMatch(2,seats),{matchNumber:3,startingSeat:3});
  assert.deepEqual(nextMatch(4,seats),{matchNumber:5,startingSeat:1});
});
