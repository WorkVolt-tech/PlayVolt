import React from 'react';

// Original little game bunny in collectible outfits, rendered crisply at TV and phone sizes.
export function AvatarArt({ variant }) {
  if (variant === 'fox') return <svg className="avatar-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path d="M5 10 24 18 32 13 40 18 59 10 54 37 61 47 43 58 32 55 21 58 3 47 10 37Z"
      fill="#ca6138" stroke="#402039" strokeWidth="3" strokeLinejoin="round" />
    <path d="M7 13 20 22 12 34ZM57 13 44 22 52 34Z" fill="#432c3f" />
    <path d="M10 38 20 27 29 33 32 40 35 33 44 27 54 38 45 53 32 57 19 53Z" fill="#f4cc9b" />
    <path d="M11 34 23 29 29 35 21 39 12 38ZM53 34 41 29 35 35 43 39 52 38Z" fill="#402039" />
    <path d="M21 34h5m12 0h5" stroke="#f7dc8b" strokeWidth="2.5" strokeLinecap="round" />
    <path d="m27 43 5-3 5 3-5 4Z" fill="#39243c" />
    <path d="M32 47v4m0 0-5 2m5-2 5 2" fill="none" stroke="#432c3f" strokeWidth="2" strokeLinecap="round" />
    <path d="M22 54 32 59 42 54" fill="none" stroke="#7d3550" strokeWidth="3" strokeLinecap="round" />
  </svg>;
  if (variant === 'cat') return <svg className="avatar-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path d="M7 8 22 17q10-5 20 0L57 8l-3 29q8 11 2 17-6 8-24 8T8 54Q2 48 10 37Z"
      fill="#3c465d" stroke="#1e2038" strokeWidth="3" strokeLinejoin="round" />
    <path d="M10 13 20 22 12 32ZM54 13 44 22 52 32Z" fill="#a45982" />
    <path d="M13 40q19-10 38 0l4 12q-7 10-23 10T9 52Z" fill="#252d45" />
    <path d="m14 34 14-5-2 10-12 1Zm36 0-14-5 2 10 12 1Z" fill="#121b30" />
    <path d="m19 35 7-2m19 2-7-2" stroke="#87e9d4" strokeWidth="3" strokeLinecap="round" />
    <path d="m27 43 5-3 5 3-5 4Z" fill="#b7949d" />
    <path d="M32 47v5m0 0-5 2m5-2 5 2" fill="none" stroke="#a9b6ca" strokeWidth="2" strokeLinecap="round" />
    <path d="m10 47 13-1m-13 6 13-3m31-2-13-1m13 6-13-3" stroke="#8294aa" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
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
