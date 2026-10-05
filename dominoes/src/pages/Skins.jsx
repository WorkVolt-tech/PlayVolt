import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import {
  TILE_SKINS, TABLE_SKINS, TILE_UNLOCKS, TABLE_UNLOCKS,
  ownedSkins, setEquipped, useEquippedSkins, loadPlayerStats,
} from '../lib/skins'
import TileFace from '../components/TileFace'
import './Skins.css'

// ── Skins ────────────────────────────────────────────────────────────────────
// Every tile and table skin. What you own comes from your account's stats
// (matches, Vyèj, Dekabess, tournament wins, Story chapters), so unlocks
// follow you between devices. Guests start with the free skins.

function Lock() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

export default function Skins() {
  const navigate = useNavigate()
  const equipped = useEquippedSkins()
  const [stats, setStats] = useState(null)

  // the same stats the trophies read (including clean rounds and comebacks)
  useEffect(() => { loadPlayerStats().then(setStats) }, [])

  const owned = ownedSkins(stats)

  const tileCards = TILE_UNLOCKS.map(u => ({
    ...u, label: TILE_SKINS[u.id].label,
    owned: owned.tiles.has(u.id), on: equipped.tile === u.id,
  }))
  const tableCards = TABLE_UNLOCKS.map(u => ({
    ...u, label: TABLE_SKINS[u.id].label, look: TABLE_SKINS[u.id],
    owned: owned.tables.has(u.id), on: equipped.table === u.id,
  }))

  return (
    <div className="skins-page">
      <div className="skins-head">
        <div>
          <button className="skins-back" onClick={() => navigate('/')}>← Lobby</button>
          <h1>Skins</h1>
          <p>Earn new tiles and tables by playing. Equip one of each.</p>
        </div>
        <div className="skins-count">
          <span><strong>{owned.tiles.size}</strong> / {TILE_UNLOCKS.length} tiles</span>
          <span><strong>{owned.tables.size}</strong> / {TABLE_UNLOCKS.length} tables</span>
        </div>
      </div>

      <h2 className="skins-section">Tiles</h2>
      <div className="skins-grid tiles">
        {tileCards.map(c => (
          <div key={c.id} className={`skin-card ${c.on ? 'on' : ''} ${c.owned ? '' : 'locked'}`}>
            <div className="skin-preview felt">
              <div className="skin-tiles">
                <div className="preview-tile v"><TileFace a={6} b={3} vertical skin={c.id} /></div>
                <div className="preview-tile h"><TileFace a={5} b={1} vertical={false} skin={c.id} /></div>
              </div>
              {!c.owned && <span className="skin-lock"><Lock /></span>}
            </div>
            <div className="skin-name">{c.label}</div>
            <div className="skin-note">{c.on ? 'In use' : c.owned ? 'Owned' : c.need}</div>
            {c.on && <div className="skin-state on">Equipped</div>}
            {!c.on && c.owned && <button className="skin-equip" onClick={() => setEquipped('tile', c.id)}>Equip</button>}
            {!c.owned && <div className="skin-state locked">Locked</div>}
          </div>
        ))}
      </div>

      <h2 className="skins-section">Tables</h2>
      <div className="skins-grid tables">
        {tableCards.map(c => (
          <div key={c.id} className={`skin-card ${c.on ? 'on' : ''} ${c.owned ? '' : 'locked'}`}>
            <div className="skin-preview rail" style={{ background: c.look.rail }}>
              <div className="skin-felt" style={{ background: c.look.felt }}>
                <div className="preview-tile h small"><TileFace a={2} b={5} vertical={false} /></div>
                <div className="preview-tile v small"><TileFace a={5} b={5} vertical /></div>
                <div className="preview-tile h small"><TileFace a={5} b={0} vertical={false} /></div>
              </div>
              {!c.owned && <span className="skin-lock"><Lock /></span>}
            </div>
            <div className="skin-row">
              <div>
                <div className="skin-name">{c.label}</div>
                <div className="skin-note">{c.on ? 'In use' : c.owned ? 'Owned' : c.need}</div>
              </div>
              {c.on && <div className="skin-state on compact">Equipped</div>}
              {!c.on && c.owned && <button className="skin-equip compact" onClick={() => setEquipped('table', c.id)}>Equip</button>}
              {!c.owned && <div className="skin-state locked compact"><Lock /></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
