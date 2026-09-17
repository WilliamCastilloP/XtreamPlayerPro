# XTREAM

Modern Xtream Codes PWA — Live TV, Movies, and Series.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- hls.js for HLS playback
- Next.js API routes as Xtream + HLS proxy (avoids CORS)
- Playlists stored in `localStorage` on the device
- PWA-ready (`manifest.json` + service worker via `@ducanh2912/next-pwa`)

## Features (MVP)

- Multi-playlist: name + server URL + username + password
- Home filters: LIVE / MOVIES / SERIES with favorites + full category rails
- Live TV, Movies & Series catalogs (full panel lists, grouped by category)
- Global search across all types
- Continue watching + favorites per playlist
- Fullscreen player with load progress

## Local setup

```bash
npm install
npm run proxy   # terminal A — MKV→HLS on :8080
npm run dev     # terminal B — binds 0.0.0.0 for LAN
```

Open [http://localhost:3000](http://localhost:3000) on this PC.

**Phone on the same Wi‑Fi:** run `npm run lan:ready` to print your LAN URL (e.g. `http://192.168.x.x:3000`) and open firewall ports. Use that IP on the phone — never `localhost`. Keep `NEXT_PUBLIC_STREAM_PROXY_BASE=http://127.0.0.1:8080`; the client rewrites it to the PC IP automatically.

## Production build

```bash
npm run build
npm start
```

## Deploy (Vercel)

1. Push this repo to GitHub.
2. Import the project in [Vercel](https://vercel.com).
3. Deploy — every push to `main` rebuilds the PWA.

No server-side secrets are required. Xtream credentials never leave the browser except as request headers to your own API proxy, which forwards them to the Xtream panel.

## Fire TV / Android TV (native)

The web PWA stays as-is. The Fire Stick client lives in [`native/android`](native/android) — a GPL-3.0 fork of [OpenTV](https://github.com/opentvproject/opentv). It does **not** need the Node proxy; the APK talks to the Xtream panel on the device.

### Install on a Fire Stick (no PC)

1. Enable **Apps from Unknown Sources** (Settings → My Fire TV → Developer Options).
2. Install **Downloader** from the Amazon Appstore.
3. Paste this URL (always the latest APK):

```
https://github.com/WilliamCastilloP/XtreamPlayerPro/releases/latest/download/XTREAM.apk
```

Package id: `app.xtream.player` — it installs **next to** stock OpenTV, it does not replace it.

GitHub Actions builds that APK on every `android-v*` tag (`.github/workflows/android-apk.yml`).

### Build locally

```bash
cd native/android
./gradlew assembleDebug   # JDK 17 + Android SDK API 35
```

Debug APK: `native/android/app/build/outputs/apk/debug/`.
