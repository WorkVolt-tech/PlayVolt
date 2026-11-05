// The game uses its own styled dialogs, never the browser's confirm/prompt/alert pop-ups.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

test('the pop-up check catches real pop-ups only', () => {
  const bad = /(window\.(confirm|prompt|alert)|(?<![.\w])(confirm|prompt|alert))\s*\(/;
  assert.ok(bad.test("if (window.confirm('Leave?'))") && bad.test("alert('x')") && bad.test('window.prompt("Copy", t)'));
  assert.ok(!bad.test('installPrompt.prompt()') && !bad.test('showConfirm('));
});

test('no browser pop-ups (confirm/prompt/alert) anywhere in the app', async () => {
  const root = new URL('../../src/', import.meta.url);
  const files = (await readdir(root, { recursive: true })).filter((f) => /\.(jsx?|mjs)$/.test(f));
  const offenders = [];
  for (const f of files) {
    const code = await readFile(new URL(f, root), 'utf8');
    // window.confirm(...) or a bare confirm(...); not methods like installPrompt.prompt().
    if (/(window\.(confirm|prompt|alert)|(?<![.\w])(confirm|prompt|alert))\s*\(/.test(code.replace(/\/\/.*$/gm, ''))) offenders.push(f);
  }
  assert.deepEqual(offenders, []);
});
