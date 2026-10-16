# Dekabess — rules for AI coding tools

Dekabess is a Haitian dominoes game (React + Vite, Supabase, Cloudflare Pages).
It lives in the `dominoes/` folder of the PlayVolt monorepo. The other folders
(`bluff/`, `riot-roll/`, `rushing-blur/`, `soul-harvest/`, `whos-the-worst*/`,
root `index.html`, `auth.js`) are separate games. Do not touch them.

## Ground rules

- **Don't change how the game plays** (rules, scoring, dealing, turn order, bot
  behaviour, rewards) unless the task explicitly asks for it. If a fix would
  change gameplay as a side effect, stop and say so instead.
- **Start from the latest `main`.** Other people and tools commit here. Never
  replace a whole file from an older copy; re-read the current file and make
  targeted edits.
- **Keep changes small and scoped to the task.** No drive-by refactors, renames,
  reformatting, or dependency upgrades.
- Explain changes in plain language in the PR description: what changed, what a
  player will notice, and anything the owner must do by hand (e.g. run SQL).

## Where things go

- App code: `dominoes/src/` only.
- Table artwork and frames: `dominoes/public/tables/`.
- Tests: `dominoes/tests/*.test.mjs` (plain Node, no test framework).
- Do **not** commit `dist/`, `node_modules/`, or a changed `public/sw.js`.
  `npm run build` rewrites the cache name in `public/sw.js` on every build;
  that change is expected locally and must not be committed.

## Every change must

1. **Bump `src/version.js`**: increase `VERSION` (e.g. `'v1.20'` → `'v1.21'`)
   and set `VERSION_NOTE` to a few words describing the change. The lobby shows
   it, and it is how the owner tells what's live.
2. **Build**: `cd dominoes && npm run build` must succeed. Cloudflare builds
   from `dominoes/`, and a failed build silently keeps the old site live, so a
   broken build looks like "my change didn't deploy".
3. **Test**: `cd dominoes && node --test tests/*.mjs` must pass. Add a test when
   fixing a logic bug.
4. **Check `src/components/Board.css` if you touched it.** It has been saved
   cut short twice. Confirm that `{` and `}` counts match, that the hand-slam
   rules (`.dek-slam-wrap` etc.) are still there, and that the file still ends
   with the landscape rule using `--table-felt-wide`.

## Database (Supabase)

- Project ref `eybzbtyfafmqbkulyvog`, shared with the other PlayVolt games.
  Never drop, rename, or change the meaning of anything another game might use.
- All Dekabess database changes go in **one cumulative file,
  `dekabess_database.sql`**, which the owner runs in the Supabase SQL editor.
  Don't create separate migration files.
  - It assumes the original base tables already exist: `domino_rooms`,
    `domino_players`, `board`, `game_events`, `profiles`, `queue`, `wa_tab_la`.
  - It must be safe to run again on a database that already has it
    (`create ... if not exists`, `create or replace`, `drop ... if exists`
    before re-creating policies/triggers).
  - It ends with an explicit **grants** section (required by Supabase's
    Data API change of Oct 30, 2026). Any new table, view or function needs
    its grants added there.
- Views should be `security_invoker = true`.
- Anything involving Goud (the in-game currency) is decided on the server:
  balances live in a server ledger, Goud is earned only, and the client never
  writes balances directly. Keep it that way.

## Table artwork (skins)

- Skins are defined in `src/lib/skins.js`. Images are `.webp` named
  `<name>-tall.webp`, `<name>-wide.webp`, `<name>-thumb.webp`
  (e.g. `burgundy-deco-wide.webp`). Zodiac tables follow the `zodiac-<sign>`
  pattern, with Female/Male variants for Gemini and Libra.
- Challenge prize tables use the artwork as a **9-slice frame** (corners kept,
  edges stretched) with a plain dark felt. Fields: `frame`, `frameWide`,
  `frameSlice`, `frameSliceWide`, `frameWidth`, `frameWidthWide`. The slice
  and width numbers are tuned per artwork; copy them from the nearest existing
  table and adjust, rather than assuming one set of values.
