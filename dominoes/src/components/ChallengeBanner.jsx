import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { TrophyAvatar } from '../lib/avatars'
import './ChallengeBanner.css'

// ── A friend challenges you ──────────────────────────────────────────────────
// Shown anywhere in the app. New challenges arrive live; opening the app also
// picks up any sent in the last 5 minutes. Join goes straight into the room
// (asking first if you're mid-game); Decline tells the challenger.

const MODE = { chien: 'Chien Manjé Chien', asosye: 'Asosyé' }
const LIFE_MS = 5 * 60 * 1000

export default function ChallengeBanner() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [list, setList] = useState([])
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    let ch = null, off = false
    const load = () => db.rpc('my_challenges').then(({ data }) => { if (!off) setList(data || []) }, () => {})
    db.auth.getUser().then(({ data }) => {
      const uid = data?.user?.id
      if (!uid || off) return
      load()
      ch = db.channel(`challenges-for-${uid}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friend_challenges', filter: `to_user=eq.${uid}` }, load)
        .subscribe()
    })
    const tick = setInterval(() => setNow(Date.now()), 15000)        // let expired ones drop away
    return () => { off = true; clearInterval(tick); if (ch) db.removeChannel(ch) }
  }, [])

  const live = list.filter(c => now - new Date(c.created_at).getTime() < LIFE_MS)
  const c = live[0]
  if (!c) return null

  const answer = async accept => {
    if (accept && pathname === '/game' && !window.confirm('Leave your current game to join this one?')) return
    setList(l => l.filter(x => x.id !== c.id))
    const { data: code } = await db.rpc('challenge_respond', { p_id: c.id, p_accept: accept })
    if (accept && code) navigate(`/?join=${code}&auto=1`)
  }

  return (
    <div className="cb-banner" role="dialog" aria-live="polite">
      {c.avatar ? <TrophyAvatar trophyId={c.avatar} size={38} badge={false} /> : <div className="cb-initial">{(c.nickname || '?')[0].toUpperCase()}</div>}
      <div className="cb-text">
        <strong>{c.nickname}</strong> challenges you to <strong>{MODE[c.mode] || 'a game'}</strong>
        {live.length > 1 && <small>+{live.length - 1} more</small>}
      </div>
      <button className="cb-btn join" onClick={() => answer(true)}>Join</button>
      <button className="cb-btn" onClick={() => answer(false)}>Decline</button>
    </div>
  )
}
