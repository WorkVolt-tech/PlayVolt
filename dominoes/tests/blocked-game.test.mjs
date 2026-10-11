import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { isTableBlocked } from '../src/lib/blockedGame.js'

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
const hook = read('../src/hooks/useGameState.js')
const engine = read('../src/story/storyEngine.js').replace(/import[\s\S]*?from ['"][^'"]+['"]\s*/g, '').replace(/export /g, '')
const helpers = hook.slice(hook.indexOf('export function generateDominoSet'), hook.indexOf('// ── Main hook')).replace(/export /g, '')
const ctx = vm.createContext({ isTableBlocked })
vm.runInContext(helpers + engine + '\nglobalThis.engine = { startGame, playTile, drawFrom, drawOrPass }', ctx)
const E = ctx.engine
const board = { tiles: [{ tile: [6, 6] }], left_end: 6, right_end: 6 }

for (const seats of [2, 3, 4]) {
  const hands = Array.from({ length: seats }, (_, i) => [[i, i]])
  assert.equal(isTableBlocked(board, hands, 0, seats), true)
  assert.equal(isTableBlocked(board, hands, 1, seats), false)
  assert.equal(isTableBlocked(board, hands.slice(1), 0, seats), false)
  assert.equal(isTableBlocked(board, [[], ...hands.slice(1)], 0, seats), false)
  for (let seat = 0; seat < seats; seat++) {
    const playable = hands.map((h, i) => i === seat ? [[6, i]] : h)
    assert.equal(isTableBlocked(board, playable, 0, seats), false)
    // Either a human or a bot can place the blocking tile.
    const dealt = hands.map((h, i) => i === seat ? [[5, 6], ...h] : h)
    const st = E.startGame({ seats, deal: { hands: dealt, board: [{ tile: [6, 5] }], left_end: 6, right_end: 5, turn: seat } })
    const ended = E.playTile(st, [5, 6], 'right')
    assert.equal(ended.status, 'over'); assert.equal(ended.blocked, true)
    assert.equal(ended.winner, 0); assert.equal(ended.passes, 0)
    assert.equal(ended.log.length, 1)
  }
  const st = E.startGame({ seats, pile: true, deal: { hands, board: board.tiles, left_end: 6, right_end: 6, pile: [[4, 4]] } })
  const ended = E.drawFrom(st)
  assert.equal(ended.status, 'over'); assert.equal(ended.blocked, true)
  assert.equal(ended.log.some(x => x.action === 'pass'), false)
  const playableDraw = E.drawFrom({ ...st, pile: [[4, 6]] })
  assert.equal(playableDraw.status, 'playing')
  assert.equal(E.drawFrom({ ...st, pile: [[4, 4], [4, 6]] }).status, 'playing')
  const resumed = E.drawOrPass({ ...st, pile: [] })
  assert.equal(resumed.status, 'over'); assert.equal(resumed.log.length, 0)
}
assert.equal(isTableBlocked({ ...board, tiles: [] }, [[[0, 0]], [[1, 1]]]), false)
assert.equal(isTableBlocked(board, [null, [[1, 1]]]), false)
const last = E.startGame({ seats: 2, deal: { hands: [[[5, 6]], [[0, 0]]], board: [{ tile: [6, 5] }], left_end: 6, right_end: 5 } })
const win = E.playTile(last, [5, 6], 'right')
assert.equal(win.blocked, false); assert.equal(win.dekabess, true); assert.equal(win.winner, 0)

// Execute the online move callback with server replies, including an older
// server that does not yet report instant blocks. No network or real writes.
const moveStart = hook.indexOf('  const commitMove = useCallback')
const moveEnd = hook.indexOf('\n\n  const placeTile', moveStart)
let response = { data: { blocked: false }, error: null }
const online = vm.createContext({
  useCallback: fn => fn, performance, tlog: () => {}, console,
  myInfo: { roomId: 'test', seat: 0 }, loadGameState: () => {},
  db: { rpc: async () => response },
  blockedAfterMove: (_seat, hand, b) => isTableBlocked(b, [hand, [[1, 1]]], 0, 2),
})
vm.runInContext(hook.slice(moveStart, moveEnd) + '\nglobalThis.move = commitMove', online)
const args = { seat: 0, action: 'place', hand: [[0, 0]], board, advance: true }
assert.equal((await online.move(args)).blocked, true)
assert.equal((await online.move({ ...args, hand: [[0, 6]] })).blocked, false)
response = { data: { stale: true }, error: null }
assert.equal((await online.move(args)).blocked, false)
response = { data: null, error: { code: 'PGRST202' } }
assert.equal(await online.move(args), 'missing')
// Guard the bot placement regression: it must consume the block result.
assert.match(hook, /if \(handEmpty\) \{ await endRound\(currentPlayer.seat[^\n]+\n\s+if \(res.blocked\) \{ await endRound\(null, false\); return \}/)
console.log('PASS: instant blocks for 2/3/4 seats, human/bot placements, final draws, playable opponents, empty-hand priority, stale/missing RPC replies, and bot block dispatch.')
