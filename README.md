# XtreamPlayerPro

Modern Xtream Codes PWA — Live TV, Movies, and Series with a cinematic player.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- hls.js for HLS playback
- Next.js API routes as Xtream + HLS proxy (avoids CORS)
- Playlists stored in `localStorage` on the device
- PWA-ready (`manifest.json` + service worker via `@ducanh2912/next-pwa`)

## Features (MVP)

- Multi-playlist: name + server URL + username + password
- Live TV with categories, logos, short EPG, favorites
- Movies & Series catalogs with detail pages
- Global search with Live / Movies / Series chips
- Continue watching (per playlist)
- Fullscreen player with touch-friendly controls

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

## Playlist model

```ts
{
  id: string
  name: string
  serverUrl: string
  username: string
  password: string
  createdAt: number
}
```

Favorites and continue-watching are scoped by playlist id in `localStorage`.

## App Store (phase 2)

Wrap the same UI with Capacitor when you are ready for App Store / Play Store distribution.

## Notes

- Only Xtream Codes panels are supported in the MVP (no M3U import yet).
- Some panels or CDNs may still block playback; the HLS proxy rewrites playlists to same-origin when possible.
