// Guest session persistence. The token is a random bearer capability; the server stores only its hash.
import { NAME_KEY, SESSION_KEY } from './constants.js';

export function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
}
export function savedSession() {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    const invitedRoom = new URLSearchParams(location.search).get('room')?.toUpperCase();
    if (invitedRoom && invitedRoom !== value?.code) return null;
    return value && /^[a-f0-9]{64}$/.test(value.token) && /^[A-F0-9]{6}$/.test(value.code)
      ? value : null;
  } catch {
    return null;
  }
}
export function savedName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}
