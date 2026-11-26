import React from 'react';
import { AVATARS, cosmeticStyle, normalizeCosmetics } from '../cosmetics.js';
import { AvatarArt, illustratedAvatars } from './AvatarArt.jsx';

export function PlayerAvatar({ player, size = 'md' }) {
  const appearance = normalizeCosmetics(player?.appearance, player?.seat);
  const avatar = AVATARS.find((item) => item.id === appearance.avatar);
  return <span className={`avatar avatar-${size} avatar-style-${appearance.avatar}`}
    style={cosmeticStyle(appearance, player?.seat)}
    role="img" aria-label={`${player?.name || 'Player'} avatar: ${avatar?.name || 'Classic'}`}>
    {illustratedAvatars.has(appearance.avatar)
      ? <AvatarArt variant={appearance.avatar} />
      : <b>{appearance.avatar === 'initial' ? (player?.name || '?').slice(0, 1).toUpperCase() : avatar?.icon}</b>}
  </span>;
}
