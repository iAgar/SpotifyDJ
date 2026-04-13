# PartyDJ

PartyDJ is an AI-powered in-browser DJ that watches your crowd via webcam, detects energy levels using motion analysis, and automatically transitions Spotify tracks to match the vibe. It uses the Spotify Web Playback SDK to play music directly in the browser — no native app required.

## Tech stack

| Layer | Technology |
|---|---|
| UI | React 19, TypeScript, Vite |
| Auth | Spotify PKCE OAuth (no client secret) |
| Playback | Spotify Web Playback SDK |
| Recommendations | Spotify Search API (`/v1/search`) |
| Energy detection | Webcam pixel-diff (luma, rolling average) |
| Styling | Inline styles (zero CSS framework dependency) |

## How to run locally

**Prerequisites:** Node 18+, a Spotify Premium account, Chrome or Chromium.

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Copy the env template and add your Spotify app's Client ID:
   ```bash
   cp .env.example .env
   # Edit .env and set VITE_SPOTIFY_CLIENT_ID=<your client id>
   ```
   Create a Spotify app at [developer.spotify.com](https://developer.spotify.com/dashboard) and add `http://127.0.0.1:3000` as a Redirect URI.

3. Start the dev server:
   ```bash
   npm run dev
   ```

4. Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in Chrome.

## How to demo

1. Open the app and click **LOGIN WITH SPOTIFY**. Approve the permissions.
2. Wait for the loading screen to resolve — the Spotify Web Playback SDK is initialising and registering a device.
3. Open Spotify on any device and transfer playback to **Party DJ** (it appears in the device list). Start a track.
4. Click **START PARTY** — the app requests camera access and begins reading crowd energy every 500 ms.
5. Every 15 seconds the DJ brain fetches a new recommendation matched to the current energy level. At 90% of the track's duration it auto-transitions.
6. Use **NEXT SONG** to manually skip to the queued track at any time (subject to a 45-second cooldown).
7. To demo without a crowd, click **TEST MODE** and drag the energy slider manually.
8. Click **STOP PARTY** to pause music and stop the camera.

## Known limitations

- **Spotify Premium required** — the Web Playback SDK only works with Premium accounts.
- **Chrome / Chromium only** — `MediaDevices.getUserMedia` and the Spotify SDK are tested on Chrome. Firefox and Safari have known issues.
- **localhost / 127.0.0.1 only** — Spotify's PKCE redirect URI must exactly match. The dev server is pinned to `http://127.0.0.1:3000`.
- **No queue clearing** — Spotify has no public API to clear the play queue. PartyDJ uses `PUT /v1/me/player/play` with an explicit URI to replace playback entirely, bypassing the queue.
- **Search-based recommendations** — `/v1/recommendations` and `/v1/audio-features` are deprecated/restricted for new apps. Recommendations use genre-tagged search queries instead.
