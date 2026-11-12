// A turn that goes round the table and comes back to the same seat is a new turn
// (it gets a fresh clock; an old "out of time" no longer applies).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTurnSerial } from '../src/lib/turnSerial.js'

const run = (turns) => turns.reduce((s, t) => nextTurnSerial(s, t), { last: null, serial: 0 })

test('every change of turn counts, even when it comes straight back to the same seat', () => {
  assert.equal(run([0]).serial, 0)
  assert.equal(run([0, 1]).serial, 1)
  assert.equal(run([0, 1, 0]).serial, 2, 'me → them (they knock) → me again: a new turn')
  assert.equal(run([0, 1, 2, 3, 0]).serial, 4)
})

test('repeat updates for the same turn (scores, skins, a re-read) are not new turns', () => {
  assert.equal(run([2, 2, 2]).serial, 0)
  assert.equal(run([0, 1, 1, 1]).serial, 1)
})
