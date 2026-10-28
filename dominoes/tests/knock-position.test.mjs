// A knock must come from where that player sits — the same layout as the hands
// (components/OpponentHands.jsx): 2 players across, 3 players right and left,
// 4 players right, across, left. (Online games, Story and Practice.)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// the one seating rule (rules/dekabess.js), used by every screen
import { register } from 'node:module'
register('./_story-loader.js', import.meta.url)
const { seatSide: sideOf } = await import('../src/rules/dekabess.js')
const game = readFileSync(new URL('../src/pages/Game.jsx', import.meta.url), 'utf8')
assert.match(game, /const sideOf = seatSide/, 'the online game uses the shared seating rule')
assert.match(game, /position: sideOf\(e\.player_seat, myInfo\?\.seat \?\? 0, playersForKnock\.current\.length \|\| 4\)/, 'online knocks use it with the table size')

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

// Story and Practice use the same rule (you are always seat 0)
for (const f of ['StoryChallenge.jsx', 'Practice.jsx']) {
  const src = readFileSync(new URL(`../src/pages/${f}`, import.meta.url), 'utf8')
  assert.match(src, /const knockPos = seat => seatSide\(seat, 0, st\?\.seats \?\? 4\)/, `${f} uses the shared seating rule`)
}
console.log('knocks come from the right side: 2, 3 and 4 players, every seat')
