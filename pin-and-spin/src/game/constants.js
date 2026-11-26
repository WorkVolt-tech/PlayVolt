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
  reveal: { label: 'Reveal', maxPlayers: 10, color: 1, icon: '◉', hint: 'Guess together · 4 guesses', description: 'Everyone submits privately at the same time. All guesses and clues reveal together after everyone submits. Players who solve in the same reveal share the win.' },
  'timed-reveal': { label: 'Timed Reveal', maxPlayers: 10, color: 3, icon: '◷', hint: '3 minutes per guess · 4 guesses', description: 'A fresh three-minute timer starts for EACH simultaneous guess. Reveal when everyone submits or time runs out. Missing a deadline uses that guess; you can play the next one. Same-reveal solvers tie.' },
  rush: { label: 'Rush', maxPlayers: 10, color: 2, icon: 'ϟ', hint: '5 minutes · 5 guesses · reveals every minute', description: 'Submit up to five guesses anytime during one five-minute match. Guess 1 reveals at minute 1, guess 2 at minute 2, and so on. Submitted rows stay sealed until their reveal, even while you continue playing. The first correct submission wins, but the match runs the full five minutes.' },
  relay: { label: 'Rally Relay', maxPlayers: 10, color: 3, icon: '⚑', hint: '4–10 players · 2 teams · TV boards', description: 'Two teams race through four stages. Talk through the clues together and take turns submitting guesses. Each team gets six guesses and three minutes per stage. First to solve all four wins.' },
  rally: { label: 'Code Rally', maxPlayers: 10, color: 4, icon: '⚑', hint: '4 stages · 6 guesses · 3 minutes each', description: 'Race through four codes: 4, 4, 5 and 6 balls. Solve to advance immediately, with six fresh guesses and three minutes per stage. Feedback is immediate; opponents see only your progress. Your run ends if time or guesses run out. First to finish wins. If nobody finishes: most codes solved, then fewer guesses, then fastest progress. Exact ties share the win.' },
};
export const EMPTY_GUESS = [null, null, null, null];
