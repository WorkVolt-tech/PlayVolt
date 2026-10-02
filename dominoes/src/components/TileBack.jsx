import { TILE_SKINS, useEquippedSkins } from '../lib/skins'

// ── TileBack ─────────────────────────────────────────────────────────────────
// The back of a domino, in the equipped skin — used wherever a tile is face
// down: opponents' hands and the draw pile.
//   • flag skins:  a white back with the real flag set in the middle
//   • plain skins: the skin's own colour, with a fine diagonal texture
// It fills whatever box it's placed in and only paints (never takes touches).
// The box should be an upright tile shape (1 wide : 2 tall).

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
}

export default function TileBack({ skin }) {
  const equipped = useEquippedSkins()
  const S = TILE_SKINS[skin || equipped.tile] || TILE_SKINS.classic

  const texture = 'repeating-linear-gradient(135deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 2px, transparent 2px, transparent 5px)'
  const shade = 'linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.28) 100%)'

  return (
    <div aria-hidden="true" style={{
      position: 'absolute', inset: 0, borderRadius: 'inherit', overflow: 'hidden', pointerEvents: 'none',
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
  )
}
