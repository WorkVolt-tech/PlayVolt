// Admin peek (migration 012): only accounts on the shared admins list can see a live secret.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, game, rejects, tok } from './db.mjs';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const PLAYER = '22222222-2222-4222-8222-222222222222';

test('admins see the secret of a game being played; nobody else does', async () => {
  const db = await freshDb(); const g = game(db);
  await db.query('insert into public.admins(user_id) values ($1)', [ADMIN]);
  const peek = async (account, data) => (await db.query('select public.pin_and_spin_admin_peek($1,$2::jsonb) r', [account, JSON.stringify(data)])).rows[0].r;
  const room = await g.room('classic', 2);
  assert.deepEqual(await peek(ADMIN, { code: room.code }), { secret: null }, 'no secret before the game starts');
  await g.api('start', room.code, room.players[0].token);
  await g.setSecret(room.code, [3, 1, 4, 1]);
  assert.deepEqual(await peek(ADMIN, { code: room.code }), { secret: [3, 1, 4, 1], puzzle: 1 });
  await rejects(peek(PLAYER, { code: room.code }), /Not available/);
  await rejects(peek(null, { code: room.code }), /Not available/);
  // The normal game snapshot still never includes the secret.
  assert.equal((await g.api('state', room.code, room.players[1].token)).answer, null);
});

test("admins see their own solo games' secret, not someone else's", async () => {
  const db = await freshDb();
  await db.query('insert into public.admins(user_id) values ($1)', [ADMIN]);
  const solo = async (account, data) => (await db.query(`select public.pin_and_spin_solo('solo_start',$1,$2::jsonb) r`, [account, JSON.stringify(data)])).rows[0].r;
  const peek = async (account, data) => (await db.query('select public.pin_and_spin_admin_peek($1,$2::jsonb) r', [account, JSON.stringify(data)])).rows[0].r;
  const mine = await solo(ADMIN, { kind: 'practice' });
  const theirs = await solo(PLAYER, { kind: 'practice' });
  const secret = (await db.query('select secret from public.pin_and_spin_solo_games where id=$1', [mine.id])).rows[0].secret;
  assert.deepEqual(await peek(ADMIN, { id: mine.id }), { secret });
  assert.deepEqual(await peek(ADMIN, { id: theirs.id }), { secret: null });
  const r = (await db.query(`select has_function_privilege('anon','public.pin_and_spin_admin_peek(uuid,jsonb)','execute') a,
    has_function_privilege('authenticated','public.pin_and_spin_admin_peek(uuid,jsonb)','execute') b`)).rows[0];
  assert.deepEqual(r, { a: false, b: false });
});
