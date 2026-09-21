# XTREAM

Reproductor **Xtream Codes** (Live TV, películas y series). Traes tu propio panel; XTREAM no vende contenido ni guarda tus credenciales en un servidor nuestro.

Hay **dos clientes** en este repo:

| Cliente | Dónde | Motor | ¿Necesita proxy? |
|---|---|---|---|
| **Fire TV / Android TV** | [`native/android`](native/android) | Media3 ExoPlayer (fork GPL de [OpenTV](https://github.com/opentvproject/opentv)) | No — habla directo con el panel |
| **Web / PWA** | `src/` | Next.js + hls.js | Sí — CORS y remux MKV |

Paquete de la APK: `app.xtream.player` (se instala **junto** a OpenTV, no lo reemplaza).

## Instalar en Fire Stick

1. Activa **Aplicaciones de orígenes desconocidos** (Ajustes → Mi Fire TV → Opciones de desarrollador).
2. Instala **[Downloader](https://www.aftvnews.com/downloader/)** desde Amazon.
3. En Downloader escribe este código y pulsa Go:

```
8417717
```

Ese código (o [aftv.news/8417717](https://aftv.news/8417717)) apunta siempre a la APK más reciente.

Enlace directo (si Downloader pide URL):

```
https://github.com/WilliamCastilloP/XtreamPlayerPro/releases/latest/download/XTREAM.apk
```

Release: la APK más reciente en GitHub Releases (Downloader `8417717`). Versión actual de la app nativa: **0.16.1**.

**Actualizar:** a partir de 0.16.1 Android instala encima y conserva proveedores, favoritos e historial. En la app: **Ajustes → Acerca de → Buscar actualizaciones**. O vuelve a poner `8417717` en Downloader.

**Si tienes 0.16.0 o anterior y el Stick rechaza la instalación:** cada release de CI llevaba un sello distinto. Hay que **desinstalar XTREAM una vez**, instalar 0.16.1 con `8417717`, y de ahí en adelante ya no hace falta borrar.

Películas con catálogos enormes: la primera sync puede tardar minutos. Si la pestaña queda vacía: **Ajustes → Pantalla y reproducción → Contenido → Películas ↻**.

Favoritos: en Live TV, el chip **★ Favoritos** del guía. En **Películas** y **Series**, la fila **★ Favoritos** arriba del catálogo y el mismo chip junto a Categorías. Se marcan con la estrella en la ficha del título.

## Enlaces

- Código nativo (Fire TV): [`native/android`](native/android)
- Código web (PWA): [`src`](src)
- Upstream OpenTV (GPL-3.0): https://github.com/opentvproject/opentv
- Issues: https://github.com/WilliamCastilloP/XtreamPlayerPro/issues

La app nativa es **GPL-3.0-or-later** (hereda OpenTV). Si distribuyes la APK, el código de `native/android` también tiene que ser público.

## Compilar la APK en local

JDK 17 + Android SDK API 35:

```bash
cd native/android
./gradlew assembleDebug
```

APK: `native/android/app/build/outputs/apk/debug/`. GitHub Actions publica Releases en cada tag `v*` (p. ej. `v0.14.0`).

---

## Web PWA

### Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- hls.js for HLS playback
- Next.js API routes as Xtream + HLS proxy (avoids CORS)
- Playlists stored in `localStorage` on the device
- PWA-ready (`manifest.json` + service worker via `@ducanh2912/next-pwa`)

### Features (MVP)

- Multi-playlist: name + server URL + username + password
- Home filters: LIVE / MOVIES / SERIES with favorites + full category rails
- Live TV, Movies & Series catalogs (full panel lists, grouped by category)
- Global search across all types
- Continue watching + favorites per playlist
- Fullscreen player with load progress

### Local setup

```bash
npm install
npm run proxy   # terminal A — MKV→HLS on :8080
npm run dev     # terminal B — binds 0.0.0.0 for LAN
```

Open [http://localhost:3000](http://localhost:3000) on this PC.

**Phone on the same Wi‑Fi:** run `npm run lan:ready` to print your LAN URL (e.g. `http://192.168.x.x:3000`) and open firewall ports. Use that IP on the phone — never `localhost`. Keep `NEXT_PUBLIC_STREAM_PROXY_BASE=http://127.0.0.1:8080`; the client rewrites it to the PC IP automatically.

### Production build

```bash
npm run build
npm start
```

### Deploy (Vercel)

1. Push this repo to GitHub.
2. Import the project in [Vercel](https://vercel.com).
3. Deploy — every push to `main` rebuilds the PWA.

No server-side secrets are required. Xtream credentials never leave the browser except as request headers to your own API proxy, which forwards them to the Xtream panel.
