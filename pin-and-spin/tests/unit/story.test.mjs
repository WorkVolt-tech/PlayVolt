// Story mode (migration 008): level map, unlocks, stars, timed levels and logic puzzles.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './db.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
let db;
beforeEach(async () => { db = await freshDb(); });
const story = async (action, data = {}, account = A) =>
  (await db.query('select public.pin_and_spin_story($1,$2,$3::jsonb) as r', [action, account, JSON.stringify(data)])).rows[0].r;
const solo = async (action, data = {}, account = A) =>
  (await db.query('select public.pin_and_spin_solo($1,$2,$3::jsonb) as r', [action, account, JSON.stringify(data)])).rows[0].r;
const secretOf = async (id) => (await db.query('select secret from public.pin_and_spin_solo_games where id=$1', [id])).rows[0].secret;
const score = (s, g) => {
  const pins = g.filter((v, i) => v === s[i]).length;
  let m = 0; for (let c = 0; c < 6; c++) m += Math.min(s.filter((v) => v === c).length, g.filter((v) => v === c).length);
  return [pins, m - pins];
};
const wrong = (secret, colors) => { const g = [0, 0, 0, 0].map((_, i) => (secret[i] + 1) % colors); return g; };
async function win(level, extraMisses = 0, account = A) {
  const g = await story('story_start', { level, fresh: true }, account);
  const s = await secretOf(g.id);
  let r;
  for (let i = 0; i < extraMisses; i++) r = await solo('solo_guess', { id: g.id, colors: wrong(s, g.colors), attempt: i + 1 }, account);
  r = await solo('solo_guess', { id: g.id, colors: s, attempt: extraMisses + 1 }, account);
  return r;
}

describe('story mode', () => {
  test('24 levels in 3 worlds; only level 1 is open at first; signed-in only', async () => {
    const home = await story('story_home');
    assert.equal(home.levels.length, 24);
    assert.deepEqual([...new Set(home.levels.map((l) => l.world))], [1, 2, 3]);
    assert.deepEqual(home.levels.filter((l) => l.unlocked).map((l) => l.level), [1]);
    assert.equal(home.stars, 0);
    await rejects(story('story_start', { level: 2 }), /Finish the level before/);
    await rejects(story('story_home', {}, null), /ACCOUNT_REQUIRED/);
  });

  test('winning earns stars by tries used and unlocks the next level; the best result is kept', async () => {
    // Level 1: 10 tries, 3 stars at <= 5, 2 stars at <= 7.
    let r = await win(1, 6); // 7 tries
    assert.equal(r.status, 'won');
    let home = await story('story_home');
    assert.deepEqual([home.levels[0].stars, home.levels[0].bestTries, home.levels[1].unlocked], [2, 7, true]);
    r = await win(1, 0); // 1 try
    home = await story('story_home');
    assert.deepEqual([home.levels[0].stars, home.levels[0].bestTries, home.stars], [3, 1, 3]);
    r = await win(1, 8); // 9 tries: worse, kept best
    home = await story('story_home');
    assert.equal(home.levels[0].stars, 3);
    // Another player starts from scratch.
    assert.equal((await story('story_home', {}, B)).stars, 0);
  });

  test('level rules: colors, repeats and tries come from the level', async () => {
    const g = await story('story_start', { level: 1 });
    assert.deepEqual([g.colors, g.maxTries, g.kind, g.storyLevel, g.deadline], [4, 10, 'story', 1, null]);
    const s = await secretOf(g.id);
    assert.equal(new Set(s).size, 4);
    assert.ok(s.every((c) => c < 4));
    await rejects(solo('solo_guess', { id: g.id, colors: [0, 1, 2, 5], attempt: 1 }), /Invalid color/);
    // Resuming returns the same game; losing gives no stars.
    assert.equal((await story('story_start', { level: 1 })).id, g.id);
    let r;
    for (let i = 1; i <= 10; i++) r = await solo('solo_guess', { id: g.id, colors: wrong(s, 4), attempt: i });
    assert.equal(r.status, 'lost');
    assert.equal((await story('story_home')).levels[0].stars, 0);
  });

  test('logic levels come with clues that fit exactly one code: the secret', async () => {
    await db.query(`insert into public.pin_and_spin_story_progress(user_id, level, stars, best_tries) select $1, level, 1, 1 from generate_series(1, 16) level`, [A]);
    for (const level of [3, 6, 10, 13, 17]) {
      const g = await story('story_start', { level, fresh: true });
      const s = await secretOf(g.id);
      assert.ok(g.clues.length >= 1, `level ${level} has clues`);
      assert.equal(g.answer, null);
      const all = [];
      for (let a = 0; a < g.colors; a++) for (let b = 0; b < g.colors; b++) for (let c = 0; c < g.colors; c++) for (let d = 0; d < g.colors; d++) all.push([a, b, c, d]);
      const repeats = (await story('story_home')).levels[level - 1].repeats;
      const fits = all.filter((code) => (repeats || new Set(code).size === 4) &&
        g.clues.every((cl) => { const [p, sp] = score(code, cl.colors); return p === cl.pins && sp === cl.spins; }));
      assert.deepEqual(fits, [s], `level ${level}: unique answer`);
    }
  });

  test('timed levels are lost when time runs out', async () => {
    await db.query(`insert into public.pin_and_spin_story_progress(user_id, level, stars, best_tries) select $1, level, 1, 1 from generate_series(1, 8) level`, [A]);
    const g = await story('story_start', { level: 9 });
    assert.ok(g.deadline);
    await db.query(`update public.pin_and_spin_solo_games set deadline=now()-interval '1 second' where id=$1`, [g.id]);
    const s = await secretOf(g.id);
    const r = await solo('solo_guess', { id: g.id, colors: s, attempt: 1 });
    assert.equal(r.status, 'lost');
    assert.equal((await story('story_home')).levels[8].stars, 0);
  });

  test('the level list and progress are private', async () => {
    const r = (await db.query(`select has_table_privilege('anon','public.pin_and_spin_story_progress','select') a,
      has_table_privilege('anon','public.pin_and_spin_story_levels','select') b,
      has_function_privilege('anon','public.pin_and_spin_story(text,uuid,jsonb)','execute') f`)).rows[0];
    assert.deepEqual(r, { a: false, b: false, f: false });
  });
});
