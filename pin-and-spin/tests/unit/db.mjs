// Boots an in-process Postgres (PGlite) with the real Pin & Spin backend SQL.
// No network or Game DB access: tests exercise the same functions production runs.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

const schema = new URL('../../backend/schema.sql', import.meta.url);

export async function freshDb() {
  const db = new PGlite();
  // Supabase's API roles, so the schema's grants/revokes apply as in production.
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;`);
  await db.exec(await readFile(schema, 'utf8'));
  return db;
}

export const tok = (n) => n.toString(16).padStart(64, '0');

// A small client for the game API, mirroring what the Edge Function sends.
export function game(db) {
  const api = async (action, code, token, data = {}) =>
    (await db.query('select public.pin_and_spin_api($1,$2,$3,$4::jsonb,$5) as r',
      [action, code, token, JSON.stringify(data), 'unit-test'])).rows[0].r;
  return {
    api,
    // Creates a room with `count` players (all ready). players[0] is the host.
    async room(mode, count = 2) {
      const players = Array.from({ length: count }, (_, i) => ({ token: tok(i + 1), name: `P${i + 1}` }));
      const first = await api('create', '', players[0].token, { name: players[0].name, mode });
      players[0].id = first.me;
      for (const p of players.slice(1)) {
        p.id = (await api('join', first.code, p.token, { name: p.name })).me;
        await api('ready', first.code, p.token, { ready: true });
      }
      return { code: first.code, players, display: first.displayToken };
    },
    async setSecret(code, secret) {
      await db.query('update public.pin_and_spin_rooms set secret=$1 where code=$2', [secret, code]);
    },
    async expireDeadline(code) {
      await db.query(`update public.pin_and_spin_rooms set deadline=now()-interval '1 second' where code=$1`, [code]);
    },
  };
}

export async function rejects(promise, pattern) {
  try { await promise; } catch (error) {
    if (pattern && !pattern.test(error.message)) throw new Error(`Wrong error: ${error.message}`);
    return;
  }
  throw new Error('Expected the server to reject this request');
}
