// ── Skins ────────────────────────────────────────────────────────────────────
// Every tile and table skin, what unlocks it, and which ones the player has
// equipped. Equipping is remembered on this device; what you OWN is worked
// out from your account's stats, so it follows you everywhere.

import { useEffect, useState } from 'react'

const INK   = '#1c1a16'
const WHITE = '#ffffff'
const RING  = '0 0 0 1px rgba(0,0,0,0.45)'

// face(w, h) returns the CSS background for a tile of that shape — a few
// flags need the tile's proportions to draw their diagonals corner to corner.
export const TILE_SKINS = {
  classic:  { label: 'Classic Ivory', face: () => 'linear-gradient(160deg, #fffdf6 0%, #f3ead2 60%, #e6dab9 100%)', edge: '#cdbf98', pip: INK, ring: 'none', divider: 'rgba(60,45,15,0.30)' },
  ebony:    { label: 'Ebony', face: () => 'linear-gradient(160deg, #34312b 0%, #1d1b17 60%, #0f0e0c 100%)', edge: '#000000', pip: '#f2e8d0', ring: 'none', divider: 'rgba(255,255,255,0.16)' },
  jade:     { label: 'Jade', face: () => 'linear-gradient(160deg, #eef8f2 0%, #c9e6d4 60%, #a9d3b9 100%)', edge: '#7fb293', pip: '#12402c', ring: 'none', divider: 'rgba(18,64,44,0.30)' },
  ruby:     { label: 'Ruby', face: () => 'linear-gradient(160deg, #9a1b2e 0%, #6d0f1e 60%, #4a0812 100%)', edge: '#2e0309', pip: '#fbe7c6', ring: 'none', divider: 'rgba(255,230,200,0.22)' },
  gold:     { label: 'Gold', face: () => 'linear-gradient(160deg, #fbefc0 0%, #e3c56f 55%, #b8923a 100%)', edge: '#8c6b22', pip: '#2b2006', ring: 'none', divider: 'rgba(60,40,0,0.30)' },
  marble:   { label: 'Marble', face: () => 'linear-gradient(115deg, #fbfbf9 0%, #fbfbf9 30%, #d9d9d4 33%, #fbfbf9 37%, #f2f2ef 58%, #cfcfca 61%, #f6f6f3 65%, #fbfbf9 100%)', edge: '#bdbdb6', pip: '#23221f', ring: 'none', divider: 'rgba(0,0,0,0.22)' },
  haiti:    { label: 'Haïti', face: () => 'linear-gradient(180deg, #00209F 0%, #00209F 50%, #D21034 50%, #D21034 100%)', edge: '#0a0f3a', pip: WHITE, ring: RING, divider: 'rgba(255,255,255,0.65)' },
  quebec:   { label: 'Québec', face: () => 'linear-gradient(90deg, transparent 42%, #ffffff 42%, #ffffff 58%, transparent 58%), linear-gradient(0deg, transparent 45%, #ffffff 45%, #ffffff 55%, transparent 55%), #003DA5', edge: '#00205e', pip: WHITE, ring: RING, divider: 'rgba(0,0,0,0.25)' },
  jamaica:  { label: 'Jamaica', face: (w, h) => {
      const a = Math.atan(w / h) * 180 / Math.PI
      return 'linear-gradient(to top right, transparent 44%, #FED100 44%, #FED100 56%, transparent 56%), ' +
             'linear-gradient(to top left, transparent 44%, #FED100 44%, #FED100 56%, transparent 56%), ' +
             `conic-gradient(#009B3A 0deg ${a}deg, #000000 ${a}deg ${180 - a}deg, #009B3A ${180 - a}deg ${180 + a}deg, #000000 ${180 + a}deg ${360 - a}deg, #009B3A ${360 - a}deg)`
    }, edge: '#05230f', pip: WHITE, ring: RING, divider: 'rgba(0,0,0,0.35)' },
  trinidad: { label: 'Trinidad & Tobago', face: () => 'linear-gradient(to top right, #CE1126 0%, #CE1126 36%, #ffffff 36%, #ffffff 40%, #000000 40%, #000000 60%, #ffffff 60%, #ffffff 64%, #CE1126 64%, #CE1126 100%)', edge: '#4a0610', pip: WHITE, ring: RING, divider: 'rgba(255,255,255,0.4)' },
  dominican:{ label: 'Dominican Rep.', face: () => 'linear-gradient(90deg, transparent 45%, #ffffff 45%, #ffffff 55%, transparent 55%), linear-gradient(0deg, transparent 46%, #ffffff 46%, #ffffff 54%, transparent 54%), conic-gradient(#CE1126 0deg 90deg, #002D62 90deg 180deg, #CE1126 180deg 270deg, #002D62 270deg 360deg)', edge: '#0d1b33', pip: WHITE, ring: RING, divider: 'rgba(0,0,0,0.25)' },
  france:   { label: 'France', face: () => 'linear-gradient(90deg, #0055A4 0%, #0055A4 33.3%, #ffffff 33.3%, #ffffff 66.6%, #EF4135 66.6%, #EF4135 100%)', edge: '#22304d', pip: WHITE, ring: '0 0 0 1px rgba(0,0,0,0.6)', divider: 'rgba(0,0,0,0.25)' },
}

const VIGNETTE = 'radial-gradient(ellipse at 50% 42%, rgba(255,255,255,0.07) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.5) 100%)'
const GRAIN    = 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.035) 1px, transparent 1px) 0 0 / 4px 4px'
const WOOD     = 'repeating-linear-gradient(92deg, rgba(0,0,0,0.10) 0px, rgba(0,0,0,0.10) 2px, transparent 2px, transparent 9px), linear-gradient(180deg, #6b3d1d 0%, #4a2913 55%, #2f190b 100%)'
const JA = 63   // the table is wider than tall: Jamaica's diagonals at ~63°

export const TABLE_SKINS = {
  green:    { label: 'Classic Felt', felt: `${VIGNETTE}, ${GRAIN}, #1f4a2c`, rail: WOOD },
  midnight: { label: 'Midnight', felt: `${VIGNETTE}, ${GRAIN}, #17325e`, rail: WOOD },
  burgundy: { label: 'Burgundy', felt: `${VIGNETTE}, ${GRAIN}, #5a1424`, rail: WOOD },
  slate:    { label: 'Slate', felt: `${VIGNETTE}, ${GRAIN}, #2c3236`, rail: 'linear-gradient(180deg, #2a2a2a 0%, #141414 100%)' },
  mahogany: { label: 'Mahogany', felt: `${VIGNETTE}, repeating-linear-gradient(90deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 2px, transparent 2px, transparent 11px), linear-gradient(180deg, #7a4423 0%, #5b3018 100%)`, rail: 'linear-gradient(180deg, #2b1a0c 0%, #150c05 100%)' },
  haiti:    { label: 'Haïti', felt: `${VIGNETTE}, ${GRAIN}, linear-gradient(180deg, #14307e 0%, #14307e 50%, #8c1229 50%, #8c1229 100%)`, rail: WOOD },
  jamaica:  { label: 'Jamaica', felt: `${VIGNETTE}, ${GRAIN}, linear-gradient(to top right, transparent 48%, #b89a12 48%, #b89a12 52%, transparent 52%), linear-gradient(to top left, transparent 48%, #b89a12 48%, #b89a12 52%, transparent 52%), conic-gradient(#0d5a2a 0deg ${JA}deg, #111111 ${JA}deg ${180 - JA}deg, #0d5a2a ${180 - JA}deg ${180 + JA}deg, #111111 ${180 + JA}deg ${360 - JA}deg, #0d5a2a ${360 - JA}deg)`, rail: WOOD },
  quebec:   { label: 'Québec', felt: `${VIGNETTE}, ${GRAIN}, linear-gradient(90deg, transparent 47%, rgba(255,255,255,0.55) 47%, rgba(255,255,255,0.55) 53%, transparent 53%), linear-gradient(0deg, transparent 45%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0.55) 55%, transparent 55%), #12357a`, rail: WOOD },
}

// ── What unlocks what ────────────────────────────────────────────────────────
// s = { games, vyej, dekabess, tournaments, chapters: [completed chapter ids] }
const ch = n => s => (s.chapters || []).includes(n)
export const TILE_UNLOCKS = [
  { id: 'classic',   free: true },
  { id: 'ebony',     free: true },
  { id: 'haiti',     free: true },
  { id: 'jade',      need: 'Beat Story chapter 3',  test: ch(3) },
  { id: 'ruby',      need: 'Win a Vyèj',            test: s => s.vyej >= 1 },
  { id: 'gold',      need: 'Win a tournament',      test: s => s.tournaments >= 1 },
  { id: 'marble',    need: 'Finish Story Mode',     test: ch(18) },
  { id: 'quebec',    need: 'Win 10 matches',        test: s => s.vyej >= 10 },
  { id: 'jamaica',   need: 'Win 15 matches',        test: s => s.vyej >= 15 },
  { id: 'trinidad',  need: 'Score 10 Dekabess',     test: s => s.dekabess >= 10 },
  { id: 'dominican', need: 'Win 3 tournaments',     test: s => s.tournaments >= 3 },
  { id: 'france',    need: 'Play 50 matches',       test: s => s.games >= 50 },
]
export const TABLE_UNLOCKS = [
  { id: 'green',    free: true },
  { id: 'midnight', free: true },
  { id: 'burgundy', need: 'Win 5 matches',         test: s => s.vyej >= 5 },
  { id: 'slate',    need: 'Beat Story chapter 6',  test: ch(6) },
  { id: 'mahogany', need: 'Beat Story chapter 12', test: ch(12) },
  { id: 'haiti',    need: 'Win a tournament',      test: s => s.tournaments >= 1 },
  { id: 'jamaica',  need: 'Win 25 matches',        test: s => s.vyej >= 25 },
  { id: 'quebec',   need: 'Win 10 matches',        test: s => s.vyej >= 10 },
]

export function ownedSkins(stats) {
  const s = stats || {}
  const owns = list => new Set(list.filter(u => u.free || (u.test && u.test(s))).map(u => u.id))
  return { tiles: owns(TILE_UNLOCKS), tables: owns(TABLE_UNLOCKS) }
}

// ── Equipped skins (remembered on this device) ──────────────────────────────
const KEY = 'dekabess_skins'
const EVENT = 'dekabess-skins'

export function getEquipped() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') || {}
    return {
      tile:  TILE_SKINS[v.tile]   ? v.tile  : 'classic',
      table: TABLE_SKINS[v.table] ? v.table : 'green',
    }
  } catch { return { tile: 'classic', table: 'green' } }
}

export function setEquipped(kind, id) {
  const cur = getEquipped()
  const next = { ...cur, [kind]: id }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
  applyTableSkin(next.table)
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }))
}

// The table is painted through two CSS variables, so every screen that shows
// the board picks it up without knowing about skins.
export function applyTableSkin(id) {
  const t = TABLE_SKINS[id] || TABLE_SKINS.green
  const root = document.documentElement
  root.style.setProperty('--table-felt', t.felt)
  root.style.setProperty('--table-rail', t.rail)
}

// Components that draw tiles use this, so equipping a skin repaints them.
export function useEquippedSkins() {
  const [eq, setEq] = useState(getEquipped)
  useEffect(() => {
    const on = e => setEq(e.detail || getEquipped())
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return eq
}

// paint the equipped table as soon as the app loads
if (typeof window !== 'undefined') applyTableSkin(getEquipped().table)
