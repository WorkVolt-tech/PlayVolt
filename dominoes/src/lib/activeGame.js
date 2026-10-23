// ── Your seat at an online table, kept across app restarts ───────────────────
// An installed app on iPhone is often shut down while it sits in the
// background; it then starts again at the lobby with its short-lived session
// storage wiped — so it forgot your table, and your turns timed out. The seat
// is now also kept here (localStorage) while you play, and cleared whenever
// you leave a table. On a fresh start the lobby takes you back to it.
const KEY = 'dekabess_active_game'
const MAX_AGE = 6 * 60 * 60 * 1000          // a seat older than this is stale

export function rememberSeat(info) {
  if (!info?.roomId) return
  try { localStorage.setItem(KEY, JSON.stringify({ ...info, savedAt: Date.now() })) } catch { /* ignore */ }
}

// leaving a table: forget it everywhere
export function forgetSeat() {
  try { sessionStorage.removeItem('domino_player') } catch { /* ignore */ }
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

export function savedSeat() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!s?.roomId) return null
    if (Date.now() - (s.savedAt || 0) > MAX_AGE) { localStorage.removeItem(KEY); return null }
    const { savedAt, ...info } = s           // eslint-disable-line no-unused-vars
    return info
  } catch { return null }
}

// true only for the first screen after the app starts (so walking to the
// lobby yourself never pulls you back into a game)
let fresh = true
export function takeFreshStart() { const f = fresh; fresh = false; return f }
