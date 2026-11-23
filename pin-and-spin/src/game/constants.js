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
  // Story World 4, and multiplayer games that start with 4+ players (others use the first six).
  { name: 'Orange', hex: '#ff7a12', glyph: '▤' },
  { name: 'Pink', hex: '#f2479f', glyph: '◎' },
];
export const MODES = {
  classic: { label: 'Classic', color: 0, icon: '↪', maxPlayers: 2, hint: '2 players · take turns · 4 guesses', description: 'For 2 players only (with more, later players would learn from everyone’s guesses before their turn). A random player starts each game, including rematches. Take turns trying the same secret code. Each player gets four guesses. Guesses and clues appear immediately. First to solve wins.' },
  reveal: { label: 'Reveal', maxPlayers: 10, color: 1, icon: '◉', hint: 'Guess together · 4 guesses', description: 'Everyone submits privately at the same time. All guesses and clues reveal together after everyone submits. Players who solve in the same reveal share the win. Only correct answers earn points, in submission order. In a game with N players, the first correct earns N points, second N-1, and so on down to 1. No bonus for elapsed time.' },
  'timed-reveal': { label: 'Timed Reveal', maxPlayers: 10, color: 3, icon: '◷', hint: '3 minutes per guess · 4 guesses', description: 'A fresh three-minute timer starts for EACH simultaneous guess. Reveal when everyone submits or time runs out. Missing a deadline uses that guess; you can play the next one. Same-reveal solvers share the win; only correct answers earn points in submission order (first earns one point per player in the game, second one fewer, down to 1), regardless of elapsed time.' },
  rush: { label: 'Rush', maxPlayers: 10, color: 2, icon: 'ϟ', hint: '3 minutes total · 8 guesses', description: 'Play at your own pace for three minutes total, with up to eight guesses each. Everyone’s submitted guesses and clues are visible live. The first correct submission wins and earns points equal to the number of players who started the game; wrong submissions earn no points. Points are based on correct-answer order, not elapsed time.' },
};
export const EMPTY_GUESS = [null, null, null, null];
