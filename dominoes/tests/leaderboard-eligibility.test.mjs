import assert from 'node:assert/strict'
import { tableCountsForLeaderboard, botsCountForTrophies, EXPERT_BOT_NAMES } from '../src/lib/trophies.js'
for (const seats of [2, 3, 4]) {
  const humans = Array.from({ length: seats }, (_, seat) => ({ seat, is_ai: false, nickname: 'Human' }))
  assert.equal(tableCountsForLeaderboard(humans, seats), true)
  const experts = humans.map((p, i) => i ? { ...p, is_ai: true, nickname: EXPERT_BOT_NAMES[i] } : p)
  assert.equal(tableCountsForLeaderboard(experts, seats), true)
  for (let seat = 0; seat < seats; seat++) {
    const normal = experts.map(p => p.seat === seat ? { ...p, is_ai: true, nickname: 'Ti-Djo' } : p)
    assert.equal(tableCountsForLeaderboard(normal, seats), false)
    normal[seat].stand_in = true
    assert.equal(tableCountsForLeaderboard(normal, seats), false)
  }
  assert.equal(tableCountsForLeaderboard(experts.slice(1), seats), false)
}
assert.equal(tableCountsForLeaderboard(null), false)
assert.equal(tableCountsForLeaderboard(Array(4).fill({ seat: 0, is_ai: false })), false)
assert.equal(botsCountForTrophies(EXPERT_BOT_NAMES), true)
for (let i = 0; i < 3; i++) {
  const bots = EXPERT_BOT_NAMES.slice(0, 3); bots[i] = 'Ti-Djo'
  assert.equal(botsCountForTrophies(bots), false)
}
console.log('PASS: human/expert tables qualify; one normal bot in any seat (including partner/stand-in), incomplete or duplicate rosters do not.')
