import test from 'node:test';
import assert from 'node:assert/strict';
import {secondsLeft,clockText,TURN_SECONDS} from '../src/turnClockMath.js';
test('turn clock derives from server time, never local wall time',()=>{
 assert.equal(secondsLeft('2026-11-20T00:01:00Z','2026-11-20T00:00:00Z'),60);
 assert.equal(secondsLeft('2026-11-20T00:00:44Z','2026-11-20T00:00:20Z'),24);
 assert.equal(secondsLeft('2026-11-20T00:00:20Z','2026-11-20T00:00:44Z'),0);
 assert.equal(TURN_SECONDS,60);
});
test('invalid dates and empty room show no timer',()=>{
 assert.equal(secondsLeft(null,'2026-11-20T00:00:00Z'),null);
 assert.equal(secondsLeft('not-a-date','2026-11-20T00:00:00Z'),null);
 assert.equal(clockText(null),'--:--');
});
test('timer text fits TV and mobile screens',()=>{
 assert.equal(clockText(60),'01:00');
 assert.equal(clockText(9),'00:09');
 assert.equal(clockText(0),'00:00');
});
