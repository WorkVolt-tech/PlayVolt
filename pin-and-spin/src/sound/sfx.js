// Pin & Spin sound effects. Real, pre-rendered audio files only (no synthesis).
// Sounds come from the SoundWeaver library (MIT, see public/sounds/LICENSE-SoundWeaver.txt),
// converted to small MP3s with each sound's volume baked in.
//
// How it plays (the usual way for games on iPhone, including the Home Screen app):
// - Every sound file is downloaded once and KEPT ON THE DEVICE (the browser's Cache Storage),
//   so later starts are instant and work offline. A fresh copy is fetched in the background,
//   so a replaced sound (same file name) still arrives.
// - One audio engine (Web Audio) plays them all. Phones only switch it on during a tap, so the
//   first tap switches it on; after the app was in the background, the next tap switches it
//   back on. Nothing plays while it is off, and nothing is saved up to play later.
// (Earlier versions used dozens of <audio> players. Unlocking those on iPhone either sometimes
// played every sound at once, or stopped working in the Home Screen app.)

const SOUNDS = [
  'pop-bubble', 'tap-ui-tick', 'swipe', 'message-sent-swish', 'error-soft-thud', 'success-subtle-ping',
  'xp-up', 'achievement', 'level-up', 'modal-close-fall', 'confirm-unlock', 'notification-ding',
  'mention-pop', 'message-incoming-pop', 'drawer-open', 'drawer-close', 'toggle-switch-on',
  'toggle-switch-off', 'click-crisp-primary', 'tab-switch', 'select-item', 'invalid-thunk',
];
const PREF_KEY = 'pin_and_spin_sound_v1';
export const SOUND_CACHE = 'pin-and-spin-sounds';

// Sound is on unless the player turned it off with the 🔊 button. (It used to start muted for
// "Reduce Motion" users, which made the installed iPhone app — with its own fresh settings —
// start silent. Reduce Motion is about animation, not sound.)
function readMuted() {
  try { return localStorage.getItem(PREF_KEY) === 'off'; } catch { return false; }
}

let muted = readMuted();
let ctx = null;              // the audio engine, made on the first tap
const bytes = {};            // id -> Promise<ArrayBuffer> (the file, from the device or the server)
const buffers = {};          // id -> decoded sound, ready to play
const decoding = {};
const listeners = new Set();

// The file for one sound: from the device if we have it, else from the server (and kept).
function fileBytes(id) {
  if (bytes[id]) return bytes[id];
  const url = `/sounds/${id}.mp3`;
  bytes[id] = (async () => {
    let cache = null;
    try { cache = await globalThis.caches?.open(SOUND_CACHE); } catch { /* private mode etc. */ }
    const hit = cache ? await cache.match(url).catch(() => null) : null;
    const fresh = fetch(url).then((res) => {
      if (res.ok && cache) cache.put(url, res.clone()).catch(() => {});
      return res;
    });
    if (hit) { fresh.catch(() => {}); return hit.arrayBuffer(); }
    const res = await fresh;
    if (!res.ok) throw new Error(`sound ${id}: ${res.status}`);
    return res.arrayBuffer();
  })();
  bytes[id].catch(() => { delete bytes[id]; }); // try again next time
  return bytes[id];
}

function decode(data) {
  // Older iPhones only have the callback form of decodeAudioData.
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(data, resolve, reject);
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
}

function prepare(id) {
  if (!ctx || buffers[id] || decoding[id]) return;
  decoding[id] = fileBytes(id)
    .then((data) => decode(data.slice(0))) // decode a copy: Safari empties the one it is given
    .then((buffer) => { buffers[id] = buffer; })
    .catch(() => {})
    .finally(() => { delete decoding[id]; });
}

// Fetch the files soon after the page has loaded (not while it is still loading its pictures).
if (typeof window !== 'undefined' && typeof fetch === 'function') {
  const prefetch = () => setTimeout(() => SOUNDS.forEach((id) => fileBytes(id).catch(() => {})), 1500);
  if (document.readyState === 'complete') prefetch(); else window.addEventListener('load', prefetch, { once: true });
}

// Switch the engine on. Must run during a tap on phones (or right away in the TV app).
function unlock() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return;
  try {
    if (!ctx) {
      ctx = new AC();
      SOUNDS.forEach(prepare);
    }
    if (ctx.state !== 'running') ctx.resume?.().catch(() => {});
    // iPhone also wants something started during the tap: one silent sample.
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
  } catch { /* never let sound break the game */ }
}
function onGesture() { if (!ctx || ctx.state !== 'running') unlock(); }
// The Pin & Spin TV app allows sound without a tap, so it switches on right away.
export function unlockNow() { unlock(); }
if (typeof window !== 'undefined') {
  // Every tap/key checks (cheap when already on), so sound recovers by itself after the
  // phone switched it off (app in the background, a phone call).
  window.addEventListener('pointerdown', onGesture, true);
  window.addEventListener('touchend', onGesture, true);
  window.addEventListener('keydown', onGesture, true);
}

export function play(id) {
  if (muted || !ctx) return;
  // While the engine is off, play nothing: a sound started now would wait and then play
  // together with everything else on the next tap.
  if (ctx.state !== 'running') return;
  const buffer = buffers[id];
  if (!buffer) { prepare(id); return; }
  try {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
  } catch { /* never let sound break the game */ }
}

export function isMuted() { return muted; }
export function setMuted(value) {
  muted = !!value;
  try { localStorage.setItem(PREF_KEY, muted ? 'off' : 'on'); } catch { /* ignore */ }
  listeners.forEach((fn) => fn(muted));
}
export function onMuteChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
