// ── Skins ────────────────────────────────────────────────────────────────────
// Every tile and table skin, what unlocks it, and which ones the player has
// equipped. Equipping is remembered on this device; what you OWN is worked
// out from your account's stats, so it follows you everywhere.

import { useEffect, useState } from 'react'
import { db } from './supabase'
import { TROPHIES } from './trophies'
import { SHAPE_RULES, SHAPE_PROGRESS, PUZZLE_COUNT } from './shapeUnlocks'

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
  // ── shapes (drawn in components/ShapedTile.jsx and lib/decoShapes.js; locked until their unlock is decided) ──
  kapsil:   { label: 'Kapsil', shape: 'oval', face: () => 'linear-gradient(160deg, #24211b 0%, #121110 60%, #070707 100%)', edge: '#c9a84c', pip: '#efe3c6', ring: 'none', divider: 'rgba(201,168,76,0.6)' },
  zo:       { label: 'Zo',     shape: 'bone', face: () => 'linear-gradient(160deg, #24211b 0%, #121110 60%, #070707 100%)', edge: '#c9a84c', pip: '#efe3c6', ring: 'none', divider: 'rgba(201,168,76,0.6)' },
  hexa:     { label: 'Hexa', shape: 'hex', face: () => 'linear-gradient(160deg, #262320 0%, #121110 60%, #080807 100%)', edge: '#c9a84c', pip: '#f1e7cc', ring: 'none', divider: 'rgba(201,168,76,0.6)' },
  oktav:    { label: 'Oktav', shape: 'oct', face: () => 'linear-gradient(160deg, #262320 0%, #121110 60%, #080807 100%)', edge: '#c9a84c', pip: '#f1e7cc', ring: 'none', divider: 'rgba(201,168,76,0.6)' },
  fle:      { label: 'Fle', shape: 'fleur', face: () => 'linear-gradient(160deg, #262320 0%, #121110 60%, #080807 100%)', edge: '#c9a84c', pip: '#f1e7cc', ring: 'none', divider: 'rgba(201,168,76,0.6)' },
  lozanj:   { label: 'Lozanj', shape: 'lozenge', face: () => 'linear-gradient(160deg, #262320 0%, #121110 60%, #080807 100%)', edge: '#c9a84c', pip: '#f1e7cc', ring: 'none', divider: 'rgba(201,168,76,0.6)' },
  dyaman:   { label: 'Dyaman', shape: 'diamonds', face: () => 'linear-gradient(160deg, #262320 0%, #121110 60%, #080807 100%)', edge: '#c9a84c', pip: '#f1e7cc', ring: 'none', divider: 'rgba(201,168,76,0.6)' },
  konkav:   { label: 'Konkav', shape: 'concave', face: () => 'linear-gradient(160deg, #262320 0%, #121110 60%, #080807 100%)', edge: '#c9a84c', pip: '#f1e7cc', ring: 'none', divider: 'rgba(201,168,76,0.6)' },
  triyang:  { label: 'Triyang', shape: 'triangles', face: () => 'linear-gradient(160deg, #262320 0%, #121110 60%, #080807 100%)', edge: '#c9a84c', pip: '#f1e7cc', ring: 'none', divider: 'rgba(201,168,76,0.6)' },
  // ── trophy rewards ──
  kafe:     { label: 'Kafe', face: () => 'linear-gradient(160deg, #a77b55 0%, #7a5233 55%, #4e3220 100%)', edge: '#2e1c10', pip: '#f6ead8', ring: 'none', divider: 'rgba(246,234,216,0.25)' },
  kanaval:  { label: 'Kanaval', face: () => 'radial-gradient(circle at 18% 22%, #ff4f7b 0 4%, transparent 4.6%), radial-gradient(circle at 78% 14%, #ffd23f 0 3.6%, transparent 4.2%), radial-gradient(circle at 34% 58%, #3fb7ff 0 3.4%, transparent 4%), radial-gradient(circle at 84% 52%, #3ddc84 0 3.6%, transparent 4.2%), radial-gradient(circle at 14% 88%, #b06cff 0 3.8%, transparent 4.4%), radial-gradient(circle at 66% 90%, #ff8c42 0 3.4%, transparent 4%), linear-gradient(160deg, #fffaf0 0%, #f6edd8 100%)', edge: '#cdbf98', pip: '#1c1a16', ring: 'none', divider: 'rgba(60,45,15,0.30)' },
  pearl:    { label: 'Pearl', face: () => 'linear-gradient(135deg, #ffffff 0%, #f3eef8 28%, #e8f5f5 52%, #fbf1e6 76%, #ffffff 100%)', edge: '#c9c3d6', pip: '#2a2a35', ring: 'none', divider: 'rgba(42,42,53,0.25)' },
  obsidian: { label: 'Obsidian', face: () => 'linear-gradient(115deg, transparent 38%, rgba(255,255,255,0.12) 47%, transparent 56%), linear-gradient(160deg, #3a3a44 0%, #15151b 45%, #050507 100%)', edge: '#000000', pip: '#dfe2ee', ring: 'none', divider: 'rgba(255,255,255,0.18)' },
  krisal:   { label: 'Krisal', face: () => 'linear-gradient(135deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.65) 9%, transparent 9%, transparent 52%, rgba(255,255,255,0.35) 52%, rgba(255,255,255,0.35) 57%, transparent 57%), linear-gradient(160deg, #eefaff 0%, #a9dcf5 55%, #6fbbe6 100%)', edge: '#3d86b0', pip: '#0b2a40', ring: 'none', divider: 'rgba(11,42,64,0.25)' },
  phoenix:  { label: 'Phoenix', face: () => 'linear-gradient(180deg, #ffd166 0%, #ff8c42 38%, #e63946 72%, #7a0f2a 100%)', edge: '#4a0612', pip: '#ffffff', ring: RING, divider: 'rgba(0,0,0,0.25)', pipStroke: '#000000', pipStrokeW: 6 },
  bone:     { label: 'Bone', face: () => 'radial-gradient(ellipse at 30% 25%, rgba(255,255,255,0.35) 0%, transparent 55%), linear-gradient(160deg, #efe4c8 0%, #dccba2 55%, #c4ad7e 100%)', edge: '#9c875c', pip: '#3a2c14', ring: 'none', divider: 'rgba(58,44,20,0.35)' },
  // Vyèj streak reward (Senk Vyèj Swiv — 5 matches won in a row): on fire
  flanm:    { label: 'Flanm', face: () => 'radial-gradient(ellipse at 50% 118%, rgba(255,200,80,0.55) 0%, rgba(255,120,40,0.25) 35%, transparent 65%), linear-gradient(170deg, #4a0f08 0%, #8f1d0c 45%, #d4471a 80%, #ff8a2b 100%)', edge: '#2a0603', pip: '#ffd36b', ring: 'none', divider: 'rgba(255,211,107,0.4)' },
  royal:    { label: 'Royal', face: () => 'linear-gradient(160deg, #2a3f8f 0%, #182a66 55%, #0d1a45 100%)', edge: '#c9a84c', pip: '#e8c96a', ring: 'none', divider: 'rgba(232,201,106,0.45)' },
  // ── flags ──
  // Drawn so the flag reads correctly on a tile lying sideways — the way most
  // tiles sit on the table — with the canton top-left.
  // Option B: one half navy, the other five wide soft stripes — calm behind
  // the pips, and on its side it still reads as the flag
  usa:      { label: 'USA', face: () => 'linear-gradient(180deg, #2c3a78 0%, #2c3a78 50%, transparent 50%), repeating-linear-gradient(90deg, #c4505c 0%, #c4505c 20%, #f4efe6 20%, #f4efe6 40%)', edge: '#1c1b3a', pip: WHITE, ring: '0 0 0 1px rgba(0,0,0,0.6)', divider: 'rgba(255,255,255,0.5)' , flag: true, emblem: 'usa', flagArt: 'linear-gradient(#3C3B6E, #3C3B6E) 0 0 / 40% 53.85% no-repeat, repeating-linear-gradient(180deg, #B22234 0%, #B22234 7.69%, #ffffff 7.69%, #ffffff 15.38%)', pipStroke: '#000000', pipStrokeW: 6 },
  france:   { label: 'France', face: () => 'linear-gradient(90deg, #0055A4 0%, #0055A4 33.3%, #ffffff 33.3%, #ffffff 66.6%, #EF4135 66.6%, #EF4135 100%)', edge: '#22304d', pip: WHITE, ring: '0 0 0 1px rgba(0,0,0,0.6)', divider: 'rgba(0,0,0,0.25)' , flag: true, flagArt: 'linear-gradient(90deg, #0055A4 0%, #0055A4 33.3%, #ffffff 33.3%, #ffffff 66.6%, #EF4135 66.6%, #EF4135 100%)', pipStroke: '#000000', pipStrokeW: 6 },
  // ── Shop: zodiac tiles (luxury) — one design per sign, matching its table ──
  'zodiac-aries': { label: 'Aries', shop: 2500, glyph: 'aries', glyphColor: '#e3bd62', glyphOpacity: 0.7,
    face: () => 'radial-gradient(ellipse 70% 40% at 30% 20%, rgba(255,255,255,0.10) 0%, transparent 60%), linear-gradient(118deg, transparent 0%, transparent 30%, rgba(150,18,32,0.55) 33%, transparent 37%, transparent 60%, rgba(120,12,26,0.45) 63%, transparent 67%, transparent 100%), linear-gradient(160deg, #2a0b10 0%, #160507 55%, #0b0203 100%)',
    edge: '#8a6a22', bezel: '#c9a84c', divider: '#d8b25a', dividerW: 2.2, ring: 'none',
    pipGrad: [['0%', '#ffb3b3'], ['35%', '#e0213b'], ['75%', '#8f0a1d'], ['100%', '#4a030c']], pipShine: true, pipStroke: '#d8b25a', pipStrokeW: 1.6 },
  'zodiac-gemini': { label: 'Gemini', shop: 2500, glyph: 'gemini', glyphColor: '#e6cf98', glyphOpacity: 0.65,
    face: () => 'radial-gradient(ellipse 80% 45% at 35% 18%, rgba(214,190,255,0.22) 0%, transparent 60%), radial-gradient(ellipse 70% 50% at 70% 90%, rgba(120,70,170,0.30) 0%, transparent 65%), linear-gradient(160deg, #3d2156 0%, #2a1340 50%, #170a24 100%)',
    edge: '#7d6232', bezel: '#d6bf86', divider: '#d8bf7c', dividerW: 2, ring: 'none',
    pipGrad: [['0%', '#ffffff'], ['40%', '#f1ebf6'], ['80%', '#c9bcd8'], ['100%', '#9a8aad']], pipShine: true, pipStroke: 'rgba(214,191,134,0.9)', pipStrokeW: 1.2 },
  'zodiac-libra': { label: 'Libra', shop: 2500, glyph: 'libra', glyphColor: '#b8913a', glyphOpacity: 0.75,
    face: () => 'linear-gradient(122deg, transparent 0%, transparent 27%, rgba(196,158,72,0.55) 29%, transparent 31.5%, transparent 55%, rgba(160,160,160,0.35) 57%, transparent 59%, transparent 74%, rgba(196,158,72,0.45) 75.5%, transparent 77.5%, transparent 100%), radial-gradient(ellipse 80% 50% at 30% 15%, #ffffff 0%, transparent 70%), linear-gradient(160deg, #fbf8f1 0%, #eee8da 55%, #ddd4c1 100%)',
    edge: '#9c7c32', bezel: '#c9a84c', divider: '#b8913a', dividerW: 2, ring: 'none',
    pipGrad: [['0%', '#6d6d6d'], ['35%', '#1f1f1f'], ['100%', '#000000']], pipShine: true, pipStroke: '#c9a84c', pipStrokeW: 1.6 },
  'zodiac-taurus': { label: 'Taurus', shop: 2500, glyph: 'taurus', glyphColor: '#e3c46e', glyphOpacity: 0.68,
    face: () => 'repeating-radial-gradient(ellipse at 20% 110%, rgba(255,255,255,0) 0px, rgba(255,255,255,0) 7px, rgba(120,220,170,0.10) 8px, rgba(255,255,255,0) 10px), radial-gradient(ellipse 80% 45% at 30% 15%, rgba(255,255,255,0.14) 0%, transparent 60%), linear-gradient(160deg, #0f5a3a 0%, #0a3f29 55%, #05261a 100%)',
    edge: '#7d6232', bezel: '#c9a84c', divider: '#d8b25a', dividerW: 2, ring: 'none',
    pipGrad: [['0%', '#fff4c8'], ['40%', '#e6c05e'], ['80%', '#a87d24'], ['100%', '#6b4c10']], pipShine: true, pipStroke: '#7a5a1a', pipStrokeW: 1.2 },
  'zodiac-cancer': { label: 'Cancer', shop: 2500, glyph: 'cancer', glyphColor: '#e8d6a6', glyphOpacity: 0.68,
    face: () => 'radial-gradient(ellipse 85% 45% at 30% 15%, rgba(170,200,255,0.16) 0%, transparent 60%), radial-gradient(ellipse 80% 40% at 70% 92%, rgba(60,110,180,0.28) 0%, transparent 65%), linear-gradient(160deg, #142a52 0%, #0c1b3a 55%, #060e22 100%)',
    edge: '#7a6a44', bezel: '#d9c48f', divider: '#d9c48f', dividerW: 2, ring: 'none',
    pipGrad: [['0%', '#ffffff'], ['40%', '#e3eefb'], ['80%', '#a9c2e0'], ['100%', '#6f8db3']], pipShine: true, pipStroke: 'rgba(217,196,143,0.95)', pipStrokeW: 1.2 },
  'zodiac-leo': { label: 'Leo', shop: 2500, glyph: 'leo', glyphColor: '#f0c75e', glyphOpacity: 0.68,
    face: () => 'radial-gradient(ellipse 80% 45% at 30% 15%, rgba(255,200,120,0.14) 0%, transparent 60%), radial-gradient(ellipse 70% 40% at 70% 92%, rgba(160,70,20,0.30) 0%, transparent 65%), linear-gradient(160deg, #3a240f 0%, #241507 55%, #120a03 100%)',
    edge: '#8a6a22', bezel: '#d4a93c', divider: '#e0b64c', dividerW: 2, ring: 'none',
    pipGrad: [['0%', '#fff2b0'], ['35%', '#f7a91e'], ['75%', '#b35a00'], ['100%', '#6a2e00']], pipShine: true, pipStroke: '#e0b64c', pipStrokeW: 1.6 },
  'zodiac-virgo': { label: 'Virgo', shop: 2500, glyph: 'virgo', glyphColor: '#e6cf8c', glyphOpacity: 0.68,
    face: () => 'linear-gradient(125deg, transparent 0%, transparent 35%, rgba(214,180,100,0.16) 37%, transparent 39%, transparent 100%), radial-gradient(ellipse 80% 45% at 30% 15%, rgba(255,230,200,0.12) 0%, transparent 60%), linear-gradient(160deg, #351a2c 0%, #24101e 55%, #140810 100%)',
    edge: '#7d6232', bezel: '#d6bd7a', divider: '#d6bd7a', dividerW: 2, ring: 'none',
    pipGrad: [['0%', '#fffbe6'], ['40%', '#f0dca0'], ['80%', '#c9a456'], ['100%', '#8f6c26']], pipShine: true, pipStroke: '#8f6c26', pipStrokeW: 1.2 },
  'zodiac-scorpio': { label: 'Scorpio', shop: 2500, glyph: 'scorpio', glyphColor: '#d9d9de', glyphOpacity: 0.68,
    face: () => 'radial-gradient(ellipse 75% 40% at 30% 15%, rgba(255,255,255,0.08) 0%, transparent 60%), radial-gradient(ellipse 85% 55% at 60% 80%, rgba(140,10,24,0.42) 0%, transparent 70%), linear-gradient(160deg, #1e0a0d 0%, #120506 55%, #070203 100%)',
    edge: '#6b6b72', bezel: '#c9c9d1', divider: '#c9c9d1', dividerW: 2, ring: 'none',
    pipGrad: [['0%', '#ffb0b8'], ['35%', '#c3122e'], ['75%', '#6d0617'], ['100%', '#33020a']], pipShine: true, pipStroke: '#c9c9d1', pipStrokeW: 1.6 },
  'zodiac-sagittarius': { label: 'Sagittarius', shop: 2500, glyph: 'sagittarius', glyphColor: '#e3bd62', glyphOpacity: 0.68,
    face: () => 'radial-gradient(ellipse 80% 45% at 30% 15%, rgba(170,190,255,0.12) 0%, transparent 60%), radial-gradient(ellipse 70% 45% at 75% 88%, rgba(150,20,50,0.35) 0%, transparent 65%), linear-gradient(160deg, #18213f 0%, #0f152c 55%, #070a18 100%)',
    edge: '#8a6a22', bezel: '#c9a84c', divider: '#d8b25a', dividerW: 2, ring: 'none',
    pipGrad: [['0%', '#c9fff0'], ['35%', '#1fb592'], ['75%', '#0a6b55'], ['100%', '#033328']], pipShine: true, pipStroke: '#d8b25a', pipStrokeW: 1.6 },
  'zodiac-capricorn': { label: 'Capricorn', shop: 2500, glyph: 'capricorn', glyphColor: '#e3bd62', glyphOpacity: 0.68,
    face: () => 'linear-gradient(150deg, transparent 0%, transparent 60%, rgba(255,255,255,0.05) 62%, transparent 70%), radial-gradient(ellipse 80% 45% at 30% 15%, rgba(200,215,255,0.12) 0%, transparent 60%), linear-gradient(160deg, #22262f 0%, #161a22 55%, #0b0d12 100%)',
    edge: '#8a6a22', bezel: '#c9a84c', divider: '#d8b25a', dividerW: 2, ring: 'none',
    pipGrad: [['0%', '#d6e4ff'], ['35%', '#2d64e0'], ['75%', '#102f86'], ['100%', '#06154a']], pipShine: true, pipStroke: '#d8b25a', pipStrokeW: 1.6 },
  'zodiac-aquarius': { label: 'Aquarius', shop: 2500, glyph: 'aquarius', glyphColor: '#d6ecf5', glyphOpacity: 0.68,
    face: () => 'repeating-linear-gradient(165deg, rgba(255,255,255,0) 0px, rgba(255,255,255,0) 9px, rgba(150,220,255,0.08) 10px, rgba(255,255,255,0) 12px), radial-gradient(ellipse 80% 45% at 30% 15%, rgba(180,230,255,0.18) 0%, transparent 60%), linear-gradient(160deg, #0f3a5c 0%, #0a2742 55%, #051628 100%)',
    edge: '#6c8796', bezel: '#cfe6f2', divider: '#cfe6f2', dividerW: 2, ring: 'none',
    pipGrad: [['0%', '#ffffff'], ['35%', '#9fe6ff'], ['75%', '#2b8fc9'], ['100%', '#0e4f7a']], pipShine: true, pipStroke: '#e0f2fa', pipStrokeW: 1.4 },
  'zodiac-pisces': { label: 'Pisces', shop: 2500, glyph: 'pisces', glyphColor: '#e8d9a6', glyphOpacity: 0.68,
    face: () => 'radial-gradient(ellipse 85% 45% at 30% 15%, rgba(190,255,240,0.14) 0%, transparent 60%), radial-gradient(ellipse 80% 40% at 70% 92%, rgba(30,120,120,0.30) 0%, transparent 65%), linear-gradient(160deg, #0f3a3d 0%, #0a282b 55%, #041619 100%)',
    edge: '#7a6a44', bezel: '#dccb94', divider: '#dccb94', dividerW: 2, ring: 'none',
    pipGrad: [['0%', '#ffffff'], ['40%', '#e7f6f2'], ['80%', '#a8d4ca'], ['100%', '#6aa598']], pipShine: true, pipStroke: 'rgba(220,203,148,0.95)', pipStrokeW: 1.2 },
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
  // Vyèj streak reward (Dis Vyèj Swiv — 10 matches won in a row): black velvet, a gold crown's glow
  kouwon:   { label: 'Kouwòn', felt: `${VIGNETTE}, radial-gradient(ellipse at 50% 45%, rgba(232,201,106,0.16) 0%, rgba(232,201,106,0.05) 35%, transparent 65%), repeating-linear-gradient(45deg, rgba(232,201,106,0.035) 0 2px, transparent 2px 22px), repeating-linear-gradient(-45deg, rgba(232,201,106,0.035) 0 2px, transparent 2px 22px), ${GRAIN}, #0d0b10`, rail: 'linear-gradient(180deg, #f3d98a 0%, #c9a84c 45%, #7a5f22 100%)' },
  purple:   { label: 'Purple', felt: `${VIGNETTE}, ${GRAIN}, #3b1d63`, rail: WOOD },
  pink:     { label: 'Pink', felt: `${VIGNETTE}, ${GRAIN}, #8a3361`, rail: WOOD },
  ocean:    { label: 'Ocean', felt: `${VIGNETTE}, ${GRAIN}, #0f4c5c`, rail: WOOD },
  neon:     { label: 'Neon', felt: `${VIGNETTE}, linear-gradient(rgba(0,229,255,0.07) 1px, transparent 1px) 0 0 / 26px 26px, linear-gradient(90deg, rgba(0,229,255,0.07) 1px, transparent 1px) 0 0 / 26px 26px, #0b0b12`, rail: 'linear-gradient(180deg, #2bf0ff 0%, #00a3b8 100%)' },
  dekabess: { label: 'Dekabess', felt: `${VIGNETTE}, linear-gradient(rgba(12,11,9,0.55), rgba(12,11,9,0.55)), url(/dekabess-logo.webp) center / 42% auto no-repeat, #151310`, rail: 'linear-gradient(180deg, #e3c56f 0%, #c9a84c 45%, #7a5f22 100%)' },
  playvolt: { label: 'PlayVolt', felt: `${VIGNETTE}, ${GRAIN}, #2a1b5e`, rail: 'linear-gradient(180deg, #7c5cfc 0%, #4b2fc9 100%)' },
  usa:      { label: 'USA', felt: `${VIGNETTE}, linear-gradient(#1f2350, #1f2350) 0 0 / 40% 53.85% no-repeat, repeating-linear-gradient(180deg, #6e1520 0%, #6e1520 7.69%, #8a847a 7.69%, #8a847a 15.38%)`, rail: WOOD },
  krisal:   { label: 'Krisal', felt: `${VIGNETTE}, linear-gradient(125deg, transparent 30%, rgba(255,255,255,0.07) 40%, transparent 50%, transparent 62%, rgba(255,255,255,0.05) 70%, transparent 78%), ${GRAIN}, #1d5f7a`, rail: 'linear-gradient(180deg, #d9eef8 0%, #8fbfd8 50%, #4d86a6 100%)' },
  kanaval:  { label: 'Kanaval', felt: `${VIGNETTE}, radial-gradient(circle, rgba(255,79,123,0.55) 0 2px, transparent 2.6px) 0 0 / 46px 46px, radial-gradient(circle, rgba(255,210,63,0.5) 0 2px, transparent 2.6px) 23px 15px / 46px 46px, radial-gradient(circle, rgba(63,183,255,0.5) 0 2px, transparent 2.6px) 11px 31px / 46px 46px, #4a2370`, rail: WOOD },
  phoenix:  { label: 'Phoenix', felt: `radial-gradient(ellipse at 50% 108%, rgba(255,140,66,0.45) 0%, rgba(230,57,70,0.18) 35%, transparent 62%), ${VIGNETTE}, ${GRAIN}, #34090c`, rail: 'linear-gradient(180deg, #ff9d4d 0%, #c2410c 50%, #6b1405 100%)' },
  lakou:    { label: 'Lakou', felt: `${VIGNETTE}, linear-gradient(rgba(0,0,0,0.16) 1.5px, transparent 1.5px) 0 0 / 44px 44px, linear-gradient(90deg, rgba(0,0,0,0.16) 1.5px, transparent 1.5px) 0 0 / 44px 44px, linear-gradient(180deg, #a85a34 0%, #8a4424 100%)`, rail: WOOD },
  // ── Wa Tab La prize tables (your artwork): won by being #1 the week each is offered ──
  // (tiger / viking / marron keep their ids, so earlier winners get the new art)
  // Tiger Jungle uses its art as a 9-slice frame (like the Challenge prize tables) so the
  // four tigers are never cropped: tall art on upright screens, wide art sideways. Cuts
  // keep each tiger with its leaves and claw marks: tall 300 top, 360 sides, 380 bottom;
  // wide 250 top, 420 sides, 405 bottom. Widths follow the picture's own scale.
  tiger:    { label: 'Tiger Jungle', wtl: true, thumb: '/tables/tiger-wide.webp', felt: '#0f0d0b', wideFelt: '#0f0d0b',
    frame: "url('/tables/tiger-tall.webp')", frameWide: "url('/tables/tiger-wide.webp')",
    frameSlice: '300 360 380 fill', frameSliceWide: '250 420 405 fill',
    frameWidth: '29.3vw 35.2vw 37.1vw', frameWidthWide: '27.8vh 46.7vh 45vh',
    rail: 'linear-gradient(180deg, #3a2a14 0%, #160f08 100%)' },
  // Norse uses its art as a 9-slice frame too (like Tiger Jungle), so nothing is cropped.
  // Tall: the shields and axe heads sit in the corners and keep their real shape; only the
  // axe handles, rune columns and stone stretch (cuts 430 top, 175 sides, 680 bottom).
  // Wide: the side columns are drawn at their own scale; only the raven band and the
  // longship scene widen on very wide screens (cuts 150 top, 280 sides, 195 bottom).
  viking:   { label: 'Norse', wtl: true, thumb: '/tables/norse-wide.webp', felt: '#121417', wideFelt: '#121417',
    frame: "url('/tables/norse-tall.webp')", frameWide: "url('/tables/norse-wide.webp')",
    frameSlice: '430 175 680 fill', frameSliceWide: '150 280 195 fill',
    frameWidth: '41.99vw 17.09vw 66.41vw', frameWidthWide: '16.67vh 31.11vh 21.67vh',
    rail: 'linear-gradient(180deg, #2e3640 0%, #12161b 100%)' },
  // Maroon Resistance, Art Deco Jazz and Neg Maron: their sides are full of figures and two
  // have artwork in the middle, so instead of a 9-slice frame the whole picture is stretched
  // evenly to the board (tall art upright, wide art sideways). Nothing is cropped.
  marron:   { label: 'Maroon Resistance', wtl: true, thumb: '/tables/maroon-wide.webp', felt: "url('/tables/maroon-tall.webp') center / 100% 100% no-repeat, #15110c", wideFelt: "url('/tables/maroon-wide.webp') center / 100% 100% no-repeat, #15110c", rail: 'linear-gradient(180deg, #3a2a16 0%, #1a120a 100%)' },
  jazz:     { label: 'Art Deco Jazz', wtl: true, thumb: '/tables/jazz-wide.webp', felt: "url('/tables/jazz-tall.webp') center / 100% 100% no-repeat, #3a0a12", wideFelt: "url('/tables/jazz-wide.webp') center / 100% 100% no-repeat, #3a0a12", rail: 'linear-gradient(180deg, #4a1420 0%, #1e060b 100%)' },
  // the figure sits where the chain goes, so the centre is gently dimmed to keep tiles readable
  negmaron: { label: 'Neg Maron', wtl: true, thumb: '/tables/negmaron-wide.webp', felt: "radial-gradient(ellipse 40% 45% at 50% 50%, rgba(8,7,6,0.45) 0%, rgba(8,7,6,0.3) 60%, transparent 100%), url('/tables/negmaron-tall.webp') center / 100% 100% no-repeat, #0d0b09", wideFelt: "radial-gradient(ellipse 40% 45% at 50% 50%, rgba(8,7,6,0.45) 0%, rgba(8,7,6,0.3) 60%, transparent 100%), url('/tables/negmaron-wide.webp') center / 100% 100% no-repeat, #0d0b09", rail: 'linear-gradient(180deg, #3a2a14 0%, #160f08 100%)' },
  // ── Challenge Mode prize tables (your artwork): won by beating a challenge (every 3 days) ──
  emerald:  { label: 'Emerald Crown', challenge: true,
    thumb: '/tables/emerald-crown-thumb.webp',
    // Your artwork, tall (2:3) for upright screens and wide (16:9) for wide ones.
    // Drawn as a 9-slice: each crowned corner medallion is kept exactly as
    // painted (cut 250 px / 270 px in), only the straight runs of frame and the
    // marble centre stretch — so it fits any screen shape without squashing.
    felt: '#070a08', wideFelt: '#070a08',
    frame: "url('/tables/emerald-crown-tall.webp')",
    frameWide: "url('/tables/emerald-crown-wide.webp')",
    frameSlice: '250 fill', frameSliceWide: '270 fill',
    frameWidth: '23vw', frameWidthWide: 'min(16vw, 30vh)',
    rail: 'linear-gradient(180deg, #1f3a2a 0%, #0c1a12 100%)' },
  sapphire: { label: 'Sapphire & Ruby', challenge: true,
    thumb: '/tables/sapphire-ruby-thumb.webp',
    // Your artwork, tall and wide, drawn as a 9-slice like Emerald Crown:
    // the sapphire corner medallions stay exactly as painted.
    felt: '#070a16', wideFelt: '#070a16',
    frame: "url('/tables/sapphire-ruby-tall.webp')",
    frameWide: "url('/tables/sapphire-ruby-wide.webp')",
    frameSlice: '240 fill', frameSliceWide: '290 fill',
    frameWidth: '22vw', frameWidthWide: 'min(17vw, 31vh)',
    rail: 'linear-gradient(180deg, #24305a 0%, #0e1226 100%)' },
  burgundydeco: { label: 'Burgundy Deco', challenge: true,
    thumb: '/tables/burgundy-deco-thumb.webp',
    // Your artwork, tall and wide, drawn as a 9-slice like Emerald Crown and
    // Sapphire & Ruby: the ruby corner medallions stay exactly as painted.
    felt: '#080506', wideFelt: '#080506',
    frame: "url('/tables/burgundy-deco-tall.webp')",
    frameWide: "url('/tables/burgundy-deco-wide.webp')",
    frameSlice: '240 fill', frameSliceWide: '290 fill',
    frameWidth: '22vw', frameWidthWide: 'min(17vw, 31vh)',
    rail: '#080506' },
  teal:     { label: 'Teal Deco', challenge: true,
    thumb: '/tables/teal-deco-thumb.webp',
    // Your artwork, tall and wide, drawn as a 9-slice like the other prize
    // tables, with the cuts set per side so they only cross plain gold bars:
    // tall 240 top/sides and 280 at the bottom, wide 235 top, 290 sides and
    // 260 bottom (between the corner flourishes and the round side gems).
    // The widths keep the same scale per side, so nothing is squashed.
    felt: '#060808', wideFelt: '#060808',
    frame: "url('/tables/teal-deco-tall.webp')",
    frameWide: "url('/tables/teal-deco-wide.webp')",
    frameSlice: '240 240 280 240 fill', frameSliceWide: '235 290 260 fill',
    frameWidth: '22vw 22vw 25.7vw 22vw', frameWidthWide: 'min(13.8vw, 25.1vh) min(17vw, 31vh) min(15.2vw, 27.8vh)',
    rail: '#060808' },
  amethyst: { label: 'Amethyst Deco', challenge: true,
    thumb: '/tables/amethyst-deco-thumb.webp',
    // Your artwork, tall and wide, drawn as a 9-slice like the other prize
    // tables. The cuts are set per side for this artwork so they only cross
    // plain gold bars: tall 240 top/sides and 310 at the bottom (its bottom
    // corner fans sit higher), wide 215 top/bottom and 320 at the sides (so
    // the small round gems stay in the corners). The widths keep the same
    // scale per side, so nothing is squashed.
    felt: '#07060a', wideFelt: '#07060a',
    frame: "url('/tables/amethyst-deco-tall.webp')",
    frameWide: "url('/tables/amethyst-deco-wide.webp')",
    frameSlice: '240 240 310 240 fill', frameSliceWide: '215 320 fill',
    frameWidth: '22vw 22vw 28.4vw 22vw', frameWidthWide: 'min(12.6vw, 23vh) min(18.8vw, 34.2vh)',
    rail: '#07060a' },
  haiti:    { label: 'Haïti', felt: `${VIGNETTE}, ${GRAIN}, linear-gradient(180deg, #14307e 0%, #14307e 50%, #8c1229 50%, #8c1229 100%)`, rail: WOOD },
  jamaica:  { label: 'Jamaica', felt: `${VIGNETTE}, ${GRAIN}, linear-gradient(to top right, transparent 48%, #b89a12 48%, #b89a12 52%, transparent 52%), linear-gradient(to top left, transparent 48%, #b89a12 48%, #b89a12 52%, transparent 52%), conic-gradient(#0d5a2a 0deg ${JA}deg, #111111 ${JA}deg ${180 - JA}deg, #0d5a2a ${180 - JA}deg ${180 + JA}deg, #111111 ${180 + JA}deg ${360 - JA}deg, #0d5a2a ${360 - JA}deg)`, rail: WOOD },
  quebec:   { label: 'Québec', felt: `${VIGNETTE}, ${GRAIN}, linear-gradient(90deg, transparent 47%, rgba(255,255,255,0.55) 47%, rgba(255,255,255,0.55) 53%, transparent 53%), linear-gradient(0deg, transparent 45%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0.55) 55%, transparent 55%), #12357a`, rail: WOOD },
  // ── Shop: the zodiac collection (your artwork), sold for Goud ──
  // Gemini and Libra come in two versions; the chosen one is saved with the
  // table as 'zodiac-gemini@male' (see tableLook).
  'zodiac-aries': { label: 'Aries', shop: 5000, rail: 'linear-gradient(180deg, #2a2038 0%, #120c18 100%)', thumb: '/tables/zodiac-aries-thumb.webp', felt: "url('/tables/zodiac-aries-tall.webp') center / 100% 100% no-repeat, #0e0c10", wideFelt: "url('/tables/zodiac-aries-wide.webp') center / 100% 100% no-repeat, #0e0c10" },
  'zodiac-taurus': { label: 'Taurus', shop: 5000, rail: 'linear-gradient(180deg, #2a2038 0%, #120c18 100%)', thumb: '/tables/zodiac-taurus-thumb.webp', felt: "url('/tables/zodiac-taurus-tall.webp') center / 100% 100% no-repeat, #0e0c10", wideFelt: "url('/tables/zodiac-taurus-wide.webp') center / 100% 100% no-repeat, #0e0c10" },
  'zodiac-gemini': { label: 'Gemini', shop: 5000, rail: 'linear-gradient(180deg, #2a2038 0%, #120c18 100%)', thumb: '/tables/zodiac-gemini-female-thumb.webp', felt: "url('/tables/zodiac-gemini-female-tall.webp') center / 100% 100% no-repeat, #0e0c10", wideFelt: "url('/tables/zodiac-gemini-female-wide.webp') center / 100% 100% no-repeat, #0e0c10",
    variants: { female: { label: 'Female', thumb: '/tables/zodiac-gemini-female-thumb.webp', felt: "url('/tables/zodiac-gemini-female-tall.webp') center / 100% 100% no-repeat, #0e0c10", wideFelt: "url('/tables/zodiac-gemini-female-wide.webp') center / 100% 100% no-repeat, #0e0c10" }, male: { label: 'Male', thumb: '/tables/zodiac-gemini-male-thumb.webp', felt: "url('/tables/zodiac-gemini-male-tall.webp') center / 100% 100% no-repeat, #0e0c10", wideFelt: "url('/tables/zodiac-gemini-male-wide.webp') center / 100% 100% no-repeat, #0e0c10" } } },
  'zodiac-cancer': { label: 'Cancer', shop: 5000, rail: 'linear-gradient(180deg, #2a2038 0%, #120c18 100%)', thumb: '/tables/zodiac-cancer-thumb.webp', felt: "url('/tables/zodiac-cancer-tall.webp') center / 100% 100% no-repeat, #0e0c10", wideFelt: "url('/tables/zodiac-cancer-wide.webp') center / 100% 100% no-repeat, #0e0c10" },
  'zodiac-leo': { label: 'Leo', shop: 5000, rail: 'linear-gradient(180deg, #2a2038 0%, #120c18 100%)', thumb: '/tables/zodiac-leo-thumb.webp', felt: "url('/tables/zodiac-leo-tall.webp') center / 100% 100% no-repeat, #0e0c10", wideFelt: "url('/tables/zodiac-leo-wide.webp') center / 100% 100% no-repeat, #0e0c10" },
  'zodiac-virgo': { label: 'Virgo', shop: 5000, rail: 'linear-gradient(180deg, #2a2038 0%, #120c18 100%)', thumb: '/tables/zodiac-virgo-thumb.webp', felt: "url('/tables/zodiac-virgo-tall.webp') center / 100% 100% no-repeat, #0e0c10", wideFelt: "url('/tables/zodiac-virgo-wide.webp') center / 100% 100% no-repeat, #0e0c10" },
  'zodiac-libra': { label: 'Libra', shop: 5000, rail: 'linear-gradient(180deg, #2a2038 0%, #120c18 100%)', thumb: '/tables/zodiac-libra-female-thumb.webp', felt: "radial-gradient(ellipse 42% 40% at 50% 50%, rgba(6,5,4,0.55) 0%, rgba(6,5,4,0.4) 65%, transparent 100%), url('/tables/zodiac-libra-female-tall.webp') center / 100% 100% no-repeat, #0e0c10", wideFelt: "radial-gradient(ellipse 42% 40% at 50% 50%, rgba(6,5,4,0.55) 0%, rgba(6,5,4,0.4) 65%, transparent 100%), url('/tables/zodiac-libra-female-wide.webp') center / 100% 100% no-repeat, #0e0c10",
    variants: { female: { label: 'Female', thumb: '/tables/zodiac-libra-female-thumb.webp', felt: "radial-gradient(ellipse 42% 40% at 50% 50%, rgba(6,5,4,0.55) 0%, rgba(6,5,4,0.4) 65%, transparent 100%), url('/tables/zodiac-libra-female-tall.webp') center / 100% 100% no-repeat, #0e0c10", wideFelt: "radial-gradient(ellipse 42% 40% at 50% 50%, rgba(6,5,4,0.55) 0%, rgba(6,5,4,0.4) 65%, transparent 100%), url('/tables/zodiac-libra-female-wide.webp') center / 100% 100% no-repeat, #0e0c10" }, male: { label: 'Male', thumb: '/tables/zodiac-libra-male-thumb.webp', felt: "radial-gradient(ellipse 42% 40% at 50% 50%, rgba(6,5,4,0.55) 0%, rgba(6,5,4,0.4) 65%, transparent 100%), url('/tables/zodiac-libra-male-tall.webp') center / 100% 100% no-repeat, #0e0c10", wideFelt: "radial-gradient(ellipse 42% 40% at 50% 50%, rgba(6,5,4,0.55) 0%, rgba(6,5,4,0.4) 65%, transparent 100%), url('/tables/zodiac-libra-male-wide.webp') center / 100% 100% no-repeat, #0e0c10" } } },
  'zodiac-scorpio': { label: 'Scorpio', shop: 5000, rail: 'linear-gradient(180deg, #2a2038 0%, #120c18 100%)', thumb: '/tables/zodiac-scorpio-thumb.webp', felt: "url('/tables/zodiac-scorpio-tall.webp') center / 100% 100% no-repeat, #0e0c10", wideFelt: "url('/tables/zodiac-scorpio-wide.webp') center / 100% 100% no-repeat, #0e0c10" },
  'zodiac-sagittarius': { label: 'Sagittarius', shop: 5000, rail: 'linear-gradient(180deg, #2a2038 0%, #120c18 100%)', thumb: '/tables/zodiac-sagittarius-thumb.webp', felt: "url('/tables/zodiac-sagittarius-tall.webp') center / 100% 100% no-repeat, #0e0c10", wideFelt: "url('/tables/zodiac-sagittarius-wide.webp') center / 100% 100% no-repeat, #0e0c10" },
  'zodiac-capricorn': { label: 'Capricorn', shop: 5000, rail: 'linear-gradient(180deg, #2a2038 0%, #120c18 100%)', thumb: '/tables/zodiac-capricorn-thumb.webp', felt: "url('/tables/zodiac-capricorn-tall.webp') center / 100% 100% no-repeat, #0e0c10", wideFelt: "url('/tables/zodiac-capricorn-wide.webp') center / 100% 100% no-repeat, #0e0c10" },
  // Zodiac tables (all 12 have a tall version): the whole
  // picture is stretched evenly to the board (tall art upright, wide art sideways) — nothing cropped.
  'zodiac-aquarius': { label: 'Aquarius', shop: 5000, rail: 'linear-gradient(180deg, #2a2038 0%, #120c18 100%)', thumb: '/tables/zodiac-aquarius-thumb.webp', felt: "url('/tables/zodiac-aquarius-tall.webp') center / 100% 100% no-repeat, #0e0c10", wideFelt: "url('/tables/zodiac-aquarius-wide.webp') center / 100% 100% no-repeat, #0e0c10" },
  'zodiac-pisces': { label: 'Pisces', shop: 5000, rail: 'linear-gradient(180deg, #2a2038 0%, #120c18 100%)', thumb: '/tables/zodiac-pisces-thumb.webp', felt: "url('/tables/zodiac-pisces-tall.webp') center / 100% 100% no-repeat, #0e0c10", wideFelt: "url('/tables/zodiac-pisces-wide.webp') center / 100% 100% no-repeat, #0e0c10" },
}

// ── What unlocks what ────────────────────────────────────────────────────────
// A few skins are free. Every other skin is a trophy's reward, and its unlock
// rule is that trophy's — built from trophies.js, so the two never disagree.
const FREE_TILES  = ['classic', 'ebony', 'haiti', 'lavender', 'rose']
const FREE_TABLES = ['green', 'midnight']

// ── Wa Tab La prize tables ──
// One is the prize each week, on a fixed rotation counted from Monday
// 2026-01-05 — the same rotation the database uses (wa_tab_la_prize).
export const WTL_TABLES = ['tiger', 'viking', 'marron', 'jazz', 'negmaron']   // the rotation, in order
export function weekStartUTC(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = x.getUTCDay() || 7                 // Monday = 1 … Sunday = 7
  x.setUTCDate(x.getUTCDate() - (day - 1))
  return x
}
export function wtlPrize(weekStart = weekStartUTC()) {
  const weeks = Math.round((weekStart - Date.UTC(2026, 0, 5)) / (7 * 86400000))
  const n = WTL_TABLES.length
  return WTL_TABLES[((weeks % n) + n) % n]
}

function unlocksFor(kind, free, ids) {
  return ids.map(id => {
    if (free.includes(id)) return { id, free: true }
    if (kind === 'tables' && ['emerald', 'sapphire', 'burgundydeco', 'teal', 'amethyst'].includes(id)) {
      return { id, challenge: true, need: 'Challenge Mode prize — beat the challenge while it’s offered', test: s => (s.tableUnlocks || []).includes(id) }
    }
    if (kind === 'tiles' && TILE_SKINS[id]?.shop) {
      return { id, shop: TILE_SKINS[id].shop, need: `Shop — ${TILE_SKINS[id].shop.toLocaleString('en-US')} Goud`, test: s => (s.tileUnlocks || []).includes(id) }
    }
    if (kind === 'tables' && TABLE_SKINS[id]?.shop) {
      return { id, shop: TABLE_SKINS[id].shop, need: `Shop — ${TABLE_SKINS[id].shop.toLocaleString('en-US')} Goud`, test: s => (s.tableUnlocks || []).includes(id) }
    }
    if (kind === 'tables' && WTL_TABLES.includes(id)) {
      return { id, wtl: true, need: 'Wa Tab La prize — be #1 the week it’s offered', test: s => (s.tableUnlocks || []).includes(id) }
    }
    if (kind === 'tiles' && SHAPE_RULES[id]) {
      return { id, need: SHAPE_RULES[id], progress: SHAPE_PROGRESS[id], test: s => (s.tileUnlocks || []).includes(id) }
    }
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

// ── A table can carry a version: 'zodiac-gemini@male' ──
export const tableBase = v => String(v || '').split('@')[0]
export const tableVariant = v => String(v || '').split('@')[1] || null
export function tableLook(v) {
  const t = TABLE_SKINS[tableBase(v)] || TABLE_SKINS.green
  const want = tableVariant(v)
  const ver = t.variants && (t.variants[want] || Object.values(t.variants)[0])
  return ver ? { ...t, ...ver, label: t.label } : t
}

export function getEquipped() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') || {}
    return {
      tile:  TILE_SKINS[v.tile]   ? v.tile  : 'classic',
      table: TABLE_SKINS[tableBase(v.table)] ? v.table : 'green',
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
    table: TABLE_SKINS[tableBase(skins.table)] ? skins.table : null,
  }
  roomSkins = clean && (clean.tile || clean.table) ? clean : null
  applyTableSkin(roomSkins?.table || getEquipped().table)
  window.dispatchEvent(new CustomEvent(EVENT, { detail: getEquipped() }))
}

// The table is painted through two CSS variables, so every screen that shows
// the board picks it up without knowing about skins.
// The latest artwork is shared by portrait, landscape, and skin previews.
export function applyTableSkin(id) {
  const t = tableLook(TABLE_SKINS[tableBase(id)] ? id : 'green')      // the chosen version, if it has one
  const root = document.documentElement

  // Tables can opt into a landscape-specific centre + 9-slice frame.
  // Everything else keeps its original rendering, so no gameplay/layout code
  // is involved and non-sliced artwork is never stretched.
  root.style.setProperty('--table-felt', t.felt)
  root.style.setProperty('--table-felt-wide', t.wideFelt || t.felt)
  root.style.setProperty('--table-rail', t.rail)
  root.style.setProperty('--table-frame-image-effective', t.frameOverlay ? 'none' : (t.frame || t.frameWide || 'none'))
  root.style.setProperty('--table-frame-image-effective-wide', t.frameOverlay ? 'none' : (t.frameWide || t.frame || 'none'))

  if (t.frame || t.frameWide) {
    root.style.setProperty('--table-frame-image', t.frame || t.frameWide)
    root.style.setProperty('--table-frame-image-wide', t.frameWide || t.frame)
    root.style.setProperty('--table-frame-slice', t.frameSlice || '120')
    root.style.setProperty('--table-frame-slice-wide', t.frameSliceWide || t.frameSlice || '120')
    root.style.setProperty('--table-frame-width', t.frameWidth || '58px 42px 64px 42px')
    root.style.setProperty('--table-frame-width-wide', t.frameWidthWide || t.frameWidth || '32px 70px 40px 70px')
    root.style.setProperty('--table-frame-overlay', t.frameOverlay || 'none')
    root.style.setProperty('--table-frame-overlay-wide', t.frameOverlayWide || t.frameOverlay || 'none')
  } else {
    root.style.removeProperty('--table-frame-image')
    root.style.removeProperty('--table-frame-image-wide')
    root.style.removeProperty('--table-frame-slice')
    root.style.removeProperty('--table-frame-slice-wide')
    root.style.removeProperty('--table-frame-width')
    root.style.removeProperty('--table-frame-width-wide')
    root.style.removeProperty('--table-frame-overlay')
    root.style.removeProperty('--table-frame-overlay-wide')
  }
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
  const zero = { games: 0, vyej: 0, dekabess: 0, tournaments: 0, chapters: [], cleanRounds: 0, comebacks: 0, fiveDoubles: 0, fiveDoublesWon: 0, bestVyejStreak: 0, tableUnlocks: [], tileUnlocks: [], expertsBeaten: [], puzzlesDone: 0 }
  const { data: auth } = await db.auth.getUser()
  const uid = auth?.user?.id
  if (!uid) return zero
  await db.rpc('shape_check_puzzles', { p_total: PUZZLE_COUNT }).then(() => {}, () => {})    // catch up: Kapsil for puzzles already finished
  const [{ data: prof }, { data: sp }, { data: won }, { data: tilesOwned }, { data: shapes }] = await Promise.all([
    db.from('profiles').select('*').eq('id', uid).maybeSingle(),
    db.rpc('ensure_story_progress'),
    db.from('table_unlocks').select('skin').eq('user_id', uid),
    db.from('tile_unlocks').select('skin').eq('user_id', uid),          // tiles bought in the shop or unlocked
    db.rpc('shape_progress'),                                           // experts beaten, puzzles done
  ])
  const row = Array.isArray(sp) ? sp[0] : sp
  return {
    // trophies read the trophy counters (only games vs humans and experts);
    // before the database update they fall back to the totals
    games: prof?.trophy_games ?? prof?.total_games ?? 0,
    vyej: prof?.trophy_vyej ?? prof?.total_vyej ?? 0,
    dekabess: prof?.trophy_dekabess ?? prof?.total_dekabess ?? 0,
    tournaments: prof?.trophy_tournaments_won ?? prof?.total_tournaments_won ?? 0,
    chapters: row?.completed_chapters || [],
    cleanRounds: prof?.total_clean_rounds ?? 0,
    comebacks: prof?.total_comebacks ?? 0,
    bestVyejStreak: prof?.best_vyej_streak ?? 0,     // matches won in a row (record_round_stats)
    fiveDoubles: prof?.total_five_double_rounds ?? 0,
    fiveDoublesWon: prof?.total_five_double_wins ?? 0,
    tableUnlocks: (won || []).map(r => r.skin),
    tileUnlocks: (tilesOwned || []).map(r => r.skin),
    expertsBeaten: shapes?.beaten || [],
    puzzlesDone: Number(shapes?.puzzles || 0),
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

// ── Themed groups for the Skins page ─────────────────────────────────────────
// Matching skins sit together. A skin not listed in any group still shows,
// under "More", so nothing can go missing from the page.
export const TILE_GROUPS = [
  { label: 'Classics', ids: ['classic', 'ebony', 'pearl', 'bone', 'marble', 'obsidian'] },
  { label: 'Gems & Metals', ids: ['jade', 'ruby', 'gold', 'amethyst', 'royal', 'krisal'] },
  { label: 'Colours', ids: ['lavender', 'rose', 'fuchsia', 'ocean', 'sunset'] },
  { label: 'Neon', ids: ['neonGreen', 'neonPink', 'neonOrange', 'neonYellow', 'neonBlue', 'glow'] },
  { label: 'Flags', ids: ['haiti', 'quebec', 'jamaica', 'trinidad', 'dominican', 'usa', 'france'] },
  { label: 'Culture & Dekabess', ids: ['kafe', 'kanaval', 'phoenix', 'dekabess', 'playvolt'] },
  { label: 'Vyèj Streaks', ids: ['flanm'] },
  { label: 'Shapes', ids: ['kapsil', 'zo', 'hexa', 'oktav', 'fle', 'lozanj', 'dyaman', 'konkav', 'triyang'] },
  { label: 'Zodiac — Shop', ids: ['zodiac-aries', 'zodiac-taurus', 'zodiac-gemini', 'zodiac-cancer', 'zodiac-leo', 'zodiac-virgo', 'zodiac-libra', 'zodiac-scorpio', 'zodiac-sagittarius', 'zodiac-capricorn', 'zodiac-aquarius', 'zodiac-pisces'] },
]
export const TABLE_GROUPS = [
  { label: 'Classic Felts', ids: ['green', 'midnight', 'burgundy', 'slate', 'mahogany', 'purple', 'pink', 'ocean'] },
  { label: 'Flags', ids: ['haiti', 'jamaica', 'quebec', 'usa'] },
  { label: 'Culture & Neon', ids: ['neon', 'krisal', 'kanaval', 'phoenix', 'lakou', 'dekabess', 'playvolt'] },
  { label: 'Vyèj Streaks', ids: ['kouwon'] },
  { label: 'Wa Tab La Prizes', ids: ['tiger', 'viking', 'marron', 'jazz', 'negmaron'] },
  { label: 'Challenge Prizes', ids: ['emerald', 'sapphire', 'burgundydeco', 'teal', 'amethyst'] },
  { label: 'Zodiac — Shop', ids: ['zodiac-aries', 'zodiac-taurus', 'zodiac-gemini', 'zodiac-cancer', 'zodiac-leo', 'zodiac-virgo', 'zodiac-libra', 'zodiac-scorpio', 'zodiac-sagittarius', 'zodiac-capricorn', 'zodiac-aquarius', 'zodiac-pisces'] },
]
export function groupCards(cards, groups) {
  const byId = new Map(cards.map(c => [c.id, c]))
  const out = groups.map(g => ({ label: g.label, cards: g.ids.map(id => byId.get(id)).filter(Boolean) })).filter(g => g.cards.length)
  const listed = new Set(groups.flatMap(g => g.ids))
  const rest = cards.filter(c => !listed.has(c.id))
  if (rest.length) out.push({ label: 'More', cards: rest })
  return out
}