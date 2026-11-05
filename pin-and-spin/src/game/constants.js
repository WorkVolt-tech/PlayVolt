// Static game configuration shared by the player controller and the shared board.
export const API = 'https://eybzbtyfafmqbkulyvog.supabase.co/functions/v1/pin-and-spin';
export const SESSION_KEY = 'pin_and_spin_session_v1';
export const NAME_KEY = 'pin_and_spin_nickname';
export const DRAFT_KEY = 'pin_and_spin_draft_v1';
export const COLORS = [
  { name: 'Blue', hex: '#1f7bff', glyph: '✚' },
  { name: 'Red', hex: '#ff2d3a', glyph: '▦' },
  { name: 'Green', hex: '#2fcf1e', glyph: '▲' },
  { name: 'Yellow', hex: '#ffc81a', glyph: '✦' },
  { name: 'Purple', hex: '#a43cff', glyph: '⬟' },
  { name: 'White', hex: '#ece8f7', glyph: '═' },
];
export const MODES = {
  classic: { label: 'Classic', color: 0, icon: '↪', hint: 'Take turns · 4 guesses', description: 'A random player starts each game, including rematches. Take turns trying the same secret code. Each player gets four guesses. Guesses and clues appear immediately. First to solve wins.' },
  reveal: { label: 'Reveal', color: 1, icon: '◉', hint: 'Guess together · 4 guesses', description: 'Everyone submits privately at the same time. All guesses and clues reveal together after everyone submits. Players who solve in the same reveal share the win.' },
  'timed-reveal': { label: 'Timed Reveal', color: 3, icon: '◷', hint: '3 minutes per guess · 4 guesses', description: 'A fresh three-minute timer starts for EACH simultaneous guess. Reveal when everyone submits or time runs out. Missing a deadline uses that guess; you can play the next one. Same-reveal solvers tie.' },
  rush: { label: 'Rush', color: 2, icon: 'ϟ', hint: '3 minutes total · 8 guesses', description: 'Play at your own pace for three minutes total, with up to eight guesses each. Everyone’s submitted guesses and clues are visible live. The first correct submission wins.' },
};
export const EMPTY_GUESS = [null, null, null, null];
