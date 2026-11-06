// TV pairing (migration 005): a TV shows a 4-letter code, a player in the room types it,
// and only that TV receives the room's read-only display link.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, game, rejects, tok } from './db.mjs';

let db, g;
beforeEach(async () => { db = await freshDb(); g = game(db); });

const tv = async (action, { pair = '', token = tok(900), room = '', origin = 'tv-test' } = {}) =>
  (await db.query('select public.pin_and_spin_tv($1,$2,$3,$4,$5) as r', [action, pair, token, room, origin])).rows[0].r;

describe('TV pairing', () => {
  test('a TV gets an easy-to-read 4-letter code, kept while it is still good', async () => {
    const first = await tv('tv_start');
    assert.match(first.pairCode, /^[ACDEFHJKMNPRTUVWXY34679]{4}$/);
    assert.ok(new Date(first.expiresAt) > new Date());
    assert.equal((await tv('tv_start')).pairCode, first.pairCode, 'reloading the TV keeps its code');
    assert.notEqual((await tv('tv_start', { token: tok(901) })).pairCode, undefined);
  });

  test('a player types the code and the TV receives the room display link', async () => {
    const room = await g.room('classic', 2);
    const { pairCode } = await tv('tv_start');
    assert.equal((await tv('tv_check', { pair: pairCode })).paired, false);
    const claim = await tv('tv_pair', { pair: pairCode.toLowerCase(), token: room.players[1].token, room: room.code });
    assert.deepEqual(claim, { paired: true });
    const done = await tv('tv_check', { pair: pairCode });
    assert.deepEqual(done, { paired: true, code: room.code, displayToken: room.display });
    // The link works with the existing read-only display action.
    const shown = await g.api('display', room.code, room.display);
    assert.equal(shown.code, room.code);
  });

  test('only the TV that asked for the code can collect the link', async () => {
    const room = await g.room('classic', 2);
    const { pairCode } = await tv('tv_start');
    await tv('tv_pair', { pair: pairCode, token: room.players[0].token, room: room.code });
    await rejects(tv('tv_check', { pair: pairCode, token: tok(999) }), /expired/);
  });

  test('only active players in the room can connect a TV', async () => {
    const room = await g.room('reveal', 3);
    const { pairCode } = await tv('tv_start');
    await rejects(tv('tv_pair', { pair: pairCode, token: tok(777), room: room.code }), /Join the room/);
    await g.api('start', room.code, room.players[0].token);
    await g.api('kick', room.code, room.players[0].token, { playerId: room.players[2].id });
    await rejects(tv('tv_pair', { pair: pairCode, token: room.players[2].token, room: room.code }), /Join the room/);
  });

  test('wrong or expired codes are refused, and a TV connected to one room cannot be taken by another', async () => {
    const a = await g.room('classic', 2);
    // A second room with its own host (g.room reuses the same player tokens).
    const b = { players: [{ token: tok(50) }] };
    b.code = (await g.api('create', '', tok(50), { name: 'B1', mode: 'reveal' })).code;
    assert.notEqual(b.code, a.code);
    const { pairCode } = await tv('tv_start');
    const wrong = pairCode === 'AAAA' ? 'CCCC' : 'AAAA';
    assert.match((await tv('tv_pair', { pair: wrong, token: a.players[0].token, room: a.code })).error, /not right or has expired/);
    await tv('tv_pair', { pair: pairCode, token: a.players[0].token, room: a.code });
    assert.match((await tv('tv_pair', { pair: pairCode, token: b.players[0].token, room: b.code })).error, /already connected/);
    assert.equal((await tv('tv_check', { pair: pairCode })).code, a.code);

    const other = await tv('tv_start', { token: tok(902) });
    await db.query(`update public.pin_and_spin_tv_pairings set expires_at=now()-interval '1 second' where code=$1`, [other.pairCode]);
    assert.match((await tv('tv_pair', { pair: other.pairCode, token: a.players[0].token, room: a.code })).error, /expired/);
    await rejects(tv('tv_check', { pair: other.pairCode, token: tok(902) }), /expired/);
    assert.notEqual((await tv('tv_start', { token: tok(902) })).pairCode, undefined, 'an expired TV just gets a new code');
  });

  test('guessing codes is rate-limited per network address', async () => {
    const room = await g.room('classic', 2);
    const { pairCode } = await tv('tv_start');
    const wrong = pairCode === 'AAAA' ? 'CCCC' : 'AAAA';
    for (let i = 0; i < 10; i++) await tv('tv_pair', { pair: wrong, token: room.players[0].token, room: room.code, origin: 'guesser' });
    await rejects(tv('tv_pair', { pair: pairCode, token: room.players[0].token, room: room.code, origin: 'guesser' }), /Too many wrong/);
    // Other homes are not affected.
    assert.deepEqual(await tv('tv_pair', { pair: pairCode, token: room.players[0].token, room: room.code, origin: 'home' }), { paired: true });
  });

  test('pairing tables are private and the function is server-only', async () => {
    const { rows } = await db.query(`select c.relname, c.relrowsecurity,
      has_table_privilege('anon', c.oid, 'select') anon_read, has_table_privilege('authenticated', c.oid, 'select') auth_read
      from pg_class c where c.relname like 'pin_and_spin_tv%' and c.relkind='r'`);
    assert.equal(rows.length, 2);
    for (const r of rows) assert.deepEqual([r.relrowsecurity, r.anon_read, r.auth_read], [true, false, false], r.relname);
    const fn = await db.query(`select has_function_privilege('anon','public.pin_and_spin_tv(text,text,text,text,text)','execute') a,
      has_function_privilege('authenticated','public.pin_and_spin_tv(text,text,text,text,text)','execute') b`);
    assert.deepEqual(fn.rows[0], { a: false, b: false });
  });

  test('the migration is safe to run twice', async () => {
    const { readFile } = await import('node:fs/promises');
    await db.exec(await readFile(new URL('../../backend/migrations/005_tv_pairing.sql', import.meta.url), 'utf8'));
    assert.match((await tv('tv_start')).pairCode, /^[A-Z0-9]{4}$/);
  });
});
