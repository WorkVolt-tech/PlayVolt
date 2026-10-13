// ── Zodiac glyphs, drawn as vector shapes ────────────────────────────────────
// The zodiac symbols are emoji characters, so many phones would draw them as
// coloured emoji. These are our own strokes on a 24 × 24 grid instead: they
// look the same on every device and take any colour.
export const ZODIAC_GLYPHS = {
  aries:  'M12 21.5V10.5M12 10.5C12 3.5 3.5 2.5 3.5 8C3.5 10.6 5.6 11.6 7.4 11M12 10.5C12 3.5 20.5 2.5 20.5 8C20.5 10.6 18.4 11.6 16.6 11',
  gemini: 'M4.5 4C9 6.2 15 6.2 19.5 4M4.5 20C9 17.8 15 17.8 19.5 20M9 5.6V18.4M15 5.6V18.4',
  libra:  'M3.5 20H20.5M3.5 15.5H8.6C7.2 14.2 6.4 12.6 6.4 10.8A5.6 5.6 0 0 1 17.6 10.8C17.6 12.6 16.8 14.2 15.4 15.5H20.5',
  taurus: 'M17 14.5A5 5 0 1 1 7 14.5A5 5 0 1 1 17 14.5M3.5 4C5 8 8.5 9.5 12 9.5C15.5 9.5 19 8 20.5 4',
  cancer: 'M9.2 9.5A2.2 2.2 0 1 1 4.8 9.5A2.2 2.2 0 1 1 9.2 9.5M7 7.3C11 4.6 17 5 20.5 8M19.2 14.5A2.2 2.2 0 1 1 14.8 14.5A2.2 2.2 0 1 1 19.2 14.5M17 16.7C13 19.4 7 19 3.5 16',
  leo:    'M11.3 17.5A2.8 2.8 0 1 1 5.7 17.5A2.8 2.8 0 1 1 11.3 17.5M10.6 15.8C8.6 12 8.4 5 13.2 5C17.6 5 18.2 10 16.2 13C14.5 15.6 14.6 19 17 20.5C18.3 21.3 19.8 20.6 20.5 19.4',
  virgo:  'M3.5 7C5 5.5 6.5 6 6.5 8V19M6.5 9C6.5 6.5 10.5 5.5 10.5 9V19M10.5 9C10.5 6.5 14.5 5.5 14.5 9V16.5C14.5 19 17 20.5 19 18.5C21 16.5 19 13 16 14.5',
  scorpio:'M3.5 7C5 5.5 6.5 6 6.5 8V19M6.5 9C6.5 6.5 10.5 5.5 10.5 9V19M10.5 9C10.5 6.5 14.5 5.5 14.5 9V18C14.5 19.5 15.5 20 17 20H20.5M18.3 17.8L20.5 20L18.3 22.2',
  sagittarius: 'M4.5 19.5L19.5 4.5M11.5 4.5H19.5V12.5M6 11L13 18',
  capricorn: 'M3.5 6C5 5 6.5 5.5 6.5 8V17M6.5 9C6.5 6 11 5 11 9V15.5C11 18.5 13 20.5 16 20.5C18.7 20.5 20.5 18.8 20.5 16.5C20.5 14.2 18.8 12.8 16.8 12.8C14.5 12.8 13 14.5 13 17C13 19.5 11.5 21 9.5 21',
  aquarius: 'M3.5 10L7 7L10.5 10L14 7L17.5 10L20.5 7.5M3.5 17L7 14L10.5 17L14 14L17.5 17L20.5 14.5',
  pisces: 'M5.5 4C9 8 9 16 5.5 20M18.5 4C15 8 15 16 18.5 20M5 12H19',
}

// The glyph as an SVG group, placed in a box at (x, y) of the given size
export function GlyphPath({ sign, x = 0, y = 0, size = 24, color = '#d8b25a', width = 2, opacity = 1, rotate = 0 }) {
  const d = ZODIAC_GLYPHS[sign]
  if (!d) return null
  const s = size / 24
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate} ${size / 2} ${size / 2}) scale(${s})`} opacity={opacity}>
      <path d={d} fill="none" stroke={color} strokeWidth={width / s} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  )
}
