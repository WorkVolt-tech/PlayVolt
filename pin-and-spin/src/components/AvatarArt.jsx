import React from 'react';

export const illustratedAvatars = new Set([
  'bunny', 'bear', 'fox', 'wolf', 'cat', 'robot', 'champion', 'royal', 'carrot', 'crystal', 'dragon',
  'onyx-knight', 'nitro-pilot', 'circuit-falcon',
]);

// Original character portraits. Distinct silhouettes read clearly on phone and TV.
export function AvatarArt({ variant }) {
  if (variant === 'onyx-knight') return <svg className="avatar-art" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M11 20 22 9l10-5 10 5 11 11-3 29-18 13-18-13Z" fill="#33344d" stroke="#121224" strokeWidth="3"/>
    <path d="M32 6v19L13 22l10-12Zm0 0v19l19-3-10-12Z" fill="#aab1cf"/>
    <path d="m12 25 20 4 20-4-4 10-16 4-16-4Z" fill="#171629"/>
    <path d="m17 30 12 3m6 0 12-3" stroke="#ed75ad" strokeWidth="3" strokeLinecap="round"/>
    <path d="m16 39 16 4 16-4-2 9-14 11-14-11Z" fill="#676b8c"/>
    <path d="M28 45v7m8-7v7" stroke="#282840" strokeWidth="3"/>
  </svg>;
  if (variant === 'nitro-pilot') return <svg className="avatar-art" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M8 31C8 12 18 5 32 5s24 10 24 26l-4 18-9 10H23L11 48Z" fill="#ee7a33" stroke="#391d39" strokeWidth="3"/>
    <path d="M29 6h10l-6 19H23Z" fill="#ffe8a3"/>
    <path d="M11 29q20-11 44-7l-3 20-12 6H23L12 38Z" fill="#191a35" stroke="#ffd394" strokeWidth="2"/>
    <path d="M17 30q13-6 31-6l-7 7-19 4Z" fill="#67e8ef"/><path d="M41 33h7l-2 4h-9Z" fill="#bccaff"/>
    <path d="M24 52h17l-3 4H26Z" fill="#f9c76e"/>
  </svg>;
  if (variant === 'circuit-falcon') return <svg className="avatar-art" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M4 14 21 19l11-11 11 11 17-5-7 25-7 14-14 9-14-9-7-14Z" fill="#2d5d86" stroke="#112a49" strokeWidth="3"/>
    <path d="m5 16 24 12-8 12L9 29Zm54 0L35 28l8 12 12-11Z" fill="#75c4e8"/>
    <path d="m16 30 12 5-4 6-7-3Zm32 0-12 5 4 6 7-3Z" fill="#15304b"/>
    <path d="m18 34 6 3m22-3-6 3" stroke="#81f9ee" strokeWidth="2.5" strokeLinecap="round"/>
    <path d="m26 41 6-7 9 7-9 13Z" fill="#ffd46e"/><path d="m32 54 9-13-9 4Z" fill="#d5863e"/>
  </svg>;
  if (variant === 'bear') return <svg className="avatar-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <circle cx="13" cy="17" r="10" fill="#8c5947" stroke="#482d43" strokeWidth="3" /><circle cx="51" cy="17" r="10" fill="#8c5947" stroke="#482d43" strokeWidth="3" />
    <circle cx="13" cy="17" r="4" fill="#d8a586" /><circle cx="51" cy="17" r="4" fill="#d8a586" />
    <path d="M7 37Q7 12 32 12t25 25q2 24-25 25Q5 61 7 37Z" fill="#a56d50" stroke="#482d43" strokeWidth="3" />
    <path d="M16 29q7-5 14 0m4 0q7-5 14 0" fill="none" stroke="#5b3540" strokeWidth="3" strokeLinecap="round" />
    <circle cx="23" cy="35" r="3" fill="#241d35" /><circle cx="41" cy="35" r="3" fill="#241d35" />
    <ellipse cx="32" cy="48" rx="14" ry="10" fill="#e2b88c" /><path d="M26 43q6-5 12 0l-6 6Z" fill="#35283c" />
    <path d="M32 49q-3 6-8 3m8-3q3 6 8 3" fill="none" stroke="#5a3a43" strokeWidth="2" strokeLinecap="round" />
  </svg>;
  if (variant === 'wolf') return <svg className="avatar-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path d="M5 4 23 17q9-5 18 0L59 4 56 42 45 59 32 56 19 59 8 42Z" fill="#74829b" stroke="#26324c" strokeWidth="3" strokeLinejoin="round" />
    <path d="M9 10 21 23 11 28Zm46 0L43 23l10 5Z" fill="#c58c99" />
    <path d="M9 41 19 31l10 3 3 9 3-9 10-3 10 10-9 15-14 4-14-4Z" fill="#c4cbd3" />
    <path d="M15 31 28 29 24 38 15 38Zm34 0-13-2 4 9h9Z" fill="#26324c" />
    <path d="m18 33 7 1m21-1-7 1" stroke="#e3cb83" strokeWidth="3" strokeLinecap="round" />
    <path d="m26 44 6-4 6 4-6 5Z" fill="#253046" /><path d="M32 49v5m0 0-5 2m5-2 5 2" fill="none" stroke="#53617a" strokeWidth="2" />
  </svg>;
  if (variant === 'robot') return <svg className="avatar-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path d="M32 14V6" stroke="#8398b6" strokeWidth="4" strokeLinecap="round" /><circle cx="32" cy="5" r="4" fill="#79f5d6" />
    <path d="M11 19 19 13h26l8 6v32l-8 9H19l-8-9Z" fill="#8997b3" stroke="#293254" strokeWidth="3" strokeLinejoin="round" />
    <path d="M16 23h32v27H16Z" fill="#17223c" stroke="#c0cee0" strokeWidth="2" />
    <path d="M19 31h10l-2 9h-6Zm16 0h10l-2 9h-6Z" fill="#6af5db" /><path d="M26 46h12" stroke="#8cf0ef" strokeWidth="3" strokeLinecap="round" />
    <path d="M7 30h5v12H7Zm45 0h5v12h-5Z" fill="#e3ab5c" stroke="#293254" strokeWidth="2" /><path d="M23 56h18" stroke="#e1af61" strokeWidth="3" />
  </svg>;
  if (variant === 'dragon') return <svg className="avatar-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path d="M11 14 6 3 25 15 32 11 39 15 58 3l-5 11 7 28-12 17H16L4 42Z" fill="#247e80" stroke="#183b55" strokeWidth="3" strokeLinejoin="round" />
    <path d="M13 18 8 7l13 13Zm38 0 5-11-13 13Z" fill="#f5be7d" />
    <path d="M9 32 20 25 31 29 32 42 33 29 44 25 55 32 47 49 32 58 17 49Z" fill="#50c7a5" />
    <path d="m17 34 11-2-4 9-9-3Zm30 0-11-2 4 9 9-3Z" fill="#163b51" /><path d="m18 35 7 1m21-1-7 1" stroke="#ffd37b" strokeWidth="3" strokeLinecap="round" />
    <path d="m27 47 5-3 5 3-5 4Z" fill="#1a4d58" /><path d="M23 54h18" stroke="#e1ebbb" strokeWidth="2" strokeLinecap="round" />
  </svg>;
  if (variant === 'champion') return <svg className="avatar-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path d="M7 20 16 8l8 9 8-10 8 10 8-9 9 12-3 30-12 12H22L10 50Z" fill="#9b522c" stroke="#502e3b" strokeWidth="3" strokeLinejoin="round" />
    <path d="M15 22Q32 9 49 22l2 24-19 14-19-14Z" fill="#e5a85d" /><path d="M17 30q6-5 12 0m6 0q6-5 12 0" fill="none" stroke="#633a35" strokeWidth="3" strokeLinecap="round" />
    <circle cx="23" cy="35" r="2.8" fill="#332439" /><circle cx="41" cy="35" r="2.8" fill="#332439" /><path d="m27 43 5-4 5 4-5 4Z" fill="#59343a" />
    <circle cx="49" cy="51" r="9" fill="#ffd568" stroke="#5b3874" strokeWidth="2" /><path d="m49 45 2 4 4 1-4 2-2 4-2-4-4-2 4-1Z" fill="#fff7d0" />
  </svg>;
  if (variant === 'royal') return <svg className="avatar-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path d="M8 23 5 6l17 10q10-5 20 0L59 6l-3 17q5 25-7 35H15Q3 48 8 23Z" fill="#434a86" stroke="#242747" strokeWidth="3" strokeLinejoin="round" />
    <path d="M7 9 21 18l-11 5Zm50 0L43 18l11 5Z" fill="#7772ad" /><ellipse cx="22" cy="34" rx="11" ry="13" fill="#f2dfb5" /><ellipse cx="42" cy="34" rx="11" ry="13" fill="#f2dfb5" />
    <circle cx="23" cy="35" r="5" fill="#302950" /><circle cx="41" cy="35" r="5" fill="#302950" /><path d="m28 45 4-3 4 3-4 7Z" fill="#d9a761" />
    <path d="m15 14 7 3 10-11 10 11 7-3-2 10H17Z" fill="#ffdb83" stroke="#936447" strokeWidth="2" strokeLinejoin="round" />
  </svg>;
  if (variant === 'crystal') return <svg className="avatar-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path d="M12 5 22 17 32 8l10 9L52 5l7 27-8 24-19 7-19-7-8-24Z" fill="#79c9e3" stroke="#376188" strokeWidth="3" strokeLinejoin="round" />
    <path d="M12 5 22 17 9 31ZM52 5 42 17l13 14ZM32 8 22 17l10 12 10-12Z" fill="#c1f2f8" /><path d="M9 31 22 17l10 12-6 29-13-2ZM55 31 42 17 32 29l6 29 13-2Z" fill="#56a5c9" />
    <path d="m16 32 13-3-5 11-10-3Zm32 0-13-3 5 11 10-3Z" fill="#264979" /><path d="m18 34 8 0m20 0-8 0" stroke="#e4ffff" strokeWidth="3" strokeLinecap="round" />
    <path d="m27 46 5-4 5 4-5 7Z" fill="#a9ecf8" stroke="#376188" strokeWidth="1.5" />
  </svg>;
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
  const carrot = variant === 'carrot';
  const fur = carrot ? '#ffd7bb' : '#f9edff';
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
    {carrot && <><path d="M49 49l-12 10 4-15z" fill="#ff9e46" stroke="#803d35" strokeWidth="2" />
      <path d="M40 44q-3-8-6-7m6 7q3-8 7-8" fill="none" stroke="#4ed38b" strokeWidth="3" strokeLinecap="round" /></>}
  </svg>;
}
