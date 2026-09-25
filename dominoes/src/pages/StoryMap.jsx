import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { CHAPTERS } from '../story/chapters'
import './StoryMap.css'

// ── Story Mode map ───────────────────────────────────────────────────────────
// Shows every chapter — the ones you've beaten, the one you're on, and the
// locked ones ahead, so there's always something visible to aim at.
//
// Progress lives on the account, so guests are asked to sign in.

export default function StoryMap() {
  const navigate = useNavigate()
  const { user, isLoading } = useAuth()
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    if (isLoading) return
    if (!user) { setBusy(false); return }
    let cancelled = false
    ;(async () => {
      const { data, error: e } = await db.rpc('ensure_story_progress')
      if (cancelled) return
      if (e) setError(e.message)
      else setProgress(Array.isArray(data) ? data[0] : data)
      setBusy(false)
    })()
    return () => { cancelled = true }
  }, [user, isLoading])

  const completed = progress?.completed_chapters || []
  const current = progress?.current_chapter || 1

  function statusOf(ch) {
    if (completed.includes(ch.id)) return 'done'
    if (ch.id === current) return 'current'
    return 'locked'
  }

  function starsFor(ch) {
    const s = progress?.stars?.[String(ch.id)] || {}
    return Object.values(s).reduce((a, b) => a + (Number(b) || 0), 0)
  }

  // ── guests ────────────────────────────────────────────────────────────────
  if (!isLoading && !user) {
    return (
      <div className="story-page">
        <div className="story-header">
          <button className="story-back" onClick={() => navigate('/')}>← Back</button>
          <h1 className="story-title">Story Mode</h1>
          <span style={{ width: 60 }} />
        </div>
        <div className="story-gate">
          <p>Story Mode keeps your progress on your account, so it follows you between devices.</p>
          <button className="story-btn" onClick={() => navigate('/auth')}>Sign in to play</button>
        </div>
      </div>
    )
  }

  const tiers = [
    { key: 'normal',    label: 'Normal Circuit' },
    { key: 'qualifier', label: 'Qualifier' },
    { key: 'expert',    label: 'Expert Circuit' },
    { key: 'final',     label: 'Championship' },
  ]

  return (
    <div className="story-page">
      <div className="story-header">
        <button className="story-back" onClick={() => navigate('/')}>← Back</button>
        <h1 className="story-title">Story Mode</h1>
        <span className="story-count">{completed.length}/{CHAPTERS.length}</span>
      </div>

      {busy && <div className="story-note">Loading…</div>}
      {error && <div className="story-note story-error">Couldn’t load your progress: {error}</div>}

      {!busy && !error && tiers.map(tier => {
        const list = CHAPTERS.filter(c => c.tier === tier.key)
        if (!list.length) return null
        return (
          <div key={tier.key} className="story-tier">
            <div className="story-tier-label">{tier.label}</div>
            <div className="story-grid">
              {list.map(ch => {
                const st = statusOf(ch)
                const stars = starsFor(ch)
                return (
                  <button
                    key={ch.id}
                    className={`story-chapter ${st}`}
                    disabled={st === 'locked' || !ch.challenges.length}
                    onClick={() => navigate(`/story/${ch.id}`)}
                  >
                    <div className="story-chapter-top">
                      <span className="story-chapter-num">{ch.id}</span>
                      {st === 'done' && <span className="story-tick">✓</span>}
                      {st === 'locked' && <span className="story-lock">🔒</span>}
                    </div>
                    <div className="story-chapter-name">{ch.title}</div>
                    {ch.featured && <div className="story-chapter-foe">{ch.featured}</div>}
                    <div className="story-chapter-theme">{ch.theme}</div>
                    {stars > 0 && <div className="story-stars">{'★'.repeat(Math.min(stars, 5))}</div>}
                    {st !== 'locked' && !ch.challenges.length && (
                      <div className="story-soon">Coming soon</div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
