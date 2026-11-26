import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './db.mjs';

const [a,b,c] = [1,2,3].map(n => `00000000-0000-4000-8000-00000000000${n}`);

test('Duel authorizes friends and keeps both boards sealed until the result', async t => {
  const db = await freshDb();
  t.after(() => db.close());
  const call = async (action, player, data = {}) => (await db.query(
    'select public.pin_and_spin_duel($1,$2,$3) result', ['duel_' + action, player, JSON.stringify(data)]
  )).rows[0].result;
  await rejects(call('list', null), /ACCOUNT_REQUIRED/);
  await rejects(call('create', a, { friend: b }), /unavailable/);
  await db.query("insert into public.friendships(requester,addressee,status) values ($1,$2,'accepted')", [a,b]);
  const { id } = await call('create', a, { friend: b });
  assert.equal((await call('create', b, { friend: a })).id, id);
  await rejects(call('get', c, { id }), /not found/);
  await rejects(call('respond', a, { id, response: 'accept' }), /Only your friend/);
  await call('respond', b, { id, response: 'accept' });
  const code = [0,1,2,3], wrong = [5,5,5,5];
  await db.query('update public.pin_and_spin_duels set secret=$1 where id=$2', [code,id]);
  const guess = (player, attempt, colors) => call('guess', player, { id, attempt, colors });
  await rejects(guess(a, 1, [1,2,3,7]), /Choose four/);
  let view = await guess(a, 1, code);
  assert.equal(view.mine.solved, true);
  assert.equal(view.answer, null);
  assert.deepEqual((await call('get', b, { id })).theirs, { done: true });
  for (let attempt=1; attempt<=7; attempt++) {
    view = await guess(b, attempt, wrong);
    assert.equal(view.status, 'playing');
  }
  assert.equal((await guess(b, 7, wrong)).mine.guesses.length, 7);
  view = await guess(b, 8, code);
  assert.equal(view.result, 'loss');
  assert.deepEqual(view.answer, code);
  assert.equal(view.theirs.guesses.length, 1);
  assert.equal((await call('get', a, { id })).result, 'win');
  assert.equal((await db.query("select has_table_privilege('authenticated','public.pin_and_spin_duels','select') allowed")).rows[0].allowed, false);
  for (const solved of [true,false]) {
    const { id: rematch } = await call('create', a, { friend: b });
    await call('respond', b, { id: rematch, response: 'accept' });
    await db.query('update public.pin_and_spin_duels set secret=$1 where id=$2', [code,rematch]);
    for (const player of [a,b]) {
      for (let attempt=1; attempt<=(solved ? 1 : 8); attempt++) {
        view = await call('guess', player, { id: rematch, attempt, colors: solved ? code : wrong });
      }
    }
    assert.equal(view.result, solved ? 'tie' : 'unsolved');
  }
  const { id: blocked } = await call('create', a, { friend: b });
  await db.query('insert into public.blocks values ($1,$2)', [b,a]);
  await rejects(call('respond', b, { id: blocked, response: 'accept' }), /unavailable/);
  assert.equal((await call('respond', b, { id: blocked, response: 'decline' })).status,'declined');
});
