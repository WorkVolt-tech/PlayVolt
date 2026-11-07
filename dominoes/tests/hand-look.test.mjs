// Your hand at the table (src/lib/handLook.js): looks only, and never broken by a bad value.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { HAND_STYLES, NAIL_COLORS, parseLook, lookString, handPictures } from '../src/lib/handLook.js'

const pub = p => fileURLToPath(new URL('../public' + p, import.meta.url))

test('no choice, or a bad/old value, means the original hand with natural nails', () => {
  for (const v of [null, undefined, '', 'robot', 'female:glitter', 42, 'url(evil)']) {
    const l = parseLook(v)
    assert.ok(Object.hasOwn(HAND_STYLES, l.style))
    if (v !== undefined && typeof v === 'string' && v.startsWith('female')) assert.equal(l.style, 'female')
    else assert.equal(l.style, 'male')
    assert.equal(l.nails, 'natural')
  }
  assert.deepEqual(handPictures(null, 'slam'), { src: '/handslam.webp', nails: null, color: null })
  assert.deepEqual(handPictures(undefined, 'knock'), { src: '/handknock.webp', nails: null, color: null })
})

test('a look round-trips through its saved string', () => {
  assert.equal(lookString({ style: 'female', nails: 'red' }), 'female:red')
  assert.equal(lookString({ style: 'female', nails: 'natural' }), 'female')
  assert.equal(lookString({ style: 'male' }), 'male')
  assert.deepEqual(parseLook('female:red'), { style: 'female', nails: 'red' })
  const p = handPictures('female:blue', 'knock')
  assert.equal(p.src, '/hands/female-knock.webp')
  assert.equal(p.color, NAIL_COLORS.find(c => c.id === 'blue').color)
})

test('every hand and nail picture exists', () => {
  for (const h of Object.values(HAND_STYLES)) {
    for (const f of [h.slam, h.knock, h.slamNails, h.knockNails]) assert.ok(existsSync(pub(f)), f)
  }
  for (const c of NAIL_COLORS) if (c.color) assert.match(c.color, /^#[0-9a-f]{6}$/i)
})
