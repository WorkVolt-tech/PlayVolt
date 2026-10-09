import { useEffect, useState } from 'react'
import { TROPHIES, earnedTrophies } from '../lib/trophies'
import { loadPlayerStats, TABLE_SKINS } from '../lib/skins'
import { db } from '../lib/supabase'
import { Medal, rewardText } from '../pages/Trophies'
import '../pages/Trophies.css'

// ── "Trophy earned" ──────────────────────────────────────────────────────────
// Shown in the lobby when you've earned trophies since you last looked —
// each with its Kreyòl name, meaning, and what it unlocked.
// The very first time (or on a new device), everything already earned is
// quietly marked as seen, so nobody gets a flood of old trophies.

export default function TrophyNotice() {
  const [fresh, setFresh] = useState([])
  const [tables, setTables] = useState([])
  const [tablesKey, setTablesKey] = useState(null)
  const [key, setKey] = useState(null)

  useEffect(() => {
    let off = false
    // award any finished Wa Tab La weeks first, so a won table shows up now
    db.rpc('settle_wa_tab_la').then(() => {}, () => {}).then(() => loadPlayerStats()).then(stats => {
      if (off || !stats.uid) return                    // guests earn no trophies
      // Wa Tab La prize tables won since you last looked
      const tk = `dk-tables-seen-${stats.uid}`
      let tseen = null
      try { tseen = JSON.parse(localStorage.getItem(tk) || 'null') } catch { /* ignore */ }
      const won = stats.tableUnlocks || []
      if (!Array.isArray(tseen)) { try { localStorage.setItem(tk, JSON.stringify(won)) } catch { /* ignore */ } }
      else {
        const newTables = won.filter(id => !tseen.includes(id))
        if (newTables.length) { setTables(newTables); setTablesKey(tk) }
      }
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

  if (tables.length) {
    const closeTables = () => {
      try {
        const seen = JSON.parse(localStorage.getItem(tablesKey) || '[]')
        localStorage.setItem(tablesKey, JSON.stringify([...new Set([...seen, ...tables])]))
      } catch { /* ignore */ }
      setTables([])
    }
    return (
      <div className="trophy-notice-bg" onClick={closeTables}>
        <div className="trophy-notice" onClick={e => e.stopPropagation()}>
          <h2>👑 Wa Tab La!</h2>
          <p style={{ margin: '0 0 0.8rem', fontSize: '0.72rem', color: 'var(--ivory-dim)' }}>
            You finished the week as King of the Table. Your prize is yours for good:
          </p>
          {tables.map(id => (
            <div key={id} style={{ marginBottom: '0.7rem' }}>
              <img src={TABLE_SKINS[id]?.thumb} alt="" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--gold)' }} />
              <div style={{ marginTop: 6, color: 'var(--gold-glow)', fontFamily: 'Playfair Display, Georgia, serif', fontSize: '1.05rem' }}>
                {TABLE_SKINS[id]?.label} table
              </div>
            </div>
          ))}
          <button className="trophy-notice-ok" onClick={closeTables}>Equip it in Skins</button>
        </div>
      </div>
    )
  }
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
              <Medal trophyId={t.id} earned size={52} />
              <div className="trophy-text">
                <div className="trophy-name">{t.kreyol}</div>
                <div className="trophy-meaning">“{t.meaning}”</div>
                <div className="trophy-desc">{t.desc}</div>
                <div className="trophy-reward">Unlocked: {rewardText(t)} · its avatar</div>
              </div>
            </div>
          )
        })}
        <button className="trophy-notice-ok" onClick={close}>Nice</button>
      </div>
    </div>
  )
}
