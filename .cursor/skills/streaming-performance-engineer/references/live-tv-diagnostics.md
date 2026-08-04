# Diagnóstico: Live TV no reproduce (404 / timeout en el manifest)

Sigue estos pasos EN ORDEN. No pases al siguiente hasta descartar el anterior. El objetivo es aislar si el problema está en (A) la construcción de la URL, (B) la autenticación/panel Xtream, (C) CORS/proxy, o (D) el reproductor.

## Paso 1 — Verifica cómo se construye la URL del stream

Xtream Codes construye las URLs de Live TV con este patrón:

```
http://{host}:{port}/live/{username}/{password}/{stream_id}.{ext}
```

Donde `{ext}` suele ser `ts` (MPEG-TS directo) o `m3u8` (HLS) según el panel. Errores comunes:

- Falta el `.m3u8` o `.ts` al final, o se usa la extensión equivocada para lo que el panel realmente sirve.
- El `stream_id` viene de `get_live_streams` como `stream_id` (número), no confundir con `epg_channel_id` (string).
- Doble slash o falta de slash entre password y stream_id.
- Puerto por defecto (80/443) omitido cuando el panel lo requiere explícito.

**Acción:** imprime/loggea la URL final ANTES de pasarla al reproductor y compárala manualmente pegándola en el navegador o en VLC. Si en VLC funciona pero en la app no, el problema es del reproductor (ir a Paso 4). Si tampoco funciona en VLC, el problema es de URL/autenticación (Paso 2).

## Paso 2 — Verifica autenticación y estado de la cuenta

Antes de tocar el player, confirma con una llamada simple:

```
http://{host}:{port}/player_api.php?username={u}&password={p}
```

Revisa en la respuesta JSON:
- `auth: 1` (si es 0, credenciales inválidas o cuenta vencida)
- `status` del usuario (activo/expirado)
- `max_connections` vs conexiones activas — muchos paneles bloquean si ya hay una sesión abierta en otro dispositivo/pestaña.

**Errores 404 en el manifest casi siempre son esto**, no un bug del reproductor: cuenta expirada, IP bloqueada por el proveedor, o límite de conexiones simultáneas alcanzado.

## Paso 3 — Verifica CORS y el proxy (crítico en web)

Como es una app **web**, el navegador aplica CORS. Muchos paneles Xtream no mandan headers CORS (`Access-Control-Allow-Origin`), lo que hace que la petición falle silenciosamente o aparezca como error genérico de red (a veces se ve como "404" en herramientas de dev aunque el servidor sí respondió 200).

**Acción:**
1. Abre DevTools > Network, filtra por el nombre del stream.
2. Si ves el request en rojo con `(failed) net::ERR_FAILED` o similar (no un 404 real del servidor) → es CORS, no la URL.
3. Solución: usar un proxy propio (backend Node/Cloudflare Worker) que reenvíe la petición al panel Xtream y agregue los headers CORS necesarios. NO intentes desactivar CORS del lado del cliente, eso no es posible ni seguro.

## Paso 4 — Verifica el reproductor según el tipo de stream

- Si el panel sirve `.m3u8` (HLS) → confirma que estás usando **hls.js** (o Safari nativo, que soporta HLS de forma nativa) y no un `<video src=...>` plano, que no soporta HLS en Chrome/Firefox.
- Si el panel sirve `.ts` crudo (MPEG-TS) → el navegador **no puede reproducir esto directamente**, ningún `<video>` tag lo soporta de forma nativa. Necesitas:
  - Pedir al panel la variante `.m3u8` si existe (muchos paneles Xtream sirven ambas para el mismo canal), o
  - Transcodificar en un servidor intermedio con ffmpeg a HLS.
- Revisa la consola del navegador en el momento exacto del intento de play — hls.js expone eventos de error (`Hls.Events.ERROR`) con `data.type` y `data.details` que dicen exactamente si fue `networkError`, `mediaError`, o `manifestParsingError`.

## Checklist de verificación final

- [ ] La URL final coincide con el patrón correcto de Xtream y funciona pegada en VLC
- [ ] `player_api.php` devuelve `auth: 1` y cuenta activa
- [ ] No hay error de CORS en Network tab (o ya existe proxy que lo resuelve)
- [ ] El reproductor usado coincide con el formato servido (hls.js para `.m3u8`, transcodificación si es `.ts`)
- [ ] Los eventos de error de hls.js fueron revisados en consola, no solo asumidos
