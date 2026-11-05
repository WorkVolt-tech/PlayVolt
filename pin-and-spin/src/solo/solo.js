// Shared helpers for the 1-player modes (pure, unit-tested).

// The player's own calendar day (YYYY-MM-DD): the daily puzzle changes at local midnight.
export function localDay(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Milliseconds until the next local midnight (next daily puzzle).
export function msToTomorrow(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

export const LEVELS = {
  easy: { label: 'Easy', hint: '4 colors · no repeats · 8 tries' },
  normal: { label: 'Normal', hint: '6 colors · repeats · 8 tries' },
  hard: { label: 'Hard', hint: '6 colors · repeats · 6 tries' },
};

// Wordle-style result to share: one line per guess, 🟢 = Pin, ⚪ = Spin, ⚫ = miss.
// It never shows the colors, so it doesn't spoil the puzzle.
export function shareText(game, url) {
  const won = game.status === 'won';
  const rows = (game.guesses || []).map((g) => '🟢'.repeat(g.pins) + '⚪'.repeat(g.spins) + '⚫'.repeat(4 - g.pins - g.spins));
  return [`Pin & Spin Daily #${game.number} ${won ? rows.length : 'X'}/${game.maxTries}`, ...rows, url].filter(Boolean).join('\n');
}
