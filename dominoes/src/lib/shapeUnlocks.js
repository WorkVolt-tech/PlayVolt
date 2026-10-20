import { db } from './supabase'
import { getPersonality, isExpertBot } from './botAI'

// ── Unlocking the shaped tiles ───────────────────────────────────────────────
// Kapsil: all 30 puzzles. The others: beating expert bots (shape_record /
// shape_check_puzzles in dekabess_database.sql — the server checks the
// opponents really are experts and records it only for the signed-in player).
// Practice never counts. A table counts when every opponent is an expert.

// Every puzzle on the Learn & Puzzle page. A test (tests/shape-unlocks.test.mjs)
// fails if the page's count changes, so update this — and the minimum in
// shape_check_puzzles — when puzzles are added.
export const PUZZLE_COUNT = 78

export const SHAPE_RULES = {
  kapsil:  'Finish every puzzle in Learn & Puzzle',
  zo:      'Win a match 1-on-1 against an expert bot',
  hexa:    'Win a match at a 3-player table against 2 experts',
  oktav:   'Win a match at a 4-player table against 3 experts',
  fle:     'Win a match against Ti-Jòj, Ti-Tid and Ti-Roro',
  lozanj:  'Win a match against Ti-Chasè, Ti-Chaj and Ti-Wa',
  dyaman:  'As partners, win a match against Ti-Frè and Ti-Pyèj',
  konkav:  'Win a round with a Dekabess against 3 experts',
  triyang: 'Beat all 8 experts — win a match at a table with each',
}
export const SHAPE_PROGRESS = {
  kapsil:  s => `${Math.min(PUZZLE_COUNT, s.puzzlesDone || 0)}/${PUZZLE_COUNT} done`,
  triyang: s => `${(s.expertsBeaten || []).length} of 8 beaten`,
}

// a small note when something unlocks
function celebrate(names) {
  if (!names?.length || typeof document === 'undefined') return
  const el = document.createElement('div')
  el.textContent = `🎉 New tile unlocked: ${names.join(', ')} — equip it on the Skins page`
  el.style.cssText = 'position:fixed;left:50%;top:calc(64px + env(safe-area-inset-top,0px));transform:translateX(-50%);' +
    'z-index:9999;max-width:90vw;padding:8px 14px;border-radius:14px;background:rgba(10,9,7,.94);color:#e8c96a;' +
    'border:1px solid #c9a84c;font:13px/1.35 "DM Mono",monospace;text-align:center;pointer-events:none'
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 5000)
}

// event 'match' (you won the match) or 'dekabess' (you won a round with a Dekabess);
// opponentNames: the bots' names at the table (your partner left out)
export async function recordShapeWin(event, opponentNames, partners = false) {
  try {
    const ids = (opponentNames || []).map(getPersonality)
    if (!ids.length || !ids.every(isExpertBot)) return            // only expert-only tables count
    const { data: auth } = await db.auth.getUser()
    if (!auth?.user) return
    const { data } = await db.rpc('shape_record', { p_event: event, p_opponents: ids, p_partners: !!partners })
    celebrate(data)
  } catch { /* non-fatal */ }
}

export async function checkPuzzleShape() {
  try {
    const { data } = await db.rpc('shape_check_puzzles', { p_total: PUZZLE_COUNT })
    celebrate(data)
  } catch { /* non-fatal */ }
}
