// The ball pictures are built into the stylesheet, so a ball never appears a moment late
// (as separate files, each color was only fetched the first time it showed up).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../../vite.config.js';

test('every ball picture is inlined; other files keep the normal rule', () => {
  const inline = config.build.assetsInlineLimit;
  for (const f of ['/x/pin-and-spin/src/balls/ball-1-red.svg', 'C:\\x\\src\\balls\\ball-5-white.svg']) assert.equal(inline(f), true, f);
  assert.equal(inline('/x/pin-and-spin/src/assets/logo.svg'), undefined);
  assert.equal(inline('/x/pin-and-spin/src/balls/generate.py'), undefined);
});
