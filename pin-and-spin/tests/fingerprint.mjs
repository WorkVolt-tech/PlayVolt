// Prints fingerprints of the Pin & Spin database functions as built from this repo
// (backend/schema.sql + backend/migrations/*.sql). Compare them with Game DB before
// applying any database change — if they differ, production was changed outside the
// repo: record that change as a migration first (see CLAUDE.md).
//
//   npm run db:fingerprint
//
// Matching query to run on Game DB (Supabase SQL editor or MCP execute_sql). Line endings are
// ignored: SQL pasted into the Supabase SQL editor can arrive with Windows (CR LF) endings.
//   select p.proname, md5(replace(pg_get_functiondef(p.oid), chr(13), '')) from pg_proc p
//   join pg_namespace n on n.oid = p.pronamespace
//   where n.nspname = 'public' and p.proname like 'pin_and_spin%' order by 1;
import { freshDb } from './unit/db.mjs';

const db = await freshDb();
const { rows } = await db.query(`select p.proname, md5(replace(pg_get_functiondef(p.oid), chr(13), '')) as md5 from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'pin_and_spin%' order by 1`);
for (const row of rows) console.log(row.proname.padEnd(24), row.md5);
const triggers = await db.query(`select tgname from pg_trigger where not tgisinternal and tgrelid::regclass::text like '%pin_and_spin%' order by 1`);
console.log('triggers:', triggers.rows.map((t) => t.tgname).join(', '));
