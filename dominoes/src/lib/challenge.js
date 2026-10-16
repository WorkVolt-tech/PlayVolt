// ── Challenge Mode: a new challenge every 3 days ─────────────────────────────
// (Wa Tab La stays weekly.) A period is 3 days from midnight UTC, counted from
// 2026-01-05 — the same as the database's challenge_period_start(). Each
// period: one challenge against expert bots, 3 tries. The format rotates
// Solo → 3-player → 1-on-1 → Team; 1-on-1 alternates with and without the
// draw pile. Opponents are hand-picked expert line-ups that play well
// together. The prize tables rotate on their own five-period cycle — the same
// rotation the database uses to award them (challenge_table).

export const CHALLENGE_TABLES = ['sapphire', 'burgundydeco', 'teal', 'amethyst', 'emerald']
const FORMATS = ['trio', 'duel', 'team', 'solo']          // period 0 (from 2026-01-05) is a 3-player challenge

// expert line-ups that complement each other, per format
const LINEUPS = {
  solo: [['Ti-Jòj', 'Ti-Roro', 'Ti-Pyèj'], ['Ti-Chasè', 'Ti-Chaj', 'Ti-Wa'], ['Ti-Tid', 'Ti-Jòj', 'Ti-Chasè'], ['Ti-Roro', 'Ti-Wa', 'Ti-Chaj']],
  trio: [['Ti-Roro', 'Ti-Pyèj'], ['Ti-Chasè', 'Ti-Chaj'], ['Ti-Jòj', 'Ti-Wa'], ['Ti-Tid', 'Ti-Pyèj']],
  duel: [['Ti-Jòj'], ['Ti-Wa'], ['Ti-Chasè'], ['Ti-Roro']],
  team: [['Ti-Frè', 'Ti-Jòj'], ['Ti-Roro', 'Ti-Pyèj'], ['Ti-Chasè', 'Ti-Chaj'], ['Ti-Tid', 'Ti-Wa']],
}
const BLURB = {
  'Ti-Jòj,Ti-Roro,Ti-Pyèj': 'The Master leads while the Locker and the Trapper close the table on you.',
  'Ti-Chasè,Ti-Chaj,Ti-Wa': 'They control the ends, count every tile, and go after whoever is closest to winning — you.',
  'Ti-Tid,Ti-Jòj,Ti-Chasè': 'Doubles held back, the strongest move every turn, and both ends under control.',
  'Ti-Roro,Ti-Wa,Ti-Chaj': 'Locked ends, a reader at the table, and nothing left of your numbers.',
  'Ti-Roro,Ti-Pyèj': 'One locks the ends, the other springs the trap.',
  'Ti-Chasè,Ti-Chaj': 'One controls the table, the other counts out your numbers.',
  'Ti-Jòj,Ti-Wa': 'The Master and the Reader — strongest moves, aimed squarely at you.',
  'Ti-Tid,Ti-Pyèj': 'Doubles held back until the trap is set.',
  'Ti-Jòj': 'The Master: the strongest move, every single turn.',
  'Ti-Wa': 'The Reader: always going after the player closest to winning.',
  'Ti-Chasè': 'The Controller: hunts both ends of the table.',
  'Ti-Roro': 'The Locker: jams the table on purpose.',
  'Ti-Frè,Ti-Jòj': 'A true partner feeding the Master.',
  'Ti-Tid,Ti-Wa': 'Doubles held back, and a reader watching your every play.',
}
const NAME = { solo: 'Solo — you vs 3 experts', trio: '3-player — you vs 2 experts', duel: '1-on-1 — you vs 1 expert', team: 'Team — you and a friend vs 2 experts' }

export const PERIOD_DAYS = 3
const DAY = 86400000, ANCHOR = Date.UTC(2026, 0, 5)

// The start (midnight UTC) of the 3-day period a moment falls in
export function periodStartUTC(d = new Date()) {
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return new Date(ANCHOR + Math.floor((day - ANCHOR) / (PERIOD_DAYS * DAY)) * PERIOD_DAYS * DAY)
}
export function periodsSince(start = periodStartUTC()) {
  return Math.round((start - ANCHOR) / (PERIOD_DAYS * DAY))
}
// When the current challenge ends (the next one starts)
export function challengeEnds(d = new Date()) {
  return new Date(periodStartUTC(d).getTime() + PERIOD_DAYS * DAY)
}

export function challengeFor(start = periodStartUTC()) {
  const w = periodsSince(start)
  const m = (x, n) => ((x % n) + n) % n
  const format = FORMATS[m(w, 4)]
  const cycle = Math.floor(w / 4)
  const opponents = LINEUPS[format][m(cycle, 4)]
  const pile = format === 'duel' && m(cycle, 2) === 1
  return {
    week: start.toISOString().slice(0, 10),        // the period's start date (named 'week' for saved games and the database)
    format, pile, opponents,
    title: NAME[format] + (format === 'duel' ? (pile ? ', with the draw pile' : ', every tile dealt') : ''),
    blurb: BLURB[opponents.join(',')] || '',
    seats: format === 'solo' || format === 'team' ? 4 : format === 'trio' ? 3 : 2,
    table: CHALLENGE_TABLES[m(w, 5)],
  }
}
