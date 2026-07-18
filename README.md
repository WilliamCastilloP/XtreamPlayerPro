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
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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
