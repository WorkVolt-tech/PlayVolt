import { DECO_KINDS, decoSvg, decoDefs } from '../lib/decoShapes'

// ── ShapedTile ───────────────────────────────────────────────────────────────
// The art for the shaped tile skins: Kapsil (an oval) and Zo (a bone).
// TileFace and TileBack hand over to this when the skin has a `shape`.
//
// The art is drawn SIDEWAYS in a 200 × 100 grid; an upright tile is the same
// art turned 90° (so the first number is on the left when sideways and on top
// when upright, like every other skin). It's scaled evenly, so the shape and
// the pips never stretch. The box around it drops its rectangle (background,
// shadow, border) — see "Shaped tile skins" in styles/global.css.
//
// The gradients and patterns live ONCE on the page (<ShapeDefs />, rendered by
// App.jsx in an always-present, invisible <svg>) and every tile refers to them.
// The shadow and the gold glow are drawn with the tile — a hidden gold outline
// (.st-glow) the CSS fades in — so no CSS filters are used: per-tile copies of
// the definitions and filter effects made long games run out of memory on iPhone.

const SIDE = { 0: [], 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 1, 2, 6, 7, 8] }

// The bone's outline, pulled in by `o` units (0 = the outer edge): chamfered
// ends with a small notch in the middle, and a pinched waist.
function bonePath(o) {
  const L = 2 + o, R = 198 - o, T = 4 + o, B = 96 - o, c = 13 - o * 0.4
  const wT = 20 + o, wB = 80 - o, sx = 64 - o * 0.2, wx = 86 + o * 0.3
  const nT = 43, nB = 57, nd = 5
  return `M${L + c} ${T} H${sx} L${wx} ${wT} H${200 - wx} L${200 - sx} ${T} H${R - c} L${R} ${T + c} ` +
    `V${nT} H${R - nd} V${nB} H${R} V${B - c} L${R - c} ${B} H${200 - sx} L${200 - wx} ${wB} H${wx} L${sx} ${B} H${L + c} L${L} ${B - c} ` +
    `V${nB} H${L + nd} V${nT} H${L} V${T + c} Z`
}

function Defs({ u }) {
  return (
    <defs>
      <linearGradient id={`${u}gold`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff1bf" /><stop offset=".18" stopColor="#e9c46a" />
        <stop offset=".5" stopColor="#b8892e" /><stop offset=".78" stopColor="#e2b95a" /><stop offset="1" stopColor="#6e4f16" />
      </linearGradient>
      <linearGradient id={`${u}goldin`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#7a5a1c" /><stop offset=".5" stopColor="#d9b053" /><stop offset="1" stopColor="#fff0b8" />
      </linearGradient>
      <linearGradient id={`${u}bar`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#7a5a1c" /><stop offset=".45" stopColor="#ffe9a6" /><stop offset=".6" stopColor="#d4a94a" /><stop offset="1" stopColor="#6e4f16" />
      </linearGradient>
      <radialGradient id={`${u}face`} cx=".5" cy=".38" r=".75">
        <stop offset="0" stopColor="#26231e" /><stop offset=".7" stopColor="#121110" /><stop offset="1" stopColor="#070707" />
      </radialGradient>
      <linearGradient id={`${u}sheen`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="rgba(255,255,255,.22)" /><stop offset="1" stopColor="rgba(255,255,255,0)" />
      </linearGradient>
      <radialGradient id={`${u}pearl`} cx=".36" cy=".32" r=".75">
        <stop offset="0" stopColor="#fffdf5" /><stop offset=".45" stopColor="#efe3c6" /><stop offset=".85" stopColor="#b79d6c" /><stop offset="1" stopColor="#7d6638" />
      </radialGradient>
      <pattern id={`${u}quilt`} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <path d="M0 0 H14 M0 0 V14" stroke="#c9a14a" strokeWidth=".8" opacity=".28" />
      </pattern>
      <clipPath id={`${u}ovalclip`}><rect x="6" y="8" width="188" height="84" rx="42" /></clipPath>
      <clipPath id={`${u}boneclip`}><path d={bonePath(5)} /></clipPath>
    </defs>
  )
}

// pearl pips for one half: a 3 × 3 grid centred on (cx, cy), `d` apart
function Pips({ n, cx, cy, d, r, u }) {
  return (SIDE[n] || []).map(i => {
    const x = cx + ((i % 3) - 1) * d, y = cy + (Math.floor(i / 3) - 1) * d
    return (
      <g key={i}>
        <circle cx={x} cy={y} r={r} fill={`url(#${u}pearl)`} />
        <circle cx={x - r * 0.32} cy={y - r * 0.36} r={r * 0.28} fill="rgba(255,255,255,.75)" />
      </g>
    )
  })
}

// the back's centrepiece: a gold Art Deco diamond with a pearl
function Medallion({ k, u }) {
  const cx = 100, cy = 50
  return (
    <>
      <path d={`M${cx} ${cy - k} L${cx + k * 1.35} ${cy} L${cx} ${cy + k} L${cx - k * 1.35} ${cy} Z`} fill={`url(#${u}gold)`} stroke="#5e4312" strokeWidth=".8" />
      <path d={`M${cx} ${cy - k * 0.62} L${cx + k * 0.84} ${cy} L${cx} ${cy + k * 0.62} L${cx - k * 0.84} ${cy} Z`} fill="#0c0b09" />
      <circle cx={cx} cy={cy} r={k * 0.3} fill={`url(#${u}pearl)`} />
      <path d={`M${cx - k * 2.5} ${cy} H${cx - k * 1.6} M${cx + k * 1.6} ${cy} H${cx + k * 2.5}`} stroke="#d9b053" strokeWidth={k * 0.22} strokeLinecap="round" />
    </>
  )
}

// ── Kapsil: the whole domino is the oval; the black face fills the gold rim ──
function Oval({ a, b, back, u }) {
  return (
    <>
      <rect x="1" y="5.6" width="198" height="94" rx="47" fill="rgba(0,0,0,.42)" />
      <rect className="st-glow" x="1" y="3" width="198" height="94" rx="47" fill="none" stroke="#e8c96a" strokeWidth="14" strokeOpacity=".3" />
      <rect className="st-glow" x="1" y="3" width="198" height="94" rx="47" fill="none" stroke="#f3d27a" strokeWidth="7" />
      <rect x="1" y="3" width="198" height="94" rx="47" fill={`url(#${u}gold)`} />
      <rect x="5" y="7" width="190" height="86" rx="43" fill="#0a0907" />
      <rect x="6" y="8" width="188" height="84" rx="42" fill={`url(#${u}face)`} />
      <rect x="6" y="8" width="188" height="30" fill={`url(#${u}sheen)`} opacity=".55" clipPath={`url(#${u}ovalclip)`} />
      {back
        ? <><rect x="6" y="8" width="188" height="84" rx="42" fill={`url(#${u}quilt)`} /><Medallion k={20} u={u} /></>
        : <>
            <rect x="97.4" y="18" width="5.2" height="64" rx="2.6" fill={`url(#${u}bar)`} />
            <Pips n={a} cx={60} cy={50} d={20} r={8.5} u={u} />
            <Pips n={b} cx={140} cy={50} d={20} r={8.5} u={u} />
          </>}
    </>
  )
}

// ── Zo, face: one gold rim, the black face fills the bone ──
function BoneFace({ a, b, u }) {
  return (
    <>
      <path d={bonePath(0)} transform="translate(0 2.6)" fill="rgba(0,0,0,.42)" />
      <path className="st-glow" d={bonePath(0)} fill="none" stroke="#e8c96a" strokeWidth="14" strokeOpacity=".3" strokeLinejoin="round" />
      <path className="st-glow" d={bonePath(0)} fill="none" stroke="#f3d27a" strokeWidth="7" strokeLinejoin="round" />
      <path d={bonePath(0)} fill={`url(#${u}gold)`} stroke="#5e4312" strokeWidth="1" />
      <path d={bonePath(4)} fill="#0a0907" />
      <path d={bonePath(5)} fill={`url(#${u}face)`} />
      <rect x="0" y="0" width="200" height="34" fill={`url(#${u}sheen)`} opacity=".55" clipPath={`url(#${u}boneclip)`} />
      <rect x="97.4" y="27" width="5.2" height="46" rx="2.6" fill={`url(#${u}bar)`} />
      <Pips n={a} cx={50} cy={50} d={20} r={8.6} u={u} />
      <Pips n={b} cx={150} cy={50} d={20} r={8.6} u={u} />
    </>
  )
}

// ── Zo, back: the double gold frame with a fine inner line, quilted ──
function BoneBack({ u }) {
  return (
    <>
      <path d={bonePath(0)} transform="translate(0 2.6)" fill="rgba(0,0,0,.42)" />
      <path d={bonePath(0)} fill={`url(#${u}gold)`} stroke="#5e4312" strokeWidth="1" />
      <path d={bonePath(5)} fill={`url(#${u}goldin)`} />
      <path d={bonePath(7.5)} fill="#0c0b09" />
      <path d={bonePath(9)} fill={`url(#${u}face)`} />
      <path d={bonePath(9)} fill={`url(#${u}quilt)`} />
      <path d={bonePath(11.5)} fill="none" stroke="#c9a14a" strokeWidth=".9" opacity=".75" />
      <Medallion k={17} u={u} />
    </>
  )
}

const U = 'sd-ov-'      // the shared ids for Kapsil and Zo

// Rendered once by App.jsx: every shaped tile's gradients and patterns.
// (Invisible but present: a display:none <svg> would make browsers drop them.)
export function ShapeDefs() {
  return (
    <svg aria-hidden="true" width="0" height="0" focusable="false"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <Defs u={U} />
      <g dangerouslySetInnerHTML={{ __html: decoDefs() }} />
    </svg>
  )
}

// shape: 'oval' | 'bone' | a deco shape. sideways: lie along a 2:1 box (else upright, 1:2).
export default function ShapedTile({ shape, a = 0, b = 0, back = false, sideways = false }) {
  const box = { position: 'absolute', inset: 0, display: 'block', overflow: 'visible' }
  const view = sideways ? '0 0 200 100' : '0 0 100 200'
  // the black-marble deco family (Hexa, Oktav, Fle, Lozanj, Dyaman, Konkav, Triyang)
  if (DECO_KINDS.includes(shape)) {
    const html = { __html: decoSvg(shape, a, b, back) }
    return (
      <div data-tile-shape={shape} aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <svg viewBox={view} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style={box}>
          {sideways ? <g dangerouslySetInnerHTML={html} /> : <g transform="translate(100 0) rotate(90)" dangerouslySetInnerHTML={html} />}
        </svg>
      </div>
    )
  }
  const art = shape === 'bone'
    ? (back ? <BoneBack u={U} /> : <BoneFace a={a} b={b} u={U} />)
    : <Oval a={a} b={b} back={back} u={U} />
  return (
    <div data-tile-shape={shape} aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <svg viewBox={view} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style={box}>
        {sideways ? art : <g transform="translate(100 0) rotate(90)">{art}</g>}
      </svg>
    </div>
  )
}
