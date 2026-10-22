import { useEffect, useState } from 'react'

// ── A pause before the end-of-round panel ────────────────────────────────────
// When a round ends, the panel waits a moment so everyone sees the last
// domino land (and the final board) before it covers the table. Used by
// online games, Solo, Story and Practice. A new round resets it.
export const END_PAUSE_MS = 1500

export function useEndPause(over, ms = END_PAUSE_MS) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!over) { setReady(false); return }
    const t = setTimeout(() => setReady(true), ms)
    return () => clearTimeout(t)
  }, [over, ms])
  return over && ready
}
