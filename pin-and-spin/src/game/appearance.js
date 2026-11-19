import { DEFAULT_COSMETICS, normalizeCosmetics } from '../cosmetics.js';

const STORAGE = 'pin_and_spin_cosmetics_v1';
export function readSavedAppearance() {
  try { return normalizeCosmetics(JSON.parse(localStorage.getItem(STORAGE)), 1); }
  catch { return DEFAULT_COSMETICS; }
}
export function saveAppearance(value) {
  try { localStorage.setItem(STORAGE, JSON.stringify(normalizeCosmetics(value))); }
  catch { /* Saving in a room still works when storage is disabled. */ }
}
