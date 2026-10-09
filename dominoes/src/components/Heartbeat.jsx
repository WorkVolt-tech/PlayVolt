import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { db } from '../lib/supabase'

// ── Online status ────────────────────────────────────────────────────────────
// While Dekabess is open and visible, a signed-in player checks in with the
// server: on opening, every minute, on coming back to the app, and the moment
// they start or stop playing. Friends then see them as online / in a game.
// Draws nothing; guests send nothing.

const playing = path => path === '/game' || path === '/solo' || path === '/practice' || path === '/challenge/play' || /^\/story\/[^/]+/.test(path)

export default function Heartbeat() {
  const { pathname } = useLocation()
  const activity = playing(pathname) ? 'game' : 'online'
  const actRef = useRef(activity)
  actRef.current = activity

  const beat = useRef(async () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    const { data } = await db.auth.getSession()
    if (!data?.session) return
    db.rpc('heartbeat', { p_activity: actRef.current }).then(() => {}, () => {})
  }).current

  useEffect(() => {
    beat()
    const t = setInterval(beat, 60000)
    const onVisible = () => { if (document.visibilityState === 'visible') beat() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  // starting or leaving a game updates your status right away
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    beat()
  }, [activity])

  return null
}
