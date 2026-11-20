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
- Elimination: connect the current Balanced target (3 with 4–8 players, or
  4 with 2–3) to eliminate the **previous active player** in turn order:
  the last opponent who had a chance to block. Already eliminated seats are
  skipped and the order wraps around. The winning connection flashes, the
  defeated player is announced, the arena visually clears, and the server
  enforces a three-second 3–2–1 reset before the next player can drop.
  A full board resets the arena without eliminating anyone.
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

## Party Highlights and TV Replay (preview; migration 012)
- After a completed online match, the **room host** has a TV Party Replay
  selector. It lists completed matches in that room with complete snapshots.
  The host can start **★ Show Highlights on TV**, play the **Full Replay**, or
  **Stop Replay**. The existing read-only TV link automatically switches over.
- A highlights reel picks scoring lines, Chaos Barrier/Blast moves, Elimination
  rounds, Bottom Drop clears, and the deciding move, with context. The normal
  replay shows every recorded move. TV playback animates automatically and
  repeats highlights, while full replays finish on the final board.
- Phone Match History also offers highlights and clickable key-moment chips.
- The replay controller refuses non-hosts, incomplete/no-contest matches and
  attempts during a running game. Starting a live match **immediately cancels**
  the TV replay. The TV's 64-character read-only display capability can only
  read a host-selected completed match in its own room and never control it.
  No other PlayVolt games, authentication, or live hub paths are modified.

## Mobile and TV polish (preview)
- Phone navigation uses a **Menu** with one-tap destinations for Game,
  Customize, Match History, Trophies and Sign Out; tap outside or press Escape
  to close. Desktop navigation stays visible.
- Phone board supports **tap anywhere in a valid column**, not just the tiny
  arrows. Full columns and invalid Chaos Blast targets are disabled from both
  input surfaces. For 12- or 14-column games, the board scrolls horizontally
  with accessible 40px columns instead of shrinking to nearly untappable cells.
  TV board remains fully fitted and read-only.
- The lobby offers **Copy code** and **Invite friends**, the join form works
  with the mobile keyboard's Join action, and the room has a connection-status
  indicator with manual retry during an outage. Existing room membership and
  game states are preserved through transient network loss.
- Spectator TV puts the **board before the player sidebar** on narrow screens
  during games and replays; lobby TV shows the join code first. On phones,
  12- and 14-column archived replay boards scroll rather than shrinking.
- These are client-only interface enhancements. They do **not** change the
  Supabase rules, award logic, PlayVolt hub, Dekabess or Pin & Spin.

- The unattended TV shows a clear **Live / Reconnecting** indicator.
  Interrupted replay loads retry automatically, rather than permanently
  leaving the TV stuck on the loading screen.

## Last-move and end-of-match feedback (preview; migration 013)

The room and scoped read-only TV RPCs return the **last accepted move** of the
current match (seat, column, row, kind, move number and points earned).
The last placed chip or Chaos Barrier is outlined, while a Blast or reset round
highlights its affected column instead of inventing a vanished chip. The same
feedback works in local pass-and-play demos and on the shared TV.

On a finished match, the display derives the **winning connection through the
final placed chip**; Team Battle treats same-team chips as compatible even
when their individual colors differ. Territory uses its final score-based
result, without falsely marking an arbitrary four-in-a-row. The completion
banner shows the winner, winning teammates, or an actual draw; the same
styling is applied to the final step of saved phone replays. Animations respect
reduced-motion preferences. No new game tables, leaderboard logic, or shared
PlayVolt apps were changed.

## ⚡ Speed Round: all players drop at once (preview; migration 014)

**Speed Round** is a separate, online-only 2–8 player mode. Unlike Classic,
there is **no individual turn order**. Every player may submit exactly **one
normal chip in each 60-second round**, using their own phone. The database
serializes concurrent requests under a locked room row, so the first accepted
submission is placed first. Two people choosing the same column will stack
in that order: the earlier accepted chip lands lower. Nobody can submit a
second chip until all participating players have made their one drop.

When the last player submits, the next round opens **immediately**. If one or
more people do not play, a server-owned 60-second round deadline skips only
those missing players when a joined participant next polls, then opens a
fresh round for everyone. Skipped players are **not eliminated**. A drop arriving
just after an expired deadline is not placed; the client sees the new round
and can submit again. First connected four wins; a full board is a draw.

Players and the read-only TV see round number, the shared countdown, and
which participants have already dropped. Room polling is slightly faster for
this mode. Server-only `drop_block_speed_plays` records each round's unique
participation, with RLS and direct client privileges denied. Signed-in room
participants submit only through the transactional `drop_block_action` RPC.
Each accepted drop still writes the regular move log and replay snapshot,
so match history, win recording and TV playback work as before.
Local hot-seat demo is disabled for this mode, since simultaneous inputs need
separate devices. **All six existing game modes remain turn-based and unchanged.**

## Speed Round start signal and race positions (preview; migration 016)

Speed Round now has a synchronized **3–2–1–GO** before the first drop of
**every** round, including after everyone has submitted or after a 60-second
round timeout. The server records the round's opening timestamp and refuses
early drops; a device animation cannot start the match prematurely. The
60-second play window begins at GO, not when the countdown starts. The
previously deployed 60-second timeout skipping rules remain intact.

Accepted Speed Round submissions are ranked **#1, #2, #3, …** by their
server-written global move numbers (never by unreliable client timestamps).
Phones and the shared read-only TV display the accepted order beside player
names. After the last player submits, the board advances to a new countdown
and displays the previous round's finishing order while the next one gets
ready. Unique server move numbers guarantee deterministic stacking and rank
when several people tap the same column simultaneously. Earlier matches keep
their existing replay history; the migration backfills accepted move numbers
for any Speed Round submissions previously recorded. This is a Speed Round-only
improvement; Classic and all other modes retain their existing turn logic.

## Realtime room/TV updates (preview; migration 017)

Online Drop & Block now listens for **Supabase Realtime Broadcast** notifications.
All seven game modes, including Speed Round, use the same low-latency update
path, and the read-only TV view subscribes without requiring a PlayVolt login.

- A server-owned trigger on `drop_block_rooms` sends an **empty invalidation**
  when a match, round or replay changes. A separate `drop_block_players`
  trigger handles joins, readiness, scores and elimination. Routine
  `last_seen_at` presence heartbeats are deliberately excluded to avoid
  read/notification loops.
- The broadcast topic is derived solely from the existing 256-bit
  `display_token` bearer secret shared with joined players and their TV.
  It carries **no board state, code, player names, user IDs, or scores**.
  Clients never trust a socket payload as a legal move, never send a game
  broadcast, and always fetch authoritative room state through the existing
  authenticated `drop_block_action('get')` or token-checked
  `drop_block_tv_state` read-only endpoint.
- Bursts of server events become a single coalesced refresh, with one trailing
  fetch if updates arrive during the request. Older HTTP responses cannot
  roll the board backward over a newer move, round, win or rematch.
- On a working WebSocket, phones perform a 15-second maintenance refresh and
  TVs an 18-second refresh instead of checking every 1–2 seconds.
  Disconnected sockets automatically fall back to 3.5-second refreshes for
  Speed Round/TV, or 6 seconds for other modes. Returning to the tab or
  reconnecting also triggers an immediate refresh.
- Player clients schedule a server check around an approaching turn or round
  deadline so that timeout-skips work without needing a rapid polling loop.
  A spectator TV cannot trigger any gameplay action, even at the deadline.
- The UI distinguishes **Instant updates** from **Automatic refresh**, and
  shows a reconnection warning if the authoritative RPC itself fails.
  No additional direct table access, new login, or privileges were granted.

A broadcast is best-effort and can arrive later than an opponent's HTTP
request; fairness, move order and timers remain governed by the existing
transactional SQL. Test with at least two different devices plus the TV.

## Arcade Visual Pass 1 (preview only)

This pass refreshes the Drop & Block presentation without changing movement,
wins, timers, rankings, account access or shared PlayVolt applications.

- Confirmed newly placed chips **fall visibly down their column** and land
  with a small squash-and-bounce and luminous impact ring. The server remains
  the authority for every chip's final row/seat. On Speed Round updates with
  several new chips, the animation queue uses server-accepted positions when
  supplied and staggers the falls, including stacked chips in the same column.
- The live multiplayer phone board, read-only shared TV and TV match replay
  all use the same decorative overlay; it never intercepts taps or changes the
  saved board. Opening an existing game or loading a saved board does **not**
  replay historical drops. A rematch's cleared board does not trigger fake
  falls; Chaos Blast and Bottom Drop clear effects are not misrepresented as
  new chips. If a reconnect jumps over many moves, the board snaps to its
  confirmed position instead of pretending to know the missing animation.
- Existing trophy-earned board themes and chip shapes are preserved. Boards
  gain recessed arcade slots, illuminated frame edges, chip gloss and
  layered shadows. Winning connections and victory panels get a brighter
  glow. The Speed Round 3–2–1–GO countdown adds rising start lamps.
- Uses lightweight CSS transforms instead of a physics engine. It supports
  high-player-count mobile scrolling and TV displays, with motion disabled for
  people who request reduced motion at the operating-system/browser level.
  No extra database migration, table, or permissions are needed for visuals.

## Arcade Visual Pass 2 — Original Sounds & Celebration (preview only)

The live phone/TV game now includes a **sound control** (off by default).
The user's explicit On/Off choice is stored locally on their device; browsers
that restrict audio still play normally. No audio downloads or licensed songs
are used: a small built-in Web Audio synthesizer generates each original,
short cue for chip landing, barrier, Blast, Speed Round ticks and GO, and a win.
The TV party replay has its own visible sound switch and chip impact cues.

Newly accepted chips emit a small **particle burst on impact**. Genuine match
wins show a colorful, one-shot confetti shower and trophy pop above the
existing victory panel. Draws, host-cancelled matches and lobby closures never
display a false win celebration. All effects ignore pointer input, work with
existing skins and chip shapes, and respect the OS/browser
`prefers-reduced-motion` setting. No changes to gameplay, Supabase
tables/RPCs, scoring, player accounts, or the live PlayVolt hub.

## Balanced multiplayer connections (preview; migration 018)

New matches use the **Balanced** win condition, frozen from the number of
joined players when the host presses Start:

- **2–3 active players:** Connect **4** own chips.
- **4–8 active players:** Connect **3** own chips.
- **Team Battle:** Connect **4 team chips**, regardless of team size.

This is the same rule for normal Classic/Speed Round wins, Chaos/Bottom Drop,
Elimination's knockouts and Territory's scoring lines. In Territory, the match
still plays to a full board; newly completed connections earn points instead
of an immediate victory. In Elimination, successful connections knock out one
opponent and can start another round. Speed Round's one-drop-per-round race,
timer, ordering and GO countdown are unchanged.

The database stores `win_length` on the room at Start and with every
accepted move. Existing completed moves are preserved as Connect 4, and
existing ongoing games keep their prior Connect 4 rule until the next match.
Phone/TV room state reports `winLength`, and personal/TV replay detail
uses the saved **per-match** rule, so even older replays remain correct after
a rematch. Server RPCs enforce the win condition; the local demo, winning
highlights, match captions and replay UIs match the server. Board dimensions
are unchanged in this pass; capacity still determines the board dimensions,
while **the actual starting participants determine the winning rule**.

## Elimination reset + prior-player targeting (migration 019)

A newly connected line removes the **previous living seat** before the scorer,
not the next. For example, with seats 1 → 2 → 3 → 4: if seat 3 scores,
seat 2 is eliminated; if seat 1 scores, seat 4 is eliminated; if 2 is
already out and 3 scores, seat 1 is eliminated. The scorer is never targeted.

The next round opens after a server-timed **three-second reset animation**,
showing the actual last confirmed board and its glowing winning connection,
the eliminated player's name/avatar, an animated clearing effect and a
3–2–1 countdown. All spectators and participants see the same event through
the existing authenticated room or bearer-token TV RPC. Board input is
blocked server-side before the deadline; the next active seat's full
60-second turn begins only *after* the countdown. A board-full redraw
also shows a reset sequence, but nobody is eliminated. A final elimination
ends the match without a reset delay.

The offline hot-seat demo mirrors the previous-active targeting and reset
visuals. The existing replay move log still retains the elimination event,
post-reset snapshot and updated player states; no old matches are rewritten.
No other mode, live PlayVolt hub or unrelated project was modified.
