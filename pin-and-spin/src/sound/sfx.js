// Pin & Spin sound effects. Real, pre-rendered audio files only (no synthesis).
// Sounds come from the SoundWeaver library (MIT, see public/sounds/LICENSE-SoundWeaver.txt),
// converted to small MP3s with each sound's volume baked in, because iPhones ignore
// a web page's per-element volume. Playback approach adapted from SoundWeaver's SoundManager.
//
// Phones only allow audio after the player touches the page. On a touch we "unlock" a small
// pool of audio elements per sound (see unlock() below); later sounds triggered by other
// players (a reveal, your turn) reuse those unlocked elements.

const SOUNDS = [
  'pop-bubble', 'tap-ui-tick', 'swipe', 'message-sent-swish', 'error-soft-thud', 'success-subtle-ping',
  'xp-up', 'achievement', 'level-up', 'modal-close-fall', 'confirm-unlock', 'notification-ding',
  'mention-pop', 'message-incoming-pop', 'drawer-open', 'drawer-close', 'toggle-switch-on',
  'toggle-switch-off', 'click-crisp-primary', 'tab-switch', 'select-item', 'invalid-thunk',
];
const POOL_SIZE = 3;
const PREF_KEY = 'pin_and_spin_sound_v1';

// Sound is on unless the player turned it off with the 🔊 button. (It used to start muted for
// "Reduce Motion" users, which made the installed iPhone app — with its own fresh settings —
// start silent. Reduce Motion is about animation, not sound.)
function readMuted() {
  try { return localStorage.getItem(PREF_KEY) === 'off'; } catch { return false; }
}

let muted = readMuted();
let unlocked = false;
const pools = {};
const cursor = {};
const listeners = new Set();
// Each element's own sound, and the elements still being unlocked (see unlockOne).
const realSrc = new Map();
const unlocking = new Map();   // element -> puts its own sound back
// A twentieth of a second of silence (a tiny WAV), used to unlock elements without a sound.
const SILENT = 'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';

function build() {
  if (typeof Audio === 'undefined') return;
  for (const id of SOUNDS) {
    if (pools[id]) continue;
    pools[id] = Array.from({ length: POOL_SIZE }, () => {
      const a = new Audio(`/sounds/${id}.mp3`);
      a.preload = 'auto';
      realSrc.set(a, a.src);
      return a;
    });
    cursor[id] = 0;
  }
}

// Phones only allow sound after a tap, and an app added to the iPhone Home Screen is stricter
// than Safari: each audio element must be started UNMUTED during a tap. Once started that way,
// the element stays allowed, even with another sound file. So on a tap every pooled element
// plays a short SILENT clip, then gets its own sound back.
// (It used to start and instantly stop each real sound. Once in a while an iPhone ignored the
// instant stop, and all the sounds played at once while the page stalled.)
// iPhones can lock sound again after the app was in the background, so we unlock again on the
// next tap after coming back, and whenever a sound is refused.
function unlockOne(a) {
  if (unlocking.has(a)) return;
  let done = false;
  const restore = () => {
    if (done) return;
    done = true;
    try { a.pause(); a.src = realSrc.get(a); a.load?.(); } catch { /* never let sound break the game */ }
    unlocking.delete(a);
  };
  unlocking.set(a, restore);
  try {
    a.muted = false;
    a.src = SILENT;
    const p = a.play();
    if (p && typeof p.then === 'function') p.then(restore, restore); else restore();
  } catch { restore(); }
  setTimeout(restore, 1500); // in case the phone never answers
}
function unlock() {
  if (unlocked) return;
  build();
  if (!Object.keys(pools).length) return;
  unlocked = true;
  for (const id of SOUNDS) for (const a of pools[id]) unlockOne(a);
}
function onGesture() { if (!unlocked) unlock(); }
function relock() { unlocked = false; } // the next tap unlocks again
// The Pin & Spin TV app allows sound without a tap, so it unlocks right away.
export function unlockNow() { unlock(); }
if (typeof window !== 'undefined') {
  // Every tap/key checks (cheap when already unlocked), so sound recovers by itself.
  window.addEventListener('pointerdown', onGesture, true);
  window.addEventListener('touchend', onGesture, true);
  window.addEventListener('keydown', onGesture, true);
  document.addEventListener?.('visibilitychange', () => { if (document.visibilityState === 'visible') relock(); });
  window.addEventListener('pageshow', relock);
}

export function play(id) {
  if (muted || !unlocked) return;
  const pool = pools[id];
  if (!pool) return;
  const a = pool[cursor[id]];
  cursor[id] = (cursor[id] + 1) % pool.length;
  // still playing the silent clip (a sound in the same tap that unlocked it): give it its sound back first
  unlocking.get(a)?.();
  start(a);
}

function start(a) {
  try {
    a.currentTime = 0;
    const p = a.play();
    // Refused (the phone locked sound again): unlock on the next tap.
    if (p && typeof p.catch === 'function') p.catch((e) => { if (e?.name === 'NotAllowedError') relock(); });
  } catch { /* never let sound break the game */ }
}

export function isMuted() { return muted; }
export function setMuted(value) {
  muted = !!value;
  try { localStorage.setItem(PREF_KEY, muted ? 'off' : 'on'); } catch { /* ignore */ }
  listeners.forEach((fn) => fn(muted));
}
export function onMuteChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
