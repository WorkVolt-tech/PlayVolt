// Cosmetic choices never change the code, colors, or Pin/Spin scoring.
export const ACCENTS = [
  { id: 'violet', name: 'Violet', hex: '#bb78ff' },
  { id: 'teal', name: 'Teal', hex: '#43dcd0', trophy: 'first_win' },
  { id: 'amber', name: 'Amber', hex: '#ffce64', trophy: 'world_1' },
  { id: 'rose', name: 'Rose', hex: '#ff80bb', trophy: 'daily_first' },
  { id: 'blue', name: 'Blue', hex: '#79aaff', trophy: 'hard_win' },
  { id: 'lime', name: 'Lime', hex: '#a7df6b', trophy: 'world_2' },
  { id: 'coral', name: 'Coral', hex: '#ff9275', trophy: 'big_room' },
  { id: 'ice', name: 'Ice', hex: '#93e8ff', trophy: 'world_3' },
  { id: 'gold', name: 'Gold', hex: '#f7da83', trophy: 'wins_10' },
  { id: 'orchid', name: 'Orchid', hex: '#e8a0f8', trophy: 'world_4' },
];

export const AVATARS = [
  { id: 'initial', name: 'Classic', icon: '●' },
  { id: 'bunny', name: 'Bunny', icon: '🐰' },
  { id: 'bear', name: 'Bear', icon: '🐻' },
  { id: 'fox', name: 'Rogue Fox', icon: '🦊', trophy: 'first_win' },
  { id: 'wolf', name: 'Silver Wolf', icon: '🐺', trophy: 'first_try' },
  { id: 'cat', name: 'Shadow Cat', icon: '🐱', trophy: 'hard_win' },
  { id: 'robot', name: 'Gear Bot', icon: '🤖', trophy: 'world_2' },
  { id: 'champion', name: 'Champion Lion', icon: '🦁', trophy: 'wins_10' },
  { id: 'royal', name: 'Royal Owl', icon: '🦉', trophy: 'wins_50' },
  { id: 'carrot', name: 'Carrot Keeper', icon: '🥕', trophy: 'world_1' },
  { id: 'crystal', name: 'Crystal Golem', icon: '💎', trophy: 'world_4' },
  { id: 'dragon', name: 'Desert Dragon', icon: '🐉', trophy: 'world_5' },
];
export const BOARDS = [
  { id: 'nebula', name: 'Nebula' },
  { id: 'arcade', name: 'Arcade', trophy: 'first_win' },
  { id: 'waves', name: 'Waves', trophy: 'world_2' },
  { id: 'gold', name: 'Gold', trophy: 'wins_10' },
  { id: 'prism', name: 'Prism', trophy: 'all_modes' },
  { id: 'crystal', name: 'Crystal', trophy: 'world_4' },
];
export const PIECES = [
  { id: 'round', name: 'Round', icon: '●' },
  { id: 'square', name: 'Square', icon: '■', trophy: 'first_win' },
  { id: 'star', name: 'Star', icon: '★', trophy: 'world_1' },
  { id: 'gem', name: 'Gem', icon: '◆', trophy: 'world_3' },
  { id: 'hex', name: 'Hexagon', icon: '⬢', trophy: 'hard_win' },
  { id: 'crown', name: 'Crown', icon: '♛', trophy: 'wins_50' },
];
export const RESULT_PINS = [
  { id: 'round', name: 'Round', icon: '●' },
  { id: 'square', name: 'Square', icon: '■', trophy: 'world_2' },
  { id: 'star', name: 'Star', icon: '★', trophy: 'perfectionist' },
];
export const DEFAULT_COSMETICS = { avatar: 'initial', board: 'nebula', piece: 'round', pin: 'round', accent: 'violet' };
export const GROUPS = { avatar: AVATARS, board: BOARDS, piece: PIECES, pin: RESULT_PINS, accent: ACCENTS };

export function unlockedCosmetics(value, earned = {}) {
  const normalized = normalizeCosmetics(value);
  return Object.fromEntries(Object.entries(GROUPS).map(([key, options]) => {
    const selected = options.find((option) => option.id === normalized[key]);
    return [key, selected?.trophy && !earned[selected.trophy] ? DEFAULT_COSMETICS[key] : normalized[key]];
  }));
}

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
