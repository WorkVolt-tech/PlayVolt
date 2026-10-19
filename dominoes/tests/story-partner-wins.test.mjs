// Story mode, partner challenges (chapters 9–18): a round your AI partner
// (seat 2, across from you) wins is a win for your team — it must count toward
// your best-of-three, your stars and your Goud. Opponents' wins (seats 1, 3)
// must still count as losses, and solo challenges count only seat 0.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
register('./_story-loader.js', import.meta.url)
const Engine = await import('../src/story/storyEngine.js')

// play a random round to the end with the real Story engine
function playOut(cfg) {
  let st = Engine.startGame(cfg)
  for (let i = 0; i < 400 && st.status !== 'over'; i++) {
    const moves = Engine.legalMoves(st)
    st = moves.length ? Engine.playTile(st, moves[0].tile, moves[0].side) : Engine.drawOrPass(st)
    st = Engine.settleTurn(st)
  }
  return st
}

const seen = { 0: 0, 1: 0, 2: 0, 3: 0 }
for (let n = 0; n < 400; n++) {
  const st = playOut({ seats: 4, objective: { kind: 'win' } })
  assert.equal(st.status, 'over')
  if (st.winner < 0) continue
  seen[st.winner]++
  const team = Engine.evaluateObjective(st, [0, 2])           // partner challenge
  const solo = Engine.evaluateObjective(st)                    // solo challenge
  assert.equal(team.won, st.winner === 0 || st.winner === 2, `partner game, winner seat ${st.winner}`)
  assert.equal(team.met, team.won, 'a "win" objective is met exactly when your side wins')
  assert.equal(solo.won, st.winner === 0, `solo game, winner seat ${st.winner}`)
}
assert.ok(seen[2] > 0, 'the partner went out at least once in the sample')
assert.ok(seen[1] + seen[3] > 0, 'an opponent went out at least once in the sample')

// The challenge screen hands the engine your whole side whenever the challenge has a partner
const page = readFileSync(new URL('../src/pages/StoryChallenge.jsx', import.meta.url), 'utf8')
assert.match(page, /evaluateObjective\(st, playerSeats\)/, 'the objective is judged for your side')
assert.match(page, /const playerSeats = mate && \(st\.seats \?\? 4\) === 4 \? \[0, 2\] : \[0\]/, 'partner games pass seats 0 and 2')
assert.match(page, /\(outcome\.won \? worth : 0\)/, 'the best-of-three tally uses the side result')
console.log('partner wins count for the player:', seen)
