import React from 'react';

// Original little game bunny in collectible outfits, rendered crisply at TV and phone sizes.
export function AvatarArt({ variant }) {
  const royal = variant === 'royal';
  const champion = variant === 'champion';
  const carrot = variant === 'carrot';
  const crystal = variant === 'crystal';
  const fur = crystal ? '#cff4ff' : carrot ? '#ffd7bb' : '#f9edff';
  return <svg className="avatar-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path d="M17 25C7 12 9 2 13 2c7-1 13 12 15 19M46 25C58 10 56 2 51 2 44 2 39 14 37 21"
      fill={fur} stroke="#502874" strokeWidth="3.5" strokeLinejoin="round" />
    <path d="M18 20C15 14 13 10 13 8M47 20c3-5 5-10 5-12" fill="none" stroke="#e898d9" strokeWidth="4" strokeLinecap="round" />
    <ellipse cx="32" cy="41" rx="27" ry="21" fill={fur} stroke="#502874" strokeWidth="3" />
    <ellipse cx="16" cy="44" rx="5" ry="3" fill="#f7a9c6" opacity=".75" />
    <ellipse cx="48" cy="44" rx="5" ry="3" fill="#f7a9c6" opacity=".75" />
    <ellipse cx="23" cy="37" rx="2.7" ry="4" fill="#2b1647" />
    <ellipse cx="41" cy="37" rx="2.7" ry="4" fill="#2b1647" />
    <path d="M29 44q3-3 6 0l-3 3z" fill="#b459ac" />
    <path d="M32 47q-4 8-8 0m8 0q4 8 8 0" fill="none" stroke="#56316e" strokeWidth="2" strokeLinecap="round" />
    {royal && <path d="M14 17l8 5 10-12 10 12 8-5-2 14H16z" fill="#ffe28b" stroke="#9a5b25" strokeWidth="2.5" />}
    {champion && <><circle cx="51" cy="50" r="10" fill="#ffd263" stroke="#5c3190" strokeWidth="2" />
      <path d="M51 43l1.5 5 5 0-4 3 1.5 5-4-3-4 3 1.5-5-4-3h5z" fill="#fff7d7" /></>}
    {carrot && <><path d="M49 49l-12 10 4-15z" fill="#ff9e46" stroke="#803d35" strokeWidth="2" />
      <path d="M40 44q-3-8-6-7m6 7q3-8 7-8" fill="none" stroke="#4ed38b" strokeWidth="3" strokeLinecap="round" /></>}
    {crystal && <path d="M51 40l9 10-9 12-9-12z" fill="#8de9ff" stroke="#5e58b1" strokeWidth="2" />}
  </svg>;
}
