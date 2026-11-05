// Inviting a friend into your room (migration 011). The friends list is the shared PlayVolt one.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, game, rejects, tok } from './db.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
let db, g;
beforeEach(async () => {
  db = await freshDb(); g = game(db);
  await db.query(`insert into public.profiles(id,nickname) values($1,'Maxo'),($2,'Dick'),($3,'Ana')`, [A, B, C]);
  await db.query(`insert into public.friendships(requester,addressee,status) values($1,$2,'accepted'),($1,$3,'pending')`, [A, B, C]);
});
const social = async (action, data, account) =>
  (await db.query('select public.pin_and_spin_social($1,$2,$3::jsonb) r', [action, account, JSON.stringify(data)])).rows[0].r;
const hostRoom = async () => (await g.api('create', '', tok(1), { name: 'x', mode: 'classic', _account_id: A })).code;

describe('friend invites', () => {
  test('invite a friend; they see it, accept it and get the room code', async () => {
    const code = await hostRoom();
    assert.deepEqual(await social('invite', { friend: B, code }, A), { sent: true });
    const { invites } = await social('invites', {}, B);
    assert.equal(invites.length, 1);
    assert.deepEqual([invites[0].from, invites[0].code, invites[0].mode], ['Maxo', code, 'classic']);
    assert.deepEqual(await social('invite_respond', { id: invites[0].id, accept: true }, B), { code });
    assert.equal((await social('invites', {}, B)).invites.length, 0, 'answered invites disappear');
    // The friend can now join with that code, signed in.
    const joined = await g.api('join', code, tok(2), { name: 'y', _account_id: B });
    assert.equal(joined.players.length, 2);
  });

  test('only friends (accepted) can be invited, and only from a room you are in', async () => {
    const code = await hostRoom();
    await rejects(social('invite', { friend: C, code }, A), /only invite your friends/);
    await rejects(social('invite', { friend: A, code }, B), /Join the room/);
    await rejects(social('invite', { friend: B, code: 'ZZZZZZ' }, A), /waiting to start/);
    await rejects(social('invites', {}, null), /ACCOUNT_REQUIRED/);
  });

  test('declining; a blocked friend quietly gets nothing; one invite per friend per room', async () => {
    const code = await hostRoom();
    await social('invite', { friend: B, code }, A);
    await social('invite', { friend: B, code }, A);
    const { invites } = await social('invites', {}, B);
    assert.equal(invites.length, 1);
    assert.deepEqual(await social('invite_respond', { id: invites[0].id, accept: false }, B), { declined: true });
    await rejects(social('invite_respond', { id: invites[0].id, accept: true }, B), /expired/);
    await db.query('insert into public.blocks(blocker, blocked) values ($1, $2)', [B, A]);
    assert.deepEqual(await social('invite', { friend: B, code }, A), { sent: true });
    assert.equal((await social('invites', {}, B)).invites.length, 0);
  });

  test('invites expire after 10 minutes or once the game starts; a new invite signals the friend', async () => {
    const code = await hostRoom();
    await social('invite', { friend: B, code }, A);
    const sent = (await db.query(`select topic, event from realtime.sent where topic like 'pin-and-spin-invites:%'`)).rows;
    assert.deepEqual(sent, [{ topic: `pin-and-spin-invites:${B}`, event: 'invited' }]);
    await db.query(`update public.pin_and_spin_invites set created_at = now() - interval '11 minutes'`);
    assert.equal((await social('invites', {}, B)).invites.length, 0);
    await social('invite', { friend: B, code }, A);
    await db.query(`update public.pin_and_spin_rooms set status = 'playing' where code = $1`, [code]);
    assert.equal((await social('invites', {}, B)).invites.length, 0);
    await rejects(social('invite', { friend: B, code }, A), /waiting to start/);
  });

  test('invites are private and server-only', async () => {
    const r = (await db.query(`select has_table_privilege('anon','public.pin_and_spin_invites','select') a,
      has_function_privilege('anon','public.pin_and_spin_social(text,uuid,jsonb)','execute') f`)).rows[0];
    assert.deepEqual(r, { a: false, f: false });
  });
});
