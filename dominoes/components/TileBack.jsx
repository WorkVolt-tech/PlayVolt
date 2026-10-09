import { TILE_SKINS, useEquippedSkins } from '../lib/skins'

// ── TileBack ─────────────────────────────────────────────────────────────────
// The back of a domino, in the equipped skin — used wherever a tile is face
// down: opponents' hands and the draw pile.
//   • flag skins:  a white back with the real flag set in the middle
//   • plain skins: the skin's own colour, with a fine diagonal texture
// It fills whatever box it's placed in and only paints (never takes touches).
// The box should be an upright tile shape (1 wide : 2 tall).

// ── Québec: a fleur-de-lis, drawn in a 10 × 10 box ──
const FLEUR = (
  <g fill="#ffffff">
    <path d="M5 0 C6.5 1.6 6.7 3.5 5.6 5.5 L4.4 5.5 C3.3 3.5 3.5 1.6 5 0 Z" />
    <path d="M4.3 6 C3 3.4 0.3 3.5 0.5 5.6 C0.7 7.2 2.5 7.4 3.5 6.5 C2.6 6.7 1.9 6.2 2.1 5.6 C2.5 4.7 3.6 5.1 4.3 6.3 Z" />
    <path d="M5.7 6 C7 3.4 9.7 3.5 9.5 5.6 C9.3 7.2 7.5 7.4 6.5 6.5 C7.4 6.7 8.1 6.2 7.9 5.6 C7.5 4.7 6.4 5.1 5.7 6.3 Z" />
    <rect x="2.4" y="6.2" width="5.2" height="1" rx="0.3" />
    <path d="M4.5 7.2 L4.1 9.6 L5 9 L5.9 9.6 L5.5 7.2 Z" />
  </g>
)

// ── USA: 50 five-pointed stars, 9 rows alternating 6 and 5, in the canton ──
const STAR = 'M0 -1 L0.235 -0.324 L0.951 -0.309 L0.38 0.124 L0.588 0.809 L0 0.4 L-0.588 0.809 L-0.38 0.124 L-0.951 -0.309 L-0.235 -0.324 Z'
const USA_STARS = (() => {
  const cw = 24, ch = 21.54        // the canton: 40% of 60 wide, 7/13 of 40 tall
  const stars = []
  for (let row = 0; row < 9; row++) {
    const y = (row + 1) * ch / 10
    const n = row % 2 === 0 ? 6 : 5
    for (let k = 0; k < n; k++) {
      const x = row % 2 === 0 ? (2 * k + 1) * cw / 12 : (2 * k + 2) * cw / 12
      stars.push(<path key={`${row}-${k}`} d={STAR} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(0.82)`} />)
    }
  }
  return <g fill="#ffffff">{stars}</g>
})()

const EMBLEM_SVG = children => (
  <svg viewBox="0 0 60 40" preserveAspectRatio="none"
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>{children}</svg>
)

// A flag's centre emblem, drawn over the flag in a 60 × 40 grid. Simplified
// on purpose: on an opponent's tile the whole flag is only ~15px wide.
const EMBLEMS = {
  // Haïti: the white panel with the palm tree on its green mound, flanked by
  // blue and red flags, a red cap at the top
  haiti: (
    <svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid meet"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <rect x="20" y="12" width="20" height="16" fill="#ffffff" />
      {/* flags fanned out behind the palm */}
      <path d="M30 22 L21.5 15.5 L22.5 19.5 Z" fill="#00209F" />
      <path d="M30 22 L38.5 15.5 L37.5 19.5 Z" fill="#D21034" />
      {/* the mound */}
      <path d="M21 27.5 Q30 21.5 39 27.5 Z" fill="#2f8f3a" />
      {/* the palm: trunk, fronds, cap */}
      <rect x="29.4" y="16" width="1.2" height="9" fill="#6b4a1f" />
      <path d="M30 16 Q26 14.5 23.8 17 M30 16 Q34 14.5 36.2 17 M30 16 Q27.2 13 25.5 13.3 M30 16 Q32.8 13 34.5 13.3 M30 16 L30 12.9"
        stroke="#1f7a2b" strokeWidth="1.25" fill="none" strokeLinecap="round" />
      <circle cx="30" cy="12.9" r="1" fill="#D21034" />
    </svg>
  ),

  // Québec: a fleur-de-lis centred in each of the four blue quarters
  quebec: EMBLEM_SVG(<>
    <g transform="translate(7.2 1.9) scale(1.2)">{FLEUR}</g>
    <g transform="translate(41.1 1.9) scale(1.2)">{FLEUR}</g>
    <g transform="translate(7.2 26.0) scale(1.2)">{FLEUR}</g>
    <g transform="translate(41.1 26.0) scale(1.2)">{FLEUR}</g>
  </>),

  // USA: the 50 stars
  usa: EMBLEM_SVG(USA_STARS),

  // Dominican Republic: the coat of arms where the cross meets — laurel and
  // palm branches, the blue ribbon above, the quartered shield with the Bible
  // and cross, and the red ribbon below
  dominican: EMBLEM_SVG(<g transform="translate(30 20) scale(1.6) translate(-30 -20.6)">
    {/* laurel (left) and palm (right) */}
    <path d="M27.2 27.2 C23.2 24.6 22.6 18.6 25.2 14.4" stroke="#2e7d32" strokeWidth="0.7" fill="none" />
    {[[24.3,24.4,-40],[23.4,21.6,-20],[23.4,18.6,0],[24.2,15.9,20]].map(([x,y,r],i)=>(
      <ellipse key={'l'+i} cx={x} cy={y} rx="1.5" ry="0.65" transform={`rotate(${r} ${x} ${y})`} fill="#2e7d32" />
    ))}
    <path d="M32.8 27.2 C36.8 24.6 37.4 18.6 34.8 14.4" stroke="#2e7d32" strokeWidth="0.7" fill="none" />
    {[[35.7,24.4,40],[36.6,21.6,20],[36.6,18.6,0],[35.8,15.9,-20]].map(([x,y,r],i)=>(
      <ellipse key={'p'+i} cx={x} cy={y} rx="1.7" ry="0.5" transform={`rotate(${r} ${x} ${y})`} fill="#3b8f3b" />
    ))}
    {/* blue ribbon above */}
    <path d="M25 14.2 Q30 11.6 35 14.2" stroke="#002D62" strokeWidth="1.5" fill="none" />
    {/* the shield: quartered blue and red, white cross */}
    <path d="M27 15.4 H33 V20.6 Q33 23.4 30 24.6 Q27 23.4 27 20.6 Z" fill="#ffffff" stroke="#c9a84c" strokeWidth="0.35" />
    <rect x="27.35" y="15.75" width="2.25" height="2.6" fill="#002D62" />
    <rect x="30.4" y="15.75" width="2.25" height="2.6" fill="#CE1126" />
    <path d="M27.35 19.15 H29.6 V23.4 Q28.1 22.6 27.35 20.6 Z" fill="#CE1126" />
    <path d="M30.4 19.15 H32.65 V20.6 Q32 22.6 30.4 23.4 Z" fill="#002D62" />
    {/* the open Bible and the small gold cross */}
    <rect x="29.05" y="18.15" width="1.9" height="1.4" fill="#ffffff" stroke="#8a6a22" strokeWidth="0.2" />
    <line x1="30" y1="18.2" x2="30" y2="19.5" stroke="#8a6a22" strokeWidth="0.2" />
    <path d="M30 16.2 V17.9 M29.4 16.8 H30.6" stroke="#c9a84c" strokeWidth="0.35" />
    {/* red ribbon below */}
    <path d="M25.2 25.8 Q30 28.4 34.8 25.8" stroke="#CE1126" strokeWidth="1.4" fill="none" />
  </g>),
}

export default function TileBack({ skin, turn = 0 }) {
  const equipped = useEquippedSkins()
  const S = TILE_SKINS[skin || equipped.tile] || TILE_SKINS.classic

  const texture = 'repeating-linear-gradient(135deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 2px, transparent 2px, transparent 5px)'
  const shade = 'linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.28) 100%)'

  // Sideways tile (turn = ±90): paint the upright back in a 1:2 box centred
  // in the 2:1 tile, turned to lie along it.
  const upright = !turn
  return (
    <div aria-hidden="true" style={upright
      ? { position: 'absolute', inset: 0, borderRadius: 'inherit', overflow: 'hidden', pointerEvents: 'none' }
      : { position: 'absolute', inset: 0, borderRadius: 'inherit', overflow: 'hidden', pointerEvents: 'none' }}>
    <div style={{
      ...(upright
        ? { position: 'absolute', inset: 0, borderRadius: 'inherit' }
        : { position: 'absolute', left: '25%', top: '-50%', width: '50%', height: '200%',
            transform: `rotate(${turn}deg) scale(1.04)`, borderRadius: 3 }),
      overflow: 'hidden', pointerEvents: 'none',
      background: S.flag
        // flag tiles: a white back, with the flag set in the middle
        ? 'repeating-linear-gradient(135deg, rgba(0,0,0,0.035) 0px, rgba(0,0,0,0.035) 2px, transparent 2px, transparent 5px), linear-gradient(160deg, #ffffff 0%, #f1efe9 60%, #e2ded4 100%)'
        : `${texture}, ${shade}, ${S.face(1, 2)}`,
      boxShadow: S.flag
        ? 'inset 0 0 0 1px #b9b3a6, inset 0 1px 0 rgba(255,255,255,0.6)'
        : `inset 0 0 0 1px ${S.edge}, inset 0 1px 0 rgba(255,255,255,0.18)`,
    }}>
      {S.flag && (
        // The real flag, landscape 3:2, centred: 84% of the back's width.
        // (Its own drawing — the tile face patterns are laid out for the tile,
        // not to be the true flag.)
        <div style={{
          position: 'absolute', left: '8%', width: '84%',
          top: '50%', transform: 'translateY(-50%)',
          height: 0, paddingBottom: '56%',
          overflow: 'hidden', borderRadius: 1,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.25)',
        }}>
          <div style={{ position: 'absolute', inset: 0, background: S.flagArt || S.face(2, 1) }} />
          {S.emblem && EMBLEMS[S.emblem]}
        </div>
      )}
    </div>
    </div>
  )
}
