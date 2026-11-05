// Pin & Spin sound effects. Real, pre-rendered audio files only (no synthesis).
// Sounds come from the SoundWeaver library (MIT, see public/sounds/LICENSE-SoundWeaver.txt),
// converted to small MP3s with each sound's volume baked in, because iPhones ignore
// a web page's per-element volume. Playback approach adapted from SoundWeaver's SoundManager.
//
// Phones only allow audio after the player touches the page. On the first touch we
// "unlock" a small pool of audio elements per sound; later sounds triggered by other
// players (a reveal, your turn) reuse those unlocked elements.

const SOUNDS = [
  'pop-bubble', 'tap-ui-tick', 'swipe', 'message-sent-swish', 'error-soft-thud', 'success-subtle-ping',
  'xp-up', 'achievement', 'level-up', 'modal-close-fall', 'confirm-unlock', 'notification-ding',
  'mention-pop', 'message-incoming-pop', 'drawer-open', 'drawer-close', 'toggle-switch-on',
  'toggle-switch-off', 'click-crisp-primary', 'tab-switch', 'select-item', 'invalid-thunk',
];
const POOL_SIZE = 3;
const PREF_KEY = 'pin_and_spin_sound_v1';

function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
function readMuted() {
  try {
    const saved = localStorage.getItem(PREF_KEY);
    if (saved === 'on') return false;
    if (saved === 'off') return true;
  } catch { /* storage disabled */ }
  return prefersReducedMotion(); // quiet by default for people who ask for reduced motion
}

let muted = readMuted();
let unlocked = false;
const pools = {};
const cursor = {};
const listeners = new Set();

function build() {
  if (typeof Audio === 'undefined') return;
  for (const id of SOUNDS) {
    if (pools[id]) continue;
    pools[id] = Array.from({ length: POOL_SIZE }, () => {
      const a = new Audio(`/sounds/${id}.mp3`);
      a.preload = 'auto';
      return a;
    });
    cursor[id] = 0;
  }
}

// Called on the first touch/click/key: create and unlock every pooled element.
function unlock() {
  if (unlocked) return;
  unlocked = true;
  build();
  for (const id of SOUNDS) {
    for (const a of pools[id]) {
      a.muted = true;
      a.dataset.unlocking = '1';
      const done = () => {
        a.pause(); a.currentTime = 0; a.muted = false; delete a.dataset.unlocking;
        if (a.dataset.playAfter) { delete a.dataset.playAfter; start(a); }
      };
      const p = a.play();
      if (p && typeof p.then === 'function') p.then(done, done);
      else done();
    }
  }
}
// The Pin & Spin TV app allows sound without a tap, so it unlocks right away.
export function unlockNow() { unlock(); }
if (typeof window !== 'undefined') {
  const once = () => {
    unlock();
    window.removeEventListener('pointerdown', once, true);
    window.removeEventListener('keydown', once, true);
  };
  window.addEventListener('pointerdown', once, true);
  window.addEventListener('keydown', once, true);
}

export function play(id) {
  if (muted || !unlocked) return;
  const pool = pools[id];
  if (!pool) return;
  const a = pool[cursor[id]];
  cursor[id] = (cursor[id] + 1) % pool.length;
  if (a.dataset.unlocking) { a.dataset.playAfter = '1'; return; } // first tap: play once unlocked
  start(a);
}

function start(a) {
  try {
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch { /* never let sound break the game */ }
}

export function isMuted() { return muted; }
export function setMuted(value) {
  muted = !!value;
  try { localStorage.setItem(PREF_KEY, muted ? 'off' : 'on'); } catch { /* ignore */ }
  listeners.forEach((fn) => fn(muted));
}
export function onMuteChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
