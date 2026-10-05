import { useEffect, useState } from 'react'
import { TROPHIES, earnedTrophies } from '../lib/trophies'
import { loadPlayerStats } from '../lib/skins'
import { Medal, rewardText } from '../pages/Trophies'
import '../pages/Trophies.css'

// ── "Trophy earned" ──────────────────────────────────────────────────────────
// Shown in the lobby when you've earned trophies since you last looked —
// each with its Kreyòl name, meaning, and what it unlocked.
// The very first time (or on a new device), everything already earned is
// quietly marked as seen, so nobody gets a flood of old trophies.

export default function TrophyNotice() {
  const [fresh, setFresh] = useState([])
  const [key, setKey] = useState(null)

  useEffect(() => {
    let off = false
    loadPlayerStats().then(stats => {
      if (off || !stats.uid) return                    // guests earn no trophies
      const k = `dk-trophies-seen-${stats.uid}`
      const earned = [...earnedTrophies(stats)]
      let seen = null
      try { seen = JSON.parse(localStorage.getItem(k) || 'null') } catch { /* ignore */ }
      if (!Array.isArray(seen)) {                       // first time on this device
        try { localStorage.setItem(k, JSON.stringify(earned)) } catch { /* ignore */ }
        return
      }
      const news = earned.filter(id => !seen.includes(id))
      if (news.length) { setKey(k); setFresh(news) }
    })
    return () => { off = true }
  }, [])

  if (!fresh.length) return null
  const close = () => {
    try {
      const seen = JSON.parse(localStorage.getItem(key) || '[]')
      localStorage.setItem(key, JSON.stringify([...new Set([...seen, ...fresh])]))
    } catch { /* ignore */ }
    setFresh([])
  }
  return (
    <div className="trophy-notice-bg" onClick={close}>
      <div className="trophy-notice" onClick={e => e.stopPropagation()}>
        <h2>{fresh.length === 1 ? 'Trophy earned!' : `${fresh.length} trophies earned!`}</h2>
        {fresh.map(id => {
          const t = TROPHIES.find(x => x.id === id)
          if (!t) return null
          return (
            <div key={id} className="trophy-card earned">
              <Medal tier={t.tier} earned />
              <div className="trophy-text">
                <div className="trophy-name">{t.kreyol}</div>
                <div className="trophy-meaning">“{t.meaning}”</div>
                <div className="trophy-desc">{t.desc}</div>
                <div className="trophy-reward">Unlocked: {rewardText(t)}</div>
              </div>
            </div>
          )
        })}
        <button className="trophy-notice-ok" onClick={close}>Nice</button>
      </div>
    </div>
  )
}
