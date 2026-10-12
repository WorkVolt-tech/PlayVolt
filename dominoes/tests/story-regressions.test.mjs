import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createConfirmedSaver } from '../src/story/saveProgress.js'
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
let calls = 0, fail = true
const saver = createConfirmedSaver(async () => { calls++; return { error: fail ? new Error('offline') : null } })
const key = 'user:2:4'
const first = saver.save(key, {})
assert.equal(saver.save(key, {}), first)
await assert.rejects(first, /offline/)
fail = false
await saver.save(key, {})
await saver.save(key, {})
assert.equal(calls, 2, 'retry failed saves; do not repeat confirmed saves')
await saver.save('other-user:2:4', {})
assert.equal(calls, 3, 'confirmation is account-specific')
let throws = true
const throwing = createConfirmedSaver(async () => { if (throws) throw new Error('network') })
await assert.rejects(throwing.save(key, {}), /network/)
throws = false
await throwing.save(key, {})

// Exercise the actual local-game recording function; all database writes mocked.
const solo = read('../src/pages/SoloGame.jsx')
const fn = solo.slice(solo.indexOf('  async function recordRound('), solo.indexOf('  const nextRound'))
for (const [teams, challengeMode, eligible, vyej, expected] of [
  [true, false, true, true, 'teams'], [false, false, true, true, 'solo'],
  [true, false, true, false, null], [true, false, false, true, null],
  [true, true, true, true, null],
]) {
  const rpcCalls = []
  const context = vm.createContext({
    teams, challengeMode, bots: ['expert'], myName: 'Tester', round: 4,
    recorded: { current: new Set() }, console, crypto,
    botsCountForTrophies: () => eligible,
    weekStartUTC: () => new Date('2026-10-05T00:00:00Z'),
    localStorage: { getItem: () => 'device', setItem() {} },
    db: { auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
      rpc: async (name, args) => { rpcCalls.push({ name, args }); return { error: null } } },
  })
  vm.runInContext(fn + '\nglobalThis.record = recordRound', context)
  // The caller supplies vyej for the winning team, including seat 2's win.
  await context.record({ won: vyej, vyej, isDek: false, matchOver: vyej })
  await context.record({ won: vyej, vyej, isDek: false, matchOver: vyej })
  const scores = rpcCalls.filter(x => x.name === 'wa_tab_la_win')
  assert.equal(scores.length, expected ? 1 : 0)
  if (expected) { assert.equal(scores[0].args.p_mode, expected); assert.equal(scores[0].args.p_week_start, '2026-10-05') }
}

// Feed Story's real seat adapter into the shared hand position calculation.
const story = read('../src/pages/StoryChallenge.jsx')
const adapter = story.slice(story.indexOf('  const fakePlayers'), story.indexOf('  return (', story.indexOf('  const fakePlayers')))
const opponent = read('../src/components/OpponentHands.jsx')
const position = opponent.slice(opponent.indexOf('  const mySeat'), opponent.indexOf('  return ('))
for (const seats of [2, 3, 4]) {
  const context = vm.createContext({ st: { hands: Array.from({ length: seats }, () => [[1, 2]]), turn: 1 },
    seatNames: ['You', 'Bot1', 'Bot2', 'Bot3'], challenge: {},
  })
  vm.runInContext(adapter + '\nconst players=fakePlayers, myInfo=fakeMe;\n' + position + '\nglobalThis.positions=players.slice(1).map(p=>getPosition(p.seat))', context)
  assert.deepEqual(Array.from(context.positions), seats === 2 ? ['top'] : seats === 3 ? ['right', 'left'] : ['right', 'top', 'left'])
}
console.log('PASS: failed/in-flight/confirmed story saves, account separation, expert team/solo leaderboard wins and exclusions, and Story opponent positions for 2/3/4 seats.')
