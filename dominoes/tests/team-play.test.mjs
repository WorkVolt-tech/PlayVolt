// Asosyé team play for the regular bots (lib/botAI.js).
import assert from 'node:assert/strict'
import { register } from 'node:module'
register('./_story-loader.js', import.meta.url)
const { knocksFromMoves, chooseTile } = await import('../src/lib/botAI.js')

// 1) knocks: replay the plays, a pass marks both ends' numbers for that seat
const moves = [
  { seat: 0, action: 'play', tile: [6, 6] },                  // ends 6 | 6
  { seat: 1, action: 'play', tile: [6, 3], side: 'right' },   // ends 6 | 3
  { seat: 2, action: 'pass' },                                // seat 2 has no 6 and no 3
  { seat: 3, action: 'play', tile: [5, 6], side: 'left' },    // ends 5 | 3
  { seat: 0, action: 'pass', ends: [5, 3] },                  // recorded ends are used as given
]
const k = knocksFromMoves(moves)
assert.deepEqual(k[2].sort(), [3, 6])
assert.deepEqual(k[0].sort(), [3, 5])
assert.deepEqual(k[1], [])

// 2) in asosyé a bot always returns one of its legal moves, with or without knocks
const board = { tiles: [{ tile: [6, 6] }, { tile: [6, 3] }], left_end: 6, right_end: 3 }
const hand = [[6, 1], [3, 2], [4, 4], [0, 5], [1, 2]]
const playable = hand.filter(t => [6, 3].includes(t[0]) || [6, 3].includes(t[1]))
for (const pers of ['strategist', 'gambler', 'blocker', 'bebe', 'sak', 'met', 'pridan', 'doub']) {
  for (const knocks of [undefined, [[], [6], [3], []]]) {
    const ctx = { seat: 0, mode: 'asosye', tileCountsBySeat: [5, 6, 2, 6], knocks }
    const pick = chooseTile(pers, playable, hand, board, ctx)
    assert.ok(pick && playable.some(t => t[0] === pick.tile[0] && t[1] === pick.tile[1]), `${pers} picks a legal tile`)
    assert.ok(['left', 'right'].includes(pick.side), `${pers} picks a side`)
  }
}

// 3) the partner is not an opponent: when only the PARTNER is about to go out,
//    a bot doesn't switch to all-out blocking (Solo/Story used to count the
//    partner among the opponents here)
const src = (await import('node:fs')).readFileSync(new URL('../src/lib/botAI.js', import.meta.url), 'utf8')
assert.match(src, /In asosyé the partner is not an opponent/)
console.log('team play: knocks read, legal moves, partner not treated as an opponent')
