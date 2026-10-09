// ── Avatars ─────────────────────────────────────────────────────────────────
// Every picture in the game, drawn in code (crisp at any size):
//   • 38 trophy avatars — one per trophy, framed by the trophy's tier
//     (bronze → silver → gold → platinum) with a badge for what it took
//   • 16 bot avatars — regulars in a wood-and-brass ring, experts in onyx
//     with an ember glow
import { TROPHIES } from './trophies'
import './avatars.css'

// One picture per trophy, on a 100 × 100 grid. Ivory shapes, dark outlines,
// a few accent colours.
const IV = '#f3ead2', INK = '#1c1a16', S = { stroke: INK, strokeWidth: 2.5, strokeLinejoin: 'round', strokeLinecap: 'round' }
const GOLD = '#e8c96a', RED = '#d64545', BLUE = '#3f6fd8', GREEN = '#3f9a52', BROWN = '#a8743e', ORANGE = '#ff9d4d'
const tile = (x, y, w, h, pips = [], rot = 0) => (
  <g transform={`rotate(${rot} ${x + w / 2} ${y + h / 2})`}>
    <rect x={x} y={y} width={w} height={h} rx={Math.min(w, h) * 0.18} fill={IV} {...S} />
    {w > h ? <line x1={x + w / 2} y1={y + 3} x2={x + w / 2} y2={y + h - 3} stroke={INK} strokeWidth="1.6" /> : <line x1={x + 3} y1={y + h / 2} x2={x + w - 3} y2={y + h / 2} stroke={INK} strokeWidth="1.6" />}
    {pips.map(([px, py], i) => <circle key={i} cx={x + px} cy={y + py} r={Math.min(w, h) * 0.11} fill={INK} />)}
  </g>
)
const chair = (dx = 0) => (
  <g {...S} transform={`translate(${dx} 0)`}>
    <path d="M36 22 H58 Q62 22 62 26 V52 H36 Z" fill="#c8a06a" />
    <path d="M40 30 H58 M40 38 H58 M40 46 H58" stroke="#8a6a3a" strokeWidth="1.8" />
    <path d="M30 52 H68 Q70 52 70 55 V59 H30 Z" fill="#e2c08a" />
    <path d="M34 59 V80 M66 59 V80 M38 70 H62" fill="none" />
  </g>
)
const cup = (x, y, s = 1) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} {...S}>
    <path d="M-17 -28 H17 V-12 C17 1 9 8 0 8 C-9 8 -17 1 -17 -12 Z" fill={GOLD} />
    <path d="M-17 -22 C-28 -22 -29 -4 -14 -3 M17 -22 C28 -22 29 -4 14 -3" fill="none" strokeWidth={4.2} />
    <path d="M-17 -22 C-28 -22 -29 -4 -14 -3 M17 -22 C28 -22 29 -4 14 -3" fill="none" stroke={GOLD} strokeWidth={1.8} />
    <path d="M-5 8 H5 V17 H-5 Z" fill={GOLD} /><path d="M-15 17 H15 V26 H-15 Z" fill={GOLD} />
  </g>
)
const star = (cx, cy, r, fill = IV) => {
  const p = [...Array(10)].map((_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; return `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}` }).join(' ')
  return <polygon points={p} fill={fill} {...S} />
}
const sparkle = (x, y, r, fill = '#fff') => <path d={`M${x} ${y - r} L${x + r * .3} ${y - r * .3} L${x + r} ${y} L${x + r * .3} ${y + r * .3} L${x} ${y + r} L${x - r * .3} ${y + r * .3} L${x - r} ${y} L${x - r * .3} ${y - r * .3} Z`} fill={fill} />
const hand = <path d="M38 78 C30 72 28 62 30 54 L30 40 C30 36 36 36 36 40 L36 52 L36 32 C36 28 42 28 42 32 L42 50 L42 28 C42 24 48 24 48 28 L48 50 L48 32 C48 28 54 28 54 32 L54 54 L58 48 C61 44 66 47 64 52 L56 70 C54 75 50 78 46 78 Z" fill={IV} {...S} />
const fist = <g {...S}><path d="M32 44 Q32 34 42 34 H60 Q68 34 68 42 V58 Q68 70 56 70 H44 Q32 70 32 58 Z" fill={IV} /><path d="M44 34 V44 M52 34 V44 M60 34 V44" fill="none" /><path d="M32 50 Q24 50 26 58 Q28 64 36 62" fill={IV} /></g>

export const TROPHY_ICONS = {
  // Getting started
  'premye-chez': chair(),
  'premye-vyej': <g {...S}><path d="M38 56 L30 82 L40 76 L44 86 L50 62 M62 56 L70 82 L60 76 L56 86 L50 62" fill={RED} />{[...Array(12)].map((_, i) => { const a = i * Math.PI / 6; return <circle key={i} cx={50 + 17 * Math.cos(a)} cy={42 + 17 * Math.sin(a)} r="6" fill={BLUE} stroke={INK} strokeWidth="1.5" /> })}<circle cx="50" cy="42" r="14" fill={GOLD} /><text x="50" y="49" textAnchor="middle" fontSize="18" fontWeight="700" fill={INK} stroke="none" fontFamily="Georgia, serif">1</text></g>,
  'premye-dekabess': <g>{tile(14, 41, 22, 14, [[5, 7], [17, 7]])}{tile(39, 41, 22, 14, [[5, 4], [5, 10], [17, 7]])}{tile(64, 41, 22, 14, [[5, 7], [17, 4], [17, 10]])}{sparkle(10, 32, 7, GOLD)}{sparkle(90, 32, 7, GOLD)}{sparkle(50, 26, 5, GOLD)}</g>,
  // Matches won
  'konkiran': <g>{tile(18, 34, 20, 38, [[10, 9], [6, 27], [14, 31]], -24)}{tile(62, 34, 20, 38, [[6, 7], [14, 13], [10, 29]], 24)}{sparkle(50, 30, 8, GOLD)}</g>,
  'abitye': <g {...S}><path d="M26 76 H74" strokeWidth="4" /><path d="M30 46 H64 V60 C64 70 57 74 47 74 C37 74 30 70 30 60 Z" fill={IV} /><path d="M64 50 C74 50 74 64 64 64" fill="none" strokeWidth="3.5" /><path d="M40 40 C36 34 44 30 40 22 M50 40 C46 34 54 30 50 22 M58 40 C54 34 62 30 58 22" fill="none" stroke="#c9b9a0" strokeWidth="2.2" /><path d="M30 52 H64" stroke="#7a5233" strokeWidth="5" /></g>,
  'ansyen': <g {...S}><circle cx="50" cy="20" r="5" fill={GOLD} /><rect x="46" y="22" width="8" height="7" fill={GOLD} /><circle cx="50" cy="55" r="25" fill={GOLD} /><circle cx="50" cy="55" r="19" fill={IV} />{[...Array(12)].map((_, i) => { const a = i * Math.PI / 6; return <line key={i} x1={50 + 15 * Math.cos(a)} y1={55 + 15 * Math.sin(a)} x2={50 + 17.5 * Math.cos(a)} y2={55 + 17.5 * Math.sin(a)} strokeWidth="1.6" /> })}<path d="M50 55 V43 M50 55 L59 60" strokeWidth="2.6" /></g>,
  'chanpyon': <g {...S}><path d="M36 16 L46 46 L54 46 L44 16 Z" fill={RED} /><path d="M64 16 L54 46 L46 46 L56 16 Z" fill={BLUE} /><circle cx="50" cy="62" r="19" fill={GOLD} /><circle cx="50" cy="62" r="13" fill="none" stroke="#a8862e" strokeWidth="1.6" />{star(50, 62, 9, IV)}</g>,
  'lejann': <g>{[...Array(7)].map((_, i) => { const a = 150 + i * 15, x = 50 + 28 * Math.cos(a * Math.PI / 180), y = 44 + 28 * Math.sin(a * Math.PI / 180); return <ellipse key={'a' + i} cx={x} cy={y} rx="8" ry="3.6" transform={`rotate(${a + 65} ${x} ${y})`} fill={GOLD} stroke={INK} strokeWidth="1.6" /> })}{[...Array(7)].map((_, i) => { const a = 30 - i * 15, x = 50 + 28 * Math.cos(a * Math.PI / 180), y = 44 + 28 * Math.sin(a * Math.PI / 180); return <ellipse key={'b' + i} cx={x} cy={y} rx="8" ry="3.6" transform={`rotate(${a - 65} ${x} ${y})`} fill={GOLD} stroke={INK} strokeWidth="1.6" /> })}<path d="M30 74 Q50 84 70 74" fill="none" stroke={INK} strokeWidth="2.5" />{sparkle(50, 40, 9, '#fff')}</g>,
  'met-tab': <g {...S}><path d="M18 64 H82 V70 H18 Z" fill="#c8a06a" /><path d="M24 70 V86 M76 70 V86" fill="none" strokeWidth="3.5" /><path d="M30 56 L33 30 L42 42 L50 24 L58 42 L67 30 L70 56 Z" fill={GOLD} /><circle cx="50" cy="44" r="3" fill={RED} /></g>,
  // Matches played
  'chofe-chez': <g>{chair(0)}<path d="M28 20 C24 14 32 10 28 4 M70 20 C66 14 74 10 70 4 M80 34 C76 28 84 24 80 18" fill="none" stroke={ORANGE} strokeWidth="2.8" strokeLinecap="round" /></g>,
  'figi-konnen': <g {...S}><circle cx="50" cy="50" r="27" fill={GOLD} /><circle cx="41" cy="44" r="3.4" fill={INK} /><circle cx="59" cy="44" r="3.4" fill={INK} /><path d="M38 56 Q50 68 62 56" fill="none" strokeWidth="3" /><circle cx="34" cy="55" r="3.5" fill="#f08a6a" stroke="none" /><circle cx="66" cy="55" r="3.5" fill="#f08a6a" stroke="none" /></g>,
  'pye-tab': <g {...S}><path d="M16 40 H84 V48 H16 Z" fill="#c8a06a" /><path d="M22 48 H32 V84 H22 Z M68 48 H78 V84 H68 Z" fill="#a87d4a" /><path d="M32 58 H68" fill="none" strokeWidth="3" />{tile(38, 28, 24, 12, [[6, 6], [18, 4], [18, 8]])}</g>,
  'moun-lakay': <g {...S}><path d="M18 50 L50 22 L82 50 Z" fill={RED} /><path d="M26 48 H74 V80 H26 Z" fill={IV} /><path d="M33 56 H47 V68 H33 Z" fill={GOLD} /><path d="M40 56 V68 M33 62 H47" strokeWidth="1.6" /><path d="M55 60 H67 V80 H55 Z" fill="#8a5a33" /><circle cx="64" cy="70" r="1.3" fill={GOLD} stroke="none" /></g>,
  'san-match': <g>{tile(24, 66, 52, 14, [[8, 7], [44, 4], [44, 10]], 0)}{tile(28, 52, 52, 14, [[8, 4], [8, 10], [44, 7]], 0)}{tile(20, 38, 52, 14, [[8, 7], [44, 7]], 0)}{tile(26, 24, 52, 14, [[8, 4], [8, 10], [44, 4], [44, 10]], 0)}</g>,
  // Dekabess
  'twa-kou': <g {...S}><path d="M30 78 L62 40" fill="none" stroke="#8a5a33" strokeWidth="7" /><path d="M30 78 L62 40" fill="none" stroke="#c8a06a" strokeWidth="3.5" /><path d="M52 24 L80 48 L72 58 L44 34 Z" fill="#9aa3ad" /><path d="M18 30 L28 36 M14 44 L26 46 M22 18 L30 28" fill="none" stroke={ORANGE} strokeWidth="3" /></g>,
  'tire': <g {...S}><circle cx="46" cy="54" r="26" fill={IV} /><circle cx="46" cy="54" r="18" fill={RED} /><circle cx="46" cy="54" r="10" fill={IV} /><circle cx="46" cy="54" r="4" fill={RED} /><path d="M46 54 L80 20" fill="none" strokeWidth="3" /><path d="M74 16 L84 16 L84 26 M80 20 L86 14" fill="none" stroke={GOLD} strokeWidth="3" /></g>,
  'met-dekabess': <g>{star(50, 58, 25)}<path d="M36 34 L38 18 L45 26 L50 14 L55 26 L62 18 L64 34 Z" fill={GOLD} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" /></g>,
  'kanpe-tout-moun': <g><polygon points="38,18 62,18 80,36 80,62 62,80 38,80 20,62 20,36" fill={RED} stroke={INK} strokeWidth="2.5" /><polygon points="40,23 60,23 75,38 75,60 60,75 40,75 25,60 25,38" fill="none" stroke="#fff" strokeWidth="2" /><text x="50" y="56" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif">STOP</text></g>,
  'pesonn-pa-touche': <g {...S}><path d="M50 16 L78 26 V48 C78 66 66 78 50 86 C34 78 22 66 22 48 V26 Z" fill="#9aa3ad" /><path d="M50 22 L72 30 V48 C72 62 63 72 50 79 Z" fill={BLUE} stroke="none" /><path d="M50 22 L28 30 V48 C28 62 37 72 50 79 Z" fill={IV} stroke="none" /><path d="M50 16 L78 26 V48 C78 66 66 78 50 86 C34 78 22 66 22 48 V26 Z" fill="none" /></g>,
  // Clean rounds
  'men-pwop': <g>{hand}{sparkle(72, 26, 8, '#fff')}{sparkle(26, 30, 5, '#fff')}{sparkle(76, 50, 4, '#fff')}</g>,
  'pa-janm-frape': <g>{fist}<circle cx="50" cy="52" r="32" fill="none" stroke={RED} strokeWidth="5" /><path d="M28 30 L72 74" stroke={RED} strokeWidth="5" /></g>,
  'san-frape': <g {...S}><path d="M28 56 Q40 46 50 52 Q60 46 72 56 Q60 70 50 68 Q40 70 28 56 Z" fill={RED} /><path d="M28 56 Q50 60 72 56" fill="none" strokeWidth="1.8" /><rect x="45" y="22" width="10" height="44" rx="5" fill={IV} /><path d="M45 34 H55" strokeWidth="1.4" fill="none" /></g>,
  // Comebacks
  'remonte': <g {...S}><path d="M30 86 L38 22 M54 86 L62 22" fill="none" stroke="#a87d4a" strokeWidth="4" /><path d="M32 74 H56 M34 60 H58 M36 46 H60 M38 32 H62" fill="none" stroke="#a87d4a" strokeWidth="3" /><path d="M76 72 V30 M66 40 L76 28 L86 40" fill="none" stroke={GREEN} strokeWidth="5" /></g>,
  'leve-kanpe': <g {...S}><path d="M34 18 H54 V54 L74 60 Q82 63 82 70 V78 H30 V60 Q34 56 34 48 Z" fill="#8a5a33" /><path d="M30 78 H82 V84 H30 Z" fill="#3a2a1a" /><path d="M36 26 H52 M36 34 H52 M36 42 H52" fill="none" stroke={GOLD} strokeWidth="2" /><path d="M14 84 H90" fill="none" strokeWidth="3" /></g>,
  'pa-janm-mouri': <g {...S}><path d="M50 30 C44 40 44 52 50 62 C56 52 56 40 50 30 Z" fill={GOLD} /><path d="M48 44 C36 30 22 34 14 24 C16 42 30 52 46 56 Z" fill={ORANGE} /><path d="M52 44 C64 30 78 34 86 24 C84 42 70 52 54 56 Z" fill={ORANGE} /><path d="M46 60 C40 72 42 80 50 88 C58 80 60 72 54 60 Z" fill={RED} /><circle cx="50" cy="26" r="5" fill={GOLD} /><path d="M50 21 L52 15 L48 18 Z" fill={RED} /></g>,
  // Five doubles
  'pa-pe-doub': <g {...S}>{[...Array(14)].map((_, i) => { const a = i * Math.PI / 7; return <circle key={i} cx={50 + 24 * Math.cos(a)} cy={50 + 24 * Math.sin(a)} r="9" fill="#b0702a" stroke="none" /> })}<circle cx="50" cy="50" r="27" fill="none" stroke={INK} strokeWidth="1.2" /><circle cx="50" cy="52" r="17" fill={GOLD} /><circle cx="44" cy="47" r="2.4" fill={INK} /><circle cx="56" cy="47" r="2.4" fill={INK} /><path d="M46 56 L50 60 L54 56 Z" fill={INK} /><path d="M44 62 Q50 66 56 62" fill="none" strokeWidth="1.8" /></g>,
  'doub-pa-bat-mwen': <g>{tile(28, 18, 22, 64, [[5.5, 8], [16.5, 8], [5.5, 22], [16.5, 22], [11, 15], [5.5, 42], [16.5, 42], [11, 49], [5.5, 56], [16.5, 56]], -10)}<g transform="translate(14 0) rotate(14 50 50)">{tile(50, 18, 0.01, 0.01, [])}</g><path d="M30 46 L42 50 L36 54 L48 58" fill="none" stroke={RED} strokeWidth="3" strokeLinecap="round" />{sparkle(70, 30, 9, GOLD)}{sparkle(72, 66, 6, GOLD)}</g>,
  // Tournaments
  'premye-koup': cup(50, 54, 1.25),
  'twa-koup': <g>{cup(24, 60, 0.75)}{cup(76, 60, 0.75)}{cup(50, 52, 0.95)}</g>,
  'dinasti': <g {...S}><path d="M30 86 V40 H70 V86 Z" fill="#b8b0a0" /><path d="M26 40 V30 H34 V36 H42 V30 H50 V36 H58 V30 H66 V36 H74 V30 V40 Z" fill="#b8b0a0" /><path d="M44 86 V70 Q50 62 56 70 V86 Z" fill="#5a3a1a" /><path d="M42 50 H48 V58 H42 Z M52 50 H58 V58 H52 Z" fill={GOLD} /><path d="M50 30 V10" fill="none" strokeWidth="2.5" /><path d="M50 10 L66 15 L50 20 Z" fill={RED} /></g>,
  // Story Mode
  'sak-la': <g {...S}><path d="M30 42 Q24 64 30 78 Q50 88 70 78 Q76 64 70 42 Z" fill="#c8a06a" /><path d="M30 42 Q50 32 70 42 Q50 50 30 42 Z" fill="#8a6a3a" />{tile(18, 70, 18, 10, [[4.5, 5], [13.5, 5]], -20)}{tile(64, 72, 18, 10, [[4.5, 3], [4.5, 7], [13.5, 5]], 15)}{tile(44, 22, 12, 22, [[6, 5.5], [3, 16], [9, 16]], 10)}</g>,
  'konte-pwen': <g {...S}><path d="M18 20 H82 V80 H18 Z" fill="none" stroke="#8a5a33" strokeWidth="4" /><path d="M18 38 H82 M18 56 H82 M18 74 H82" fill="none" stroke="#8a5a33" strokeWidth="2" />{[[28, 38, RED], [38, 38, RED], [64, 38, RED], [28, 56, BLUE], [54, 56, BLUE], [64, 56, BLUE], [72, 56, BLUE], [28, 74, GOLD], [38, 74, GOLD], [48, 74, GOLD]].map(([x, y, c], i) => <ellipse key={i} cx={x} cy={y} rx="5" ry="6" fill={c} strokeWidth="1.6" />)}</g>,
  'chans': <g {...S}><path d="M28 24 Q20 64 50 80 Q80 64 72 24 L60 24 Q66 58 50 66 Q34 58 40 24 Z" fill="#9aa3ad" />{[[31, 32], [29, 46], [34, 60], [69, 32], [71, 46], [66, 60]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2" fill={INK} stroke="none" />)}{sparkle(50, 30, 7, GOLD)}</g>,
  'estrateji': <g {...S}><path d="M16 28 L38 22 L62 28 L84 22 V74 L62 80 L38 74 L16 80 Z" fill={IV} /><path d="M38 22 V74 M62 28 V80" fill="none" strokeWidth="1.6" /><path d="M24 66 Q34 50 48 56 Q62 62 66 42" fill="none" stroke={RED} strokeWidth="2.4" strokeDasharray="3 4" /><path d="M64 32 L74 42 M74 32 L64 42" fill="none" stroke={RED} strokeWidth="3.2" /></g>,
  'kalifikasyon': <g {...S}><path d="M14 32 H86 V44 Q80 50 86 56 V68 H14 V56 Q20 50 14 44 Z" fill={GOLD} transform="rotate(-10 50 50)" /><g transform="rotate(-10 50 50)"><path d="M66 32 V68" fill="none" strokeDasharray="3 3" strokeWidth="1.8" />{star(40, 50, 10, IV)}</g></g>,
  'femen-tab': <g {...S}><path d="M34 46 V34 Q34 18 50 18 Q66 18 66 34 V46" fill="none" stroke="#9aa3ad" strokeWidth="7" /><path d="M34 46 V34 Q34 18 50 18 Q66 18 66 34 V46" fill="none" stroke={INK} strokeWidth="1.5" /><rect x="26" y="44" width="48" height="38" rx="6" fill={GOLD} /><circle cx="50" cy="60" r="5" fill={INK} /><path d="M48 62 H52 L53 72 H47 Z" fill={INK} /></g>,
  'konte': <g {...S}><path d="M34 84 V58 Q34 50 40 50 H62 Q68 50 68 58 V70 Q68 84 54 84 Z" fill={IV} /><rect x="36" y="22" width="9" height="32" rx="4.5" fill={IV} /><rect x="47" y="16" width="9" height="38" rx="4.5" fill={IV} /><rect x="58" y="22" width="9" height="32" rx="4.5" fill={IV} /><path d="M34 62 Q24 60 26 52 Q30 46 38 54" fill={IV} /><text x="78" y="34" fontSize="13" fontWeight="700" fill={GOLD} stroke="none" fontFamily="Georgia, serif">3</text></g>,
  'istwa-fini': <g {...S}><path d="M22 30 H72 Q78 30 78 36 V80 H28 Q22 80 22 74 Z" fill="#7a2a2a" /><path d="M22 74 Q22 68 28 68 H78" fill="none" /><path d="M28 72 H76" stroke={IV} strokeWidth="3" /><path d="M32 30 V58" stroke={GOLD} strokeWidth="3" fill="none" /><path d="M86 12 Q66 22 54 50 L58 52 Q72 30 86 12 Z" fill={IV} /><path d="M54 50 L50 60" fill="none" strokeWidth="2" /></g>,
}

// Story trophies are stored by chapter
Object.assign(TROPHY_ICONS, { ch2: TROPHY_ICONS['sak-la'], ch3: TROPHY_ICONS['konte-pwen'], ch4: TROPHY_ICONS['chans'], ch6: TROPHY_ICONS['estrateji'], ch9: TROPHY_ICONS['kalifikasyon'], ch12: TROPHY_ICONS['femen-tab'], ch15: TROPHY_ICONS['konte'] })


// ── Bot drawings ──
const pipT = (x, y, w, h, pips, rot = 0) => (
  <g transform={`rotate(${rot} ${x + w / 2} ${y + h / 2})`}>
    <rect x={x} y={y} width={w} height={h} rx={Math.min(w, h) * 0.18} fill={IV} {...S} />
    <line x1={x + 3} y1={y + h / 2} x2={x + w - 3} y2={y + h / 2} stroke={INK} strokeWidth="1.6" />
    {pips.map(([px, py], i) => <circle key={i} cx={x + px} cy={y + py} r={w * 0.1} fill={INK} />)}
  </g>
)
const SIX = (w, h) => [[w * .3, h * .12], [w * .7, h * .12], [w * .3, h * .25], [w * .7, h * .25], [w * .3, h * .38], [w * .7, h * .38], [w * .3, h * .62], [w * .7, h * .62], [w * .3, h * .75], [w * .7, h * .75], [w * .3, h * .88], [w * .7, h * .88]]
export const BOT_ICONS = {
  'Ti-Bebe': <g {...S}><circle cx="50" cy="66" r="12" fill="none" stroke="#7fb6e6" strokeWidth="5" /><path d="M26 48 Q50 32 74 48 Q50 60 26 48 Z" fill="#9ccbf0" /><path d="M42 40 Q42 22 50 20 Q58 22 58 40 Z" fill="#f5d7b0" /></g>,
  'Ti-Sak': <g {...S}><path d="M30 40 Q16 70 30 82 Q50 92 70 82 Q84 70 70 40 Z" fill="#c8a06a" /><path d="M38 40 Q44 30 50 34 Q56 30 62 40" fill="#c8a06a" /><path d="M36 40 Q50 46 64 40" fill="none" stroke="#7a5233" strokeWidth="4" /><path d="M58 40 Q72 30 70 22" fill="none" stroke="#7a5233" strokeWidth="2.5" /><path d="M40 62 Q50 58 60 64" fill="none" stroke="#8a6a3a" strokeWidth="1.8" /></g>,
  'Ti-Pridan': <g strokeLinecap="round" strokeLinejoin="round"><path d="M50 22 V78" stroke={IV} strokeWidth="4" /><path d="M34 80 H66" stroke={IV} strokeWidth="5" /><circle cx="50" cy="22" r="4" fill={GOLD} /><path d="M20 40 L80 26" stroke={IV} strokeWidth="3.5" /><path d="M20 40 L12 60 M20 40 L28 60" stroke={IV} strokeWidth="1.8" /><path d="M8 60 Q20 70 32 60 Z" fill={GOLD} stroke={INK} strokeWidth="1.5" /><circle cx="15" cy="57" r="3" fill={INK} /><circle cx="21" cy="55" r="3" fill={INK} /><circle cx="27" cy="57" r="3" fill={INK} /><path d="M80 26 L72 46 M80 26 L88 46" stroke={IV} strokeWidth="1.8" /><path d="M68 46 Q80 56 92 46 Z" fill={GOLD} stroke={INK} strokeWidth="1.5" /><circle cx="80" cy="43" r="3" fill={INK} /></g>,
  'Ti-Cam': <g {...S}><g transform="rotate(-18 36 54)"><rect x="20" y="38" width="32" height="32" rx="6" fill="#f2f2f2" />{[[28, 46], [44, 46], [36, 54], [28, 62], [44, 62]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill={RED} stroke="none" />)}</g><g transform="rotate(22 66 40)"><rect x="52" y="26" width="28" height="28" rx="5" fill="#f2f2f2" />{[[59, 33], [73, 47]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill={RED} stroke="none" />)}</g><path d="M14 30 Q20 24 26 28 M80 66 Q86 72 80 78" fill="none" stroke={GOLD} strokeWidth="2" /></g>,
  'Ti-Jean': <g {...S}>{[0, 1, 2, 3].map(r => [0, 1, 2].map(c => <rect key={r + '-' + c} x={16 + c * 23 + (r % 2 ? -11 : 0)} y={22 + r * 15} width="22" height="13" rx="1.5" fill="#b85a3a" strokeWidth="1.8" />))}<rect x="16" y="22" width="68" height="60" fill="none" strokeWidth="0" /></g>,
  'Ti-Djo': <g {...S}><path d="M34 82 H70 V74 H66 Q64 60 64 52 L70 46 Q72 34 62 26 Q54 20 44 24 L40 18 L36 28 Q30 34 30 42 L42 46 Q44 52 40 58 Q36 64 38 74 H34 Z" fill={IV} /><circle cx="50" cy="34" r="2.6" fill={INK} stroke="none" /><path d="M30 82 H74" strokeWidth="4" /></g>,
  'Ti-Mèt': <g {...S}><path d="M14 82 Q50 52 86 82 Z" fill={GREEN} /><path d="M50 66 V20" fill="none" strokeWidth="3" /><path d="M50 22 L78 30 L50 40 Z" fill={RED} /><circle cx="60" cy="27" r="2" fill="#fff" stroke="none" /><circle cx="68" cy="31" r="2" fill="#fff" stroke="none" /><circle cx="60" cy="35" r="2" fill="#fff" stroke="none" /></g>,
  'Ti-Doub': <g>{pipT(36, 18, 28, 64, SIX(28, 64), -16)}<path d="M18 30 Q14 40 18 50 M82 50 Q86 60 82 70" fill="none" stroke={GOLD} strokeWidth="2.6" strokeLinecap="round" /></g>,
  'Ti-Jòj': <g {...S}><ellipse cx="50" cy="62" rx="38" ry="12" fill="#e2c890" /><path d="M28 60 Q28 30 50 28 Q72 30 72 60 Z" fill="#e8d29c" /><path d="M28 56 Q50 64 72 56" fill="none" stroke={RED} strokeWidth="5" /><path d="M34 40 Q50 34 66 40 M30 50 Q50 44 70 50" fill="none" stroke="#b89a5a" strokeWidth="1.6" /></g>,
  'Ti-Tid': <g>{pipT(38, 14, 22, 58, [[6.6, 7], [15.4, 7], [6.6, 21], [15.4, 21], [6.6, 37], [15.4, 37], [6.6, 51], [15.4, 51]], -38)}{pipT(40, 14, 22, 58, [[11, 9], [11, 20], [11, 38], [11, 49]], 38)}</g>,
  'Ti-Roro': <g {...S}><circle cx="34" cy="42" r="16" fill="none" stroke="#7d828c" strokeWidth="7" /><circle cx="34" cy="42" r="16" fill="none" strokeWidth="1.4" /><path d="M48 50 L80 72" fill="none" stroke="#7d828c" strokeWidth="7" /><path d="M70 66 L64 76 M78 72 L72 82" fill="none" stroke="#7d828c" strokeWidth="5" /></g>,
  'Ti-Chasè': <g {...S}>{pipT(36, 30, 28, 40, [[8, 9], [20, 9], [14, 30]], 0)}<circle cx="50" cy="50" r="26" fill="none" stroke={RED} strokeWidth="2.6" /><path d="M50 16 V32 M50 68 V84 M16 50 H32 M68 50 H84" fill="none" stroke={RED} strokeWidth="2.6" /></g>,
  'Ti-Frè': <g {...S} transform="translate(50 52) scale(1.35) translate(-50 -52)"><path d="M8 66 L34 50 L44 58 L22 74 Z" fill="#a8743e" /><path d="M92 66 L66 50 L56 58 L78 74 Z" fill="#e2c08a" /><path d="M34 50 Q44 40 56 46 L68 56 Q71 63 64 63 L54 57 Q50 66 40 64 L30 58 Z" fill="#e2c08a" /><path d="M40 56 Q44 50 50 52 M44 60 Q48 54 54 56" fill="none" strokeWidth="1.6" /><path d="M58 46 L54 40 M62 50 L60 44" fill="none" stroke={GOLD} strokeWidth="2" /></g>,
  'Ti-Chaj': <g {...S}>{[24, 36, 48, 60].map(x => <path key={x} d={`M${x} 26 V74`} fill="none" stroke={IV} strokeWidth="5" />)}<path d="M16 66 L72 32" fill="none" stroke={RED} strokeWidth="5" /></g>,
  'Ti-Pyèj': <g {...S}><path d="M18 54 Q18 28 50 26 Q82 28 82 54 Z" fill="#7d828c" /><path d="M22 54 L28 42 L34 54 L40 42 L46 54 L52 42 L58 54 L64 42 L70 54 L76 42 L78 54" fill="#e6e6e6" strokeWidth="1.6" /><path d="M18 58 H82" fill="none" strokeWidth="3" /><path d="M26 62 Q50 78 74 62" fill="none" stroke="#7d828c" strokeWidth="5" /><circle cx="50" cy="76" r="4" fill="#7d828c" /></g>,
  'Ti-Wa': <g {...S}><path d="M14 58 Q50 26 86 58 Q50 88 14 58 Z" fill={IV} /><circle cx="50" cy="58" r="14" fill="#3f6fd8" /><circle cx="50" cy="58" r="6.5" fill={INK} /><circle cx="46" cy="54" r="2.4" fill="#fff" stroke="none" /><path d="M34 32 L37 16 L45 24 L50 12 L55 24 L63 16 L66 32 Z" fill={GOLD} /></g>,
}


// ── Final redraws ──
const SKIN = '#e2c08a'
const KNIGHT = (
  <g {...S}>
    <path d="M47 12 H53 V18 H59 V24 H53 V29 H47 V24 H41 V18 H47 Z" fill={GOLD} />
    <path d="M38 34 Q38 29 50 29 Q62 29 62 34 L58 42 H42 Z" fill={IV} />
    <path d="M40 42 H60 V46 H40 Z" fill={IV} />
    <path d="M42 46 Q45 58 40 70 H60 Q55 58 58 46 Z" fill={IV} />
    <path d="M36 70 H64 V76 H36 Z" fill={IV} />
    <path d="M30 76 H70 Q72 76 72 79 V86 H28 V79 Q28 76 30 76 Z" fill={IV} />
    <path d="M28 81 H72" fill="none" stroke={GOLD} strokeWidth="2.2" />
  </g>
)
const COUNTING_HAND = (
  <g {...S} transform="translate(50 54) scale(1.6 1.0) translate(-35.5 -54)" strokeWidth="1.8">
    <path d="M24 86 V58 L23 50 C23 46 28.5 46 28.5 50 L29 50 L29 26 C29 22 35 22 35 26 L35 48 L36 24 C36 20 42 20 42 24 L41 48 L43 30 C43 26 49 26 48 30 L46 60 L46 86 Z" fill="#e2c08a" />
  </g>
)
const HIGH_FIVE = (
  <g {...S}><g transform="rotate(-24 34 58)"><path d="M24 86 V58 L22 34 C22 30 28 30 28 34 L29 50 L29 26 C29 22 35 22 35 26 L35 48 L36 24 C36 20 42 20 42 24 L41 48 L43 30 C43 26 49 26 48 30 L47 54 C50 48 56 46 57 51 C58 54 53 60 47 66 L46 86 Z" fill="#a8743e" /></g><g transform="rotate(24 66 58)"><path d="M76 86 V58 L78 34 C78 30 72 30 72 34 L71 50 L71 26 C71 22 65 22 65 26 L65 48 L64 24 C64 20 58 20 58 24 L59 48 L57 30 C57 26 51 26 52 30 L53 54 C50 48 44 46 43 51 C42 54 47 60 53 66 L54 86 Z" fill="#e2c08a" /></g><path d="M50 12 V20 M40 15 L44 22 M60 15 L56 22" fill="none" stroke={GOLD} strokeWidth="2.6" /></g>
)


BOT_ICONS['Ti-Djo'] = KNIGHT            // the king
BOT_ICONS['Ti-Frè'] = HIGH_FIVE
TROPHY_ICONS['konte'] = COUNTING_HAND
TROPHY_ICONS.ch15 = COUNTING_HAND


// ── Tiers climb: bronze → silver → gold → platinum ──
const TIERS = {
  bronze:   { ring: 'radial-gradient(circle at 35% 30%, #f0b27a, #a0522d 70%)', pad: 0.06, glow: '0 3px 10px rgba(0,0,0,0.5)', tint: null },
  silver:   { ring: 'radial-gradient(circle at 35% 28%, #ffffff 0%, #dfe4ea 30%, #8f98a3 75%, #c9d0d8 100%)', pad: 0.075, glow: '0 0 0 1px #5d656e, 0 4px 12px rgba(0,0,0,0.5)', tint: 'rgba(255,255,255,0.10)', bevel: true },
  gold:     { ring: 'conic-gradient(from 0deg, #fff1b8, #c9a84c, #fff1b8, #a8862e, #fff1b8, #c9a84c, #fff1b8)', pad: 0.09, glow: '0 0 0 1px #7a5f22, 0 0 16px 3px rgba(232,201,106,0.45), 0 4px 12px rgba(0,0,0,0.5)', tint: 'rgba(232,201,106,0.16)', bevel: true, notches: true },
  platinum: { ring: 'conic-gradient(from 0deg, #f4fbff, #b7c9ff, #ffd6f5, #c8fff1, #f4fbff, #b7c9ff, #ffd6f5, #c8fff1, #f4fbff)', pad: 0.1, glow: '0 0 0 1px #8fa3c8, 0 0 24px 6px rgba(160,190,255,0.55), 0 0 44px 10px rgba(255,190,240,0.25)', tint: 'rgba(190,210,255,0.18)', bevel: true, notches: true, laurel: true, shimmer: true },
}
const Laurel = () => (
  <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: '-14%', width: '128%', height: '128%', pointerEvents: 'none' }}>
    {[...Array(7)].map((_, i) => { const a = 120 + i * 16; const r = 47; const x = 50 + r * Math.cos(a * Math.PI / 180), y = 50 + r * Math.sin(a * Math.PI / 180)
      return <ellipse key={'l' + i} cx={x} cy={y} rx="5.2" ry="2.3" transform={`rotate(${a + 60} ${x} ${y})`} fill="#d7e4ff" stroke="#7d8fb8" strokeWidth="0.6" /> })}
    {[...Array(7)].map((_, i) => { const a = 60 - i * 16; const r = 47; const x = 50 + r * Math.cos(a * Math.PI / 180), y = 50 + r * Math.sin(a * Math.PI / 180)
      return <ellipse key={'r' + i} cx={x} cy={y} rx="5.2" ry="2.3" transform={`rotate(${a - 60} ${x} ${y})`} fill="#d7e4ff" stroke="#7d8fb8" strokeWidth="0.6" /> })}
  </svg>
)
const Sparkles = () => (
  <svg viewBox="0 0 100 100" className="av-sparkles" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
    {[[16, 18, 5], [86, 24, 4], [82, 84, 5], [12, 78, 3.5]].map(([x, y, r], i) => (
      <path key={i} d={`M${x} ${y - r} L${x + r * 0.28} ${y - r * 0.28} L${x + r} ${y} L${x + r * 0.28} ${y + r * 0.28} L${x} ${y + r} L${x - r * 0.28} ${y + r * 0.28} L${x - r} ${y} L${x - r * 0.28} ${y - r * 0.28} Z`} fill="#ffffff" style={{ animationDelay: `${i * 0.45}s` }} />
    ))}
  </svg>
)
function Frame({ icon, tier = 'gold', size = 64, locked = false, badge }) {
  const T = TIERS[tier] || TIERS.bronze
  return (
    <div className={`av av-${tier}`} style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {!locked && T.laurel && <Laurel />}
      <div className="av-ring" style={{ width: '100%', height: '100%', borderRadius: '50%', padding: Math.max(2, size * T.pad), boxSizing: 'border-box',
        background: locked ? '#3a3528' : (T.shimmer ? 'transparent' : T.ring), boxShadow: locked ? 'none' : T.glow, filter: locked ? 'grayscale(1)' : 'none', opacity: locked ? 0.5 : 1, position: 'relative' }}>
        {/* platinum: the shimmer moves on the RING only, never on the picture */}
        {!locked && T.shimmer && <div className="av-shimmer" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: T.ring }} />}
        {!locked && T.notches && (
          <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            {[...Array(16)].map((_, i) => { const a = i * 22.5 * Math.PI / 180; return <circle key={i} cx={50 + 47 * Math.cos(a)} cy={50 + 47 * Math.sin(a)} r="1.6" fill="rgba(0,0,0,0.35)" /> })}
          </svg>
        )}
        <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden',
          background: 'radial-gradient(circle at 50% 35%, #2e2a22, #15130f 75%)',
          boxShadow: !locked && T.bevel ? 'inset 0 2px 3px rgba(255,255,255,0.18), inset 0 -3px 6px rgba(0,0,0,0.6)' : 'none' }}>
          {!locked && T.tint && <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 40%, ${T.tint}, transparent 70%)` }} />}
          <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ position: 'relative' }}>{TROPHY_ICONS[icon]}</svg>
          {!locked && T.bevel && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(140deg, rgba(255,255,255,0.22) 0%, transparent 38%)' }} />}
        </div>
      </div>
      {!locked && tier === 'platinum' && <Sparkles />}
      {badge != null && (
        <div style={{ position: 'absolute', right: '-4%', bottom: '-4%', minWidth: size * 0.36, height: size * 0.36, padding: `0 ${size * 0.06}px`, boxSizing: 'border-box',
          borderRadius: size * 0.2, background: '#0f0e0c', border: `${Math.max(1.5, size * 0.03)}px solid ${({ bronze: '#c47a45', silver: '#c9d0d8', gold: '#e8c96a', platinum: '#c8d8ff' })[tier]}`,
          color: '#f0ead8', fontFamily: 'DM Mono, monospace', fontSize: size * 0.19, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: locked ? 0.5 : 1 }}>{badge}</div>
      )}
    </div>
  )
}


// ── What each trophy's avatar shows: its tier, and the number it took ──
const COMEBACK_N = { 'remonte': '1', 'leve-kanpe': '3', 'pa-janm-mouri': '5' }
export function avatarBadge(t) {
  if (!t) return null
  if (t.group === 'start') return '1'
  if (t.group === 'story') return (t.desc.match(/chapter (\d+)/) || [])[1] || null
  if (t.id === 'pa-pe-doub') return '5'
  if (t.id === 'doub-pa-bat-mwen') return 'W'
  if (COMEBACK_N[t.id]) return COMEBACK_N[t.id]
  const m = t.desc.match(/(\d+)/)
  return m ? m[1] : '1'
}

export function TrophyAvatar({ trophyId, size = 64, locked = false, badge = true }) {
  const t = TROPHIES.find(x => x.id === trophyId)
  if (!t) return null
  return <Frame icon={t.id} tier={t.tier} size={size} locked={locked} badge={badge ? avatarBadge(t) : null} />
}

export const EXPERT_BOTS = ['Ti-Jòj', 'Ti-Tid', 'Ti-Roro', 'Ti-Chasè', 'Ti-Frè', 'Ti-Chaj', 'Ti-Pyèj', 'Ti-Wa']
export function isBotName(name) { return !!BOT_ICONS[name] }

export function BotAvatar({ name, size = 40 }) {
  const expert = EXPERT_BOTS.includes(name)
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', padding: size * 0.075, boxSizing: 'border-box', flexShrink: 0,
      background: expert ? 'conic-gradient(from 20deg, #2a2a33, #55555f, #1a1a20, #3a3a44, #2a2a33)' : 'linear-gradient(160deg, #c8a06a 0%, #8a5a33 55%, #5a3a1a 100%)',
      boxShadow: expert ? '0 0 0 1.5px #c2410c, 0 0 14px 3px rgba(230,90,40,0.45), 0 3px 8px rgba(0,0,0,0.6)' : '0 0 0 1.5px #c9a84c, 0 3px 8px rgba(0,0,0,0.5)' }}>
      <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden',
        background: expert ? 'radial-gradient(circle at 50% 40%, #2b1414, #0c0a0a 75%)' : 'radial-gradient(circle at 50% 35%, #2e2a22, #15130f 75%)',
        boxShadow: 'inset 0 2px 3px rgba(255,255,255,0.12), inset 0 -3px 6px rgba(0,0,0,0.6)' }}>
        <svg viewBox="0 0 100 100" width="100%" height="100%">{BOT_ICONS[name]}</svg>
      </div>
    </div>
  )
}

// The right picture for anyone at a table: a bot's own picture, a player's
// chosen trophy avatar, or nothing (the caller shows initials instead).
export function hasSeatAvatar(player) {
  if (!player) return false
  if (isBotName(player.nickname) && (player.is_ai || !player.avatar)) return true
  return !!(player.avatar && TROPHIES.some(t => t.id === player.avatar))
}

export function SeatAvatar({ player, size = 40 }) {
  if (!hasSeatAvatar(player)) return null
  if (isBotName(player.nickname) && (player.is_ai || !player.avatar)) return <BotAvatar name={player.nickname} size={size} />
  if (player.avatar && TROPHIES.some(t => t.id === player.avatar)) return <TrophyAvatar trophyId={player.avatar} size={size} badge={false} />
  return null
}
