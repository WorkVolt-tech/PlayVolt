import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { TABLE_SKINS, wtlPrize, weekStartUTC } from '../lib/skins'
import './WaTabLa.css'

// One row per player: a signed-in player's wins from every device are added
// together (guests, with no account, count per device). The name shown is the
// one from the device with the most wins.
export function mergeByAccount(rows) {
  const by = new Map()
  for (const r of rows || []) {
    const key = r.user_id ? `u:${r.user_id}` : `d:${r.player_id}`
    const cur = by.get(key)
    if (!cur) by.set(key, { ...r, best: r.wins })
    else {
      if (r.wins > cur.best) { cur.player_nickname = r.player_nickname; cur.best = r.wins }
      cur.wins += r.wins
    }
  }
  return [...by.values()].sort((a, b) => b.wins - a.wins).slice(0, 20)
}

function getTimeUntilReset() {
  const now = new Date()
  const nextMonday = weekStartUTC(now).getTime() + 7 * 86400000
  const diff = nextMonday - now.getTime()
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
  const [timeLeft, setTimeLeft] = useState(getTimeUntilReset())

  const load = useCallback(async () => {
    setLoading(true)
    // award any finished weeks' prize tables before showing this week
    try { await db.rpc('settle_wa_tab_la') } catch { /* ignore */ }
    const week = weekStartUTC().toISOString().slice(0, 10)
    const [s, t] = await Promise.all([
      db.from('wa_tab_la').select('*').eq('mode', 'solo').eq('week_start', week).order('wins', { ascending: false }).limit(200),
      db.from('wa_tab_la').select('*').eq('mode', 'teams').eq('week_start', week).order('wins', { ascending: false }).limit(200),
    ])
    setSolo(mergeByAccount(s.data))
    setTeams(mergeByAccount(t.data))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(() => setTimeLeft(getTimeUntilReset()), 60000)
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

      {/* This week's prize: an exclusive table, on a rotation */}
      {(() => {
        const now = wtlPrize()
        const next = wtlPrize(new Date(weekStartUTC().getTime() + 7 * 86400000))
        return (
          <div className="wtl-prize">
            <div className="wtl-prize-label">This week's prize</div>
            <img className="wtl-prize-img" src={TABLE_SKINS[now].thumb} alt="" />
            <div className="wtl-prize-name">{TABLE_SKINS[now].label} table</div>
            <p className="wtl-prize-how">
              Finish the week as #1 — on the solo or the teams board — and this table is yours for good.
              Ties for #1 all win it. You need to be signed in to receive it.
            </p>
            <div className="wtl-prize-next">Next week: {TABLE_SKINS[next].label}</div>
          </div>
        )
      })()}
    </div>
  )
}
