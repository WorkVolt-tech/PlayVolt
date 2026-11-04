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

## Modes

- Classic — alternating turns, 4 guesses per player
- Reveal — simultaneous guesses, 4 rounds
- Timed Reveal — 3 minutes per round, 4 rounds
- Rush — 3 minutes total, 8 guesses per player

The shared TV/display concept is a **future phase** and is not yet implemented.

## Optional

To point the game header's PlayVolt link to a deployed hub (instead of the GitHub repository), add the Cloudflare build environment variable `VITE_PLAYVOLT_HUB_URL` with the verified hub URL.
