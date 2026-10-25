// Measures how much better the regular bots play as Asosyé partners.
// Same deals are played twice — new team play on one side, the old play (no
// team sense) on the other, then swapped — and it prints the new side's win
// rate (50% = no difference) and the thinking time per move.
//   node tools/team-sim.mjs 900        (number of deals; ~1 s per deal)
// Tested 2026-10-25: 54.4% over 1800 rounds.
import { register } from 'node:module'
register(new URL('../tests/_story-loader.js', import.meta.url))
const Engine = await import(new URL('../src/story/storyEngine.js', import.meta.url))
const { chooseTile, knocksFromMoves, tableReads } = await import(new URL('../src/lib/botAI.js', import.meta.url))
const REG = ['strategist', 'gambler', 'blocker', 'bebe', 'sak', 'met', 'pridan', 'doub']
// a seeded random, so both versions face exactly the same deals
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
Math.random = rnd
function ctxFor(st, seat, isNew) {
  const counts = st.hands.map(h => h.length)
  if (!isNew) return { seat, mode: 'asosye', noTeamPlay: true, opponentTileCounts: counts.filter((_, i) => i !== seat) }   // how bots played until now
  return { seat, mode: 'asosye', tileCountsBySeat: counts, opponentTileCounts: counts.filter((_, i) => i !== seat && i !== (seat + 2) % 4),
           knocks: knocksFromMoves(st.log), shows: tableReads(st.log).shows, teamW: JSON.parse(process.env.TW || '{}'), noTeamPlay: process.env.NOTEAM === '1', teamMargin: Number(process.env.MARGIN || 150), teamSense: process.env.NOSENSE !== '1' }
}
function playRound(start, pers, newTeam) {
  let st = start
  for (let i = 0; i < 400 && st.status !== 'over'; i++) {
    const seat = st.turn
    const moves = Engine.legalMoves(st)
    if (!moves.length) { st = Engine.settleTurn(Engine.drawOrPass(st)); continue }
    const t0 = performance.now()
    const pick = chooseTile(pers[seat], moves.map(m => m.tile), st.hands[seat], st.board, ctxFor(st, seat, seat % 2 === newTeam))
    const dt = performance.now() - t0; if (seat % 2 === newTeam && moves.length > 1) { globalThis.T = (globalThis.T || []); globalThis.T.push(dt) }
    const mv = moves.find(m => m.tile[0] === pick?.tile?.[0] && m.tile[1] === pick?.tile?.[1] && m.side === pick.side)
            || moves.find(m => m.tile[0] === pick?.tile?.[0] && m.tile[1] === pick?.tile?.[1]) || moves[0]
    st = Engine.settleTurn(Engine.playTile(st, mv.tile, mv.side))
  }
  return st.winner
}
const N = Number(process.argv[2] || 3000)
let newWins = 0, games = 0, blocked = 0
for (let d = 0; d < N; d++) {
  const pers = [0, 1, 2, 3].map(() => REG[Math.floor(rnd() * REG.length)])
  const start = Engine.settleTurn(Engine.startGame({ seats: 4, starter: Math.floor(rnd() * 4) }))
  for (const newTeam of [0, 1]) {                       // the same deal, each side gets the new bots once
    const savedSeed = seed
    const w = playRound(start, pers, newTeam)
    seed = savedSeed
    if (w < 0) { blocked++; continue }
    games++; if (w % 2 === newTeam) newWins++
  }
}
const T = (globalThis.T || []).sort((a, b) => a - b); console.log(`thinking time per real decision: median ${T[Math.floor(T.length/2)].toFixed(0)} ms, slowest 1% ${T[Math.floor(T.length*0.99)].toFixed(0)} ms, slowest ${T[T.length-1].toFixed(0)} ms`)
console.log(`${games} decided rounds (same deals, sides swapped): the new partner play won ${(100 * newWins / games).toFixed(1)}%  (50% = no difference)`)
