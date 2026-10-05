import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TROPHIES, TROPHY_GROUPS, earnedTrophies } from '../lib/trophies'
import { TILE_SKINS, TABLE_SKINS, loadPlayerStats } from '../lib/skins'
import './Trophies.css'

// ── Trophies: the cabinet ────────────────────────────────────────────────────
// Every trophy, grouped. Each shows its Kreyòl name, what the name literally
// means, what earns it, and what it unlocks. Earned ones are in their medal
// colour; the rest are greyed until you get there.

export function rewardText(t) {
  const parts = []
  for (const id of t.rewards?.tiles || [])  parts.push(`${TILE_SKINS[id]?.label || id} tiles`)
  for (const id of t.rewards?.tables || []) parts.push(`${TABLE_SKINS[id]?.label || id} table`)
  return parts.length ? parts.join(' · ') : 'Badge of honour'
}

export function Medal({ tier, earned, size = 44 }) {
  return (
    <div className={`medal ${tier} ${earned ? 'earned' : ''}`} style={{ width: size, height: size }}>
      <span style={{ fontSize: size * 0.48 }}>{earned ? '🏆' : '🔒'}</span>
    </div>
  )
}

export default function Trophies() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  useEffect(() => { loadPlayerStats().then(setStats) }, [])
  const earned = earnedTrophies(stats)

  return (
    <div className="trophies-page">
      <div className="trophies-head">
        <div>
          <button className="trophies-back" onClick={() => navigate(-1)}>← Back</button>
          <h1>Trophies</h1>
          <p>Earn them by playing. Each one unlocks something — and stays on your profile as a badge of honour.</p>
        </div>
        <div className="trophies-count"><strong>{earned.size}</strong> / {TROPHIES.length} earned</div>
      </div>

      {TROPHY_GROUPS.map(g => (
        <section key={g.id}>
          <h2 className="trophies-section">{g.label}</h2>
          <div className="trophies-grid">
            {TROPHIES.filter(t => t.group === g.id).map(t => {
              const got = earned.has(t.id)
              return (
                <div key={t.id} className={`trophy-card ${got ? 'earned' : ''}`}>
                  <Medal tier={t.tier} earned={got} />
                  <div className="trophy-text">
                    <div className="trophy-name">{t.kreyol}</div>
                    <div className="trophy-meaning">“{t.meaning}”</div>
                    <div className="trophy-desc">{t.desc}</div>
                    <div className="trophy-reward">{got ? 'Unlocked: ' : 'Unlocks: '}{rewardText(t)}</div>
                  </div>
                  <div className={`trophy-tier ${t.tier}`}>{t.tier}</div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
