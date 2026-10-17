import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import {
  TILE_SKINS, TABLE_SKINS, TILE_UNLOCKS, TABLE_UNLOCKS, TILE_GROUPS, TABLE_GROUPS, groupCards,
  ownedSkins, setEquipped, useEquippedSkins, loadPlayerStats, tableBase, tableVariant, tableLook,
} from '../lib/skins'
import TileFace from '../components/TileFace'
import './Skins.css'
import { InfoButton } from '../components/GameGuide'

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

  // Tiles and Tables are separate tabs (remembered while you're on the site), and
  // the bar holding them and the back button stays pinned to the top as you scroll.
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('dekabess_skins_tab') || 'tiles' } catch { return 'tiles' } })
  function openTab(t) {
    setTab(t)
    try { sessionStorage.setItem('dekabess_skins_tab', t) } catch { /* ignore */ }
    window.scrollTo({ top: 0 })
  }

  // Gemini / Libra: which version each card shows (the equipped one first)
  const [picks, setPicks] = useState({})
  const pickOf = id => picks[id] || (tableBase(equipped.table) === id && tableVariant(equipped.table)) || Object.keys(TABLE_SKINS[id].variants || {})[0] || null
  const valueOf = id => (TABLE_SKINS[id].variants ? `${id}@${pickOf(id)}` : id)
  const choose = (id, v) => {
    setPicks(p => ({ ...p, [id]: v }))
    if (tableBase(equipped.table) === id) setEquipped('table', `${id}@${v}`)      // switch the one in use straight away
  }
  // buying from the shop (the server checks the price and your Goud)
  const [shopMsg, setShopMsg] = useState(null)
  const [buying, setBuying] = useState(null)
  async function buy(c, kind = 'table') {
    if (buying) return
    const item = kind === 'tile' ? `tile:${c.id}` : c.id          // tiles and tables of a sign are separate items
    setBuying(item); setShopMsg(null)
    const { data, error } = await db.rpc('goud_buy', { p_item: item })
    setBuying(null)
    const what = kind === 'tile' ? `${c.label} tiles are` : `The ${c.label} table is`
    const say = { bought: `${what} yours — equip ${kind === 'tile' ? 'them' : 'it'} below.`, owned: 'You already own that.', 'not enough goud': 'Not enough Goud yet — keep playing!', 'not for sale': 'That table isn’t for sale.', 'sign in': 'Sign in to buy from the shop.' }
    setShopMsg({ ok: data === 'bought', text: error ? `Couldn’t buy — ${error.message}` : say[data] || String(data) })
    if (data === 'bought' || data === 'owned') loadPlayerStats().then(setStats)
  }

  const tileCards = TILE_UNLOCKS.map(u => ({
    ...u, label: TILE_SKINS[u.id].label,
    owned: owned.tiles.has(u.id), on: equipped.tile === u.id,
  }))
  const tableCards = TABLE_UNLOCKS.map(u => ({
    ...u, label: TABLE_SKINS[u.id].label, look: tableLook(valueOf(u.id)),
    owned: owned.tables.has(u.id), on: tableBase(equipped.table) === u.id,
  }))

  return (
    <div className="skins-page ui-page">
      <div className="skins-bar">
        <button className="skins-back ui-back" onClick={() => navigate('/')}>← Lobby</button>
        <div className="skins-tabs" role="tablist" aria-label="Skins">
          <button role="tab" aria-selected={tab === 'tiles'} className={tab === 'tiles' ? 'on' : ''} onClick={() => openTab('tiles')}>
            Tiles <span>{owned.tiles.size}/{TILE_UNLOCKS.length}</span>
          </button>
          <button role="tab" aria-selected={tab === 'tables'} className={tab === 'tables' ? 'on' : ''} onClick={() => openTab('tables')}>
            Tables <span>{owned.tables.size}/{TABLE_UNLOCKS.length}</span>
          </button>
        </div>
      </div>

      <div className="skins-head">
        <div>
          <h1>Skins <InfoButton section="skins" label="About skins and the shop" style={{ marginLeft: 10, verticalAlign: 'middle' }} /></h1>
          <p>Earn new tiles and tables by playing. Equip one of each.</p>
        </div>
      </div>

      {shopMsg && <div className={`skins-shop-msg ${shopMsg.ok ? 'ok' : ''}`}>{shopMsg.text}</div>}
      {tab === 'tiles' && groupCards(tileCards, TILE_GROUPS).map(g => (
        <section key={g.label} className="skins-group">
          <h3 className="skins-group-title">{g.label}</h3>
          <div className="skins-grid tiles">
            {g.cards.map(c => (
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
                {!c.owned && c.shop && (
                  <button className="skin-buy wide" disabled={buying === `tile:${c.id}`} onClick={() => buy(c, 'tile')}>
                    {buying === `tile:${c.id}` ? '…' : <><span className="goud-coin" aria-hidden="true">G</span>{c.shop.toLocaleString('en-US')}</>}
                  </button>
                )}
                {!c.owned && !c.shop && <div className="skin-state locked">Locked</div>}
              </div>
            ))}
          </div>
        </section>
      ))}

      {tab === 'tables' && groupCards(tableCards, TABLE_GROUPS).map(g => (
        <section key={g.label} className="skins-group">
          <h3 className="skins-group-title">{g.label}</h3>
          <div className="skins-grid tables">
            {g.cards.map(c => (
              <div key={c.id} className={`skin-card ${c.on ? 'on' : ''} ${c.owned ? '' : 'locked'}`}>
                {c.look.thumb ? (
                  <div className="skin-preview table-art">
                    <img src={c.look.thumb} alt={`${c.label} full table design`} />
                  </div>
                ) : (
                <div className="skin-preview rail" style={{ background: c.look.rail }}>
                  <div className="skin-felt" style={{ background: c.look.felt }}>
                    <div className="preview-tile h small"><TileFace a={2} b={5} vertical={false} /></div>
                    <div className="preview-tile v small"><TileFace a={5} b={5} vertical /></div>
                    <div className="preview-tile h small"><TileFace a={5} b={0} vertical={false} /></div>
                  </div>
                  {!c.owned && <span className="skin-lock"><Lock /></span>}
                </div>
                )}
                {TABLE_SKINS[c.id].variants && (
                  <div className="skin-variants" role="group" aria-label="Version">
                    {Object.entries(TABLE_SKINS[c.id].variants).map(([v, info]) => (
                      <button key={v} className={pickOf(c.id) === v ? 'on' : ''} onClick={() => choose(c.id, v)}>{info.label}</button>
                    ))}
                  </div>
                )}
                <div className="skin-row">
                  <div>
                    <div className="skin-name">{c.label}</div>
                    <div className="skin-note">{c.on ? 'In use' : c.owned ? 'Owned' : c.need}</div>
                  </div>
                  {c.on && <div className="skin-state on compact">Equipped</div>}
                  {!c.on && c.owned && <button className="skin-equip compact" onClick={() => setEquipped('table', valueOf(c.id))}>Equip</button>}
                  {!c.owned && c.shop && (
                    <button className="skin-buy" disabled={buying === c.id} onClick={() => buy(c, 'table')}>
                      {buying === c.id ? '…' : <><span className="goud-coin" aria-hidden="true">G</span>{c.shop.toLocaleString('en-US')}</>}
                    </button>
                  )}
                  {!c.owned && !c.shop && <div className="skin-state locked compact"><Lock /></div>}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}