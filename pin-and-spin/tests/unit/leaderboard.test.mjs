// Leaderboard (migration 006): multiplayer wins for signed-in players only.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, game, rejects, tok } from './db.mjs';

const SECRET = [0, 1, 2, 3];
const WRONG = [5, 5, 5, 5];
const ACC = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
let db, g;
beforeEach(async () => {
  db = await freshDb(); g = game(db);
  for (const [i, id] of ACC.entries()) await db.query('insert into public.profiles(id,nickname) values($1,$2)', [id, ['Maxo', 'Dick', 'Ana'][i]]);
});

// Players: { token, account? }. The first creates; the rest join and get ready.
async function match(mode, people) {
  const as = (p, data = {}) => (p.account ? { ...data, _account_id: p.account } : data);
  const first = await g.api('create', '', people[0].token, as(people[0], { name: 'Host', mode }));
  people[0].id = first.me;
  for (const [i, p] of people.slice(1).entries()) {
    p.id = (await g.api('join', first.code, p.token, as(p, { name: 'Guest' + i }))).me;
    await g.api('ready', first.code, p.token, as(p, { ready: true }));
  }
  const room = { code: first.code, people, as };
  room.call = (p, action, data = {}) => g.api(action, room.code, p.token, as(p, data));
  await room.call(people[0], 'start');
  await g.setSecret(room.code, SECRET);
  return room;
}
const results = async () => (await db.query('select user_id, won, players, mode from public.pin_and_spin_results order by user_id')).rows;
const board = async (period = 'week', account = null) =>
  (await db.query('select public.pin_and_spin_leaderboard($1,$2) as r', [period, account])).rows[0].r;

describe('leaderboard', () => {
  test('a finished match records a win and a loss for signed-in players', async () => {
    const [a, b] = [{ token: tok(1), account: ACC[0] }, { token: tok(2), account: ACC[1] }];
    const room = await match('rush', [a, b]);
    await room.call(b, 'guess', { colors: WRONG, attempt: 1, puzzle: 1 });
    await room.call(a, 'guess', { colors: SECRET, attempt: 1, puzzle: 1 });
    assert.deepEqual(await results(), [
      { user_id: ACC[0], won: true, players: 2, mode: 'rush' },
      { user_id: ACC[1], won: false, players: 2, mode: 'rush' },
    ]);
  });

  test('guests are never stored, but still count as an opponent', async () => {
    const [a, guest] = [{ token: tok(1), account: ACC[0] }, { token: tok(2) }];
    const room = await match('rush', [a, guest]);
    await room.call(guest, 'guess', { colors: SECRET, attempt: 1, puzzle: 1 });
    assert.deepEqual(await results(), [{ user_id: ACC[0], won: false, players: 2, mode: 'rush' }]);
  });

  test('leaving after playing still counts as a loss; leaving before playing does not', async () => {
    const [a, b, c] = [{ token: tok(1), account: ACC[0] }, { token: tok(2), account: ACC[1] }, { token: tok(3), account: ACC[2] }];
    const room = await match('rush', [a, b, c]);
    await room.call(b, 'guess', { colors: WRONG, attempt: 1, puzzle: 1 });
    await room.call(b, 'leave');
    await room.call(c, 'leave');
    await room.call(a, 'guess', { colors: SECRET, attempt: 1, puzzle: 1 });
    const rows = await results();
    assert.deepEqual(rows.map((r) => [r.user_id, r.won, r.players]), [[ACC[0], true, 2], [ACC[1], false, 2]]);
  });

  test('every mode records, including shared wins and no-winner games', async () => {
    const [a, b] = [{ token: tok(1), account: ACC[0] }, { token: tok(2), account: ACC[1] }];
    const room = await match('reveal', [a, b]);
    await room.call(a, 'guess', { colors: SECRET, attempt: 1, puzzle: 1 });
    await room.call(b, 'guess', { colors: SECRET, attempt: 1, puzzle: 1 });
    assert.deepEqual((await results()).map((r) => r.won), [true, true]);

    const [c, d] = [{ token: tok(3), account: ACC[0] }, { token: tok(4), account: ACC[2] }];
    const classic = await match('classic', [c, d]);
    const state = await classic.call(c, 'state');
    const order = state.turnId === c.id ? [c, d] : [d, c];
    for (let attempt = 1; attempt <= 4; attempt++) for (const p of order) await classic.call(p, 'guess', { colors: WRONG, attempt, puzzle: 1 });
    const rows = (await results()).filter((r) => r.mode === 'classic');
    assert.deepEqual(rows.map((r) => r.won), [false, false]);
  });

  test('a rematch is a new match on the leaderboard', async () => {
    const [a, b] = [{ token: tok(1), account: ACC[0] }, { token: tok(2), account: ACC[1] }];
    const room = await match('rush', [a, b]);
    await room.call(a, 'guess', { colors: SECRET, attempt: 1, puzzle: 1 });
    await room.call(a, 'replay');
    await room.call(b, 'ready', { ready: true });
    await room.call(a, 'start');
    await g.setSecret(room.code, SECRET);
    await room.call(b, 'guess', { colors: SECRET, attempt: 1, puzzle: 2 });
    const top = await board('all');
    assert.deepEqual(top.players.map((p) => [p.name, p.wins, p.games]), [['Dick', 1, 2], ['Maxo', 1, 2]]);
  });

  test('ranked by wins (fewer games breaks ties), with the caller marked and their own row', async () => {
    const add = (user, won, days = 0) => db.query(`insert into public.pin_and_spin_results(room_id,puzzle,mode,user_id,won,players,finished_at)
      values((select id from public.pin_and_spin_rooms limit 1), $4, 'rush', $1, $2, 2, now() - ($3 || ' days')::interval)`, [user, won, String(days), Math.floor(Math.random() * 1e9)]);
    await g.room('rush', 2); // a room to attach rows to
    await add(ACC[0], true); await add(ACC[0], true); await add(ACC[0], false);
    await add(ACC[1], true); await add(ACC[1], true);
    await add(ACC[2], true, 30); // only all-time
    const week = await board('week', ACC[0]);
    assert.deepEqual(week.players.map((p) => [p.rank, p.name, p.wins, p.games, p.me]), [[1, 'Dick', 2, 2, false], [2, 'Maxo', 2, 3, true]]);
    assert.deepEqual(week.me, { rank: 2, name: 'Maxo', wins: 2, games: 3, a: 2, b: 3 });
    const all = await board('all', ACC[2]);
    assert.equal(all.players.length, 3);
    assert.deepEqual(all.me, { rank: 3, name: 'Ana', wins: 1, games: 1, a: 1, b: 1 });
    assert.equal((await board('week', ACC[2])).me, null);
    await rejects(board('month'), /period/);
  });

  test('results are private; the leaderboard function is server-only', async () => {
    const r = (await db.query(`select has_table_privilege('anon','public.pin_and_spin_results','select') a,
      has_function_privilege('anon','public.pin_and_spin_leaderboard(text,uuid,text)','execute') f`)).rows[0];
    assert.deepEqual(r, { a: false, f: false });
  });
});
