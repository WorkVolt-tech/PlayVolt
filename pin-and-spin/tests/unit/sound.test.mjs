// Sound effects on phones, with a fake iPhone-style player: audio may only start during a
// tap unless that element was already started (unmuted) during an earlier tap.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const listeners = {};
let inTap = false;
let heard = [];
class FakeAudio {
  constructor(src) { this.src = src; this.muted = false; this.unlocked = false; this.currentTime = 0; this.paused = true; }
  play() {
    if (inTap && !this.muted) this.unlocked = true;
    if (!this.unlocked && !inTap) { const e = new Error('blocked'); e.name = 'NotAllowedError'; return Promise.reject(e); }
    this.paused = false;
    queueMicrotask(() => { if (!this.paused) heard.push(this.src.split('/').pop()); });
    return Promise.resolve();
  }
  pause() { this.paused = true; }
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
  tap();
  await tick();
  assert.deepEqual(heard, [], 'unlocking is silent');
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
