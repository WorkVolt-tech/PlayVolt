# Neon migration

**Draft deployment blocker:** the latest uploads to `main` restore Weekly
Challenge Mode. Those frontend changes have been preserved, but the Neon
migrations omit its database functions under the earlier removal request.
Resolve whether the mode stays before deploying this branch to production.

This is a fresh backend for Dekabess. Supabase accounts and saved progress are
not copied. The sign-in page tells existing players to create an account.
The original Supabase project is not modified by these migrations.

## Deployment

1. Enable Managed Neon Auth and provision the Data API without default grants.
   This creates `auth.uid()`, `anonymous`, and `authenticated`.
2. Check that the target `public` schema has no game tables. Apply migrations
   `001` through `004` in order, together in one transaction. These are initial
   schema migrations, not scripts to rerun against an existing game database.
3. Refresh the Data API schema cache with Neon's Data API update operation after
   committing. PostgreSQL `NOTIFY pgrst` is not sufficient for this deployment.
4. Add the website's exact origin to the branch's Neon Auth trusted domains.
5. Set the public `VITE_NEON_AUTH_URL` and `VITE_NEON_DATA_URL` for the target
   branch. Production endpoints are in `.env.production`; these are public URLs,
   not database passwords. Never put a database connection string in Vite vars.

The test branch is `br-bitter-violet-b8k36ywj` (`migration-test`), separate from
production `br-young-cherry-b8w5xfcz`, project `cool-bird-86456792`.

## Access and live updates

Account identity comes from Neon Auth JWTs. Guests get anonymous JWTs and a
random browser secret; only its SHA-256 hash is stored with a room or seat.
Room membership policies restrict game reads and writes. Joining by code uses
an atomic database function. Spectator responses mask hands on the server.
The game retains its existing client-controlled turn and score logic.

`neonRealtime.js` adapts the existing subscriptions to one shared `live_sync`
request per active tab, scheduled 900 ms after the previous request finishes.
Requests never overlap and failures back off. Presence expires after 35 seconds.
This is polling, not Supabase Realtime; load and update latency should be
monitored with real traffic. Authentication is not repeated on each guest poll.

Weekly Challenge reward functions and scheduled tasks are absent from Neon.
Story Mode's `record_challenge` and friend invitations remain. No database cron
jobs are installed by this migration.

## Validation

Run the existing game regressions with `node --test tests/*.test.mjs` and build
with `npx vite build`. For the disposable test branch only, put its public URLs
in `.env.local`, then run:

```sh
node neon/tests/integration.mjs
node neon/tests/auth-integration.mjs
```

These integration tests create test data. They check guest room creation and
joining, match-start fields, room isolation, immediate blocks, spectator masking,
presence, privileged move restrictions, account signup/sign-in/sign-out, profile
creation, Chapter 3 unlocking after Chapter 2, and leaderboard persistence after
a loss. Test accounts use `example.invalid`; email verification must be disabled
on the disposable test branch. Do not run these account tests against production.

Browser verification additionally covers two independent guest sessions joining
and starting a game, account creation, Story Mode loading, session restoration,
and sign-out.

## Rollback

Revert the frontend migration commit to return the site to its previous Supabase
backend. This does not transfer any new Neon accounts or progress back to
Supabase. Keep both databases intact until the migration has been accepted.
