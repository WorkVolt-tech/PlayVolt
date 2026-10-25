// Asosyé: when the winning team is two bots, the stronger hand opens
// (lib/botAI.js pickOpener). The winner keeps it unless the partner's hand is
// clearly stronger.
import assert from 'node:assert/strict'
import { register } from 'node:module'
register('./_story-loader.js', import.meta.url)
const { pickOpener, openerStrength } = await import('../src/lib/botAI.js')

const strong = [[6, 6], [6, 5], [6, 4], [6, 2], [6, 1], [1, 1], [0, 0]]   // long run of 6s, three doubles
const weak   = [[5, 4], [3, 2], [4, 1], [5, 3], [2, 0], [4, 3], [5, 2]]   // scattered, no doubles
assert.ok(openerStrength(strong) > openerStrength(weak))
assert.equal(pickOpener(1, weak, 3, strong), 3, 'the partner with the much stronger hand opens')
assert.equal(pickOpener(1, strong, 3, weak), 1, 'the winner with the stronger hand keeps it')
assert.equal(pickOpener(1, weak, 3, weak), 1, 'equal hands: the winner opens')
console.log('the stronger hand opens')
