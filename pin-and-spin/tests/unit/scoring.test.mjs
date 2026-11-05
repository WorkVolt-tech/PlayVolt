// Pin/Spin scoring, run against the real pin_and_spin_score SQL function.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './db.mjs';

const B = 0, R = 1, G = 2, Y = 3, P = 4, W = 5;
let db;
before(async () => { db = await freshDb(); });
const score = async (secret, guess) =>
  (await db.query('select public.pin_and_spin_score($1,$2) s', [secret, guess])).rows[0].s;

// Independent reference: exact matches first, then color overlap of the remainder.
function reference(secret, guess) {
  let pins = 0; const s = {}, g = {};
  secret.forEach((c, i) => { if (c === guess[i]) pins++; else { s[c] = (s[c] || 0) + 1; g[guess[i]] = (g[guess[i]] || 0) + 1; } });
  return [pins, Object.keys(g).reduce((n, c) => n + Math.min(g[c], s[c] || 0), 0)];
}

const cases = [
  ['spec example: Red Blue Green Yellow vs Red Green Purple Blue', [R, B, G, Y], [R, G, P, B], [1, 2]],
  ['all four correct', [B, R, G, Y], [B, R, G, Y], [4, 0]],
  ['zero matching colors', [B, B, R, R], [G, Y, P, W], [0, 0]],
  ['all colors right, all positions wrong', [B, R, G, Y], [R, B, Y, G], [0, 4]],
  ['repeated color in the guess is not double counted', [B, R, G, Y], [B, B, B, B], [1, 0]],
  ['repeated guess color, single secret color elsewhere', [R, B, G, Y], [B, B, W, W], [1, 0]],
  ['repeated color in the secret', [B, B, R, R], [R, R, B, B], [0, 4]],
  ['repeats on both sides', [B, B, B, R], [B, R, R, B], [1, 2]],
  ['database regression: [0,0,1,2] vs [0,1,0,0]', [0, 0, 1, 2], [0, 1, 0, 0], [1, 2]],
  ['one color everywhere', [W, W, W, W], [W, W, W, W], [4, 0]],
  ['three of a kind vs one', [G, G, G, Y], [Y, P, P, P], [0, 1]],
];
for (const [name, secret, guess, expected] of cases) {
  test(name, async () => assert.deepEqual(await score(secret, guess), expected));
}

test('matches the reference for every guess against secrets with and without repeats', async () => {
  const all = [];
  for (let n = 0; n < 1296; n++) all.push([n / 216 | 0, (n / 36 | 0) % 6, (n / 6 | 0) % 6, n % 6]);
  const secrets = [[B, R, G, Y], [B, B, R, R], [W, W, W, W], [P, Y, P, Y], [G, G, G, B], [R, B, R, W]];
  for (const secret of secrets) {
    const { rows } = await db.query(
      `select g.i, public.pin_and_spin_score($1, g.guess) s
       from jsonb_array_elements($2::jsonb) with ordinality g0(v, i)
       cross join lateral (select g0.i, array(select jsonb_array_elements_text(g0.v)::int) guess) g`,
      [secret, JSON.stringify(all)]);
    for (const row of rows) {
      const guess = all[row.i - 1];
      const [pins, spins] = row.s;
      assert.deepEqual(row.s, reference(secret, guess), `secret ${secret} guess ${guess}`);
      assert.ok(pins + spins <= 4);
    }
  }
});
