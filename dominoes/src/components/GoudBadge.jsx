import { useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { loadPlayerStats } from '../lib/skins'
import { TROPHIES } from '../lib/trophies'
import './Goud.css'
import GoudCoin from './GoudCoin'

// ── Goud in the lobby ────────────────────────────────────────────────────────
// Shows your balance. On opening it collects today's bonus and pays any
// trophies not yet paid for (the server pays each trophy only once; this
// device remembers which it has already asked about, to save requests), then
// shows what was added.

export const fmtGoud = n => Number(n || 0).toLocaleString('en-US')

export default function GoudBadge() {
  const [balance, setBalance] = useState(null)
  const [gain, setGain] = useState('')

  useEffect(() => {
    let off = false
    ;(async () => {
      const { data: auth } = await db.auth.getUser()
      const uid = auth?.user?.id
      if (!uid) return
      const read = async () => { const { data } = await db.rpc('goud_status'); return Array.isArray(data) ? data[0] : data }
      let row = await read()
      if (!row) return
      if (!off) setBalance(row.balance)
      const gained = []
      let added = 0
      if (row.daily_available) {
        const { data: d } = await db.rpc('goud_claim_daily')
        if (d > 0) { added += d; gained.push(`+${fmtGoud(d)} daily bonus`) }
      }
      // trophies earned but not yet paid for
      const key = `goud-trophies-${uid}`
      let asked = []
      try { asked = JSON.parse(localStorage.getItem(key) || '[]') } catch { /* ignore */ }
      try {
        const stats = await loadPlayerStats()
        const fresh = TROPHIES.filter(t => !asked.includes(t.id) && t.test(stats))
        let paid = 0
        for (const t of fresh) {
          const { data: a, error } = await db.rpc('goud_trophy', { p_trophy: t.id })
          if (error) continue                       // try again next time
          paid += a || 0
          asked.push(t.id)
        }
        try { localStorage.setItem(key, JSON.stringify(asked)) } catch { /* ignore */ }
        if (paid) { added += paid; gained.push(`+${fmtGoud(paid)} for trophies`) }
      } catch { /* stats unavailable: next time */ }
      if (added) row = (await read()) || row
      if (off) return
      setBalance(row.balance)
      if (gained.length) { setGain(gained.join(' · ')); setTimeout(() => !off && setGain(''), 5000) }
    })()
    return () => { off = true }
  }, [])

  if (balance == null) return null
  return (
    <div className="goud-badge" title="Goud — earned by playing">
      <GoudCoin />{fmtGoud(balance)}
      {gain && <div className="goud-gain">{gain}</div>}
    </div>
  )
}

// ── Goud on the Profile page: balance and recent earnings ───────────────────
const LABEL = { start: 'Welcome bonus', daily: 'Daily bonus', round: 'Round won', match: 'Match won (Vyèj)',
  trophy: 'Trophy', challenge: 'Challenge beaten', wa_tab_la: 'Wa Tab La — King of the week' }

export function GoudPanel() {
  const [balance, setBalance] = useState(null)
  const [rows, setRows] = useState([])
  useEffect(() => {
    db.rpc('goud_status').then(({ data }) => { const r = Array.isArray(data) ? data[0] : data; if (r) setBalance(r.balance) })
    db.rpc('goud_history', { p_limit: 15 }).then(({ data }) => setRows(data || []))
  }, [])
  if (balance == null) return null
  return (
    <div className="goud-panel">
      <div className="goud-panel-head">
        <span>Goud</span>
        <strong><GoudCoin />{fmtGoud(balance)}</strong>
      </div>
      <p className="goud-panel-how">Earned by playing: rounds and matches won against people or expert AIs, trophies, the Challenge and Wa Tab La — plus a daily bonus.</p>
      {rows.map((r, i) => (
        <div key={i} className="goud-row">
          <span>{LABEL[r.reason] || r.reason}{r.reason === 'trophy' && r.ref ? ` — ${TROPHIES.find(t => t.id === r.ref)?.kreyol || r.ref}` : ''}</span>
          <span className={r.amount >= 0 ? 'goud-plus' : 'goud-minus'}>{r.amount >= 0 ? '+' : ''}{fmtGoud(r.amount)}</span>
        </div>
      ))}
    </div>
  )
}
