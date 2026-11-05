import React from 'react';

// Pin (green) and Spin (white) dots. Counts only — dots never map to particular slots.
export function Feedback({ guess }) {
  if (guess && !guess.revealed) return <span className="pending">SEALED</span>;
  if (guess && !guess.colors) return <span className="pending">MISSED</span>;
  const pins = guess?.pins || 0, spins = guess?.spins || 0;
  return <span className="feedback-dots" role="img" aria-label={guess ? `${pins} Pins, ${spins} Spins` : 'No feedback yet'}>
    {Array.from({ length: 4 }, (_, i) => <i key={i} className={i < pins ? 'pin-dot' : i < pins + spins ? 'spin-dot' : ''} />)}
  </span>;
}
