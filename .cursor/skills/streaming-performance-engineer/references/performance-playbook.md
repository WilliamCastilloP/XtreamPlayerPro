# Playbook de Performance (estrategias tipo Netflix)

Aplica estas técnicas EN ESTE ORDEN. Cada una depende de que la anterior ya esté funcionando. No implementes precarga predictiva si el ABR básico ni siquiera está configurado.

## 1. Caché del catálogo (mayor impacto, menor esfuerzo)

El listado de canales/VOD/EPG de Xtream Codes (`get_live_streams`, `get_vod_streams`, `get_series`, EPG) es la petición más pesada y la que menos cambia. Nunca debe pedirse completa en cada carga de la app.

- Guarda la respuesta en `IndexedDB` (preferido sobre `localStorage` por tamaño — el catálogo puede ser grande) con timestamp.
- TTL sugerido: 30-60 min para catálogo, 15 min para EPG (cambia más seguido).
- Al abrir la app: muestra el catálogo cacheado INMEDIATAMENTE, y dispara el refresh en segundo plano (patrón stale-while-revalidate). El usuario nunca debe ver una pantalla vacía esperando la red si ya hay datos previos.
- Pide por categoría bajo demanda en vez de todo el árbol de una vez, si el panel lo permite via `category_id`.

## 2. ABR real con hls.js (o Shaka Player)

No confíes en el `<video>` nativo para HLS fuera de Safari. Configuración base recomendada:

```javascript
const hls = new Hls({
  maxBufferLength: 30,
  maxMaxBufferLength: 60,
  liveSyncDurationCount: 3,     // solo relevante para live
  startLevel: -1,               // deja que el ABR elija el nivel inicial
  abrEwmaDefaultEstimate: 5000000,
  capLevelToPlayerSize: true,   // no descargues 1080p en un player chico
});
hls.on(Hls.Events.ERROR, (event, data) => {
  // loggear data.type / data.details — nunca tragarse el error silenciosamente
});
```

Si el panel Xtream solo sirve `.ts` crudo sin variante HLS, esto no aplica directamente — ver la sección de transcodificación en `live-tv-diagnostics.md` Paso 4. No hay ABR posible sobre un único stream de bitrate fijo sin transcodificar.

## 3. Precarga del "hero" / última reproducción

- Al abrir la app, si hay un canal/episodio "último visto" o destacado, inicia `hls.loadSource()` + `hls.attachMedia()` en un `<video>` oculto/muteado apenas carga la pantalla principal — no esperes a que el usuario toque play.
- Esto hace que el primer play se sienta instantáneo porque ya hay segmentos en buffer.
- Ojo: no hagas esto para más de 1-2 elementos a la vez, satura ancho de banda y contradice el punto 5 (paralelización con cabeza).

## 4. Precarga predictiva de "siguiente contenido"

- **Series/VOD:** si el usuario está en el episodio N, empieza a descargar los primeros segmentos (no el manifest completo) del episodio N+1 cuando quede ~1 minuto del actual.
- **Live TV en grilla/zapping:** si el usuario navega la lista de canales, precarga el manifest (no el video completo) de los 2-3 canales adyacentes al que tiene foco, para que el cambio de canal sea instantáneo.
- Cancela precargas pendientes agresivamente si el usuario sigue navegando rápido (debounce ~300-500ms) para no desperdiciar ancho de banda en contenido que no va a ver.

## 5. Paralelización de requests de arranque

Error común: login → esperar → categorías → esperar → EPG, todo en cadena. En vez de eso:

```javascript
const [categories, userProfile, lastWatched] = await Promise.all([
  fetchXtream('get_live_categories'),
  getUserProfile(),
  getLastWatchedFromCache(),
]);
```

Solo encadena lo que realmente depende entre sí (ej. necesitas el `auth` antes de pedir streams).

## 6. Percepción de velocidad (aunque no cambie la velocidad real)

- Skeleton screens con la forma real del contenido en vez de spinners genéricos — evita saltos de layout.
- Miniaturas/logos de canales: lazy load fuera del viewport, carga inmediata solo de lo visible.
- Optimiza el formato/tamaño de las imágenes de logos de canales (muchos paneles Xtream devuelven logos sin optimizar — considera un proxy de imágenes con resize/cache, ej. Cloudflare Images o un resize simple en tu backend).

## Cómo medir que esto realmente funciona

No asumas mejora — mide:
- Time to First Frame (TTFF): desde tap en play hasta primer frame visible.
- Time to Interactive del catálogo: desde abrir la app hasta que la grilla es scrolleable con datos reales.
- Rebuffer ratio: tiempo en estado de buffering / tiempo total de reproducción.

Usa `performance.now()` alrededor de estos eventos y loggea a consola o a un endpoint propio de analítica — no hace falta una librería pesada para empezar.
