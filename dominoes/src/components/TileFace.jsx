import { TILE_SKINS, useEquippedSkins } from '../lib/skins'

// ── TileFace ─────────────────────────────────────────────────────────────────
// Draws a domino's face to fill whatever box it's placed in: the skin's face,
// a bevel, the centre line with its brass pin, and the pips as shapes (crisp
// at any size, unlike the old pip pictures). Used by the hand, the board and
// anywhere else a face-up tile appears, so a skin applies everywhere at once.
//
// It only paints. It never takes clicks or touches — those stay with whatever
// it sits inside, so dragging and tapping are untouched.

// Which of the 3×3 spots carry a pip. Six is two columns on an upright half
// and two rows on a sideways one, as on a real tile.
const UPRIGHT  = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 3, 6, 2, 5, 8] }
const SIDEWAYS = { 0: [], 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 1, 2, 6, 7, 8] }
const SPOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8]

export default function TileFace({ a, b, vertical = true, skin }) {
  const equipped = useEquippedSkins()
  const S = TILE_SKINS[skin || equipped.tile] || TILE_SKINS.classic
  const layout = vertical ? UPRIGHT : SIDEWAYS
  const face = S.face(vertical ? 1 : 2, vertical ? 2 : 1)

  const half = n => (
    <div style={{
      flex: 1,
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
      padding: '13%',
      minWidth: 0, minHeight: 0,
    }}>
      {SPOTS.map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, minHeight: 0 }}>
          {layout[n]?.includes(i) && (
            <div style={{
              width: '68%', aspectRatio: '1 / 1', maxHeight: '68%',
              borderRadius: '50%', background: S.pip, boxShadow: S.ring,
            }} />
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div aria-hidden="true" style={{
      position: 'absolute', inset: 0,
      borderRadius: 'inherit',
      background: face,
      boxShadow: `inset 0 0 0 1px ${S.edge}, inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 0 rgba(0,0,0,0.12)`,
      display: 'flex',
      flexDirection: vertical ? 'column' : 'row',
      overflow: 'hidden',
      pointerEvents: 'none',
    }}>
      {half(a)}
      {half(b)}
      {/* centre line */}
      <div style={{
        position: 'absolute', background: S.divider,
        ...(vertical
          ? { left: '12%', right: '12%', top: '50%', height: 1 }
          : { top: '12%', bottom: '12%', left: '50%', width: 1 }),
      }} />
      {/* brass pin */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        width: vertical ? '13%' : '6.5%', aspectRatio: '1 / 1',
        transform: 'translate(-50%, -50%)', borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 35%, #fff3c4 0%, #d8b25a 45%, #8a6a22 100%)',
        boxShadow: '0 1px 1px rgba(0,0,0,0.35)',
      }} />
    </div>
  )
}
