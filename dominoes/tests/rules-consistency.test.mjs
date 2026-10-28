// One set of rules for every mode (src/rules/dekabess.js).
// 1) every mode reads its rules from there — no mode keeps its own copy;
// 2) the on-device engine (Solo, Challenge, Story, Practice) agrees with them
//    over hundreds of random rounds; 3) streaks and the Vyèj count the same in
//    both ways a team is written. (Goud stake games run on the server with the
//    same rules — see dekabess_stakes.sql.)
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { register } from 'node:module'
register('./_story-loader.js', import.meta.url)
const R = await import('../src/rules/dekabess.js')
const Engine = await import('../src/story/storyEngine.js')
const src = p => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')

// ── 1. every mode uses the rules file, and keeps no copy of its own ──────────
const users = {
  'hooks/useGameState.js': /from '\.\.\/rules\/dekabess'/, 'story/storyEngine.js': /from '\.\.\/rules\/dekabess'/,
  'pages/SoloGame.jsx': /from '\.\.\/rules\/dekabess'/, 'pages/Game.jsx': /from '\.\.\/rules\/dekabess'/,
  'pages/StoryChallenge.jsx': /from '\.\.\/rules\/dekabess'/, 'pages/Practice.jsx': /from '\.\.\/rules\/dekabess'/,
  'pages/Lobby.jsx': /from '\.\.\/rules\/dekabess'/,
}
for (const [f, re] of Object.entries(users)) assert.match(src(f), re, `${f} reads the shared rules`)
const copies = [
  [/function computeNewStreak|function nextTeamStreak|function nextStreak\(/, 'a streak rule'],
  [/a\.pips - b\.pips \|\| a\.seat - b\.seat|bestPips = Infinity/, 'a blocked-round rule'],
  [/for \(let d = 6; d >= 0/, 'a first-opener rule'],
  [/function sideOf\(|const knockPos = seat => \{/, 'a seating rule'],
  [/export function (generateDominoSet|dealTable|getPlayableTiles|checkDekabess)\b/, 'a tile/deal rule'],
]
const files = []
for (const dir of ['pages', 'hooks', 'story', 'components', 'lib']) {
  for (const f of readdirSync(new URL(`../src/${dir}`, import.meta.url))) if (/\.(js|jsx)$/.test(f)) files.push(`${dir}/${f}`)
}
for (const f of files) for (const [re, what] of copies) assert.ok(!re.test(src(f)), `${f} has its own copy of ${what} — use src/rules/dekabess.js`)

// ── 2. the on-device engine agrees with the rules ────────────────────────────
let rounds = 0, blocked = 0, out = 0
for (let n = 0; n < 400; n++) {
  const seats = [2, 3, 4][n % 3], pile = seats < 4 && n % 2 === 0
  let st = Engine.startGame({ seats, pile, forceDoubleSix: true })
  const first = R.firstOpener(st.hands)
  assert.equal(st.turn, first.seat, 'the first round opens with the 6-6 (or the highest double)')
  st = Engine.settleTurn(st)
  for (let i = 0; i < 400 && st.status !== 'over'; i++) {
    const moves = Engine.legalMoves(st)
    st = Engine.settleTurn(moves.length ? Engine.playTile(st, moves[0].tile, moves[0].side) : Engine.drawOrPass(st))
  }
  assert.equal(st.status, 'over'); rounds++
  if (st.blocked) { blocked++; assert.equal(st.winner, R.blockedWinner(st.hands.slice(0, seats)), 'a blocked round: lowest pips wins, ties to the lowest seat') }
  else { out++; assert.equal(st.hands[st.winner].length, 0, 'the winner went out') }
}
assert.ok(blocked > 0 && out > 0, 'both kinds of round ending were seen')

// ── 3. streaks and the Vyèj ──────────────────────────────────────────────────
let s = null
for (const [w, dek] of [[0, false], [0, true]]) s = R.nextStreak(s, w, dek)
assert.deepEqual([s.seat, s.count, R.isVyej(s)], [0, 3, false])
s = R.nextStreak(s, 0, false); assert.ok(R.isVyej(s), '4 is a Vyèj')
assert.equal(R.nextStreak(s, 1, false).count, 1, 'another winner starts again')
// partners: either partner's win adds to the team; both ways of writing a team agree
for (const teamOf of [R.teamLetter, x => x % 2]) {
  let t = null
  for (const w of [0, 2, 0]) t = R.nextStreak(t, w, false, { teams: true, teamOf })
  assert.equal(t.count, 3)
  assert.equal(R.nextStreak(t, 3, true, { teams: true, teamOf }).count, 2, 'the other team starts at 2 with a Dekabess')
}
console.log(`one set of rules: every mode uses it; the engine agreed over ${rounds} rounds (${out} went out, ${blocked} blocked); streaks count the same`)
