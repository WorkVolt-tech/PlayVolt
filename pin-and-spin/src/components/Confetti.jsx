import React from 'react';
import { COLORS } from '../game/constants.js';

// Lightweight CSS confetti burst (no library). Hidden when reduced motion is preferred.
const PIECES = Array.from({ length: 28 }, (_, i) => ({
  x: (i * 37) % 100,
  delay: (i % 7) * 0.09,
  drift: ((i * 53) % 60) - 30,
  spin: ((i * 97) % 540) + 180,
  color: COLORS[i % COLORS.length].hex,
  wide: i % 3 === 0,
}));

export function Confetti() {
  return <div className="confetti" aria-hidden="true">
    {PIECES.map((p, i) => <i key={i} className={p.wide ? 'wide' : ''} style={{
      left: p.x + '%', background: p.color, animationDelay: p.delay + 's',
      '--drift': p.drift + 'px', '--spin': p.spin + 'deg',
    }} />)}
  </div>;
}
