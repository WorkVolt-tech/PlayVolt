// Shaped tiles: what the app reports to the server when you beat expert bots.
import assert from 'node:assert/strict'
import { register } from 'node:module'
register('./_story-loader.js', import.meta.url)
const { db } = await import('../src/lib/supabase.js')
const { recordShapeWin, SHAPE_RULES } = await import('../src/lib/shapeUnlocks.js')
const { TILE_SKINS } = await import('../src/lib/skins.js')

const calls = []
let signedIn = true
db.auth = { getUser: async () => ({ data: { user: signedIn ? { id: 'me' } : null } }) }
db.rpc = async (name, args) => { calls.push({ name, args }); return { data: [] } }

// expert names (with or without accents) become their ids
await recordShapeWin('match', ['Ti-Jòj', 'Ti-Tid', 'Ti-Roro'], false)
assert.deepEqual(calls.pop(), { name: 'shape_record', args: { p_event: 'match', p_opponents: ['tijoj', 'titid', 'tiroro'], p_partners: false } })
await recordShapeWin('match', ['Ti-Fre', 'Ti-Pyej'], true)
assert.deepEqual(calls.pop().args, { p_event: 'match', p_opponents: ['tifre', 'tipyej'], p_partners: true })

// a table with any non-expert opponent, no opponents, or nobody signed in: nothing is sent
await recordShapeWin('match', ['Ti-Jòj', 'Ti-Djo'], false)
await recordShapeWin('match', [], false)
signedIn = false
await recordShapeWin('dekabess', ['Ti-Jòj', 'Ti-Tid', 'Ti-Wa'], false)
assert.equal(calls.length, 0, 'nothing reported for those')

// every shaped tile has a rule, and every rule is a shaped tile
const shaped = Object.keys(TILE_SKINS).filter(id => TILE_SKINS[id].shape).sort()
assert.deepEqual(Object.keys(SHAPE_RULES).sort(), shaped)
console.log('shape unlock reporting ok for', shaped.length, 'shapes')

// Kapsil needs every puzzle: the count used for it must match the Puzzle page
{
  const { PUZZLE_COUNT } = await import('../src/lib/shapeUnlocks.js')
  const { readFileSync } = await import('node:fs')
  const s = readFileSync(new URL('../src/pages/Puzzle.jsx', import.meta.url), 'utf8')
  const t = s.slice(s.indexOf('const TRACKS'))
  const arrays = [...t.slice(0, t.indexOf('\n}\n')).matchAll(/puzzles: ([A-Z_]+)/g)].map(m => m[1])
  let total = 0
  for (const a of arrays) {
    const i = s.indexOf(`const ${a} = [`); let d = 0, j = s.indexOf('[', i), k = j
    for (; k < s.length; k++) { if (s[k] === '[') d++; else if (s[k] === ']') { d--; if (!d) break } }
    total += (s.slice(j, k).match(/\n    id: '/g) || []).length
  }
  assert.equal(total, PUZZLE_COUNT, `Learn & Puzzle has ${total} puzzles: update PUZZLE_COUNT (and the minimum in shape_check_puzzles)`)
  console.log('puzzle count matches:', total)
}
