# PlayVolt game development rules

**Scope:** This document applies to the entire `PlayVolt` repository, including existing games and new games. Read it before designing, changing, or debugging a game. It captures project decisions so future developers and AI coding assistants do not repeat avoidable mistakes.

## 1. Accounts are optional for playing

**Never require someone to sign up or sign in merely to play a PlayVolt game.**

- A guest must be able to **create/host a room, join with a room code, and play multiplayer** with the same gameplay rules as a registered player.
- Let guests enter a display nickname. No email, password, or permanent PlayVolt account is required to start a game.
- Account sign-in/sign-up is an optional, clearly labeled way to save progress and compete for rewards, not a blocker or mandatory onboarding step.
- A guest's in-match scores, wins, turns, and power-ups work normally during the game.
- A guest **does not earn persistent leaderboard scores/rankings, trophies, achievements, unlockables, or other account-based rewards**. Signed-in participants in the same match remain eligible for their own rewards according to normal game rules.
- Enforce reward eligibility on the **server/database** as well as in the UI. Do not rely on hiding a leaderboard button.
- Avoid calling a temporary guest profile a registered account, or presenting optional login as required.

**Existing patterns to inspect before writing new guest code:**
- **Dekabess:** `dominoes/src/pages/Lobby.jsx` — supports guest seats without requiring an authenticated account; registered players can link their seats to their account.
- **Pin & Spin:** `pin-and-spin/src/hooks/useAccount.js` and `pin-and-spin/src/screens/EntryScreen.jsx` — guest play is available even while signed out; account state is optional.
- Reuse the **behavior and shared conventions**, but verify current source and schema before adapting a particular implementation.

**Important distinction:** A guest in these existing games does **not** require Supabase `signInAnonymously()`. Do **not** assume Anonymous Sign-Ins must be enabled, tell someone to configure it, or build a dependency on it without checking the existing architecture and getting approval. Supabase anonymous identities and a game's account-optional guest seats are different designs.

## 2. Secure guest identities and rooms

- Inspect the existing game's current room, player, move, and result tables and RPCs **before** implementing guest access. Some older games have `NOT NULL` account IDs/FKs and cannot support guests through a frontend-only change.
- For a new account-free multiplayer flow, use guest-capable seat/session records and a **server-verified, unpredictable guest session or seat token** where needed for moves, reconnection, and ownership checks. A nickname or room code alone is **not proof of identity or permission to move**.
- Validate room membership, host actions, seat ownership, turn order, limits, and all moves server-side. Never trust a client-supplied user ID, seat number, score, or reward eligibility.
- Keep browser reconnection possible for a guest on the same device. Explain that guest progress is temporary.
- Do not alter other games' authentication triggers or account structures to accommodate one game's guest system.

## 3. One shared Game DB; game-specific database names

- PlayVolt games use the **existing shared Supabase Game DB**. Do not create another permanent Supabase project or paid database branch unless expressly requested.
- **One login for every PlayVolt game — mandatory:** All games must use the **same existing Supabase authentication user table, `auth.users`**, as the single source of truth for login credentials and user identity. The existing shared `public.profiles` table supplies the cross-game player profile/nickname. **Never create a separate login, account, password, or authentication-user table for an individual game.**
- A player registers **once** and uses the **same email/password, account identity, and login session** across Dekabess, Pin & Spin, Drop & Block, and every future game in this shared Game DB. Signing up in one game must not require signing up again in another.
- Each game may have its own **prefixed, game-specific progress, settings, achievements, leaderboard and player-seat tables**, but registered account references must link back to the **same shared `auth.users.id`** (and `public.profiles.id` where appropriate), never to a second game-specific account system. Never store duplicate passwords or credentials in game tables.
- **Guest access remains optional-account play:** Do not force a login to play. Guest seat/session records are distinct from registered account identities, and guest matches do not produce permanent competitive rewards.
- Prefix **every game-owned database table, RPC/function, trigger, and other game-specific object** to identify its game. Preserve each game's existing naming:
  - Drop & Block: `drop_block_`
  - Pin & Spin: `pin_and_spin_`
  - Dekabess: `domino_` (inspect live objects for older naming conventions)
  - New game: choose one unambiguous prefix and use it consistently.
- Do not modify shared authentication or another game's tables to fix a single game unless the cross-game impact has been reviewed and authorized.
- Check real constraints, foreign keys, RLS, permissions, triggers, and existing function definitions before drafting or applying SQL. Keep changes backwards-compatible and use rollback-safe validation before a live migration.
- Never put secret/service-role credentials in frontend code or this repository.

## 4. Check existing implementations before inventing a new one

Before proposing a new feature, setting, table, or service:

1. **Fetch the current live source** of the affected game and inspect related games in this repository for the same feature.
2. **Verify the actual database schema and current behavior**, not just documentation, old snippets, or prior assistant claims.
3. Reuse established conventions and avoid creating duplicate systems.
4. If there is a mismatch (such as a table requiring `user_id` while guest play must be account-free), identify it explicitly and plan the full frontend + backend adjustment.
5. Only ask the owner to enable or change a platform setting after checking whether existing games already satisfy the requirement without it.

**Lesson learned (November 2026):** Drop & Block's guest-play draft originally used `signInAnonymously()` and suggested enabling a Supabase setting. That was the wrong assumption: Dekabess and Pin & Spin already permit signed-out guests through their game logic. Future Drop & Block guest support should follow the account-optional behavior, not require a new authentication dependency.

## 5. Change management and verification

- **Latest-file rule:** Fetch the live file from its actual branch before editing. Make only requested, surgical changes. Preserve earlier fixes; do not overwrite with old copies or modify unrelated files.
- Prepare gameplay and UI changes on a **separate GitHub branch/PR**. Provide a preview for review and **do not merge into `main` without owner approval**.
- Never claim a new feature works simply because it was coded or Cloudflare built it. Verify the build and test the user flow. Be explicit when a two-device or real-account test has not been completed.
- Review database changes separately. Do not apply live changes without authorization; test with transactions/rollback when possible. Document migrations in the repo.
- Before considering a multiplayer guest feature complete, test:
  - Guest creates room; another guest joins by code; guest reconnects.
  - Guest and registered player can play together without unequal gameplay.
  - One registered PlayVolt login works across all games without a second signup or game-specific credential table; shared player ID remains consistent.
  - Guest gets no leaderboard/trophy/unlockable credit; registered player still gets eligible rewards.
  - Host controls, move authorization, power-ups, rematches, and room codes still work.
  - Mobile portrait/landscape, responsive controls, and iPhone/safe-area insets.
- When documentation and the current running code differ, verify the code and **update these rules** as needed.

> These are repository instructions, not automatic database restrictions or a GitHub-enforced policy. The app must implement and test the requirements. Future coding assistants should read this file at the start of work.
