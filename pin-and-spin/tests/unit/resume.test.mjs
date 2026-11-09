// Coming back to the app (iPhone): the sign-in library may hang while it refreshes the login
// over a dropped connection. Game requests must not wait for it (the game looked frozen).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const { accessToken, savedToken } = await import('../../src/game/auth.js');
const KEY = 'sb-eybzbtyfafmqbkulyvog-auth-token';
const hanging = async () => ({ auth: { getSession: () => new Promise(() => {}) } });
const working = async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'fresh' } } }) } });

test('guests: no token, no waiting', async () => {
  delete store[KEY];
  assert.equal(await accessToken({ client: hanging, wait: 50 }), null);
});

test('normally the library’s (refreshed) token is used', async () => {
  store[KEY] = JSON.stringify({ access_token: 'saved', expires_at: Date.now() / 1000 + 3600 });
  assert.equal(await accessToken({ client: working, wait: 50 }), 'fresh');
});

test('if the library hangs, the request goes ahead with the saved token instead of freezing', async () => {
  store[KEY] = JSON.stringify({ access_token: 'saved', expires_at: Date.now() / 1000 + 3600 });
  const started = Date.now();
  assert.equal(await accessToken({ client: hanging, wait: 50 }), 'saved');
  assert.ok(Date.now() - started < 1000);
});

test('an expired saved token is not used (the player plays on as before; sign-in recovers later)', () => {
  store[KEY] = JSON.stringify({ access_token: 'old', expires_at: Date.now() / 1000 - 5 });
  assert.equal(savedToken(), null);
  store[KEY] = 'not json';
  assert.equal(savedToken(), null);
});

test('a request left hanging while the app was in the background is dropped on return', async () => {
  const docListeners = [];
  globalThis.document = { hidden: false, addEventListener: (t, fn) => docListeners.push(fn) };
  globalThis.fetch = (url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
  });
  const { callGame } = await import('../../src/game/api.js?resume');
  delete store[KEY];
  const pending = callGame('state', { code: 'ABCDEF', token: 'x' });
  await new Promise((r) => setTimeout(r, 5));
  document.hidden = true; docListeners.forEach((fn) => fn());      // switched to another app
  await new Promise((r) => setTimeout(r, 5));
  document.hidden = false; docListeners.forEach((fn) => fn());     // back
  await assert.rejects(pending, (e) => e.resumed === true);
});
