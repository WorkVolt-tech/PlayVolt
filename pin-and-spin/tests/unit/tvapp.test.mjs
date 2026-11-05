// The Pin & Spin TV app identifies itself in the user agent; the website then skips the
// "Start sound & full screen" button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inTvApp } from '../../src/tv/tvLink.js';

const withAgent = (ua, fn) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: ua }, configurable: true });
  try { return fn(); } finally { if (original) Object.defineProperty(globalThis, 'navigator', original); }
};

test('the TV app is recognised by its user agent, browsers are not', () => {
  assert.equal(withAgent('Mozilla/5.0 (Linux; Android 9; AFTSSS) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 PlayVoltTV/1.0.3', inTvApp), true);
  assert.equal(withAgent('Mozilla/5.0 (Linux; Android 9; AFTSSS) AppleWebKit/537.36 Silk/120 like Chrome/120 Safari/537.36', inTvApp), false);
});

test('the app opens the TV page and uses the same user-agent marker', async () => {
  const java = await readFile(new URL('../../firetv/app/src/main/java/ca/chezmaxo/pinandspin/tv/MainActivity.java', import.meta.url), 'utf8');
  const gradle = await readFile(new URL('../../firetv/app/build.gradle', import.meta.url), 'utf8');
  assert.match(java, /" PlayVoltTV\/"/);
  assert.match(gradle, /https:\/\/playvolt-pin-and-spin\.pages\.dev\/tv/);
  assert.match(gradle, /applicationId 'ca\.chezmaxo\.pinandspin\.tv'/);
});
