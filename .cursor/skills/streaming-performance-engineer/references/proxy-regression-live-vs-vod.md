# Patrón de regresión: "el proxy arregló VOD/series pero rompió Live TV"

Este es un patrón muy común y casi nunca es casualidad — Live TV y VOD/series se comportan de forma fundamentalmente distinta como streams de red, y un proxy configurado pensando en uno rara vez funciona bien para el otro sin ajustes explícitos.

## Por qué pasa esto (causas más probables, en orden de frecuencia)

### 1. Duración de la conexión: finita vs continua
- VOD/series son archivos con un final conocido. Un proxy puede recibir la petición, hacer streaming (o incluso buffer completo) de un archivo que eventualmente termina, y cerrar la conexión limpio.
- Live TV es un stream **continuo, sin fin conocido**. Si el proxy tiene cualquier timeout (ej. "cierra la conexión si no termina en 30s"), Live TV se corta o nunca llega a reproducir porque el timeout se dispara antes de que el usuario vea nada, mientras que VOD/series (más cortos en el request inicial o con un tamaño conocido) no lo disparan.

**Cómo confirmarlo:** revisa la configuración del proxy por timeouts (`timeout`, `proxyTimeout`, `keepAliveTimeout` en Node/Express, `proxy_read_timeout` en Nginx, límites de ejecución si es serverless/Cloudflare Worker). Si el proxy corre como función serverless (común si está pensado para Vercel-style), puede tener un límite duro de ejecución (ej. 10-60s) que mata cualquier conexión Live de larga duración — esto es especialmente relevante si en algún punto se probó correr el proxy en un entorno serverless antes de moverlo a Oracle.

### 2. Buffer completo vs streaming real (pipe)
- Un proxy mal implementado puede estar descargando la respuesta COMPLETA del panel Xtream antes de reenviarla al cliente. Para un archivo VOD de tamaño finito esto "funciona" (tarda un poco pero eventualmente responde). Para Live TV, que no tiene fin, esto **nunca responde** porque nunca termina de bufferear.

**Cómo confirmarlo:** busca en el código del proxy si usa algo como `response.pipe(res)` (correcto, streaming real) vs. acumular todo en un buffer/`Buffer.concat` antes de enviar (incorrecto para Live).

### 3. Manejo de manifests HLS con URLs relativas
- Si el proxy reescribe URLs dentro de un manifest `.m3u8` (para que los segmentos también pasen por el proxy), la lógica de reescritura puede estar hecha pensando en la estructura de VOD y no coincidir con cómo el panel Xtream nombra los segmentos de Live (que a veces usan rutas o nomenclatura distinta, ej. segmentos con timestamp variable en vivo vs índice fijo en VOD).

**Cómo confirmarlo:** pide el manifest Live TV a través del proxy directamente (curl o Network tab) y compáralo con el manifest VOD — revisa si las URLs de los segmentos (`.ts` dentro del `.m3u8`) apuntan correctamente al proxy o si quedaron rotas/apuntando al host original de Xtream (lo cual fallaría por CORS otra vez).

### 4. Content-Type / headers específicos de Live
- Algunos proxies fuerzan un `Content-Type` fijo (ej. `video/mp4` para VOD) que es incorrecto para un manifest HLS de Live (`application/vnd.apple.mpegurl` o `application/x-mpegURL`). El navegador o hls.js puede rechazar el contenido si el Content-Type no coincide con lo esperado.

### 5. Diferencia de rutas: ¿el proxy trata todo igual?
- Revisa si el proxy tiene UNA sola ruta genérica para cualquier tipo de contenido, o rutas distintas. Si es una sola ruta genérica, es más probable que la configuración (timeout, buffering) esté optimizada implícitamente para el caso que se probó primero (VOD/series) sin considerar Live.

## Cómo diagnosticar en este proyecto específico (Vercel + proxy en Oracle)

1. Con el proxy corriendo en la IP pública de Oracle, prueba directamente (sin pasar por el frontend en Vercel) tres requests: una Live, una VOD, una de series, usando `curl -v` o Postman, y compara:
   - Tiempo de respuesta hasta el primer byte.
   - Si la conexión se mantiene abierta indefinidamente (Live) o se cierra (VOD).
   - Headers de respuesta (`Content-Type`, `Transfer-Encoding: chunked` esperado para streaming real).
2. Revisa los logs del proxy en Oracle en el momento exacto de un intento de Live TV fallido — busca timeouts, excepciones, o cierres de conexión prematuros.
3. No asumas que "Live TV funcionaba antes del proxy, por lo tanto el problema es 100% el proxy" — confirma que el panel Xtream en sí sigue sirviendo Live TV correctamente probando la URL directa (sin proxy) primero, para descartar que el problema original (que motivó crear el proxy) haya sido otra cosa que regresó.

## Qué NO hacer

- No agregues buffering/timeout largo "para que funcione" sin entender la causa — puede enmascarar el síntoma y crear una app que tarda mucho en cargar Live TV en vez de arreglarlo de raíz.
- No reviertas el proxy completo para VOD/series con tal de arreglar Live — eso deshace el trabajo que sí sirvió. El objetivo es que el proxy trate ambos casos correctamente, no elegir uno.
