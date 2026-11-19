import { DEFAULT_COSMETICS, normalizeCosmetics, unlockedCosmetics } from '../cosmetics.js';

const STORAGE = 'pin_and_spin_cosmetics_v1';
export function readSavedAppearance() {
  try { return unlockedCosmetics(JSON.parse(localStorage.getItem(STORAGE))); }
  catch { return DEFAULT_COSMETICS; }
}
export function saveAppearance(value) {
  try { localStorage.setItem(STORAGE, JSON.stringify(normalizeCosmetics(value))); }
  catch { /* Saving in a room still works when storage is disabled. */ }
}
