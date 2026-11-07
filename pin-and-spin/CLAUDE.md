# Pin & Spin — rules for AI coding tools

Pin & Spin is PlayVolt's multiplayer color-code game (React + Vite, Supabase Game DB,
Cloudflare Pages). It lives in the `pin-and-spin/` folder of the PlayVolt monorepo.
The other folders (`dominoes/` = Dekabess, `bluff/`, `riot-roll/`, `rushing-blur/`,
`soul-harvest/`, `whos-the-worst*/`, root `index.html` hub, `auth.js`) are separate
games. Do not touch them from a Pin & Spin task.

## Ground rules

- **Don't change the game rules** (scoring, guess limits, timers, turn order, who wins,
  what stays hidden) unless the task explicitly asks. If a fix would change them as a
  side effect, stop and say so.
- **Start from the latest `main`.** Other people and tools commit here. Re-read files
  before editing; never replace a whole file from an older copy.
- **Keep changes small and scoped.** No drive-by refactors, renames or dependency upgrades.
- **Preview first.** Work on a branch (`pin-and-spin/<topic>`), push it, and let the owner
  try the Cloudflare preview: `https://<branch-with-dashes>.playvolt-pin-and-spin.pages.dev`.
  Merge to `main` (= production) only when the owner says "push to prod".
- Explain changes in plain language: what changed, what a player will notice, and anything
  the owner must do by hand.

## Every change must

1. **Build:** `npm run build` must succeed. A failed Cloudflare build silently keeps the
   old site live. (Each build gets a new version, which shows players the update banner.)
2. **Test:** `npm test` must pass (offline; runs the real backend SQL in PGlite). Add a
   test for every rule or bug fix.
3. **Update `README.md`** when behavior, setup or the backend changes.

## Database (Supabase Game DB, project `eybzbtyfafmqbkulyvog`)

- Shared with Dekabess and other games. Every Pin & Spin table starts with
  `pin_and_spin_`. Never drop, rename or change anything another game uses
  (e.g. `profiles`, `admins`, `auth.users`).
- Browsers never read the tables. All game actions go through the `pin-and-spin` Edge
  Function → `pin_and_spin_api()`. Keep RLS on with no public policies, and keep the
  secret and unrevealed guesses redacted in every snapshot.
- **Every database change is a numbered file in `backend/migrations/`** (`005_...sql`),
  safe to run twice, ending with its grants/revokes. `backend/schema.sql` is the original
  base — never edit or re-run it.
- **Before applying anything to Game DB, check production matches the repo:**
  `npm run db:fingerprint`, then run the query printed at the top of
  `tests/fingerprint.mjs` on Game DB. If any fingerprint differs, production was changed
  outside the repo: record that change as a migration first (and make the tests pass),
  then build yours on top. Never overwrite a live change you didn't write.
- **Edge Function:** `backend/index.ts` must equal the deployed `pin-and-spin` function.
  Deploy it with `verify_jwt` off (guests have no JWT; the function verifies account
  tokens itself).

## Accounts, live updates, sound

- Accounts are optional and shared with Dekabess (Supabase Auth + `profiles`). The
  browser only ever has the public anon key. Guests must always be able to play.
- Live updates: migration 004 broadcasts a content-free "changed" signal on
  `pin-and-spin:<ROOM CODE>`; never put game data in that signal. Polling remains the
  fallback and the presence heartbeat.
- Sounds are real files in `public/sounds/` (volume baked in; iPhones ignore page volume).
  iPhone (especially the Home Screen app) only plays an audio element that was started unmuted
  during a tap: `sfx.js` unlocks every pooled element that way, with a silent clip (never the
  real sound, which an iPhone may fail to stop), re-unlocks after the app comes
  back from the background, and sound is ON unless the player muted it. Don't change this
  without testing on a real iPhone (`tests/unit/sound.test.mjs` simulates the rules).
  Replace a sound by keeping its file name. Keep `LICENSE-SoundWeaver.txt` while any
  SoundWeaver sound remains.

## Shared display (future TV mode)

`src/shared/` (Everyone's Guesses, mini boards, winner banner) must render **only public
data** from the snapshot and contain no player controls, so a TV/display screen can reuse
it with the display token. Controller-only actions are passed in from `src/screens/`.

## TV app

`firetv/` is the Fire TV / Android TV app: a full-screen WebView onto `/tv`. Keep game
logic on the website. Never change its package name (`ca.chezmaxo.pinandspin.tv`) and never
commit a signing key. The workflow `.github/workflows/pin-and-spin-tv-app.yml` builds it.

## Phone screens

Mobile portrait first. Full-screen views must respect the safe areas
(`env(safe-area-inset-*)`) so nothing sits under the clock, notch or home bar, and
respect `prefers-reduced-motion`.
