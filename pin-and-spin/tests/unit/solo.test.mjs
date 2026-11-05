// 1-player modes (migration 007): daily puzzle, free play and beat the clock.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './db.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
let db;
beforeEach(async () => { db = await freshDb(); });
const solo = async (action, data = {}, account = A) =>
  (await db.query('select public.pin_and_spin_solo($1,$2,$3::jsonb) as r', [action, account, JSON.stringify(data)])).rows[0].r;
const today = async () => (await db.query('select current_date::text d')).rows[0].d;
const secretOf = async (id) => (await db.query('select secret from public.pin_and_spin_solo_games where id=$1', [id])).rows[0].secret;
const setSecret = (id, s) => db.query('update public.pin_and_spin_solo_games set secret=$2 where id=$1', [id, s]);
const guess = (g, colors, attempt, account = A) => solo('solo_guess', { id: g.id, colors, attempt }, account);

describe('solo modes', () => {
  test('signed-in players only', async () => {
    await rejects(solo('solo_home', {}, null), /ACCOUNT_REQUIRED/);
  });

  test('the daily code is the same for everyone that day, and the secret stays hidden while playing', async () => {
    const day = await today();
    const a = await solo('solo_start', { kind: 'daily', day });
    const b = await solo('solo_start', { kind: 'daily', day }, B);
    assert.notEqual(a.id, b.id);
    assert.deepEqual(await secretOf(a.id), await secretOf(b.id));
    assert.equal(a.answer, null);
    assert.equal(a.maxTries, 6);
    assert.equal(a.colors, 6);
    assert.ok(a.number >= 1);
    // Starting again resumes the same game (one daily per day).
    assert.equal((await solo('solo_start', { kind: 'daily', day })).id, a.id);
    await rejects(solo('solo_start', { kind: 'daily', day: '2020-01-01' }), /date/);
  });

  test('winning and losing a game, with the answer revealed at the end', async () => {
    const g = await solo('solo_start', { kind: 'practice', level: 'hard' });
    assert.equal(g.maxTries, 6);
    await setSecret(g.id, [0, 1, 2, 3]);
    let s = await guess(g, [0, 1, 3, 2], 1);
    assert.deepEqual([s.guesses[0].pins, s.guesses[0].spins, s.status, s.answer], [2, 2, 'playing', null]);
    s = await guess(g, [0, 1, 2, 3], 2);
    assert.deepEqual([s.status, s.answer], ['won', [0, 1, 2, 3]]);
    // After the end, more guesses are ignored.
    assert.equal((await guess(g, [5, 5, 5, 5], 3)).guesses.length, 2);

    const h = await solo('solo_start', { kind: 'practice', level: 'hard' });
    await setSecret(h.id, [0, 1, 2, 3]);
    for (let i = 1; i <= 5; i++) assert.equal((await guess(h, [5, 5, 5, 5], i)).status, 'playing');
    s = await guess(h, [5, 5, 5, 5], 6);
    assert.deepEqual([s.status, s.answer], ['lost', [0, 1, 2, 3]]);
  });

  test('easy uses 4 colors with no repeats; colors outside the game are refused', async () => {
    for (let i = 0; i < 15; i++) {
      const g = await solo('solo_start', { kind: 'practice', level: 'easy', fresh: true });
      const s = await secretOf(g.id);
      assert.equal(new Set(s).size, 4);
      assert.ok(s.every((c) => c >= 0 && c < 4));
    }
    const g = await solo('solo_start', { kind: 'practice', level: 'easy' });
    assert.equal(g.colors, 4);
    await rejects(guess(g, [0, 1, 2, 5], 1), /Invalid color/);
  });

  test('a repeated or out-of-order guess is not counted twice', async () => {
    const g = await solo('solo_start', { kind: 'practice' });
    await guess(g, [5, 5, 5, 4], 1);
    const again = await guess(g, [5, 5, 5, 4], 1);
    assert.equal(again.guesses.length, 1);
    assert.equal((await guess(g, [5, 5, 5, 4], 5)).guesses.length, 1);
  });

  test('free play resumes an unfinished game; "fresh" abandons it as a loss', async () => {
    const g = await solo('solo_start', { kind: 'practice' });
    assert.equal((await solo('solo_start', { kind: 'practice' })).id, g.id);
    const fresh = await solo('solo_start', { kind: 'practice', fresh: true });
    assert.notEqual(fresh.id, g.id);
    const home = await solo('solo_home');
    assert.deepEqual(home.practice.normal, { played: 1, won: 0 });
    assert.equal(home.active['practice:normal'], fresh.id);
  });

  test('beat the clock: cracked codes score, 8 misses skip to a new code, time up ends it', async () => {
    const g = await solo('solo_start', { kind: 'clock' });
    assert.ok(g.deadline);
    await setSecret(g.id, [0, 1, 2, 3]);
    let s = await guess(g, [0, 1, 2, 3], 1);
    assert.deepEqual([s.solved, s.lastResult, s.lastSecret, s.guesses.length, s.status], [1, 'solved', [0, 1, 2, 3], 0, 'playing']);
    await setSecret(g.id, [0, 1, 2, 3]);
    for (let i = 1; i <= 7; i++) s = await guess(g, [5, 5, 5, 5], i);
    s = await guess(g, [5, 5, 5, 5], 8);
    assert.deepEqual([s.solved, s.lastResult, s.guesses.length], [1, 'skipped', 0]);
    await db.query(`update public.pin_and_spin_solo_games set deadline=now()-interval '1 second' where id=$1`, [g.id]);
    s = await solo('solo_get', { id: g.id });
    assert.deepEqual([s.status, s.solved], ['done', 1]);
    await rejects(solo('solo_get', { id: g.id }, B), /no longer available/);
    const home = await solo('solo_home');
    assert.deepEqual(home.clock, { best: 1, played: 1 });
  });

  test('daily stats: played, won, streak, best streak and tries per win', async () => {
    const make = (day, status, tries) => db.query(`insert into public.pin_and_spin_solo_games(user_id,kind,day,secret,max_tries,status,guesses)
      values($1,'daily',$2::date,'{0,0,0,0}',6,$3,(select coalesce(jsonb_agg('{}'::jsonb), '[]'::jsonb) from generate_series(1,$4)))`, [A, day, status, tries]);
    const d = (n) => db.query(`select (current_date - ${n})::text d`).then((r) => r.rows[0].d);
    await make(await d(6), 'won', 2);
    await make(await d(5), 'won', 3);
    await make(await d(4), 'won', 3);
    await make(await d(3), 'lost', 6);
    await make(await d(2), 'won', 4);
    await make(await d(1), 'won', 1);
    const home = await solo('solo_home', { day: await today() });
    assert.deepEqual(home.daily, { played: 6, won: 5, streak: 2, best: 3, tries: [1, 1, 2, 1, 0, 0] });
    assert.equal(home.today, null);
    // Someone else's stats are separate.
    assert.equal((await solo('solo_home', {}, B)).daily.played, 0);
  });

  test("players can't touch someone else's game; tables are private", async () => {
    const g = await solo('solo_start', { kind: 'practice' });
    await rejects(guess(g, [0, 0, 0, 0], 1, B), /no longer available/);
    const r = (await db.query(`select has_table_privilege('anon','public.pin_and_spin_solo_games','select') a,
      has_table_privilege('anon','public.pin_and_spin_daily','select') b,
      has_function_privilege('anon','public.pin_and_spin_solo(text,uuid,jsonb)','execute') f`)).rows[0];
    assert.deepEqual(r, { a: false, b: false, f: false });
  });
});
