import React from 'react';
import { COLORS } from '../game/constants.js';

// Each seat gets a color ball (with its pattern) so players are easy to tell apart.
export function avatarColor(seat) {
  return (Math.max(1, Number(seat) || 1) - 1) % COLORS.length;
}

export function PlayerAvatar({ player, size = 'md' }) {
  const color = avatarColor(player?.seat);
  return <span className={`avatar avatar-${size} patterned-peg color-${color}`}
    style={{ '--color': COLORS[color].hex }} aria-hidden="true">
    <b>{(player?.name || '?').slice(0, 1).toUpperCase()}</b>
  </span>;
}
