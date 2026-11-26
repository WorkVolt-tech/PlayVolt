import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, game, rejects } from './db.mjs';
import { canSubmitGuess } from '../../src/game/selectors.js';

test('Relay needs four players and assigns two balanced teams with separate secrets and rotating turns', async t => {
  const db = await freshDb();
  t.after(() => db.close());
  const client = game(db);
  const small = await client.room('relay', 3);
  await rejects(client.api('start', small.code, small.players[0].token), /four players/);
  const { code, players, display } = await client.room('relay', 5);
  const call = (action, player, data) => client.api(action, code, players[player].token, data);
  let view = await call('start', 0);
  assert.deepEqual(view.teams.map(team => team.members.length), [3,2]);
  assert.deepEqual(view.teams.map(team => team.turnId), [players[0].id,players[1].id]);
  assert.equal(canSubmitGuess(view, { busy: false, remainingMs: 30000 }), true);
  assert.equal(canSubmitGuess(await call('state',2), { busy: false, remainingMs: 30000 }), false);
  const codes = (await db.query(`select c.* from public.pin_and_spin_rally_codes c
    join public.pin_and_spin_rooms r on r.id=c.room_id where r.code=$1 order by c.stage`, [code])).rows;
  assert.deepEqual(codes.map(row => row.secret.length), [4,4,5,6]);
  for (const row of codes) {
    assert.notDeepEqual(row.secret, row.relay_secret);
    assert.equal(row.secret.length, row.relay_secret.length);
  }
  for (const key of ['secret','relay_secret']) {
    assert.equal(new Set(codes[0][key]).size,4);
    assert.ok(new Set(codes[1][key]).size < 4);
  }
  const submit = (player, stage, colors, attempt = 1) =>
    call('guess', player, { puzzle: view.puzzle, stage, attempt, colors });
  await rejects(submit(2, 1, codes[0].secret), /Wait for your turn/);
  const wrong = codes[0].secret.map(color => (color+1)%6);
  view = await submit(0, 1, wrong);
  assert.equal(view.turnId, players[2].id);
  const tv = await client.api('display',code,display);
  assert.equal(tv.answer,null);
  assert.equal(tv.team,null);
  assert.deepEqual(tv.teams[0].guesses[0].colors,wrong);
  assert.equal(tv.teams[1].guesses.length,0);
  const gold = await submit(1, 1, codes[0].secret);
  assert.equal(gold.stage,1);
  assert.equal(gold.teams[1].completed,0);
  view = await submit(2, 1, codes[0].secret, 2);
  assert.equal(view.stage,2);
  assert.equal(view.turnId,players[4].id);
  await call('leave',4);
  assert.equal((await call('state',0)).turnId,players[0].id);
  await submit(0, 2, codes[1].secret);
  await submit(2, 3, codes[2].secret);
  view = await submit(0, 4, codes[3].secret);
  assert.equal(view.status,'finished');
  assert.deepEqual(new Set(view.winners), new Set([players[0].id,players[2].id]));
  assert.equal(view.teams[0].completed,4);
  const lobby = await call('replay',0);
  assert.equal(lobby.status,'lobby');
  assert.deepEqual(lobby.teams,[]);
});
