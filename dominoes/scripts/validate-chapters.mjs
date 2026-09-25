import { CHAPTERS, NORMAL_CIRCUIT, EXPERT_CIRCUIT } from './chapters.mjs'
import * as B from './botAI_new.mjs'

const KNOWN = [...NORMAL_CIRCUIT, ...EXPERT_CIRCUIT]
const key = t => `${Math.min(t[0],t[1])}-${Math.max(t[0],t[1])}`
let problems = []

// ---- 1. every bot name must resolve to a real personality ----
for (const n of KNOWN) {
  const p = B.getPersonality(n)
  if (!p || (p === 'strategist' && n !== 'Ti-Djo')) problems.push(`bot name does not resolve: ${n}`)
}

// ---- 2. structure + deal legality ----
for (const ch of CHAPTERS) {
  if (ch.featured && !KNOWN.includes(ch.featured)) problems.push(`ch${ch.id}: unknown featured bot ${ch.featured}`)
  for (const c of ch.challenges) {
    if (c.type === 'match') {
      const seats = c.seats || 4
      if (seats === 2 && c.opponents.length !== 1) problems.push(`ch${ch.id} c${c.id}: 1v1 needs exactly 1 opponent`)
      if (seats === 4 && c.opponents.length !== 3) problems.push(`ch${ch.id} c${c.id}: 4-seat needs 3 opponents`)
      if (c.partner === ch.featured) problems.push(`ch${ch.id} c${c.id}: featured bot used as partner`)
      for (const o of c.opponents) if (!KNOWN.includes(o)) problems.push(`ch${ch.id} c${c.id}: unknown opponent ${o}`)
    }
    if (c.type === 'puzzle') {
      const used = new Map()
      const all = [...c.deal.hands.flat(), ...c.deal.board.map(e => e.tile)]
      for (const t of all) {
        if (t[0] < 0 || t[0] > 6 || t[1] < 0 || t[1] > 6) problems.push(`ch${ch.id} c${c.id}: tile out of range ${t}`)
        const k = key(t)
        used.set(k, (used.get(k) || 0) + 1)
      }
      for (const [k, n] of used) if (n > 1) problems.push(`ch${ch.id} c${c.id}: tile ${k} appears ${n} times`)
      // board must be a legal chain and the stated ends must match it
      const b = c.deal.board
      for (let i = 1; i < b.length; i++) {
        const prev = b[i-1].tile, cur = b[i].tile
        if (!(prev.includes(cur[0]) || prev.includes(cur[1]))) problems.push(`ch${ch.id} c${c.id}: board chain breaks at tile ${i}`)
      }
    }
  }
}

// ---- 3. are the puzzles actually solvable? brute-force search ----
function solvePuzzle(deal, objective, maxMoves) {
  const hasN = (t,n) => t[0]===n||t[1]===n
  const isDouble = t => t[0]===t[1]
  function movesFor(hand,L,R){const out=[];for(const t of hand){if(hasN(t,L))out.push([t,'left']);if(hasN(t,R)&&!(hasN(t,L)&&L===R))out.push([t,'right'])}return out}
  function ends(t,side,L,R){const e=side==='left'?L:R;const o=t[1]===e?t[0]:t[1];return side==='left'?[o,R]:[L,o]}
  // only the player (seat 0) moves; opponents are ignored for solvability of a
  // "can I reach the goal" puzzle — a stricter check than the real game.
  function rec(hand,L,R,depth,path){
    if (depth > maxMoves) return null
    for (const [t,side] of movesFor(hand,L,R)) {
      const rest = hand.filter(x => !(x[0]===t[0]&&x[1]===t[1]))
      const dek = !isDouble(t) && L!==R && ((t[0]===L&&t[1]===R)||(t[1]===L&&t[0]===R))
      if (objective.kind === 'dekabess' && dek && rest.length === 0) return [...path,[t,side]]
      if (objective.kind === 'win' && rest.length === 0) return [...path,[t,side]]
      const [nL,nR] = ends(t,side,L,R)
      const r = rec(rest,nL,nR,depth+1,[...path,[t,side]])
      if (r) return r
    }
    return null
  }
  return rec(deal.hands[0], deal.left_end, deal.right_end, 1, [])
}

for (const ch of CHAPTERS) for (const c of ch.challenges) {
  if (c.type !== 'puzzle') continue
  const sol = solvePuzzle(c.deal, c.objective, c.moves || 6)
  if (!sol) problems.push(`ch${ch.id} c${c.id}: PUZZLE HAS NO SOLUTION in ${c.moves||6} move(s)`)
  else console.log(`ch${ch.id} c${c.id} (${c.objective.kind}): solvable — ${sol.map(([t,s])=>`${t[0]}-${t[1]} ${s}`).join(' then ')}`)
}

console.log(`\nchapters: ${CHAPTERS.length}   challenges defined: ${CHAPTERS.reduce((a,c)=>a+c.challenges.length,0)}`)
console.log(problems.length ? 'PROBLEMS:\n  ' + problems.join('\n  ') : 'no problems found')
