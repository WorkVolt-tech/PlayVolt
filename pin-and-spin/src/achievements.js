// Achievement badges. The server decides who earned what (pin_and_spin_award in migration
// 009); this file only names and describes them. Keep the codes in sync with the migration.
import { callGame } from './game/api.js';

export const ACHIEVEMENTS = [
  { code: 'first_win', group: 'Multiplayer', icon: '🏆', title: 'First Victory', text: 'Win a match with friends.' },
  { code: 'wins_10', group: 'Multiplayer', icon: '🔟', title: 'Ten Wins', text: 'Win 10 matches with friends.' },
  { code: 'wins_50', group: 'Multiplayer', icon: '👑', title: 'Code Royalty', text: 'Win 50 matches with friends.' },
  { code: 'big_room', group: 'Multiplayer', icon: '🎉', title: 'Party Champion', text: 'Win a match with 6 or more players.' },
  { code: 'all_modes', group: 'Multiplayer', icon: '🌈', title: 'Mode Master', text: 'Win in Classic, Reveal, Timed Reveal and Rush.' },
  { code: 'daily_first', group: 'Daily Puzzle', icon: '📅', title: 'Daily Debut', text: 'Solve your first daily puzzle.' },
  { code: 'streak_3', group: 'Daily Puzzle', icon: '🔥', title: 'On a Roll', text: 'Solve the daily puzzle 3 days in a row.' },
  { code: 'streak_7', group: 'Daily Puzzle', icon: '⚡', title: 'Week Warrior', text: 'Solve the daily puzzle 7 days in a row.' },
  { code: 'streak_30', group: 'Daily Puzzle', icon: '💎', title: 'Unstoppable', text: 'Solve the daily puzzle 30 days in a row.' },
  { code: 'first_try', group: 'Solo', icon: '🎯', title: 'Lucky Shot', text: 'Crack a code on your very first try.' },
  { code: 'mind_reader', group: 'Solo', icon: '🧠', title: 'Mind Reader', text: 'Solve a daily or free-play code in 3 tries or fewer.' },
  { code: 'hard_win', group: 'Solo', icon: '💪', title: 'Hard Nut', text: 'Win a Free Play game on Hard.' },
  { code: 'clock_5', group: 'Solo', icon: '⏱️', title: 'Quick Fingers', text: 'Crack 5 codes in one Beat the Clock.' },
  { code: 'clock_10', group: 'Solo', icon: '🚀', title: 'Speed Demon', text: 'Crack 10 codes in one Beat the Clock.' },
  { code: 'world_1', group: 'Story', icon: '🥕', title: 'Carrot Keeper', text: 'Finish World 1: Carrot Patch.' },
  { code: 'world_2', group: 'Story', icon: '⚙️', title: 'Gear Breaker', text: 'Finish World 2: Clockwork Burrow.' },
  { code: 'world_3', group: 'Story', icon: '🌙', title: 'Moon Walker', text: 'Finish World 3: Moon Maze.' },
  { code: 'world_4', group: 'Story', icon: '💎', title: 'Crystal Clear', text: 'Finish World 4: Crystal Caves.' },
  { code: 'logic_master', group: 'Story', icon: '🧩', title: 'Logic Master', text: 'Solve every logic puzzle in story mode.' },
  { code: 'perfectionist', group: 'Story', icon: '⭐', title: 'Perfectionist', text: 'Get 3 stars on every story level.' },
];
export const byCode = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.code, a]));

const cacheKey = (userId) => `pin_and_spin_badges_${userId}`;
export function knownBadges(userId) {
  try { return JSON.parse(localStorage.getItem(cacheKey(userId)) || 'null'); } catch { return null; }
}
export function newBadges(known, earned) {
  if (!known) return []; // First check on this device: remember quietly, announce nothing.
  return Object.keys(earned).filter((code) => !known.includes(code) && byCode[code]);
}

// After a game ends: ask the server for this player's badges and announce new ones.
export async function checkAchievements(userId, notify) {
  if (!userId) return [];
  try {
    const { earned } = await callGame('achievements', {}, {});
    const fresh = newBadges(knownBadges(userId), earned);
    try { localStorage.setItem(cacheKey(userId), JSON.stringify(Object.keys(earned))); } catch { /* optional */ }
    fresh.forEach((code, i) => setTimeout(() => notify(`🏅 Achievement unlocked: ${byCode[code].icon} ${byCode[code].title}`), 1200 + i * 3800));
    return fresh;
  } catch { return []; }
}
