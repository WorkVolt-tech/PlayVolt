# Drop & Block — PlayVolt

Independent game in the PlayVolt monorepo; does **not** modify Dekabess or Pin & Spin.
Two to eight players, real-time-ish polling, Classic / Territory / Elimination / Bottom Drop game modes, and a
gravity board. Uses the **same Game DB** (eybzbtyfafmqbkulyvog), Supabase Auth, and
public.profiles as Dekabess and Pin & Spin: no duplicate accounts.

## Deploy (no terminal needed)
1. Review this branch and merge only after approving the gameplay.
2. Apply backend/migrations/001_drop_block_core.sql to the Game DB. This is an
   additive migration and creates only drop_block_* objects. It was applied
   during initial development if the SQL is already visible in Supabase.
3. In Cloudflare Pages, connect the existing PlayVolt GitHub repository, set
   **Root directory** to drop-and-block, **Build command** to npm run build,
   and **Build output directory** to dist. No local terminal needed.
4. Players can use their **existing PlayVolt email/password** to sign in.
   Because Cloudflare projects have different domains, browsers may ask them
   to sign in once on this game's domain (not register a new account).

## Rules
- Room creator selects 2–8 maximum players; board adapts in size.
- Each person joins with their PlayVolt account; everyone readies up; host starts.
- Tap a column to drop your piece to the lowest empty row.
- Classic: first to connect 4 horizontally, vertically or diagonally wins.
- Territory: every newly completed direction scores a point; most points when
  board is full wins. Exact-score ties finish as a tie.
- Elimination: connect four to knock out the **next active opponent** in turn
  order; the board resets each round and removed players sit out. If the board
  fills with no connection, reset the board without eliminating anyone.
  The last remaining player wins.
- Bottom Drop: first to connect four wins, but if a newly placed chip reaches
  the **second row from the top**, the bottom row clears and all higher chips
  move down one row. This happens after checking the completed line.
- Every build publishes a fresh `version.json`. Browsers check on load, every
  minute and on focus and offer the same Update Now banner as Pin & Spin. On
  reload, online players rejoin the current match from the URL; local demos reset.
- Each player's piece shows both a color and a symbol.
- Room codes expire after 24 hours; reloading a room link allows re-entry for
  existing participants. The first release does not have guest access, rematches, Chaos powers, or abandonment/time-out handling.

## Security
Only authenticated players can invoke drop_block_action(). All four new tables
have RLS enabled with no browser policies. Server-side PostgreSQL RPC verifies
membership, host, turn, room status, column bounds and scoring atomically.
No service-role or secret key in the browser. This project intentionally
does not modify existing PlayVolt auth, game rewards or other tables.

## Development
React + Vite. Versioned dependencies in package.json. Local tests for the
pure gravity/scoring rules are in tests/. Cloudflare builds this folder only.

## New migration
Run `backend/migrations/002_modes_elimination_bottom_drop.sql` after the
existing `001` migration. It extends only `drop_block_*` objects and supports
existing Classic/Territory rooms without resetting them.

## TV Party Mode (preview)
From any signed-in room, choose **Open TV** or **Copy TV link**.
Open the link on a TV browser, laptop connected to a TV, or large tablet.
The TV is a **read-only spectator**; all moves stay on individual phones.
It shows the live board, whose turn it is, player names, eliminations and scores.
Players join the room with the six-character code shown on the TV.

The TV link contains a cryptographically random 64-character secret in the URL
fragment, not in the server request. Only room participants receive this link.
Sharing it gives read-only access, not permission to play. TV state is fetched
by `drop_block_tv_state` without requiring the TV to sign in. Tokens expire
when their rooms expire after 24 hours. No existing PlayVolt tables are changed.
The TV refreshes automatically when a new preview build is deployed; phones
still receive the **Update Now** prompt.

Database: apply migration `003_tv_shared_display.sql` after `002`.
Cloudflare builds only `drop-and-block/` from the preview branch.
