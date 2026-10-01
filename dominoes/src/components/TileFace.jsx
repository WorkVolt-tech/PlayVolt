import { TILE_SKINS, useEquippedSkins } from '../lib/skins'

// ── TileFace ─────────────────────────────────────────────────────────────────
// Draws a domino's face to fill whatever box it's placed in.
//
// The pips, centre line and pin are an SVG drawing with its own fixed grid:
// an upright tile is 100 × 200 units (two 100 × 100 halves), a sideways one
// 200 × 100. Every pip is a <circle> with the SAME radius, and the drawing is
// always scaled evenly ("meet"), so pips are identical perfect circles at any
// size, on any screen. (Earlier versions built pips from boxes and let the
// browser size them, which bent some into ovals and made sizes vary.)
//
// It only paints — touches and clicks pass straight through to the tile box
// it sits in, so dragging and tapping are untouched.

const UPRIGHT  = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 3, 6, 2, 5, 8] }
const SIDEWAYS = { 0: [], 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 1, 2, 6, 7, 8] }

const SPOT = [25, 50, 75]   // the three columns/rows inside a 100-unit half
const PIP_R = 9             // every pip, every tile: the same radius

export default function TileFace({ a, b, vertical = true, skin }) {
  const equipped = useEquippedSkins()
  const S = TILE_SKINS[skin || equipped.tile] || TILE_SKINS.classic
  const layout = vertical ? UPRIGHT : SIDEWAYS
  const W = vertical ? 100 : 200
  const H = vertical ? 200 : 100
  const outline = S.ring && S.ring !== 'none'

  // pips for one half; (ox, oy) is that half's top-left corner in the drawing
  const pips = (n, ox, oy, key) => (layout[n] || []).map(i => (
    <circle
      key={`${key}-${i}`}
      cx={ox + SPOT[i % 3]}
      cy={oy + SPOT[Math.floor(i / 3)]}
      r={PIP_R}
      fill={S.pip}
      // flag tiles: white pips with a firm dark edge, so they still read
      // where they land on a white stripe or cross
      stroke={outline ? 'rgba(0,0,0,0.75)' : 'none'}
      strokeWidth={outline ? 3 : 0}
    />
  ))

  return (
    <div aria-hidden="true" style={{
      position: 'absolute', inset: 0,
      borderRadius: 'inherit',
      overflow: 'hidden',
      pointerEvents: 'none',
    }}>
      {/* The skin belongs to the TILE, not the box: it's always painted as an
          upright tile, and a sideways tile shows that same face turned 90°.
          So each half keeps its own colour (Haïti: one half blue, one red)
          whichever way the tile lies. */}
      <div style={vertical
        ? { position: 'absolute', inset: 0, background: S.face(1, 2) }
        : {
            position: 'absolute',
            left: '25%', top: '-50%', width: '50%', height: '200%',
            background: S.face(1, 2),
            // a hair oversized so a box that isn't exactly 2:1 has no gaps
            transform: 'rotate(-90deg) scale(1.06)',
          }} />
      {/* edge and bevel sit on top, unrotated */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 'inherit',
        boxShadow: `inset 0 0 0 1px ${S.edge}, inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 0 rgba(0,0,0,0.12)`,
      }} />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        width="100%" height="100%"
        style={{ position: 'absolute', inset: 0, display: 'block' }}
      >
        <defs>
          <radialGradient id="dk-pin" cx="35%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#fff3c4" />
            <stop offset="45%" stopColor="#d8b25a" />
            <stop offset="100%" stopColor="#8a6a22" />
          </radialGradient>
        </defs>

        {vertical
          ? <>{pips(a, 0, 0, 'a')}{pips(b, 0, 100, 'b')}</>
          : <>{pips(a, 0, 0, 'a')}{pips(b, 100, 0, 'b')}</>}

        {/* centre line */}
        {vertical
          ? <line x1="12" y1="100" x2="88" y2="100" stroke={S.divider} strokeWidth="1.5" />
          : <line x1="100" y1="12" x2="100" y2="88" stroke={S.divider} strokeWidth="1.5" />}

        {/* brass pin */}
        <circle cx={W / 2} cy={H / 2} r="6.5" fill="url(#dk-pin)" />
      </svg>
    </div>
  )
}
