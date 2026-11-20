# Drop & Block — PlayVolt

Independent game in the PlayVolt monorepo; does **not** modify Dekabess or Pin & Spin.
Two to eight players, real-time-ish polling, Classic / Territory / Elimination / Bottom Drop / Chaos game modes, and a
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
  existing participants. The first release does not have guest online access or abandonment/time-out handling.

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

## Rematches and saved match history (preview)
After a match finishes, **only the host** can select **Play again · Same players**.
Every player stays in the existing room and keeps their seat; nobody needs a new invite.
The game returns to the lobby, resets the board, round, eliminations and scores,
and asks the other players to ready up. The host can then start the next match.
First player rotates by match number to avoid giving one seat every first turn.

The server tracks `match_number`, a continuously increasing `total_moves` count,
and the separate `move_count` of the current match. Move history uses global
sequence numbers while results have a composite (room, match, player) key, so
previous scores/winners and moves are not overwritten on rematch.
The TV screen shows the match number and changes back to a rematch lobby.

Database: apply migration `004_rematch_history.sql` after `003`.
Rooms still expire 24 hours after initial creation, as they did before.

## Chaos Mode (preview)
Each signed-in player receives exactly **one Barrier** and **one Blast** per match.
A normal chip drop remains unlimited. Every move, including a power, consumes a turn.
- **Barrier**: drop a neutral gray `⬢` piece into a non-full column. It blocks
  connections for every player and counts toward filling the board.
- **Blast**: remove the *bottommost* piece in a nonempty column. All remaining
  pieces in that column fall by one row. It can remove an opponent's chip, your
  own chip, or a neutral Barrier. A Blast itself does **not** award a win.
- Only a **normal drop** can complete four in a row and win. A completely full
  board ends in a draw. Every player's power inventory resets for a rematch.
- On phones, choose Normal Drop, Barrier, or Blast, then select the target
  column. The TV displays the neutral piece and remaining powers.

All powers are checked atomically on the game server via `drop_block_action`.
Move history records `move_kind`, and the game server rejects repeated uses,
wrong turns, invalid targets, and power calls in other game modes.
Database: apply `backend/migrations/005_chaos_mode.sql` after `004`.

## Trophies and Leaderboards (preview)
Trophies and rankings use the **existing PlayVolt profile ID** but have their own
Drop & Block tables (`drop_block_results` and `drop_block_achievements`).
An internal DB trigger awards twelve trophies after each server-recorded finished
online match; local same-device demo games cannot award anything. Awards are
idempotent and backfill finished online matches recorded before migration 006.
The browser has no direct access to either source table. Signed-in players use
read-only `drop_block_progress(mode,period,limit)` to get a filtered top-25
leaderboard, all-time personal wins/matches, and their server-awarded trophies.
Filters: all or a specific mode, all time or last seven days. Wins, then win
percentage, then matches played determine leaderboard order. Rematches count as
separate completed matches. The same login identity is used across PlayVolt.

The gallery uses black/gold medals with locked/earned states. Players see a
server-verified unlock popup after an online match; historic trophies already
seen on a different day/device are not announced again on first visit to that
browser. Database: apply `006_trophies_leaderboard.sql` after `005`.

## Team Battle (preview; migration 007)
- Team Battle is for **4, 6 or 8 players** (2v2 / 3v3 / 4v4). The host can
  start once there are at least four players and an even number have joined.
- Seats 1,3,5,7 are **Team Gold**; seats 2,4,6,8 are **Team Blue**.
  Joining order determines teams, and existing seats persist across rematches.
- Each player keeps their individual chip color and symbol, with a gold or blue
  ring identifying its team. Differently colored teammates' chips may connect
  into a shared four-in-a-row horizontally, vertically, or diagonally.
- The first team to make a line of four wins. The winning team's *all* members
  receive a server-recorded victory, ranking credit and normal win trophies.
  A full board with no winning team is a draw. TV viewers see both teams.
- Team wins also unlock the **Teamwork Triumph** trophy. The Five-Mode Master
  trophy still requires victories in any **five different modes**.
- Existing Classic, Territory, Elimination, Bottom Drop and Chaos rules are
  unchanged. Team-mode table values are computed from seat parity; no new
  shared-account tables or destructive changes are required.

## Customization (preview; migration 008)
Every PlayVolt account begins with only Classic Navy, Round Chip and Sentinel
avatar unlocked. The 28 cosmetics are stored in `drop_block_cosmetic_items`;
all other styles require trophies in `drop_block_achievements`.
Players can preview **locked and unlocked** items in a sticky mini-board beside
the choices; only unlocked items may be equipped.
`drop_block_customization` checks trophies before saving selections in the
private `drop_block_cosmetic_loadouts` table. Direct browser writes are denied.
Chosen chips and avatars are rendered for everyone in the game and TV spectator
screens, retaining seat colors/symbols; each player sees their chosen board
theme locally, while the TV uses the host's board theme.
No existing Dekabess, Pin & Spin, PlayVolt Auth, or live hub tables are changed.

## Timed turns and reconnecting (migration 009)
Every **online match** uses a 60-second server-owned turn limit. Each accepted
move and new turn sets a fresh deadline. If the deadline expires, the first
authenticated participant polling the room resolves it **transactionally**:
the current turn is passed to the next eligible seat. No chip is dropped, no
victory is awarded, and the skipped player is **not eliminated**. The timeout
is counted per player and per match; a rematch clears all timeout counters.
A late move after the server deadline does not land on the board.

The read-only TV gets the same authoritative deadline but **cannot trigger**
turn transitions or submit any move. The mobile and TV views show a locally
animated countdown derived from a server timestamp, so device clock errors
cannot decide the result. The countdown is informational; all enforcement is
in `drop_block_action`.

An online player is marked **Away** after ~25 seconds with no room activity;
routine participant polling marks them Online again on return. This status is
informational and does not forfeit the match. Refreshing/reopening the same
invitation link restores existing room membership and allows play to continue.
Only a real participant accessing the room causes expired turns to advance;
there is no continuously running background cron for an empty room.
A normal game still has the original 24-hour room expiry. Local demos have
no timers. Only Drop & Block tables, RPCs, and preview UI are changed.

## Host room controls (migration 010)

**Close lobby:** A host may close an unused lobby immediately. Its invitation
code stops admitting new players. A closed lobby is terminal; the host must
create a new room to invite others again. There is no win, draw or trophy.

**End abandoned match — No Contest:** A host can end a playing match only
after **three minutes since the last valid move** AND at least one of:
an opponent has not been seen in the room for **90 seconds**, or the match
has already recorded **two missed turns**. The database evaluates this and
rejects early or non-host requests; browser time cannot bypass the safeguard.
The host must confirm in the UI. Both players and TV see the no-contest reason.
A No Contest has no winner and writes **no** `drop_block_results`, so it never
increases matches played, awards trophy unlocks, or changes the leaderboard.
Previously completed matches in the same room remain preserved.

After a stalled No Contest, the host may start a rematch in the **same room**,
keeping all players and the invitation code, with a fresh turn timer and
ready checks. The status `cancelled` with `ended_reason` distinguishes closed
lobbies from abandoned games. The original 24-hour room expiry still applies.
All changes are isolated to `drop_block_*` objects and the preview branch.

## Match History & Replay (preview; migration 011)

Only signed-in PlayVolt players can read their **own completed online matches**.
Open **↺ Match History** from the header, from a match, or through Trophies &
Ranks. List shows outcome, mode, players, date and moves, with pagination.
Open a match to step backward or forward, play/pause, or scrub through exact
stored snapshots. Each accepted move persists its full post-effect board and
player state transactionally, after **Chaos Blast/Barrier**, **Elimination**
knockouts/round resets, **Bottom Drop** row clears and score changes. This
is a read-only viewer; no replay button calls a gameplay action.

The `drop_block_match_history` RPC checks the authenticated user's presence
in the specific completed match's server-written results and refuses any
non-participant. Raw move rows remain private. No Contest matches, unfinished
matches, and local demos have no ranked results and are excluded.
Older completed matches recorded before this migration may lack snapshots:
player/result history is still shown, but the UI explicitly disables playback
rather than guessing past special effects. Replaying historical matches remains
possible across rematches because the match number is part of the move key.
