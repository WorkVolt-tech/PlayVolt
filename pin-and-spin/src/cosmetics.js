// Cosmetic choices never change the code, colors, or Pin/Spin scoring.
export const ACCENTS = [
  { id: 'violet', name: 'Violet', hex: '#bb78ff' },
  { id: 'teal', name: 'Teal', hex: '#43dcd0' },
  { id: 'amber', name: 'Amber', hex: '#ffce64' },
  { id: 'rose', name: 'Rose', hex: '#ff80bb' },
  { id: 'blue', name: 'Blue', hex: '#79aaff' },
  { id: 'lime', name: 'Lime', hex: '#a7df6b' },
  { id: 'coral', name: 'Coral', hex: '#ff9275' },
  { id: 'ice', name: 'Ice', hex: '#93e8ff' },
  { id: 'gold', name: 'Gold', hex: '#f7da83' },
  { id: 'orchid', name: 'Orchid', hex: '#e8a0f8' },
];

export const AVATARS = [
  { id: 'initial', name: 'Classic', icon: '●' },
  { id: 'bunny', name: 'Bunny', icon: '🐰' },
  { id: 'fox', name: 'Rogue Fox', icon: '🦊' },
  { id: 'cat', name: 'Shadow Cat', icon: '🐱' },
  { id: 'champion', name: 'Champion', icon: '🏆', trophy: 'first_win' },
  { id: 'royal', name: 'Royal', icon: '👑', trophy: 'wins_10' },
  { id: 'carrot', name: 'Carrot Keeper', icon: '🥕', trophy: 'world_1' },
  { id: 'crystal', name: 'Crystal Clear', icon: '💎', trophy: 'world_4' },
];
export const BOARDS = [
  { id: 'nebula', name: 'Nebula' },
  { id: 'arcade', name: 'Arcade' },
  { id: 'waves', name: 'Waves' },
  { id: 'gold', name: 'Gold', trophy: 'first_win' },
  { id: 'prism', name: 'Prism', trophy: 'all_modes' },
  { id: 'crystal', name: 'Crystal', trophy: 'world_4' },
];
export const PIECES = [
  { id: 'round', name: 'Round', icon: '●' },
  { id: 'square', name: 'Square', icon: '■' },
  { id: 'star', name: 'Star', icon: '★' },
  { id: 'gem', name: 'Gem', icon: '◆' },
  { id: 'hex', name: 'Hexagon', icon: '⬢' },
  { id: 'crown', name: 'Crown', icon: '♛', trophy: 'wins_10' },
];
export const RESULT_PINS = [
  { id: 'round', name: 'Round', icon: '●' },
  { id: 'square', name: 'Square', icon: '■' },
  { id: 'star', name: 'Star', icon: '★', trophy: 'first_win' },
];
export const DEFAULT_COSMETICS = { avatar: 'initial', board: 'nebula', piece: 'round', pin: 'round', accent: 'violet' };
export const GROUPS = { avatar: AVATARS, board: BOARDS, piece: PIECES, pin: RESULT_PINS, accent: ACCENTS };

export function normalizeCosmetics(value, seat = 1) {
  const raw = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(Object.entries(GROUPS).map(([key, options]) => [
    key, options.some((option) => option.id === raw[key]) ? raw[key]
      : key === 'accent' ? ACCENTS[(Math.max(1, Number(seat) || 1) - 1) % ACCENTS.length].id : DEFAULT_COSMETICS[key],
  ]));
}

export function cosmeticStyle(value, seat) {
  const c = normalizeCosmetics(value, seat);
  return { '--cosmetic-accent': ACCENTS.find((a) => a.id === c.accent).hex };
}
