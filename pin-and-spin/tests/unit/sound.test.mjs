// Sound effects on phones, with a fake iPhone-style audio engine (Web Audio): it only switches
// on during a tap, switches off when the app goes to the background, and a sound started while
// it is off waits and plays later (which is how "every sound at once" happens).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const listeners = {};
let inTap = false;
let heard = [];
let waiting = [];   // sounds started while the engine was off
let fetches = 0;

class FakeAudioContext {
  constructor() { this.state = 'suspended'; this.destination = {}; }
  resume() { if (inTap) { this.state = 'running'; heard.push(...waiting); waiting = []; } return Promise.resolve(); }
  createBuffer() { return { silent: true }; }
  createBufferSource() {
    const ctx = this;
    return { connect() {}, start() {
      if (this.buffer?.silent) return;
      if (ctx.state === 'running') heard.push(this.buffer.id); else waiting.push(this.buffer.id);
    } };
  }
  decodeAudioData(data) { return Promise.resolve({ id: new TextDecoder().decode(data) }); }
}
const stored = new Map();
const store = {};
globalThis.caches = { open: async () => ({
  match: async (url) => (stored.has(url) ? { arrayBuffer: async () => stored.get(url) } : undefined),
  put: async (url, res) => { stored.set(url, await res.arrayBuffer()); },
}) };
globalThis.fetch = async (url) => {
  fetches++;
  const body = new TextEncoder().encode(url.split('/').pop().replace('.mp3', '')).buffer;
  const res = { ok: true, arrayBuffer: async () => body.slice(0), clone: () => res };
  return res;
};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
globalThis.window = { AudioContext: FakeAudioContext, addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); } };
globalThis.document = { readyState: 'complete', visibilityState: 'visible', addEventListener: (t, fn) => { (listeners['doc:' + t] ||= []).push(fn); } };
const sfx = await import('../../src/sound/sfx.js');
const tap = () => { inTap = true; listeners.pointerdown.forEach((fn) => fn()); inTap = false; };
const settle = () => new Promise((r) => setTimeout(r, 20));
let engine;
const realAC = FakeAudioContext;
window.AudioContext = class extends realAC { constructor() { super(); engine = this; } };

test('sound starts ON, even with Reduce Motion (the installed app has its own fresh settings)', () => {
  assert.equal(sfx.isMuted(), false);
});

test('before any tap, nothing plays and nothing is saved up for later', async () => {
  sfx.play('level-up');
  tap();
  await settle();
  assert.deepEqual(heard, [], 'the first tap is silent, and the earlier sound was dropped');
});

test('after one tap, sounds triggered later by the game (not by a tap) are heard', async () => {
  sfx.play('level-up');
  await settle();
  assert.deepEqual(heard, ['level-up']);
});

test('the sound files are kept on the device, and fetched once per start', async () => {
  assert.equal(stored.size, 22, 'every sound stored on the device');
  assert.ok(stored.has('/sounds/level-up.mp3'));
  assert.ok(fetches <= 22, 'each file fetched at most once');
});

test('app in the background: sounds while it is off are dropped (no burst), the next tap brings sound back', async () => {
  heard = [];
  engine.state = 'interrupted';           // the phone switched sound off
  sfx.play('xp-up');
  sfx.play('achievement');
  await settle();
  assert.deepEqual(heard, []);
  tap();
  await settle();
  assert.deepEqual(heard, [], 'nothing saved up plays on the tap');
  sfx.play('achievement');
  assert.deepEqual(heard, ['achievement']);
});

test('the mute button still silences everything and is remembered', async () => {
  heard = [];
  sfx.setMuted(true);
  sfx.play('level-up');
  await settle();
  assert.deepEqual(heard, []);
  assert.equal(store.pin_and_spin_sound_v1, 'off');
  sfx.setMuted(false);
});
