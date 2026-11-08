// The installed-app service worker must leave sounds alone (phones load audio in "range"
// pieces, and routing those through the service worker breaks sound in the installed app).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function loadWorker() {
  const handlers = {};
  const self = { location: { origin: 'https://pin.example' }, addEventListener: (type, fn) => { handlers[type] = fn; }, skipWaiting() {}, clients: { claim() {} } };
  vm.runInNewContext(await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8'), { self, caches: { open: () => Promise.resolve({ put() {} }), match: () => Promise.resolve(null) }, fetch: () => Promise.resolve({ ok: true, clone() { return {}; } }), URL });
  // Does the worker take over this request (call respondWith)?
  return (url, { destination = '', range = false, method = 'GET' } = {}) => {
    let handled = false;
    handlers.fetch({ request: { url, method, destination, headers: { has: (h) => h === 'range' && range } }, respondWith: () => { handled = true; } });
    return handled;
  };
}

test('sounds and media are never routed through the service worker', async () => {
  const handles = await loadWorker();
  assert.equal(handles('https://pin.example/sounds/level-up.mp3', { destination: 'audio' }), false);
  assert.equal(handles('https://pin.example/sounds/level-up.mp3'), false, 'even without a destination');
  assert.equal(handles('https://pin.example/anything.mp4', { range: true }), false, 'range requests');
  assert.equal(handles('https://pin.example/version.json'), false, 'the update check');
  assert.equal(handles('https://other.example/x.js'), false, 'other sites');
});

test('the page itself still goes through it (works offline, installable)', async () => {
  const handles = await loadWorker();
  assert.equal(handles('https://pin.example/'), true);
  assert.equal(handles('https://pin.example/assets/index.js', { destination: 'script' }), true);
});

test('updating the app keeps the sounds stored on the device', async () => {
  const handlers = {};
  const deleted = [];
  const self = { location: { origin: 'https://pin.example' }, addEventListener: (type, fn) => { handlers[type] = fn; }, skipWaiting() {}, clients: { claim() {} } };
  const caches = { keys: async () => ['pin-and-spin-v1', 'pin-and-spin-v2', 'pin-and-spin-sounds'], delete: async (k) => { deleted.push(k); return true; } };
  vm.runInNewContext(await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8'), { self, caches, fetch, URL });
  let done;
  handlers.activate({ waitUntil: (p) => { done = p; } });
  await done;
  assert.deepEqual(deleted, ['pin-and-spin-v1']);
});

test('built files (/assets/) come from the stored copy without waiting for the network', async () => {
  const handlers = {};
  let fetched = 0;
  const self = { location: { origin: 'https://pin.example' }, addEventListener: (type, fn) => { handlers[type] = fn; }, skipWaiting() {}, clients: { claim() {} } };
  const stored = { ok: true, stored: true };
  const caches = { match: async () => stored, open: async () => ({ put() {} }) };
  vm.runInNewContext(await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8'),
    { self, caches, fetch: async () => { fetched++; return { ok: true, clone() { return {}; } }; }, URL });
  let answer;
  handlers.fetch({ request: { url: 'https://pin.example/assets/index-abc.css', method: 'GET', destination: 'style', headers: { has: () => false } }, respondWith: (p) => { answer = p; } });
  assert.equal(await answer, stored);
  assert.equal(fetched, 0);
});
