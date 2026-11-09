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

## Announcements and vibration

A short banner announces the start of a game, each new Reveal round ("Round 2") and
"Your turn!" in Classic; phones that support vibration (most Android phones; not iPhone)
buzz for those, for a scored guess, a solve and the end of the match. The logic is a
pure function (`matchEvents` in `src/game/selectors.js`) with unit tests.

The Supabase library loads on demand (for signed-in players and for live updates in a
room), keeping the first download small.

## Sound effects

22 short sounds from the SoundWeaver library (MIT, `public/sounds/LICENSE-SoundWeaver.txt`),
converted to small MP3s (47 KB in total) with each sound's volume baked in, since iPhones
ignore a page's volume settings. `src/sound/sfx.js` plays them with one Web Audio engine. Each file is downloaded once and
kept on the device (Cache Storage `pin-and-spin-sounds`, which the service worker keeps
across updates; a fresh copy is fetched in the background). Phones switch the engine on only
during a tap: the first tap switches it on, and the next tap after the app was in the
background switches it back on. Sounds triggered while it is off are dropped, never saved up.
(Dozens of `<audio>` players unlocked per tap either sometimes played every sound at once or
stopped working in the iPhone Home Screen app.) Like other iPhone game sound, it follows the
Silent switch. A 🔊/🔇 button in the header turns sound off and is remembered on the device;
sound is on unless the player turns it off. Game moments are mapped in
`src/sound/useGameSounds.js` (start, rounds, your turn, scoring, win/lose, lobby joins).

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

Account emails (only sent if email confirmation is ever turned on; it is off today) go to
the Supabase project's Site URL, the same as for Dekabess — ideally the PlayVolt hub.

## Modes

- Classic — **2 players only**; a random player starts each game/rematch, then turns alternate; 4 guesses per player.
  (With 3+ players the later players would learn from everyone's guesses before their turn, which is unfair.
  Migration `013_classic_two_players.sql`: a 3rd player can't join or be invited, and a Classic game won't start
  with more than 2. The lobby says so and points to Reveal/Rush for bigger groups.)
- Reveal — simultaneous guesses, 4 rounds
- Timed Reveal — 3 minutes per round, 4 rounds
- Rush — 3 minutes total, 8 guesses per player

Reveal, Timed Reveal and Rush take 2–10 players.

**More colors for 4+ players (migration 014):** a game that starts with 4 or more players uses
8 colors (orange and pink join the usual 6), since a shared code was too easy to crack with
that many guesses and clues. 2-3 players keep 6. The count is fixed at Start (rematches
re-count) and sent as `colors` in the snapshot; the palette shows that many. The host's app
asks for it with `start {maxColors: 8}`, so an app open from before this update keeps 6.

**TV mode:** in the lobby (or the 📺 button in a match) a player taps **Show on TV** and
opens the link on a laptop or smart-TV browser. The link is `/?tv=ROOM#<display token>`
(the token stays after `#`, so it never reaches the web server). The TV (`src/tv/`) uses
the read-only `display` action: lobby with a big room code and join QR code, then the live
board, announcements, countdown and winner banner. It never receives the secret before the
end or a guess before its reveal. One click on the TV turns on sound and full screen.
The TV live board (`src/tv/TvBoard.jsx`) always fits one screen with no scrolling: a slim
status bar, a one-line result strip at the end, and a grid of player lanes (max 2 rows for
up to 10 players, `src/tv/tvGrid.js`) whose ball size is measured from the space available.
Each lane shows one row per try, including empty ones.
When a new version is deployed, the TV (and the TV app) refreshes itself about 4 seconds
after the update banner appears (once per version), since nobody should need a remote to
press "Update Now". Phones still wait for the player to tap it.

**Turn order (Classic):** a number badge before each player (TV lanes, phone mini boards,
Everyone's Guesses) shows the turn order, 1 = plays first; lanes are sorted that way and the
TV marks PLAYING NOW and UP NEXT. The snapshot has no "starter", so `inTurnOrder()` in
`src/game/selectors.js` works it out from the guess counts (tested in `turnorder.test.mjs`).

**Leaderboard:** Home → Leaderboard ranks signed-in players by multiplayer wins (ties: fewer
games first), Last 7 days or All time, top 50 plus your own row. Migration `006_leaderboard.sql`
adds `pin_and_spin_results` (one row per signed-in participant when a match finishes: players
still in the room plus anyone who left after guessing; 2+ players; guests never stored), the
trigger `pin_and_spin_rooms_results` and `pin_and_spin_leaderboard()` (Edge Function action
`leaderboard`, no session needed; nicknames come from the shared `profiles` table, read only).

**Play Solo (signed-in players):** Home → Play Solo (`src/solo/`). Daily Puzzle (same code for
everyone on the player's local day, 6 colors, 6 tries, share result, streaks), Free Play (Easy:
4 colors no repeats 8 tries; Normal: 6 colors 8 tries; Hard: 6 colors 6 tries; unfinished games
resume) and Beat the Clock (3 minutes, crack as many codes as possible, 8 tries per code).
Migration `007_solo.sql`: `pin_and_spin_daily`, `pin_and_spin_solo_games` and
`pin_and_spin_solo()` (Edge Function actions `solo_home`, `solo_start`, `solo_guess`, `solo_get`;
account required). The code stays on the server until the game ends.

**Story Mode (signed-in players):** Home → Story Mode (`src/solo/StoryScreen.jsx`). 24 levels in
3 worlds (Carrot Patch, Clockwork Burrow, Moon Maze) on a winding map. Game levels twist the
rules (4-6 colors, no repeats, fewer tries, timers); logic levels show clue guesses with their
Pins/Spins that fit exactly one code (built by `pin_and_spin_story_clues()`) and give 1-3 tries.
Wins earn 1-3 stars (fewer tries = more) and unlock the next level. Migration `008_story.sql`:
`pin_and_spin_story_levels` (the level list), `pin_and_spin_story_progress`, story columns on
`pin_and_spin_solo_games`, `pin_and_spin_story()` (actions `story_home`, `story_start`; guesses
use `solo_guess`) and the star-award trigger.

**More leaderboards + achievements (migration 009):** the Leaderboard has four boards:
Multiplayer (wins), Daily (puzzles solved; ties: fewer average tries), Clock (best Beat the Clock
score) and Story (total stars). `pin_and_spin_leaderboard(p_period, p_account, p_board)` returns
two numbers per player (`a` ranked, `b` detail). Home → Achievements shows 20 badges
(`src/achievements.js` names them; `pin_and_spin_award()` decides them). Triggers on match
results, finished solo games and story progress award badges automatically; a toast announces
new ones after a game. `pin_and_spin_achievements` stores them (Edge Function action
`achievements`, account required).

**Story World 4 "Crystal Caves" (migration 010):** levels 25-32 use 5-ball codes and up to 8
colors (new balls 6 = orange, 7 = pink in `src/balls/`). Levels and solo games have `slots`
(4 or 5); `pin_and_spin_code_n()` and the logic-puzzle builder work for any size. Multiplayer
and the other solo modes still use 4 balls and 6 colors.

**Rounds won in this room (migration 015):** every player in a room, guests too, has a win
count (`players[].wins`) that a trigger raises by one each time a round ends with them among the
winners (a shared win counts for each; it lasts across rematches). The lobby, mini boards,
Everyone's Guesses, the end-of-round panel and both TV screens show each count, a 👑 on whoever
leads (ties share it; players who left drop out) and a "👑 … leads · N rounds won" line
(`src/components/WinsBadge.jsx`, `winLeaders()` in `src/game/selectors.js`).

**Coming back to the app:** game requests never wait more than 4 s for the sign-in library
(`accessToken()` in `src/game/auth.js`; after that the saved, still-valid token is used), since
on resume it refreshes the login over a connection the phone may have dropped, which froze the
game. A request that was under way when the app went to the background is dropped on return
(`callGame()` in `src/game/api.js`) and the game asks again.

**Ball pictures load instantly:** the ball SVGs in `src/balls/` are built into the stylesheet
(`assetsInlineLimit` in `vite.config.js`), so no color waits for its own download. The service
worker serves built files (`/assets/…`, renamed on every change) from its stored copy first;
the page itself stays network-first.

**Install as an app (like Dekabess):** Pin & Spin is an installable web app (PWA):
`public/manifest.json`, icons (`scripts/make_app_icons.py` builds `icon-*.png`,
`icon-maskable-*.png`, `apple-touch-icon.png`, `favicon-32.png` from the logo), the iPhone
home-screen tags in `index.html`, and `public/sw.js` (network first, cache only as an offline
fallback; `version.json` and the game server are never cached). `src/pwa.js` registers it
(not on the TV screen). The home screen shows an **Install** button on Android (the browser's
install prompt) and **Share → Add to Home Screen** steps on iPhone; nothing once installed.

**Friends (shared with Dekabess) + game invites (migration 011):** Home → Friends uses the
shared PlayVolt friends list through Dekabess's own database functions, called with the
player's sign-in exactly as Dekabess does (`src/social/friends.js`: my_friends, my_friend_code,
friend_request_by_code, friend_respond); Pin & Spin does not change them. Share-link
`/?friend=CODE` opens Friends with that code. In the lobby, signed-in players tap
**👥 Invite friends**; the friend gets a Join pop-up (`InviteBanner`, polled every 20 s plus a
content-free "invited" signal on `pin-and-spin-invites:<user id>`). Invites live in
`pin_and_spin_invites` (10 minutes, lobby only, friends only, blocked = silently dropped) via
`pin_and_spin_social()` (Edge Function actions `invite_friend`, `my_invites`, `invite_respond`).
Dekabess's own `friend_challenges` (tied to Dekabess rooms) is not used.
**Challenge** (Friends → 🎮 Challenge next to a friend → pick a mode) creates a room in that mode
and sends the friend an invite in one step. The lobby's Invite friends button always shows;
guests get an explanation (sign in first; installed iPhone apps keep their own sign-in).

**Admin view (PlayVolt admins only, like Dekabess):** tap the **Pin & Spin** title at the top 5
times within 2 seconds to turn it on, twice within 1 second to turn it off (`src/admin.js`). While
on, the secret of the game being played shows faintly in your empty guess slots (multiplayer,
and your own solo/daily/story games). Migration `012_admin_peek.sql`: `pin_and_spin_admin_peek()`
(Edge Function action `admin_peek`) checks the shared `public.admins` list itself (read only);
normal snapshots never contain the secret, so the switch gives non-admins nothing.

**How to play (ⓘ):** the ⓘ button in the top bar opens Rules, Game modes and Play on a TV
(`src/components/HowToPlay.jsx`). The TV setup steps (`TvSetupGuide.jsx`: Fire TV app via
Downloader + `<site>/app`, TV browsers via `<site>/tv`) also appear under Show on TV.

**TV pairing (no long link to type):** on the TV, open `<site>/tv` (bookmark it). It
shows a 4-letter code (no look-alike letters, new code every 10 minutes). A player in
the room types it under **Show on TV** and the TV switches to that room's board. Backend:
migration `005_tv_pairing.sql` adds `pin_and_spin_tv_pairings`, a wrong-code counter
`pin_and_spin_tv_pair_misses` (10 wrong codes per 10 minutes per network address) and
the server-only function `pin_and_spin_tv()`, reached through the Edge Function actions
`tv_start` / `tv_check` (TV) and `tv_pair` (player). Only the TV that asked for a code
(it holds its own random TV token) can collect the room's display link, and a TV already
connected to one room cannot be taken over by another. `public/_redirects` serves `/tv`.

**TV app (Fire TV / Android TV):** `firetv/` is a small Android app that opens `/tv` full
screen (sound without a click, no "Start sound" button). GitHub builds it on every change to
that folder and publishes the install file; download links `/app` (live) and `/app-preview`
(preview branches) are in `public/_redirects`. See `firetv/README.md` for sideloading.

**Compact layout:** the home menu fits one screen (Create/Join full width, the rest in a
two-column grid; on computers the logo sits left of the menu). While guessing, the color
picker and Clear/Submit sit in a dock pinned to the bottom of the screen (`.guess-dock`), so
they are always in reach; the general rules live under ⓘ instead of under the board.
With many players the mini boards slide sideways on phones (faded edge + "Swipe to see all N
players", and the row slides to whoever's turn it is); on computers the game screen is wider
and the mini boards wrap into rows, so all 10 show at once.

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
  `003_host_kick_presence.sql` (host can remove players, AWAY status, host handover)
  and `004_realtime_room_signal.sql` (instant-update signal).
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

**Instant updates:** database triggers (migration 004) broadcast a content-free
"changed" signal on the public Supabase Realtime topic `pin-and-spin:<ROOM CODE>` whenever
a room really changes; phones then fetch the redacted state immediately. Heartbeat-only
updates do not signal. Phones also refresh exactly when a timer expires. If Realtime is
unavailable, the client falls back to polling every 1.8 seconds (6 seconds while live). Server time
determines deadlines; a room request advances an expired round before accepting
another guess. Closing a phone does not forfeit its seat: reopen the page to resume,
or use Leave Room before exiting. Rooms expire after 24 hours.

## Optional

To point the game header's PlayVolt link to a deployed hub (instead of the GitHub repository), add the Cloudflare build environment variable `VITE_PLAYVOLT_HUB_URL` with the verified hub URL.
