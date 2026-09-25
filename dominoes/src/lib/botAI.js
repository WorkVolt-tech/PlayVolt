// ── Bot AI Engine ─────────────────────────────────────────────────────────────
// Each personality picks a { tile, side } from the playable tiles.
//
//   chooseTile(personality, playable, hand, board, ctx?) → { tile, side }
//
// ctx (optional, supplied by the game):
//   opponentTileCounts  tiles each opponent holds (public — shown on screen)
//   tileCountsBySeat    same, indexed by seat 0-3 (public)
//   seat, mode          the bot's seat and the game mode
//   hands               EVERY player's real tiles — passed ONLY to Ti-Jòj / Ti-Tid / Ti-Roro
//   allySeats           seats that play as one side with this bot
//
// All three personalities share one evaluation of what a move does to the
// bot's OWN hand. Earlier versions only looked at opponents' options, and
// when a single tile was playable they always took the first side it fit —
// which regularly stranded the bot's own doubles (e.g. holding 1-1 with a 1
// on the board, closing that 1 with another tile instead of playing 1-1).

// ── Helpers ───────────────────────────────────────────────────────────────────

// All 28 domino tiles
const ALL_TILES = []
for (let a = 0; a <= 6; a++)
  for (let b = a; b <= 6; b++)
    ALL_TILES.push([a, b])

const key       = t => `${t[0]}-${t[1]}`
const sameTile  = (a, b) => a[0] === b[0] && a[1] === b[1]
const isDouble  = t => t[0] === t[1]
const hasNum    = (t, n) => t[0] === n || t[1] === n
const pips      = t => t[0] + t[1]

// Tiles not on the board and not in my hand (i.e. in other players' hands)
function unknownTiles(board, myHand) {
  const played = new Set((board?.tiles || []).map(e => key(e.tile)))
  const mine   = new Set(myHand.map(key))
  return ALL_TILES.filter(t => !played.has(key(t)) && !mine.has(key(t)))
}

// How many unknown tiles contain number n?
function numberFreq(n, unknown) {
  return unknown.filter(t => hasNum(t, n)).length
}

// After playing tile on side, what are the new board ends?
function newEnds(tile, side, board) {
  if (!board?.tiles?.length) return { L: tile[0], R: tile[1] }
  const end = side === 'left' ? board.left_end : board.right_end
  const newOpen = tile[1] === end ? tile[0] : tile[1]
  return {
    L: side === 'left'  ? newOpen : board.left_end,
    R: side === 'right' ? newOpen : board.right_end,
  }
}

// Can a tile play on given ends?
function canPlay(tile, L, R) {
  return hasNum(tile, L) || hasNum(tile, R)
}

// Estimate how many unknown tiles can play on ends L, R
function opponentOptionsCount(L, R, unknown) {
  return unknown.filter(t => canPlay(t, L, R)).length
}

// Is tile a Dekabess candidate on ends L, R?
function isDekabess(tile, L, R) {
  if (isDouble(tile)) return false
  if (L === R) return false
  return (tile[0] === L && tile[1] === R) || (tile[1] === L && tile[0] === R)
}

// Every valid (tile, side) pair — both sides are considered when a tile fits
// on both, because the side changes which numbers stay open.
function getMoves(playable, board) {
  const moves = []
  for (const tile of playable) {
    if (!board?.tiles?.length) {
      moves.push({ tile, side: 'first' })
      continue
    }
    const onLeft  = hasNum(tile, board.left_end)
    const onRight = hasNum(tile, board.right_end)
    if (onLeft)  moves.push({ tile, side: 'left' })
    // Same resulting board when both ends are equal — only list it once.
    if (onRight && !(onLeft && board.left_end === board.right_end))
      moves.push({ tile, side: 'right' })
  }
  return moves
}

// ── Shared evaluation ─────────────────────────────────────────────────────────

// Ways number n could come back onto an end later: tiles containing n still
// in other hands, plus my own non-double tiles containing n.
function reopeners(n, unknown, myRemaining) {
  const fromOthers = unknown.filter(t => hasNum(t, n) && !isDouble(t)).length
  const fromMine   = myRemaining.filter(t => hasNum(t, n) && !isDouble(t)).length
  return fromOthers + fromMine
}

// How much danger is an opponent in of going out soon?
//   1 tile left → very urgent, 2 → urgent, otherwise normal.
function dangerMultiplier(ctx) {
  const counts = ctx?.opponentTileCounts
  if (!counts?.length) return 1
  const min = Math.min(...counts)
  if (min <= 1) return 4
  if (min === 2) return 2
  return 1
}

// Score one move. Higher = better. Weights define the personality.
function evaluate(move, hand, board, unknown, ctx, W) {
  const { L, R } = newEnds(move.tile, move.side, board)
  const remaining = hand.filter(t => !sameTile(t, move.tile))
  let score = 0

  // 1) Keep MY remaining tiles playable on the new ends.
  score += remaining.filter(t => canPlay(t, L, R)).length * W.ownOption

  // 2) Doubles still in my hand. A double can only be played on a matching
  //    end, so if its number is no longer on an end, it needs another tile to
  //    bring that number back. Fewer ways back = more danger; zero = dead.
  for (const d of remaining.filter(isDouble)) {
    const n = d[0]
    if (n === L || n === R) continue                  // still playable next turn
    const ways = reopeners(n, unknown, remaining)
    if (ways === 0) score -= W.deadDouble             // stranded for the round
    else score -= W.doubleAtRisk / ways
  }

  // 3) Block opponents: fewer tiles they could play on the new ends.
  //    Weighted up when an opponent is about to go out — this is the one
  //    case where sacrificing my own flexibility (even a double) can be right.
  //    NOTE: in asosyé this still counts the partner's unseen tiles too.
  //    Measured attempts to discount them made these bots no better (and the
  //    gambler worse), because opening the board for a partner opens it for
  //    both opponents as well. Real partner play needs to know which numbers
  //    the partner knocked on, which the bots aren't told yet.
  score -= opponentOptionsCount(L, R, unknown) * W.block * dangerMultiplier(ctx)

  // 4) Pips. Positive weight = shed heavy tiles (safer if the round jams);
  //    negative weight = keep them back for later (Ti-Sak).
  score += pips(move.tile) * W.pip

  // 5) Doubles: positive weight hoards them (Ti-Sak), negative dumps them
  //    early (Ti-Doub).
  if (W.holdDouble && isDouble(move.tile)) score -= W.holdDouble

  // 6) Ti-Mèt likes both ends showing the SAME number — it narrows the board
  //    to one number, which he can feed while others sit on tiles they can't
  //    place.
  if (W.lockEnds && L === R) score += W.lockEnds

  return score
}

// Pick the best move; ties broken by highest pips, then deterministically.
function bestMove(moves, hand, board, ctx, W, jitter = 0) {
  const unknown = unknownTiles(board, hand)
  let best = null, bestScore = -Infinity
  for (const m of moves) {
    let s = evaluate(m, hand, board, unknown, ctx, W)
    if (jitter) s += (Math.random() - 0.5) * jitter
    if (s > bestScore || (s === bestScore && best && pips(m.tile) > pips(best.tile))) {
      best = m; bestScore = s
    }
  }
  return best
}

// ── Personalities ─────────────────────────────────────────────────────────────

// STRATEGIST: balanced — protects its own hand, blocks when it's cheap to.
const STRATEGIST_W = { ownOption: 2, deadDouble: 40, doubleAtRisk: 12, block: 1, pip: 0.15 }

function strategist(playable, hand, board, ctx) {
  const moves = getMoves(playable, board)
  if (moves.length === 1) return moves[0]

  // With 2 tiles left, if the other one could Dekabess, keep it for last.
  if (hand.length === 2 && board?.tiles?.length) {
    const L = board.left_end, R = board.right_end
    const dekCandidate = hand.find(t => isDekabess(t, L, R))
    if (dekCandidate) {
      const others = moves.filter(m => !sameTile(m.tile, dekCandidate))
      if (others.length) return bestMove(others, hand, board, ctx, STRATEGIST_W)
    }
  }

  return bestMove(moves, hand, board, ctx, STRATEGIST_W)
}

// GAMBLER: chases Dekabess, sheds doubles early, a little unpredictable.
const GAMBLER_W = { ownOption: 1.5, deadDouble: 40, doubleAtRisk: 8, block: 0.5, pip: 0.3 }

function gambler(playable, hand, board, ctx) {
  const moves = getMoves(playable, board)
  if (moves.length === 1) return moves[0]

  // Dekabess right now with the last tile
  if (board?.tiles?.length && hand.length === 1) {
    const L = board.left_end, R = board.right_end
    const dek = moves.find(m => isDekabess(m.tile, L, R))
    if (dek) return dek
  }

  // Set up a Dekabess for the next play
  if (board?.tiles?.length && hand.length === 2) {
    for (const m of moves) {
      const { L, R } = newEnds(m.tile, m.side, board)
      const remaining = hand.filter(t => !sameTile(t, m.tile))
      if (remaining.some(t => isDekabess(t, L, R))) return m
    }
  }

  // Shed doubles first — still its trademark — choosing the best double move
  const doubleMoves = moves.filter(m => isDouble(m.tile))
  if (doubleMoves.length) return bestMove(doubleMoves, hand, board, ctx, GAMBLER_W)

  // Otherwise the best move with some randomness, so it stays unpredictable
  return bestMove(moves, hand, board, ctx, GAMBLER_W, 6)
}

// TI-BEBE (beginner): plays loose. Doesn't guard its own hand, doesn't block,
// just shoves out heavy tiles and wanders. Deliberately the weak one, so new
// players have someone they can actually beat.
const BEBE_W = { ownOption: 0, deadDouble: 0, doubleAtRisk: 0, block: 0, pip: 0.5 }

function bebe(playable, hand, board, ctx) {
  const moves = getMoves(playable, board)
  if (moves.length === 1) return moves[0]
  // Big jitter = frequently not the best move, like a real beginner.
  return bestMove(moves, hand, board, ctx, BEBE_W, 25)
}

// TI-SAK (the sack): keeps doubles and heavy tiles back for late, playing his
// light ones first. Dangerous at the end of a round — but if it jams early he
// is the one caught holding the weight.
const SAK_W = { ownOption: 2, deadDouble: 40, doubleAtRisk: 0, block: 1, pip: -0.4, holdDouble: 10 }

function sak(playable, hand, board, ctx) {
  const moves = getMoves(playable, board)
  if (moves.length === 1) return moves[0]
  return bestMove(moves, hand, board, ctx, SAK_W)
}

// TI-MÈT (the master): narrows the board so both ends show the same number,
// then feeds that number while everyone else sits stuck.
const MET_W = { ownOption: 2, deadDouble: 40, doubleAtRisk: 12, block: 1, pip: 0.15, lockEnds: 14 }

function met(playable, hand, board, ctx) {
  const moves = getMoves(playable, board)
  if (moves.length === 1) return moves[0]
  return bestMove(moves, hand, board, ctx, MET_W)
}

// TI-PRIDAN (the careful one): pays no attention to opponents at all. Just
// keeps his own hand as playable as possible and never strands a tile.
const PRIDAN_W = { ownOption: 5, deadDouble: 50, doubleAtRisk: 20, block: 0, pip: 0.1 }

function pridan(playable, hand, board, ctx) {
  const moves = getMoves(playable, board)
  if (moves.length === 1) return moves[0]
  return bestMove(moves, hand, board, ctx, PRIDAN_W)
}

// TI-DOUB: gets rid of every double as early as he can — the opposite of
// Ti-Sak. Doubles are the hardest tiles to place, so he refuses to be caught
// holding them.
const DOUB_W = { ownOption: 2, deadDouble: 40, doubleAtRisk: 14, block: 1, pip: 0.15, holdDouble: -14 }

function doub(playable, hand, board, ctx) {
  const moves = getMoves(playable, board)
  if (moves.length === 1) return moves[0]
  return bestMove(moves, hand, board, ctx, DOUB_W)
}

// BLOCKER: squeezes opponents hard — but never by strangling its own hand
// unless an opponent is about to go out.
const BLOCKER_W = { ownOption: 1, deadDouble: 40, doubleAtRisk: 12, block: 2, pip: 0.3 }

function blocker(playable, hand, board, ctx) {
  const moves = getMoves(playable, board)
  if (moves.length === 1) return moves[0]
  return bestMove(moves, hand, board, ctx, BLOCKER_W)
}


// ── Lookahead search (Ti-Jòj, Ti-Tid & Ti-Roro) ──────────────────────────────────────
// Plays the round forward several turns and picks the move whose future is
// best for this bot's side. Rules modelled exactly as the game plays them:
// turn passes clockwise, a player with no legal tile passes, four passes in
// a row blocks the round (lowest pips wins, ties to the lowest seat), first
// to empty their hand wins, and going out by matching both ends is Dekabess.
//
// Everyone else's moves are predicted with sensible play (predictMove), and
// the bot plans its own moves around those predictions. In asosyé the
// partner across the table counts as our side when scoring outcomes.

function movesFor(hand, L, R, empty) {
  if (empty) return hand.map(t => ({ tile: t, side: 'first' }))
  const out = []
  for (const t of hand) {
    const onL = t[0] === L || t[1] === L
    const onR = t[0] === R || t[1] === R
    if (onL) out.push({ tile: t, side: 'left' })
    if (onR && !(onL && L === R)) out.push({ tile: t, side: 'right' })
  }
  // Try strong-looking moves first so the search prunes more
  out.sort((a, b) => (isDouble(b.tile) - isDouble(a.tile)) || (pips(b.tile) - pips(a.tile)))
  return out
}

function endsAfter(tile, side, L, R, empty) {
  if (empty) return [tile[0], tile[1]]
  const end = side === 'left' ? L : R
  const open = tile[1] === end ? tile[0] : tile[1]
  return side === 'left' ? [open, R] : [L, open]
}

const handPips = h => h.reduce((s, t) => s + t[0] + t[1], 0)
const WIN = 1000, BLOCK_WIN = 800

// Static judgement of an unfinished position, from our side's point of view.
function leafValue(st, mine, pipWeight = 0.3, style = {}) {
  let v = 0
  let myMin = 99, oppMin = 99, myPips = 0, oppPips = 0
  for (let s = 0; s < 4; s++) {
    const h = st.hands[s]
    const playable = st.empty ? h.length : h.filter(t => canPlay(t, st.L, st.R)).length
    if (mine(s)) { myMin = Math.min(myMin, h.length); myPips += handPips(h); v += playable * 4 }
    else         { oppMin = Math.min(oppMin, h.length); oppPips += handPips(h); v -= playable * 4 }
  }
  v += (oppMin - myMin) * 30          // closest to going out matters most
  v += (oppPips - myPips) * pipWeight // pips decide a blocked round
  // Our doubles that can never come back onto an end
  for (let s = 0; s < 4; s++) {
    if (!mine(s)) continue
    for (const d of st.hands[s]) {
      if (!isDouble(d) || d[0] === st.L || d[0] === st.R) continue
      const n = d[0]
      let alive = false
      for (let k = 0; k < 4 && !alive; k++)
        for (const t of st.hands[k]) if (!isDouble(t) && hasNum(t, n)) { alive = true; break }
      if (!alive) v -= 25
    }
  }
  // TI-FRÈ: play for the partner. Their hand emptying is what matters.
  if (style.partnerFirst && style.partnerSeat >= 0) {
    const ph = st.hands[style.partnerSeat]
    const pPlayable = st.empty ? ph.length : ph.filter(t => canPlay(t, st.L, st.R)).length
    v -= ph.length * style.partnerFirst * 3   // fewer tiles for the partner
    v += pPlayable * style.partnerFirst       // and keep their options open
  }

  return v
}

function blockedWinner(hands) {
  let best = 0, bestPips = Infinity
  for (let s = 0; s < 4; s++) {
    const p = handPips(hands[s])
    if (p < bestPips) { bestPips = p; best = s }   // strict < keeps lowest seat on ties
  }
  return best
}

// What would player p sensibly play here? The same judgement the regular
// bots use (keep your own tiles playable, cut others' options, protect your
// doubles, shed pips) — used to PREDICT everyone except the bot itself.
function predictMove(st, p, moves) {
  const hand = st.hands[p]
  let best = moves[0], bestS = -Infinity
  for (const m of moves) {
    const [nL, nR] = endsAfter(m.tile, m.side, st.L, st.R, st.empty)
    let s = 0
    for (const t of hand) if (t !== m.tile && (hasNum(t, nL) || hasNum(t, nR))) s += 2
    for (let k = 0; k < 4; k++) {
      if (k === p) continue
      for (const t of st.hands[k]) if (hasNum(t, nL) || hasNum(t, nR)) s -= 1
    }
    s += pips(m.tile) * 0.15
    for (const d of hand) {
      if (d === m.tile || !isDouble(d) || d[0] === nL || d[0] === nR) continue
      let ways = 0
      for (let k = 0; k < 4; k++)
        for (const t of st.hands[k]) if (t !== m.tile && !isDouble(t) && hasNum(t, d[0])) ways++
      s -= ways === 0 ? 40 : 12 / ways
    }
    if (s > bestS) { bestS = s; best = m }
  }
  return best
}

// Look ahead. The bot branches over ITS OWN options; every other player
// (opponents, and a partner in asosyé) is predicted with predictMove. That
// matches how the round really unfolds and lets the search reach far ahead —
// often the end of the round. Returns null if the node budget ran out.
function makeSearch(mine, me, budget, style) {
  const dekBonus = style.dekBonus
  const knockBonus = style.knockBonus || 0
  const huntBonus  = style.hunt || 0   // extra for knocking the player nearest to going out
  const crush      = style.crush || 0  // value opponents' leftover pips when we win
  const slow       = style.slow  || 0  // prefer winning LATE instead of fast
  const lateDouble = style.lateDouble || 0  // hold doubles back for the right moment
  const control    = style.control || 0     // keep the open ends on numbers I'm deep in
  const killNum    = style.killNum || 0     // kill numbers off the board for good
  const chain      = style.chain || 0  // extra for knocks that land on an already-knocking table
  const blockWin   = style.blockWin   || BLOCK_WIN   // value of WINNING a blocked round
  const pipWeight  = style.pipWeight  ?? 0.3
  let nodes = 0
  // `knocks` = passes forced on the other side so far along this line
  function value(st, depth, ply, knocks, gain = 0) {
    if (++nodes > budget) return null
    if (depth === 0) return leafValue(st, mine, pipWeight, style) + knocks * knockBonus + gain
    const p = st.turn
    const hand = st.hands[p]
    const moves = movesFor(hand, st.L, st.R, st.empty)

    if (!moves.length) {                                  // forced pass
      // Ti-Chasè counts a knock far more when it lands on the opponent
      // closest to going out — starving the leader, not just anyone.
      let bump = mine(p) ? 0 : 1
      if (huntBonus && !mine(p)) {
        // Ti-Chasè measures "closest to going out" by TILE COUNT;
        // Ti-Wa measures "best placed" by PIP TOTAL — the player who would
        // win if the round jammed.
        let best = Infinity, target = -1
        for (let q = 0; q < 4; q++) {
          if (mine(q)) continue
          const metric = style.huntPips ? handPips(st.hands[q]) : st.hands[q].length
          if (metric < best) { best = metric; target = q }
        }
        if (p === target) bump += huntBonus
      }
      // Ti-Pyèj: a knock is worth far more when the table is ALREADY knocking —
      // he hunts the moment where nobody can move and passes pile up.
      if (chain && !mine(p)) bump += chain * st.passes
      const k = knocks + bump
      if (st.passes + 1 >= 4) {
        const w = blockedWinner(st.hands)
        let bw = blockWin
        if (mine(w) && crush) {
          let opp = 0
          for (let q = 0; q < 4; q++) if (!mine(q)) opp += handPips(st.hands[q])
          bw += opp * crush
        }
        return (mine(w) ? (slow ? bw + ply * slow : bw - ply) : -BLOCK_WIN + ply) + k * knockBonus + gain
      }
      const sp = st.passes, sTurn = st.turn
      st.passes = sp + 1; st.turn = (p + 1) % 4
      const v = value(st, depth - 1, ply + 1, k, gain)
      st.passes = sp; st.turn = sTurn
      return v
    }

    const options = p === me ? moves : [predictMove(st, p, moves)]
    let best = -Infinity
    for (const m of options) {
      const i = hand.indexOf(m.tile)
      hand.splice(i, 1)
      // Scoring OUR OWN move, for the styles that care how the board is left.
      let g = gain
      if (p === me) {
        // Ti-Tid: a double spent early costs him; held back it costs nothing.
        if (lateDouble && isDouble(m.tile)) g -= lateDouble * hand.length

        if (control || killNum) {
          const [cL, cR] = endsAfter(m.tile, m.side, st.L, st.R, st.empty)

          // Ti-Chasè (the controller): the ends should sit on numbers HE still
          // holds plenty of, so he can always answer and others often can't.
          if (control) {
            let mine_ = 0
            for (const t of hand) if (hasNum(t, cL) || hasNum(t, cR)) mine_++
            g += mine_ * control
          }

          // Ti-Chaj (the counter): a number is DEAD once no unplayed tile can
          // bring it back and it isn't showing. Killing one is his whole game —
          // everyone still holding that number is stuck with it.
          if (killNum) {
            for (let n = 0; n <= 6; n++) {
              if (n === cL || n === cR) continue
              if (n === st.L || n === st.R) {
                // it was showing before this move; is anything left to revive it?
                let alive = false
                for (let q = 0; q < 4 && !alive; q++)
                  for (const t of st.hands[q])
                    if (!isDouble(t) && hasNum(t, n)) { alive = true; break }
                if (!alive) g += killNum
              }
            }
          }
        }
      }
      const sL = st.L, sR = st.R, sE = st.empty, sP = st.passes, sT = st.turn
      let v
      if (hand.length === 0) {
        const dek = !sE && !isDouble(m.tile) && sL !== sR &&
          ((m.tile[0] === sL && m.tile[1] === sR) || (m.tile[1] === sL && m.tile[0] === sR))
        let amount = WIN + (dek ? dekBonus : 0)
        // Ti-Frè would rather his partner go out than go out himself.
        if (style.partnerFirst && p === style.partnerSeat) amount *= 1.25
        if (mine(p)) {
          // Ti-Chaj: the more they're still holding when we go out, the better.
          if (crush) {
            let opp = 0
            for (let q = 0; q < 4; q++) if (!mine(q)) opp += handPips(st.hands[q])
            amount += opp * crush
          }
          // Ti-Pyèj: drag it out — a later win scores higher, not lower.
          v = (slow ? amount + ply * slow : amount - ply) + knocks * knockBonus + g
        } else {
          v = -amount + ply + knocks * knockBonus + g // lose as late as possible
        }
      } else {
        const [nL, nR] = endsAfter(m.tile, m.side, sL, sR, sE)
        st.L = nL; st.R = nR; st.empty = false; st.passes = 0; st.turn = (p + 1) % 4
        v = value(st, depth - 1, ply + 1, knocks, g)
        st.L = sL; st.R = sR; st.empty = sE; st.passes = sP; st.turn = sT
      }
      hand.splice(i, 0, m.tile)
      if (v === null) return null
      if (v > best) best = v
    }
    return best
  }
  return { value, used: () => nodes }
}

// Score every root move by searching the future after it.
function rootScores(st, rootMoves, mine, depth, budget, style) {
  const search = makeSearch(mine, st.turn, budget, style)
  const scores = []
  const p = st.turn, hand = st.hands[p]
  for (const m of rootMoves) {
    const i = hand.findIndex(t => sameTile(t, m.tile))
    const [tile] = hand.splice(i, 1)
    const sL = st.L, sR = st.R, sE = st.empty, sP = st.passes, sT = st.turn
    let v
    if (hand.length === 0) {
      const dek = !sE && !isDouble(tile) && sL !== sR &&
        ((tile[0] === sL && tile[1] === sR) || (tile[1] === sL && tile[0] === sR))
      v = WIN + (dek ? style.dekBonus : 0)
    } else {
      const [nL, nR] = endsAfter(tile, m.side, sL, sR, sE)
      st.L = nL; st.R = nR; st.empty = false; st.passes = 0; st.turn = (p + 1) % 4
      const rootGain = (style.lateDouble && isDouble(tile)) ? -style.lateDouble * hand.length : 0
      v = search.value(st, depth - 1, 1, 0, rootGain)
      st.L = sL; st.R = sR; st.empty = sE; st.passes = sP; st.turn = sT
    }
    hand.splice(i, 0, tile)
    if (v === null) return null            // out of budget at this depth
    scores.push(v)
  }
  return scores
}

// Deepen until the budget runs out; keep the deepest finished answer.
function deepScores(st, rootMoves, mine, budget, style) {
  let last = null
  for (let depth = 2; depth <= 28; depth += 2) {
    const s = rootScores(st, rootMoves, mine, depth, budget, style)
    if (!s) break
    last = s
  }
  return last
}

// Who counts as "our side" when judging an outcome: me, my asosyé partner,
// and — when all three all-seeing bots are at the table — the other two, so
// they play as one bloc (ctx.allySeats, set by the game).
function teamCheck(ctx) {
  const me = ctx.seat
  const partner = ctx.mode === 'asosye' ? (me + 2) % 4 : -1
  const allies = ctx.allySeats || []
  return s => s === me || s === partner || allies.includes(s)
}

function buildState(hands, board, turn, passes) {
  return {
    hands,
    L: board?.tiles?.length ? board.left_end : null,
    R: board?.tiles?.length ? board.right_end : null,
    empty: !board?.tiles?.length,
    turn,
    passes: passes || 0,
  }
}

// Root moves limited to what the game says is playable right now.
function legalRootMoves(playable, board) {
  return getMoves(playable, board)
}

// Tie-break equal search scores with the shared single-move judgement.
function pickBest(moves, scores, hand, board, ctx) {
  const unknown = unknownTiles(board, hand)
  let bi = 0
  for (let i = 1; i < moves.length; i++) {
    if (scores[i] > scores[bi]) bi = i
    else if (scores[i] === scores[bi]) {
      const a = evaluate(moves[i], hand, board, unknown, ctx, STRATEGIST_W)
      const b = evaluate(moves[bi], hand, board, unknown, ctx, STRATEGIST_W)
      if (a > b) bi = i
    }
  }
  return moves[bi]
}

// ── Ti-Jòj, Ti-Tid & Ti-Roro ──────────────────────────────────────────────────────────
// Both see every player's real tiles, predict what each player will do, and
// plan their own moves so the following plays fall their way.
//   Ti-Jòj — plays purely to win the round.
//   Ti-Tid — the double master: refuses to dump doubles early. He holds them
//            until they do real work — controlling a number, or landing when
//            the table is short of it so opponents knock.
//   Ti-Roro — the pip counter: steers the round toward a block that he wins
//            by holding the fewest pips. If only a win by going out is
//            available he takes it, but a block win is his first choice.
const SEER_BUDGET = 60000
const TIJOJ_STYLE = { dekBonus: 300, knockBonus: 0 }
const TITID_STYLE = { dekBonus: 300, knockBonus: 25, lateDouble: 100 }
// blockWin above WIN (1000) = a won block is worth more to him than going out
const TIRORO_STYLE = { dekBonus: 0, knockBonus: 0, blockWin: 1200 }

function seer(playable, hand, board, ctx, style) {
  const moves = legalRootMoves(playable, board)
  if (moves.length === 1) return moves[0]
  // Without the real hands, fall back to the strategist's judgement.
  if (!ctx?.hands || ctx.seat === undefined) return strategist(playable, hand, board, ctx)
  const hands = [0, 1, 2, 3].map(s => (s === ctx.seat ? hand : (ctx.hands[s] || [])).map(t => [t[0], t[1]]))
  const st = buildState(hands, board, ctx.seat, ctx.consecutivePasses)
  const rootHand = st.hands[ctx.seat]
  const rootMoves = moves.map(m => ({ tile: rootHand.find(t => sameTile(t, m.tile)), side: m.side }))
  // Styles that play for a partner need to know which seat that is.
  const runStyle = { ...style, partnerSeat: ctx.mode === 'asosye' ? (ctx.seat + 2) % 4 : -1 }
  const scores = deepScores(st, rootMoves, teamCheck(ctx), SEER_BUDGET, runStyle)
  if (!scores) return strategist(playable, hand, board, ctx)
  return pickBest(moves, scores, hand, board, ctx)
}

const tijoj = (playable, hand, board, ctx) => seer(playable, hand, board, ctx, TIJOJ_STYLE)
const titid = (playable, hand, board, ctx) => seer(playable, hand, board, ctx, TITID_STYLE)
const tiroro = (playable, hand, board, ctx) => seer(playable, hand, board, ctx, TIRORO_STYLE)

//   Ti-Chasè — the controller: keeps both open ends on numbers he is deep in,
//            so he can always answer while the rest of the table can't.
//   Ti-Frè  — the brother: plays for his PARTNER, setting them up to go out
//            even at his own expense. Shows up in asosyé and 2v2 vs AI.
const TICHASE_STYLE = { dekBonus: 300, knockBonus: 20, control: 150 }
const TIFRE_STYLE   = { dekBonus: 300, knockBonus: 0, partnerFirst: 10 }

const tichase = (playable, hand, board, ctx) => seer(playable, hand, board, ctx, TICHASE_STYLE)
const tifre   = (playable, hand, board, ctx) => seer(playable, hand, board, ctx, TIFRE_STYLE)

//   Ti-Chaj — the counter: kills numbers off the board. Once the last tile of
//            a number is gone and it isn't showing, it can never come back —
//            and everyone still holding it is stuck.
//   Ti-Pyèj — the trap: hunts the moment the table seizes up. A knock counts
//            for far more when others are already knocking, so he engineers
//            runs of passes where nobody can move.
//   Ti-Wa   — goes after whoever is BEST PLACED (lowest pips, the one who'd
//            win a jammed round), not whoever is closest to going out.
const TICHAJ_STYLE = { dekBonus: 300, knockBonus: 20, killNum: 300, crush: 1 }
const TIPYEJ_STYLE = { dekBonus: 300, knockBonus: 20, chain: 8 }
const TIWA_STYLE   = { dekBonus: 300, knockBonus: 60, hunt: 5, huntPips: true }

const tichaj = (playable, hand, board, ctx) => seer(playable, hand, board, ctx, TICHAJ_STYLE)
const tipyej = (playable, hand, board, ctx) => seer(playable, hand, board, ctx, TIPYEJ_STYLE)
const tiwa   = (playable, hand, board, ctx) => seer(playable, hand, board, ctx, TIWA_STYLE)

// Which personalities are given every player's real tiles by the game.
export function seesAllHands(personality) {
  return ['tijoj', 'titid', 'tiroro', 'tichase', 'tifre', 'tichaj', 'tipyej', 'tiwa'].includes(personality)
}

// ── Personality map ───────────────────────────────────────────────────────────
export const PERSONALITIES = {
  strategist,
  gambler,
  blocker,
  tijoj,
  titid,
  tiroro,
  tichase,
  tifre,
  tichaj,
  tipyej,
  tiwa,
  bebe,
  sak,
  met,
  pridan,
  doub,
}

// Default assignment by bot name
export function getPersonality(nickname) {
  // Accents stripped so "Ti-Jòj" and "Ti-Joj" both match.
  const n = (nickname || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (n.includes('ti-joj'))                         return 'tijoj'
  if (n.includes('ti-tid'))                         return 'titid'
  if (n.includes('ti-roro'))                        return 'tiroro'
  if (n.includes('ti-chase'))                       return 'tichase'
  if (n.includes('ti-fre'))                         return 'tifre'
  if (n.includes('ti-bebe'))                        return 'bebe'
  if (n.includes('ti-sak'))                         return 'sak'
  if (n.includes('ti-chaj'))                        return 'tichaj'
  if (n.includes('ti-pyej'))                        return 'tipyej'
  if (n.includes('ti-wa'))                          return 'tiwa'
  if (n.includes('ti-met'))                         return 'met'
  if (n.includes('ti-pridan'))                      return 'pridan'
  if (n.includes('ti-doub'))                        return 'doub'
  if (n.includes('ti-djo') || n.includes('djo'))    return 'strategist'
  if (n.includes('ti-cam') || n.includes('ticam')) return 'gambler'
  if (n.includes('ti-jean') || n.includes('jean'))   return 'blocker'
  return 'strategist' // default for new bots
}

export function chooseTile(personality, playable, hand, board, ctx) {
  const fn = PERSONALITIES[personality] || strategist
  return fn(playable, hand, board, ctx)
}
