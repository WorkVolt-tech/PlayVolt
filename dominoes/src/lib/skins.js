// ── Skins ────────────────────────────────────────────────────────────────────
// Every tile and table skin, what unlocks it, and which ones the player has
// equipped. Equipping is remembered on this device; what you OWN is worked
// out from your account's stats, so it follows you everywhere.

import { useEffect, useState } from 'react'
import { db } from './supabase'
import { TROPHIES } from './trophies'

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
  haiti:    { label: 'Haïti', face: () => 'linear-gradient(180deg, #00209F 0%, #00209F 50%, #D21034 50%, #D21034 100%)', edge: '#0a0f3a', pip: WHITE, ring: RING, divider: 'rgba(255,255,255,0.65)' , flag: true, emblem: 'haiti', flagArt: 'linear-gradient(180deg, #00209F 0%, #00209F 50%, #D21034 50%, #D21034 100%)', pipStroke: '#000000', pipStrokeW: 6 },
  quebec:   { label: 'Québec', face: () => 'linear-gradient(90deg, transparent 42%, #ffffff 42%, #ffffff 58%, transparent 58%), linear-gradient(0deg, transparent 45%, #ffffff 45%, #ffffff 55%, transparent 55%), #003DA5', edge: '#00205e', pip: WHITE, ring: RING, divider: 'rgba(0,0,0,0.25)' , flag: true, emblem: 'quebec', flagArt: 'linear-gradient(90deg, transparent 43%, #ffffff 43%, #ffffff 57%, transparent 57%), linear-gradient(0deg, transparent 40%, #ffffff 40%, #ffffff 60%, transparent 60%), #003DA5', pipStroke: '#000000', pipStrokeW: 6 },
  jamaica:  { label: 'Jamaica', face: (w, h) => {
      const a = Math.atan(w / h) * 180 / Math.PI
      return 'linear-gradient(to top right, transparent 44%, #FED100 44%, #FED100 56%, transparent 56%), ' +
             'linear-gradient(to top left, transparent 44%, #FED100 44%, #FED100 56%, transparent 56%), ' +
             `conic-gradient(#009B3A 0deg ${a}deg, #000000 ${a}deg ${180 - a}deg, #009B3A ${180 - a}deg ${180 + a}deg, #000000 ${180 + a}deg ${360 - a}deg, #009B3A ${360 - a}deg)`
    }, edge: '#05230f', pip: WHITE, ring: RING, divider: 'rgba(0,0,0,0.35)' , flag: true, flagArt: 'linear-gradient(to top right, transparent 44%, #FED100 44%, #FED100 56%, transparent 56%), linear-gradient(to top left, transparent 44%, #FED100 44%, #FED100 56%, transparent 56%), conic-gradient(#009B3A 0deg 56.3deg, #000000 56.3deg 123.7deg, #009B3A 123.7deg 236.3deg, #000000 236.3deg 303.7deg, #009B3A 303.7deg)', pipStroke: '#000000', pipStrokeW: 6 },
  trinidad: { label: 'Trinidad & Tobago', face: () => 'linear-gradient(to top right, #CE1126 0%, #CE1126 36%, #ffffff 36%, #ffffff 40%, #000000 40%, #000000 60%, #ffffff 60%, #ffffff 64%, #CE1126 64%, #CE1126 100%)', edge: '#4a0610', pip: WHITE, ring: RING, divider: 'rgba(255,255,255,0.4)' , flag: true, flagArt: 'linear-gradient(to top right, #CE1126 0%, #CE1126 36%, #ffffff 36%, #ffffff 40%, #000000 40%, #000000 60%, #ffffff 60%, #ffffff 64%, #CE1126 64%, #CE1126 100%)', pipStroke: '#000000', pipStrokeW: 6 },
  dominican:{ label: 'Dominican Rep.', face: () => 'linear-gradient(90deg, transparent 45%, #ffffff 45%, #ffffff 55%, transparent 55%), linear-gradient(0deg, transparent 46%, #ffffff 46%, #ffffff 54%, transparent 54%), conic-gradient(#CE1126 0deg 90deg, #002D62 90deg 180deg, #CE1126 180deg 270deg, #002D62 270deg 360deg)', edge: '#0d1b33', pip: WHITE, ring: RING, divider: 'rgba(0,0,0,0.25)' , flag: true, emblem: 'dominican', flagArt: 'linear-gradient(90deg, transparent 45%, #ffffff 45%, #ffffff 55%, transparent 55%), linear-gradient(0deg, transparent 43%, #ffffff 43%, #ffffff 57%, transparent 57%), conic-gradient(#CE1126 0deg 90deg, #002D62 90deg 180deg, #CE1126 180deg 270deg, #002D62 270deg 360deg)', pipStroke: '#000000', pipStrokeW: 6 },
  // ── colours ──
  amethyst: { label: 'Amethyst', face: () => 'linear-gradient(160deg, #a77ae6 0%, #7444c0 55%, #4b2287 100%)', edge: '#2e1257', pip: '#f6efff', ring: 'none', divider: 'rgba(255,255,255,0.25)' },
  lavender: { label: 'Lavender', face: () => 'linear-gradient(160deg, #f6f0ff 0%, #ddcdf8 55%, #c3aaee 100%)', edge: '#9a80c9', pip: '#3a1f6b', ring: 'none', divider: 'rgba(58,31,107,0.28)' },
  rose:     { label: 'Rose', face: () => 'linear-gradient(160deg, #ffe3ee 0%, #f9b3cf 55%, #ee86b0 100%)', edge: '#c55d8a', pip: '#5a1030', ring: 'none', divider: 'rgba(90,16,48,0.28)' },
  fuchsia:  { label: 'Fuchsia', face: () => 'linear-gradient(160deg, #ff6fb5 0%, #e0258c 55%, #a8106a 100%)', edge: '#5e0a3c', pip: '#ffffff', ring: 'none', divider: 'rgba(255,255,255,0.3)' },
  ocean:    { label: 'Ocean', face: () => 'linear-gradient(160deg, #5cc0e8 0%, #2a86c0 55%, #155b8a 100%)', edge: '#0b3553', pip: '#ffffff', ring: 'none', divider: 'rgba(255,255,255,0.3)' },
  sunset:   { label: 'Sunset', face: () => 'linear-gradient(180deg, #ffc35c 0%, #ff8a4c 50%, #ff4f7b 100%)', edge: '#8f2a3a', pip: '#2a0f05', ring: 'none', divider: 'rgba(42,15,5,0.3)' },
  // ── fluorescent ──
  neonGreen:  { label: 'Neon Green', face: () => 'linear-gradient(160deg, #7dff5c 0%, #39ff14 55%, #22d10a 100%)', edge: '#127a05', pip: '#0b0b0b', ring: 'none', divider: 'rgba(0,0,0,0.3)' },
  neonPink:   { label: 'Neon Pink', face: () => 'linear-gradient(160deg, #ff7ae4 0%, #ff2fd0 55%, #d40fae 100%)', edge: '#6e0558', pip: '#0b0b0b', ring: 'none', divider: 'rgba(0,0,0,0.3)' },
  neonOrange: { label: 'Neon Orange', face: () => 'linear-gradient(160deg, #ffb066 0%, #ff7a00 55%, #e05e00 100%)', edge: '#7a3300', pip: '#0b0b0b', ring: 'none', divider: 'rgba(0,0,0,0.3)' },
  neonYellow: { label: 'Neon Yellow', face: () => 'linear-gradient(160deg, #fbff8a 0%, #f2ff1f 55%, #d6e600 100%)', edge: '#7a8200', pip: '#0b0b0b', ring: 'none', divider: 'rgba(0,0,0,0.3)' },
  neonBlue:   { label: 'Electric Blue', face: () => 'linear-gradient(160deg, #7af3ff 0%, #00e5ff 55%, #00b3d6 100%)', edge: '#006070', pip: '#001a33', ring: 'none', divider: 'rgba(0,0,0,0.3)' },
  glow:       { label: 'Glow', face: () => 'linear-gradient(160deg, #1d1d26 0%, #101016 60%, #07070a 100%)', edge: '#39ff14', pip: '#39ff14', ring: 'none', divider: 'rgba(57,255,20,0.35)' },
  // ── logo themes ──
  dekabess: { label: 'Dekabess', face: () => 'linear-gradient(160deg, #24211b 0%, #141310 60%, #0a0908 100%)', edge: '#c9a84c', pip: '#e8c96a', ring: 'none', divider: 'rgba(201,168,76,0.55)' },
  playvolt: { label: 'PlayVolt', face: () => 'linear-gradient(160deg, #9c84ff 0%, #7c5cfc 55%, #4b2fc9 100%)', edge: '#22106e', pip: '#ffffff', ring: 'none', divider: 'rgba(255,255,255,0.3)' },
  // ── trophy rewards ──
  kafe:     { label: 'Kafe', face: () => 'linear-gradient(160deg, #a77b55 0%, #7a5233 55%, #4e3220 100%)', edge: '#2e1c10', pip: '#f6ead8', ring: 'none', divider: 'rgba(246,234,216,0.25)' },
  kanaval:  { label: 'Kanaval', face: () => 'radial-gradient(circle at 18% 22%, #ff4f7b 0 4%, transparent 4.6%), radial-gradient(circle at 78% 14%, #ffd23f 0 3.6%, transparent 4.2%), radial-gradient(circle at 34% 58%, #3fb7ff 0 3.4%, transparent 4%), radial-gradient(circle at 84% 52%, #3ddc84 0 3.6%, transparent 4.2%), radial-gradient(circle at 14% 88%, #b06cff 0 3.8%, transparent 4.4%), radial-gradient(circle at 66% 90%, #ff8c42 0 3.4%, transparent 4%), linear-gradient(160deg, #fffaf0 0%, #f6edd8 100%)', edge: '#cdbf98', pip: '#1c1a16', ring: 'none', divider: 'rgba(60,45,15,0.30)' },
  pearl:    { label: 'Pearl', face: () => 'linear-gradient(135deg, #ffffff 0%, #f3eef8 28%, #e8f5f5 52%, #fbf1e6 76%, #ffffff 100%)', edge: '#c9c3d6', pip: '#2a2a35', ring: 'none', divider: 'rgba(42,42,53,0.25)' },
  obsidian: { label: 'Obsidian', face: () => 'linear-gradient(115deg, transparent 38%, rgba(255,255,255,0.12) 47%, transparent 56%), linear-gradient(160deg, #3a3a44 0%, #15151b 45%, #050507 100%)', edge: '#000000', pip: '#dfe2ee', ring: 'none', divider: 'rgba(255,255,255,0.18)' },
  krisal:   { label: 'Krisal', face: () => 'linear-gradient(135deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.65) 9%, transparent 9%, transparent 52%, rgba(255,255,255,0.35) 52%, rgba(255,255,255,0.35) 57%, transparent 57%), linear-gradient(160deg, #eefaff 0%, #a9dcf5 55%, #6fbbe6 100%)', edge: '#3d86b0', pip: '#0b2a40', ring: 'none', divider: 'rgba(11,42,64,0.25)' },
  phoenix:  { label: 'Phoenix', face: () => 'linear-gradient(180deg, #ffd166 0%, #ff8c42 38%, #e63946 72%, #7a0f2a 100%)', edge: '#4a0612', pip: '#ffffff', ring: RING, divider: 'rgba(0,0,0,0.25)', pipStroke: '#000000', pipStrokeW: 6 },
  // ── flags ──
  // Drawn so the flag reads correctly on a tile lying sideways — the way most
  // tiles sit on the table — with the canton top-left.
  usa:      { label: 'USA', face: () => 'linear-gradient(#3C3B6E, #3C3B6E) 100% 0 / 53.85% 40% no-repeat, repeating-linear-gradient(90deg, #B22234 0%, #B22234 7.69%, #ffffff 7.69%, #ffffff 15.38%)', edge: '#1c1b3a', pip: WHITE, ring: '0 0 0 1px rgba(0,0,0,0.6)', divider: 'rgba(0,0,0,0.25)' , flag: true, emblem: 'usa', flagArt: 'linear-gradient(#3C3B6E, #3C3B6E) 0 0 / 40% 53.85% no-repeat, repeating-linear-gradient(180deg, #B22234 0%, #B22234 7.69%, #ffffff 7.69%, #ffffff 15.38%)', pipStroke: '#000000', pipStrokeW: 6 },
  france:   { label: 'France', face: () => 'linear-gradient(90deg, #0055A4 0%, #0055A4 33.3%, #ffffff 33.3%, #ffffff 66.6%, #EF4135 66.6%, #EF4135 100%)', edge: '#22304d', pip: WHITE, ring: '0 0 0 1px rgba(0,0,0,0.6)', divider: 'rgba(0,0,0,0.25)' , flag: true, flagArt: 'linear-gradient(90deg, #0055A4 0%, #0055A4 33.3%, #ffffff 33.3%, #ffffff 66.6%, #EF4135 66.6%, #EF4135 100%)', pipStroke: '#000000', pipStrokeW: 6 },
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
  purple:   { label: 'Purple', felt: `${VIGNETTE}, ${GRAIN}, #3b1d63`, rail: WOOD },
  pink:     { label: 'Pink', felt: `${VIGNETTE}, ${GRAIN}, #8a3361`, rail: WOOD },
  ocean:    { label: 'Ocean', felt: `${VIGNETTE}, ${GRAIN}, #0f4c5c`, rail: WOOD },
  neon:     { label: 'Neon', felt: `${VIGNETTE}, linear-gradient(rgba(0,229,255,0.07) 1px, transparent 1px) 0 0 / 26px 26px, linear-gradient(90deg, rgba(0,229,255,0.07) 1px, transparent 1px) 0 0 / 26px 26px, #0b0b12`, rail: 'linear-gradient(180deg, #2bf0ff 0%, #00a3b8 100%)' },
  dekabess: { label: 'Dekabess', felt: `${VIGNETTE}, linear-gradient(rgba(12,11,9,0.55), rgba(12,11,9,0.55)), url(/dekabess_logo.webp) center / 42% auto no-repeat, #151310`, rail: 'linear-gradient(180deg, #e3c56f 0%, #c9a84c 45%, #7a5f22 100%)' },
  playvolt: { label: 'PlayVolt', felt: `${VIGNETTE}, ${GRAIN}, #2a1b5e`, rail: 'linear-gradient(180deg, #7c5cfc 0%, #4b2fc9 100%)' },
  usa:      { label: 'USA', felt: `${VIGNETTE}, linear-gradient(#1f2350, #1f2350) 0 0 / 40% 53.85% no-repeat, repeating-linear-gradient(180deg, #6e1520 0%, #6e1520 7.69%, #8a847a 7.69%, #8a847a 15.38%)`, rail: WOOD },
  krisal:   { label: 'Krisal', felt: `${VIGNETTE}, linear-gradient(125deg, transparent 30%, rgba(255,255,255,0.07) 40%, transparent 50%, transparent 62%, rgba(255,255,255,0.05) 70%, transparent 78%), ${GRAIN}, #1d5f7a`, rail: 'linear-gradient(180deg, #d9eef8 0%, #8fbfd8 50%, #4d86a6 100%)' },
  kanaval:  { label: 'Kanaval', felt: `${VIGNETTE}, radial-gradient(circle, rgba(255,79,123,0.55) 0 2px, transparent 2.6px) 0 0 / 46px 46px, radial-gradient(circle, rgba(255,210,63,0.5) 0 2px, transparent 2.6px) 23px 15px / 46px 46px, radial-gradient(circle, rgba(63,183,255,0.5) 0 2px, transparent 2.6px) 11px 31px / 46px 46px, #4a2370`, rail: WOOD },
  phoenix:  { label: 'Phoenix', felt: `radial-gradient(ellipse at 50% 108%, rgba(255,140,66,0.45) 0%, rgba(230,57,70,0.18) 35%, transparent 62%), ${VIGNETTE}, ${GRAIN}, #34090c`, rail: 'linear-gradient(180deg, #ff9d4d 0%, #c2410c 50%, #6b1405 100%)' },
  lakou:    { label: 'Lakou', felt: `${VIGNETTE}, linear-gradient(rgba(0,0,0,0.16) 1.5px, transparent 1.5px) 0 0 / 44px 44px, linear-gradient(90deg, rgba(0,0,0,0.16) 1.5px, transparent 1.5px) 0 0 / 44px 44px, linear-gradient(180deg, #a85a34 0%, #8a4424 100%)`, rail: WOOD },
  haiti:    { label: 'Haïti', felt: `${VIGNETTE}, ${GRAIN}, linear-gradient(180deg, #14307e 0%, #14307e 50%, #8c1229 50%, #8c1229 100%)`, rail: WOOD },
  jamaica:  { label: 'Jamaica', felt: `${VIGNETTE}, ${GRAIN}, linear-gradient(to top right, transparent 48%, #b89a12 48%, #b89a12 52%, transparent 52%), linear-gradient(to top left, transparent 48%, #b89a12 48%, #b89a12 52%, transparent 52%), conic-gradient(#0d5a2a 0deg ${JA}deg, #111111 ${JA}deg ${180 - JA}deg, #0d5a2a ${180 - JA}deg ${180 + JA}deg, #111111 ${180 + JA}deg ${360 - JA}deg, #0d5a2a ${360 - JA}deg)`, rail: WOOD },
  quebec:   { label: 'Québec', felt: `${VIGNETTE}, ${GRAIN}, linear-gradient(90deg, transparent 47%, rgba(255,255,255,0.55) 47%, rgba(255,255,255,0.55) 53%, transparent 53%), linear-gradient(0deg, transparent 45%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0.55) 55%, transparent 55%), #12357a`, rail: WOOD },
}

// ── What unlocks what ────────────────────────────────────────────────────────
// A few skins are free. Every other skin is a trophy's reward, and its unlock
// rule is that trophy's — built from trophies.js, so the two never disagree.
const FREE_TILES  = ['classic', 'ebony', 'haiti', 'lavender', 'rose']
const FREE_TABLES = ['green', 'midnight']

function unlocksFor(kind, free, ids) {
  return ids.map(id => {
    if (free.includes(id)) return { id, free: true }
    const t = TROPHIES.find(tr => (tr.rewards?.[kind] || []).includes(id))
    return t
      ? { id, trophy: t.id, need: `${t.kreyol} trophy — ${t.desc}`, test: t.test }
      : { id, need: 'Coming soon', test: () => false }
  })
}
export const TILE_UNLOCKS  = unlocksFor('tiles',  FREE_TILES,  Object.keys(TILE_SKINS))
export const TABLE_UNLOCKS = unlocksFor('tables', FREE_TABLES, Object.keys(TABLE_SKINS))

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
  applyTableSkin(roomSkins?.table || next.table)
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }))
}

// ── A multiplayer table's skins ─────────────────────────────────────────────
// At a multiplayer table everyone sees the HOST's table and tile faces. The
// game screen sets them here while you're seated and clears them when you
// leave. It's app-wide on purpose: the tile following your finger while you
// drag is drawn outside the game screen, and should match the board too.
let roomSkins = null
export function setRoomSkins(skins) {
  const clean = skins && {
    tile:  TILE_SKINS[skins.tile]   ? skins.tile  : null,
    table: TABLE_SKINS[skins.table] ? skins.table : null,
  }
  roomSkins = clean && (clean.tile || clean.table) ? clean : null
  applyTableSkin(roomSkins?.table || getEquipped().table)
  window.dispatchEvent(new CustomEvent(EVENT, { detail: getEquipped() }))
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
  const [, bump] = useState(0)
  useEffect(() => {
    const on = e => { setEq(e.detail || getEquipped()); bump(n => n + 1) }
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  // at a multiplayer table, the host's skins win
  return { tile: roomSkins?.tile || eq.tile, table: roomSkins?.table || eq.table }
}

// ── A player's stats, as trophies and skins read them ──────────────────────
// Guests (no account) get all zeros.
export async function loadPlayerStats() {
  const zero = { games: 0, vyej: 0, dekabess: 0, tournaments: 0, chapters: [], cleanRounds: 0, comebacks: 0 }
  const { data: auth } = await db.auth.getUser()
  const uid = auth?.user?.id
  if (!uid) return zero
  const [{ data: prof }, { data: sp }] = await Promise.all([
    db.from('profiles').select('*').eq('id', uid).maybeSingle(),
    db.rpc('ensure_story_progress'),
  ])
  const row = Array.isArray(sp) ? sp[0] : sp
  return {
    games: prof?.total_games ?? 0,
    vyej: prof?.total_vyej ?? 0,
    dekabess: prof?.total_dekabess ?? 0,
    tournaments: prof?.total_tournaments_won ?? 0,
    chapters: row?.completed_chapters || [],
    cleanRounds: prof?.total_clean_rounds ?? 0,
    comebacks: prof?.total_comebacks ?? 0,
    uid,
  }
}

// ── What this player owns (for "unlock" hints) ──────────────────────────────
// Reads the account's stats once; guests own only the free skins.
export function useOwnedSkins() {
  const [owned, setOwned] = useState(() => ownedSkins(null))
  useEffect(() => {
    let off = false
    loadPlayerStats().then(st => { if (!off) setOwned(ownedSkins(st)) })
    return () => { off = true }
  }, [])
  return owned
}

// paint the equipped table as soon as the app loads
if (typeof window !== 'undefined') applyTableSkin(getEquipped().table)
