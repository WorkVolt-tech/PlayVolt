import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import './WaTabLa.css'

function getWeekStart() {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Monday
  const monday = new Date(now.setDate(diff))
  return monday.toISOString().split('T')[0]
}

function getTimeUntilSunday() {
  const now = new Date()
  const nextSunday = new Date()
  nextSunday.setDate(now.getDate() + (7 - now.getDay()))
  nextSunday.setHours(0, 0, 0, 0)
  const diff = nextSunday - now
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return `${h}h ${m}m`
}

export default function WaTabLa() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('solo')
  const [solo, setSolo] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [timeLeft, setTimeLeft] = useState(getTimeUntilSunday())

  const load = useCallback(async () => {
    setLoading(true)
    const week = getWeekStart()
    const [s, t] = await Promise.all([
      db.from('wa_tab_la').select('*').eq('mode', 'solo').eq('week_start', week).order('wins', { ascending: false }).limit(20),
      db.from('wa_tab_la').select('*').eq('mode', 'teams').eq('week_start', week).order('wins', { ascending: false }).limit(20),
    ])
    setSolo(s.data || [])
    setTeams(t.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(() => setTimeLeft(getTimeUntilSunday()), 60000)
    return () => clearInterval(t)
  }, [])

  const data = tab === 'solo' ? solo : teams

  return (
    <div className="wtl-page">
      <div className="wtl-header">
        <button className="wtl-back" onClick={() => navigate('/')}>← Back</button>
        <div className="wtl-title-block">
          <h1 className="wtl-title">Wa Tab La 👑</h1>
          <p className="wtl-sub">King of the Table</p>
        </div>
        <div className="wtl-timer">
          <div className="wtl-timer-label">Resets in</div>
          <div className="wtl-timer-value">{timeLeft}</div>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="wtl-tabs">
        {['solo', 'teams'].map(m => (
          <button key={m} className={`wtl-tab ${tab === m ? 'active' : ''}`} onClick={() => setTab(m)}>
            {m === 'solo' ? '⚔️ Solo' : '🤝 Teams (2v2)'}
          </button>
        ))}
      </div>

      {/* Top 3 podium */}
      {!loading && data.length >= 3 && (
        <div className="wtl-podium">
          {[data[1], data[0], data[2]].map((p, i) => {
            const rank = i === 1 ? 1 : i === 0 ? 2 : 3
            const medals = ['🥇', '🥈', '🥉']
            return (
              <div key={p.id} className={`wtl-podium-slot rank-${rank}`}>
                <div className="wtl-podium-medal">{medals[rank - 1]}</div>
                <div className="wtl-podium-name">{p.player_nickname}</div>
                <div className="wtl-podium-wins">{p.wins} Vyèj</div>
                <div className={`wtl-podium-bar rank-${rank}`} />
                {rank === 1 && <div className="wtl-king-badge">👑 King</div>}
              </div>
            )
          })}
        </div>
      )}

      {/* Full rankings */}
      <div className="wtl-list-card">
        <div className="wtl-list-header">
          <span>#</span>
          <span>Player</span>
          <span>Vyèj</span>
        </div>

        {loading && (
          <div className="wtl-empty">Loading…</div>
        )}

        {!loading && data.length === 0 && (
          <div className="wtl-empty">
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>🎯</div>
            No games played yet this week.<br />Be the first King of the Table!
          </div>
        )}

        {data.map((p, i) => (
          <div key={p.id} className={`wtl-row ${i === 0 ? 'wtl-row-king' : ''}`}>
            <span className="wtl-rank">
              {i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
            </span>
            <span className="wtl-name">{p.player_nickname}</span>
            <span className="wtl-wins">{p.wins}</span>
          </div>
        ))}
      </div>

      {/* Prize note */}
      <div className="wtl-prize-note">
        🏆 Weekly King unlocks an exclusive skin — stay tuned!
      </div>
    </div>
  )
}
