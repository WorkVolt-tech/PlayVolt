// ── Your hands at the table ──────────────────────────────────────────────────
// The hand that knocks when you pass and slams the table on a Dekabess is
// yours to choose in your profile: the original hand or a female hand, and a
// nail colour. Pure looks: it changes no rule.
//
// A look is stored as one short string: '<style>' or '<style>:<nails>',
// e.g. 'male', 'female', 'female:red'. It lives in profiles.hand_look (so it
// follows your account), a copy in this device's storage (for solo games and
// a fast start), and domino_players.hand_look (so the others at the table see
// your hand). Anything unknown falls back to the original hand, so a bad or
// old value can never break the animation.

export const HAND_STYLES = {
  male: {
    label: 'Male',
    slam: '/handslam.webp', knock: '/handknock.webp',
    slamNails: null, knockNails: null,          // nail colour is for the female hand only
  },
  female: {
    label: 'Female',
    slam: '/hands/female-slam.webp', knock: '/hands/female-knock.webp',
    slamNails: '/hands/female-slam-nails.webp', knockNails: '/hands/female-knock-nails.webp',
  },
}

// 'natural' leaves the nails as they are in the picture (white on the female hand).
// Only a hand with nail cut-outs (slamNails/knockNails) takes a colour.
// The colour is laid over the nail with "multiply", so the nail keeps its shine.
export const NAIL_COLORS = [
  { id: 'natural', label: 'Natural', color: null },
  { id: 'red',     label: 'Red',     color: '#c8102e' },
  { id: 'pink',    label: 'Pink',    color: '#e8457e' },
  { id: 'coral',   label: 'Coral',   color: '#ff7a5c' },
  { id: 'nude',    label: 'Nude',    color: '#d9a58c' },
  { id: 'purple',  label: 'Purple',  color: '#7b2fbf' },
  { id: 'blue',    label: 'Blue',    color: '#1f5fd6' },
  { id: 'green',   label: 'Green',   color: '#1f9d55' },
  { id: 'gold',    label: 'Gold',    color: '#e0b21b' },
  { id: 'black',   label: 'Black',   color: '#2a2a2a' },
]

export const DEFAULT_LOOK = { style: 'male', nails: 'natural' }

export function parseLook(value) {
  if (typeof value !== 'string') return { ...DEFAULT_LOOK }
  const [s, n] = value.split(':')
  const style = Object.hasOwn(HAND_STYLES, s) ? s : DEFAULT_LOOK.style
  const nails = NAIL_COLORS.some(c => c.id === n) ? n : 'natural'
  return { style, nails }
}

export function lookString(look) {
  const { style, nails } = parseLook(`${look?.style}:${look?.nails}`)
  return nails === 'natural' ? style : `${style}:${nails}`
}

// The pictures for one animation: kind is 'slam' or 'knock'.
export function handPictures(value, kind) {
  const look = typeof value === 'string' || value == null ? parseLook(value) : parseLook(lookString(value))
  const h = HAND_STYLES[look.style]
  const mask = kind === 'knock' ? h.knockNails : h.slamNails
  const color = mask && NAIL_COLORS.find(c => c.id === look.nails)?.color || null
  return { src: kind === 'knock' ? h.knock : h.slam, nails: color ? mask : null, color }
}

// This device's copy of my own look.
const KEY = 'dk-hand-look'
export function myHandLook() {
  try { return lookString(parseLook(localStorage.getItem(KEY))) } catch { return 'male' }
}
export function rememberHandLook(value) {
  try { localStorage.setItem(KEY, lookString(parseLook(value))) } catch { /* ignore */ }
}
