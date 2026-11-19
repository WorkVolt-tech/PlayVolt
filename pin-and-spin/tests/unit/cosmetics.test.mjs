import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, game, rejects, tok } from './db.mjs';
import { normalizeCosmetics } from '../../src/cosmetics.js';

test('room appearance follows a guest into the read-only TV snapshot and remains cosmetic', async () => {
  const db = await freshDb();
  try {
    const g = game(db);
    const host = await g.api('create', '', tok(1), { name: 'Maxo', mode: 'reveal', appearance: {
      avatar: 'bunny', board: 'arcade', piece: 'star', pin: 'square', accent: 'teal',
    } });
    assert.equal(host.players[0].appearance.piece, 'star');
    const next = await g.api('join', host.code, tok(2), { name: 'Tom', appearance: {
      avatar: 'cat', board: 'waves', piece: 'hex', pin: 'round', accent: 'teal',
    } });
    assert.notEqual(next.players[1].appearance.accent, 'teal');
    const tv = await g.api('display', host.code, host.displayToken);
    assert.equal(tv.players[0].appearance.board, 'arcade');
    assert.equal(tv.players[1].appearance.piece, 'hex');
    assert.equal(tv.answer, null);
    await rejects(g.api('appearance', host.code, tok(2), { appearance: {
      avatar: 'cat', board: 'waves', piece: 'hex', pin: 'round', accent: 'teal',
    } }), /in use/);
    const updated = await g.api('appearance', host.code, tok(1), { appearance: {
      avatar: 'bunny', board: 'nebula', piece: 'gem', pin: 'square', accent: 'teal',
    } });
    assert.equal(updated.players[0].appearance.piece, 'gem');
    let full = updated;
    for (let n = 3; n <= 10; n++) {
      full = await g.api('join', host.code, tok(n), { name: `Player ${n}`, appearance: { accent: 'teal' } });
    }
    assert.equal(new Set(full.players.map((p) => p.appearance.accent)).size, 10);
    assert.equal(normalizeCosmetics({ piece: 'bad' }).piece, 'round');
  } finally { await db.close(); }
});

test('trophy styles require the account achievement and follow the account into a room', async () => {
  const db = await freshDb();
  try {
    const user = '11111111-1111-4111-8111-111111111111';
    await db.query('insert into public.profiles(id,nickname) values ($1,$2)', [user, 'Maxo']);
    const data = { appearance: { avatar: 'champion', board: 'gold', piece: 'star', pin: 'star', accent: 'amber' } };
    const pref = (action) => db.query('select public.pin_and_spin_cosmetic_preferences($1,$2,$3::jsonb) as r',
      [action, user, JSON.stringify(data)]);
    await rejects(pref('save'), /trophy/);
    await db.query('insert into public.pin_and_spin_achievements(user_id,code) values ($1,$2)', [user, 'first_win']);
    assert.equal((await pref('save')).rows[0].r.appearance.avatar, 'champion');
    const room = await game(db).api('create', '', tok(6), { name: 'Maxo', mode: 'classic', _account_id: user });
    assert.equal(room.players[0].appearance.board, 'gold');
    assert.equal(room.players[0].appearance.pin, 'star');
  } finally { await db.close(); }
});
