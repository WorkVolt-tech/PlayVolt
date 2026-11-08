// Sound effects on phones, with a fake iPhone-style player: audio may only start during a
// tap unless that element was already started (unmuted) during an earlier tap.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const listeners = {};
let inTap = false;
let heard = [];
// missQuickStop: like a real iPhone once in a while, a stop right after a start is ignored.
let missQuickStop = false;
const made = [];
class FakeAudio {
  constructor(src) { this.loads = 0; this.src = src ?? ''; this.muted = false; this.unlocked = false; this.currentTime = 0; this.paused = true; made.push(this); }
  get src() { return this._src; }
  set src(v) { this._src = v; if (String(v).endsWith('.mp3')) this.loads++; }
  play() {
    if (inTap && !this.muted) this.unlocked = true;   // stays allowed, whatever file it plays later
    if (!this.unlocked && !inTap) { const e = new Error('blocked'); e.name = 'NotAllowedError'; return Promise.reject(e); }
    this.paused = false;
    this.justStarted = true;
    queueMicrotask(() => { this.justStarted = false; });
    const src = this.src;
    queueMicrotask(() => { if (!this.paused && src.endsWith('.mp3')) heard.push(src.split('/').pop()); });
    return Promise.resolve();
  }
  pause() { if (missQuickStop && this.justStarted) return; this.paused = true; }
  load() {}
}
const store = {};
globalThis.Audio = FakeAudio;
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
globalThis.window = { addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); }, matchMedia: () => ({ matches: true }) };
globalThis.document = { visibilityState: 'visible', addEventListener: (t, fn) => { (listeners['doc:' + t] ||= []).push(fn); } };
const sfx = await import('../../src/sound/sfx.js');
const tap = () => { inTap = true; listeners.pointerdown.forEach((fn) => fn()); inTap = false; };
const tick = () => new Promise((r) => setTimeout(r, 0));

test('sound starts ON, even with Reduce Motion (the installed app has its own fresh settings)', () => {
  assert.equal(sfx.isMuted(), false);
});

test('after one tap, sounds triggered later by the game (not by a tap) are heard', async () => {
  // The first tap unlocks every sound. Even on a phone that misses a quick stop, nothing is
  // heard: unlocking plays a silent clip (it used to play every real sound at once).
  missQuickStop = true;
  tap();
  await tick();
  missQuickStop = false;
  assert.deepEqual(heard, [], 'unlocking is silent');
  // The real sounds come back a few at a time, never all at once, and each is fetched once.
  assert.ok(made.filter((a) => a.loads > 0).length < 5, 'not all reloaded at once');
  await new Promise((r) => setTimeout(r, 2000));
  assert.ok(made.every((a) => a.src.endsWith('.mp3')), 'every element has its sound back');
  assert.ok(made.every((a) => a.loads === 1), 'one download each');
  sfx.play('level-up');
  await tick();
  assert.deepEqual(heard, ['level-up.mp3']);
});

test('when the phone locks sound again (app in the background), the next tap unlocks it', async () => {
  heard = [];
  // Coming back from the background: the phone locked every element again.
  document.visibilityState = 'visible';
  listeners['doc:visibilitychange'].forEach((fn) => fn());
  // Simulate the lock on all elements by re-creating the lock state through a refused play.
  sfx.play('xp-up');
  await tick();
  tap();
  sfx.play('achievement');
  await tick();
  assert.ok(heard.includes('achievement.mp3'));
});

test('the mute button still silences everything and is remembered', async () => {
  heard = [];
  sfx.setMuted(true);
  sfx.play('level-up');
  await tick();
  assert.deepEqual(heard, []);
  assert.equal(store.pin_and_spin_sound_v1, 'off');
  sfx.setMuted(false);
});
