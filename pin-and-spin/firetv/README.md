# Pin & Spin TV app (Fire TV / Android TV)

A small Android app that opens the Pin & Spin TV page (`/tv`) full screen. The TV shows
a 4-letter code; a player types it under **📺 Show on TV** on their phone. All game logic
stays on the website, so game updates never need a new app version.

- Package name: `ca.chezmaxo.pinandspin.tv` (permanent once published; never change it).
- Plain Android (Java, no extra libraries), min Fire OS 5 / Android 5.1 (API 22).
- In the app, sound plays without a click and the "Start sound & full screen" button is
  hidden (the website sees `PlayVoltTV/` in the user agent).
- No internet: a friendly screen that retries every 5 seconds (or press OK).

## Building

GitHub builds it (`.github/workflows/pin-and-spin-tv-app.yml`) whenever this folder
changes:

| Branch | Opens | Download |
|---|---|---|
| `main` | live site `/tv` | `https://playvolt-pin-and-spin.pages.dev/app` |
| any other | that branch's preview `/tv` | `https://<branch>.playvolt-pin-and-spin.pages.dev/app-preview` |

Locally (needs the Android SDK): `gradle assembleDebug` in this folder.
Icons and banner: `python3 firetv/make_art.py` from `pin-and-spin/` (from the game logo).
`store-art/` holds images for the Amazon Appstore listing.

## Installing on a Fire TV (sideload, for testing)

1. Fire TV: **Settings → My Fire TV → About**, click the device name 7 times to turn on
   Developer Options.
2. Install the free **Downloader** app (search "Downloader" on the Fire TV).
3. **Settings → My Fire TV → Developer Options → Install unknown apps** → turn on Downloader.
4. Open Downloader, type the download address above, press Go, then **Install**.
5. The app appears under **Apps** as "Pin & Spin TV" (move it to the home row if you like).

Test builds are signed with a temporary key, so to install a newer test build you may
need to uninstall the old one first.

## Publishing on the Amazon Appstore (later)

Needs the Amazon Developer account. A signed release build will be added before the
first submission (the signing key is kept as a GitHub secret, never in the repo).
