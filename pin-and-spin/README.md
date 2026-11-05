# Pin & Spin — PlayVolt

An independent **React + Vite** mobile-first multiplayer color-combination game, hosted on **Cloudflare Pages**, backed by the existing **Game DB Supabase** project.

## GitHub / Cloudflare workflow (no local terminal required)

Changes go into `WorkVolt-tech/PlayVolt` on branch `main`, inside the `pin-and-spin/` folder. Upload/edit files in GitHub's web UI or through a connected editor. The dedicated Cloudflare Pages project deploys automatically when these files change.

| Cloudflare Pages setting | Value |
| --- | --- |
| Project name | `playvolt-pin-and-spin` |
| GitHub repository | `WorkVolt-tech/PlayVolt` |
| Production branch | `main` |
| Root directory | `pin-and-spin` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Live site | https://playvolt-pin-and-spin.pages.dev/ |

There is **no need to build locally or upload a `dist` directory**. Cloudflare installs the project's dependencies and builds the Vite app after each GitHub push.

## Database

Game DB Supabase project: `eybzbtyfafmqbkulyvog`.

All Pin & Spin tables begin with `pin_and_spin_`:

- `pin_and_spin_rooms` — rooms, modes, hidden combinations and match status.
- `pin_and_spin_players` — guests, seats, readiness.
- `pin_and_spin_guesses` — player attempts and Pin/Spin scores.

The **`pin-and-spin` Supabase Edge Function** is the public game API gateway. Its service credential stays on the server; it is never included in the Vite client. PostgreSQL functions perform protected game actions and scoring.

## Update banner

Each build gets a unique version (set in `vite.config.js`), baked into the app and
published as `/version.json` (never cached, see `public/_headers`). Like Dekabess, open
pages check it every minute and when the tab regains focus; when a newer version is
deployed, an "Update required" banner offers **Update Now** (a reload — the room and
unsubmitted colors are restored afterwards).

## Accounts (optional)

Players can play as guests, or sign in / create a **PlayVolt account** — the same Supabase
Auth accounts and `profiles` table as Dekabess (sign-up creates the profile through the
existing `handle_new_user` trigger). Signed-in players use their profile nickname; the
client sends their access token and the Edge Function verifies it with Supabase Auth.
The browser uses only the public anon key.

For confirmation emails to return players to Pin & Spin, add
`https://playvolt-pin-and-spin.pages.dev/**` to Supabase → Authentication → URL
Configuration → Redirect URLs (otherwise the link opens the default Site URL).

## Modes

- Classic — a random active player starts each game/rematch, then turns proceed in seat order; 4 guesses per player
- Reveal — simultaneous guesses, 4 rounds
- Timed Reveal — 3 minutes per round, 4 rounds
- Rush — 3 minutes total, 8 guesses per player

The shared TV/display concept is a **future phase** and is not yet implemented.

The phone board uses stacked horizontal guess rows (four, or eight in Rush), a
three-by-two palette, green Pin markers and white Spin markers. The selectable
colors are Blue, Red, Green, Yellow, Purple and White. Mini boards above the tabs show
everyone's public guess rows with Pin/Spin dots (plus turn, locked-in and winner marks);
tap one to open Everyone's Guesses focused on that player.
Unsubmitted selections survive a page refresh when browser storage is available.

**Everyone's Guesses** is a full-screen board (`src/shared/Scoreboard.jsx`) with one lane
per player, Pin/Spin dots, round and timer, sealed markers for players who have
locked in, the winner banner and the final secret. It scales up on laptop/TV-sized
screens and offers a full-screen button where the browser supports it.

The home screen separates Create Room, Join Room and How to Play. Mode selection
uses four stacked cards; the lobby offers Copy Code and Invite Friends. A midnight
navy and purple theme with patterned balls keeps colors distinguishable.

## Client structure

```
src/
  App.jsx                  shell: header, routing between entry / lobby / match
  game/                    no React — constants, guest session, API call, pure selectors
  hooks/usePinAndSpin.js   player-device state: session, polling, actions, draft recovery
  components/              Peg, Feedback, CodeBoard, Empty
  screens/                 phone controller: EntryScreen, Lobby, Match, GuessPanel, FinishPanel
  shared/                  EveryonesGuesses + GuessRow — the shared results board
```

`shared/` renders only public data (revealed guesses, players, the answer once
finished) and contains no player controls, so the future TV/display mode can reuse it
with a display-token snapshot. Player-only actions are passed in from `screens/`.

## Backend source and verification

- `backend/schema.sql` records the initial schema and transactional game functions
  already applied to Game DB. **Do not rerun it against the existing database.**
- `backend/migrations/` holds later changes, applied in order after `schema.sql`:
  `002_shared_domino_login.sql` (optional Dekabess account login, recorded from Game DB)
  and `003_host_kick_presence.sql` (host can remove players, AWAY status, host handover).
  Any database change must be added here too, so the tests keep matching production.
- `backend/index.ts` is the deployed `pin-and-spin` Edge Function source. It uses
  random guest-session tokens; no account or service key is required in the client.
- The tables intentionally have RLS enabled and no public policies or grants.
  Only the server can read them. Snapshots redact the secret and unrevealed opponents' guesses.
- `npm test` runs the automated tests offline (no Game DB access needed). It loads
  `backend/schema.sql` into an in-memory Postgres (PGlite) and tests the real server
  functions: scoring with repeated colors (all 1,296 guesses against several secrets),
  all four modes, hidden-guess secrecy, timers, limits, shared wins, leaving, reconnecting
  and rematches. `tests/unit/selectors.test.mjs` covers the phone's view rules.
  Keep `schema.sql` in sync with any database change so these tests stay meaningful.
- `tests/database.sql` checks scoring, authorization, turn order, ties, timeouts,
  limits and rematches inside a transaction that rolls all test data back.
- `test:live` is an optional automated ten-player concurrency test. It creates a
  disposable room and leaves all test seats afterward. It needs network access.

Client state refreshes every 1.8 seconds while the page is visible. Server time
determines deadlines; a room request advances an expired round before accepting
another guess. Closing a phone does not forfeit its seat: reopen the page to resume,
or use Leave Room before exiting. Rooms expire after 24 hours.

## Optional

To point the game header's PlayVolt link to a deployed hub (instead of the GitHub repository), add the Cloudflare build environment variable `VITE_PLAYVOLT_HUB_URL` with the verified hub URL.
