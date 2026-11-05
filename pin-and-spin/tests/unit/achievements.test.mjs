// More leaderboards and achievements (migration 009).
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './db.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
let db;
beforeEach(async () => {
  db = await freshDb();
  await db.query(`insert into public.profiles(id,nickname) values($1,'Maxo'),($2,'Dick')`, [A, B]);
});
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const board = async (b, period = 'all', account = null) =>
  (await q('select public.pin_and_spin_leaderboard($1,$2,$3) r', [period, account, b]))[0].r;
const badges = async (account = A) => Object.keys((await q('select public.pin_and_spin_achievements_for($1) r', [account]))[0].r.earned).sort();
const solo = async (action, data, account = A) =>
  (await q('select public.pin_and_spin_solo($1,$2,$3::jsonb) r', [action, account, JSON.stringify(data)]))[0].r;
const story = async (action, data, account = A) =>
  (await q('select public.pin_and_spin_story($1,$2,$3::jsonb) r', [action, account, JSON.stringify(data)]))[0].r;
const secretOf = async (id) => (await q('select secret from public.pin_and_spin_solo_games where id=$1', [id]))[0].secret;
const daily = (user, day, status, tries) => db.query(`insert into public.pin_and_spin_solo_games(user_id,kind,day,secret,max_tries,status,guesses)
  values($1,'daily',(current_date - $2::int),'{0,0,0,0}',6,$3,(select coalesce(jsonb_agg('{}'::jsonb),'[]'::jsonb) from generate_series(1,$4)))`, [user, day, status, tries]);

describe('more leaderboards', () => {
  test('daily: puzzles solved, ties broken by fewer average tries; last 7 days or all time', async () => {
    await daily(A, 1, 'won', 3); await daily(A, 2, 'won', 5); await daily(A, 20, 'won', 2);
    await daily(B, 1, 'won', 2); await daily(B, 2, 'won', 2); await daily(B, 3, 'lost', 6);
    const week = await board('daily', 'week', A);
    assert.deepEqual(week.players.map((p) => [p.rank, p.name, p.a, Number(p.b), p.me]), [[1, 'Dick', 2, 2, false], [2, 'Maxo', 2, 4, true]]);
    const all = await board('daily', 'all');
    assert.deepEqual(all.players.map((p) => [p.name, p.a]), [['Maxo', 3], ['Dick', 2]]);
  });

  test('clock: best score; story: total stars', async () => {
    await db.query(`insert into public.pin_and_spin_solo_games(user_id,kind,secret,max_tries,status,solved) values
      ($1,'clock','{0,0,0,0}',8,'done',4),($1,'clock','{0,0,0,0}',8,'done',7),($2,'clock','{0,0,0,0}',8,'done',9)`, [A, B]);
    assert.deepEqual((await board('clock')).players.map((p) => [p.name, p.a, p.b]), [['Dick', 9, 1], ['Maxo', 7, 2]]);
    await db.query(`insert into public.pin_and_spin_story_progress(user_id,level,stars,best_tries) values ($1,1,3,1),($1,2,2,3),($2,1,1,9)`, [A, B]);
    const s = await board('story', 'week', B);
    assert.deepEqual(s.players.map((p) => [p.name, p.a, p.b]), [['Maxo', 5, 2], ['Dick', 1, 1]]);
    assert.deepEqual([s.me.rank, s.me.a], [2, 1]);
    await rejects(board('nope'), /Choose a leaderboard/);
  });

  test('the multiplayer board still works with the old two-argument call', async () => {
    const r = (await q('select public.pin_and_spin_leaderboard(p_period => $1, p_account => $2) r', ['week', A]))[0].r;
    assert.equal(r.board, 'multi');
  });
});

describe('achievements', () => {
  test('signed-in only; nothing earned at first', async () => {
    await rejects(q('select public.pin_and_spin_achievements_for(null)'), /ACCOUNT_REQUIRED/);
    assert.deepEqual(await badges(), []);
  });

  test('multiplayer badges come from finished matches', async () => {
    await db.query(`insert into public.pin_and_spin_rooms(code,mode,creator_hash) values ('AAAAAA','classic','x')`);
    const add = (mode, won, players, puzzle) => db.query(`insert into public.pin_and_spin_results(room_id,puzzle,mode,user_id,won,players)
      values((select id from public.pin_and_spin_rooms limit 1),$4,$1,$5,$2,$3)`, [mode, won, players, puzzle, A]);
    await add('classic', true, 2, 1);
    assert.deepEqual(await badges(), ['first_win']);
    await add('reveal', true, 6, 2); await add('timed-reveal', true, 2, 3); await add('rush', true, 3, 4);
    assert.deepEqual(await badges(), ['all_modes', 'big_room', 'first_win']);
    for (let i = 5; i < 11; i++) await add('rush', true, 2, i);
    assert.ok((await badges()).includes('wins_10'));
  });

  test('daily streak badges', async () => {
    for (let d = 1; d <= 7; d++) await daily(A, d, 'won', 4);
    const got = await badges();
    for (const c of ['daily_first', 'streak_3', 'streak_7']) assert.ok(got.includes(c), c);
    assert.ok(!got.includes('streak_30'));
  });

  test('solo badges are awarded automatically when a game ends', async () => {
    const g = await solo('solo_start', { kind: 'practice', level: 'hard' });
    await solo('solo_guess', { id: g.id, colors: await secretOf(g.id), attempt: 1 });
    const earned = (await q('select code from public.pin_and_spin_achievements where user_id=$1 order by code', [A])).map((r) => r.code);
    assert.deepEqual(earned, ['first_try', 'hard_win', 'mind_reader']);
    // Someone else earned nothing.
    assert.deepEqual(await badges(B), []);
  });

  test('story badges: finishing world 1', async () => {
    await db.query(`insert into public.pin_and_spin_story_progress(user_id,level,stars,best_tries) select $1, l, 1, 5 from generate_series(1,7) l`, [A]);
    assert.ok(!(await badges()).includes('world_1'));
    await db.query(`insert into public.pin_and_spin_story_progress(user_id,level,stars,best_tries) values ($1,8,2,5)`, [A]);
    const earned = (await q('select code from public.pin_and_spin_achievements where user_id=$1', [A])).map((r) => r.code);
    assert.ok(earned.includes('world_1'), 'awarded by the story trigger');
    assert.ok(!earned.includes('world_2'));
  });

  test('achievements are private', async () => {
    const r = (await q(`select has_table_privilege('anon','public.pin_and_spin_achievements','select') a,
      has_function_privilege('anon','public.pin_and_spin_achievements_for(uuid)','execute') f`))[0];
    assert.deepEqual(r, { a: false, f: false });
  });
});
