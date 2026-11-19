import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, game, rejects, tok } from './db.mjs';
import { normalizeCosmetics, unlockedCosmetics, GROUPS } from '../../src/cosmetics.js';

test('room appearance follows a guest into the read-only TV snapshot and remains cosmetic', async () => {
  const db = await freshDb();
  try {
    const g = game(db);
    const host = await g.api('create', '', tok(1), { name: 'Maxo', mode: 'reveal', appearance: {
      avatar: 'bunny', board: 'nebula', piece: 'round', pin: 'round', accent: 'violet',
    } });
    assert.equal(host.players[0].appearance.piece, 'round');
    const next = await g.api('join', host.code, tok(2), { name: 'Tom', appearance: {
      avatar: 'bunny', board: 'nebula', piece: 'round', pin: 'round', accent: 'violet',
    } });
    assert.notEqual(next.players[1].appearance.accent, 'violet');
    const tv = await g.api('display', host.code, host.displayToken);
    assert.equal(tv.players[0].appearance.board, 'nebula');
    assert.equal(tv.players[1].appearance.piece, 'round');
    assert.equal(tv.answer, null);
    await rejects(g.api('appearance', host.code, tok(2), { appearance: {
      avatar: 'bunny', board: 'nebula', piece: 'round', pin: 'round', accent: 'violet',
    } }), /in use/);
    const updated = await g.api('appearance', host.code, tok(1), { appearance: {
      avatar: 'bunny', board: 'nebula', piece: 'round', pin: 'round', accent: 'violet',
    } });
    assert.equal(updated.players[0].appearance.piece, 'round');
    let full = updated;
    for (let n = 3; n <= 10; n++) {
      full = await g.api('join', host.code, tok(n), { name: `Player ${n}`, appearance: { accent: 'violet' } });
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
    const data = { appearance: { avatar: 'fox', board: 'arcade', piece: 'square', pin: 'round', accent: 'teal' } };
    const pref = (action) => db.query('select public.pin_and_spin_cosmetic_preferences($1,$2,$3::jsonb) as r',
      [action, user, JSON.stringify(data)]);
    await rejects(pref('save'), /trophy/);
    await db.query('insert into public.pin_and_spin_achievements(user_id,code) values ($1,$2)', [user, 'first_win']);
    assert.equal((await pref('save')).rows[0].r.appearance.avatar, 'fox');
    const room = await game(db).api('create', '', tok(6), { name: 'Maxo', mode: 'classic', _account_id: user });
    assert.equal(room.players[0].appearance.board, 'arcade');
    assert.equal(room.players[0].appearance.pin, 'round');
  } finally { await db.close(); }
});

test('most cosmetic choices require their named trophy, and old preferences fall back safely', async () => {
  const db = await freshDb();
  try {
    const user = '22222222-2222-4222-8222-222222222222';
    await db.query('insert into public.profiles(id,nickname) values ($1,$2)', [user, 'Tester']);
    for (const [key, options] of Object.entries(GROUPS)) {
      for (const option of options.filter((o) => o.trophy)) {
        await rejects(db.query('select public.pin_and_spin_valid_cosmetics($1::jsonb,$2)',
          [JSON.stringify({ [key]: option.id }), user]), /trophy/);
      }
    }
    await db.query('insert into public.pin_and_spin_cosmetics(user_id,appearance) values ($1,$2::jsonb)',
      [user, JSON.stringify({ avatar: 'fox', board: 'arcade', piece: 'star', pin: 'square', accent: 'teal' })]);
    const read = await db.query('select public.pin_and_spin_cosmetic_preferences($1,$2,$3::jsonb) as r',
      ['get', user, '{}']);
    assert.deepEqual(read.rows[0].r.appearance, unlockedCosmetics({}));
  } finally { await db.close(); }
});

test('an automatically assigned color can be kept, but choosing a locked color is denied', async () => {
  const db = await freshDb();
  try {
    const g = game(db);
    const host = await g.api('create', '', tok(20), { name: 'Host', mode: 'reveal' });
    const second = await g.api('join', host.code, tok(21), { name: 'Guest' });
    const assigned = second.players[1].appearance.accent;
    assert.notEqual(assigned, 'violet');
    const saved = await g.api('appearance', host.code, tok(21), { appearance: { avatar: 'bunny', accent: assigned } });
    assert.equal(saved.players[1].appearance.accent, assigned);
    await rejects(g.api('appearance', host.code, tok(20), { appearance: { accent: 'gold' } }), /trophy/);
  } finally { await db.close(); }
});
