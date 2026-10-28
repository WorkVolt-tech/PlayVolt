// The five-doubles offer ("Reshuffle, or play on?") only opens for a hand with
// 5 or more doubles, before the first tile. (v1.58 accidentally split this
// condition in Solo, so every Solo game opened with the offer and stalled.)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
for (const f of ['SoloGame.jsx', 'StoryChallenge.jsx']) {
  const s = readFileSync(new URL(`../src/pages/${f}`, import.meta.url), 'utf8')
  const i = s.indexOf('const offerOpen ='), j = s.indexOf('\n  const', i + 10)
  const def = s.slice(i, j)
  assert.match(def, /myDoubles >= 5/, `${f}: the offer needs 5+ doubles`)
  assert.match(def, /!st\.doublesDecided/, `${f}: the offer closes once decided`)
}
console.log('the five-doubles offer needs 5+ doubles (Solo, Story)')
