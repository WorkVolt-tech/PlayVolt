import { TILE_SKINS, useEquippedSkins } from '../lib/skins'

// ── TileBack ─────────────────────────────────────────────────────────────────
// The back of a domino, in the equipped skin — used wherever a tile is face
// down: opponents' hands and the draw pile.
//   • flag skins:  a dark back with the flag set in the middle, landscape
//   • plain skins: the skin's own colour, with a fine diagonal texture
// It fills whatever box it's placed in and only paints (never takes touches).
// The box should be an upright tile shape (1 wide : 2 tall).

export default function TileBack({ skin }) {
  const equipped = useEquippedSkins()
  const S = TILE_SKINS[skin || equipped.tile] || TILE_SKINS.classic

  const texture = 'repeating-linear-gradient(135deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 2px, transparent 2px, transparent 5px)'
  const shade = 'linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.28) 100%)'

  return (
    <div aria-hidden="true" style={{
      position: 'absolute', inset: 0, borderRadius: 'inherit', overflow: 'hidden', pointerEvents: 'none',
      background: S.flag
        ? `${texture}, linear-gradient(160deg, #34312b 0%, #1d1b17 60%, #0f0e0c 100%)`
        : `${texture}, ${shade}, ${S.face(1, 2)}`,
      boxShadow: `inset 0 0 0 1px ${S.edge}, inset 0 1px 0 rgba(255,255,255,0.18)`,
    }}>
      {S.flag && (
        // The real flag, landscape 3:2, centred: 74% of the back's width.
        // (Its own drawing — the tile face patterns are laid out for the tile,
        // not to be the true flag.)
        <div style={{
          position: 'absolute', left: '13%', width: '74%',
          top: '50%', transform: 'translateY(-50%)',
          height: 0, paddingBottom: '49.3%',
          overflow: 'hidden', borderRadius: 1,
          boxShadow: '0 0 0 1px rgba(255,255,255,0.35), 0 1px 3px rgba(0,0,0,0.6)',
        }}>
          <div style={{ position: 'absolute', inset: 0, background: S.flagArt || S.face(2, 1) }} />
        </div>
      )}
    </div>
  )
}
