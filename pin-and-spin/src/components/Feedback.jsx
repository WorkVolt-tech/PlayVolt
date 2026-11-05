import React from 'react';

// Pin (green) and Spin (white) dots. Counts only — dots never map to particular slots.
export function Feedback({ guess, slots = 4 }) {
  if (guess && !guess.revealed) return <span className="pending">SEALED</span>;
  if (guess && !guess.colors) return <span className="pending">MISSED</span>;
  const pins = guess?.pins || 0, spins = guess?.spins || 0;
  const n = guess?.colors?.length || slots; // one dot per ball
  return <span className={'feedback-dots' + (n === 5 ? ' five' : '')} role="img" aria-label={guess ? `${pins} Pins, ${spins} Spins` : 'No feedback yet'}
    key={guess ? 'scored' : 'empty'}>
    {Array.from({ length: n }, (_, i) => <i key={i} style={{ '--i': i }}
      className={i < pins ? 'pin-dot' : i < pins + spins ? 'spin-dot' : ''} />)}
  </span>;
}
