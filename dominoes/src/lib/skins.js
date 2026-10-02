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
  { id: 'lavender',   free: true },
  { id: 'rose',       free: true },
  { id: 'amethyst',   need: 'Win 3 matches',          test: s => s.vyej >= 3 },
  { id: 'ocean',      need: 'Beat Story chapter 2',   test: ch(2) },
  { id: 'sunset',     need: 'Score 3 Dekabess',       test: s => s.dekabess >= 3 },
  { id: 'fuchsia',    need: 'Win 20 matches',         test: s => s.vyej >= 20 },
  { id: 'neonGreen',  need: 'Play 25 matches',        test: s => s.games >= 25 },
  { id: 'neonOrange', need: 'Score 5 Dekabess',       test: s => s.dekabess >= 5 },
  { id: 'neonYellow', need: 'Beat Story chapter 9',   test: ch(9) },
  { id: 'neonPink',   need: 'Play 75 matches',        test: s => s.games >= 75 },
  { id: 'neonBlue',   need: 'Beat Story chapter 15',  test: ch(15) },
  { id: 'glow',       need: 'Score 25 Dekabess',      test: s => s.dekabess >= 25 },
  { id: 'usa',        need: 'Win 5 matches',          test: s => s.vyej >= 5 },
  { id: 'playvolt',   need: 'Play 100 matches',       test: s => s.games >= 100 },
  { id: 'dekabess',   need: 'Win 5 tournaments',      test: s => s.tournaments >= 5 },
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
  { id: 'purple',   need: 'Win 3 matches',         test: s => s.vyej >= 3 },
  { id: 'pink',     need: 'Play 10 matches',       test: s => s.games >= 10 },
  { id: 'ocean',    need: 'Beat Story chapter 4',  test: ch(4) },
  { id: 'usa',      need: 'Win 5 matches',         test: s => s.vyej >= 5 },
  { id: 'neon',     need: 'Score 15 Dekabess',     test: s => s.dekabess >= 15 },
  { id: 'playvolt', need: 'Play 100 matches',      test: s => s.games >= 100 },
  { id: 'dekabess', need: 'Win 5 tournaments',     test: s => s.tournaments >= 5 },
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
