// A knock must come from where that player sits — the same layout as the hands
// (components/OpponentHands.jsx): 2 players across, 3 players right and left,
// 4 players right, across, left. (Online games, Story and Practice.)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// the online game's rule, taken from Game.jsx itself
const game = readFileSync(new URL('../src/pages/Game.jsx', import.meta.url), 'utf8')
const fnSrc = game.slice(game.indexOf('function sideOf'), game.indexOf('\n}\n', game.indexOf('function sideOf')) + 2)
const sideOf = new Function(fnSrc + '; return sideOf')()
assert.match(game, /position: sideOf\(e\.player_seat, myInfo\?\.seat \?\? 0, playersForKnock\.current\.length \|\| 4\)/, 'online knocks use sideOf with the table size')

// the hands' layout (OpponentHands.jsx), as the reference
function handSide(seat, mySeat, n) {
  const diff = ((seat - mySeat) % n + n) % n
  if (diff === 0) return 'bottom'
  if (n === 2) return 'top'
  if (n === 3) return diff === 1 ? 'right' : 'left'
  return ['bottom', 'right', 'top', 'left'][diff]
}
for (const n of [2, 3, 4]) for (let me = 0; me < n; me++) for (let s = 0; s < n; s++) {
  assert.equal(sideOf(s, me, n), handSide(s, me, n), `online: ${n} players, I sit at ${me}, seat ${s} knocks`)
}
assert.equal(sideOf(2, 0, 3), 'left', 'the reported case: 3 players, the left player knocks')

// Story and Practice (you are always seat 0)
for (const f of ['StoryChallenge.jsx', 'Practice.jsx']) {
  const src = readFileSync(new URL(`../src/pages/${f}`, import.meta.url), 'utf8')
  const body = src.slice(src.indexOf('const knockPos = seat => {'), src.indexOf('\n  }\n', src.indexOf('const knockPos = seat => {')) + 4)
  for (const n of [2, 3, 4]) {
    const knockPos = new Function('st', body + '; return knockPos')({ seats: n })
    for (let s = 0; s < n; s++) assert.equal(knockPos(s), handSide(s, 0, n), `${f}: ${n} players, seat ${s} knocks`)
  }
}
console.log('knocks come from the right side: 2, 3 and 4 players, every seat')
