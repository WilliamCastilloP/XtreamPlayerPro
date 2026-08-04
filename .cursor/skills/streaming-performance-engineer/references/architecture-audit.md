# Auditoría de arquitectura actual ("qué hay in place")

Este paso es OBLIGATORIO antes de tocar código de reproducción cuando el proyecto ya tiene historial de cambios previos que arreglaron una cosa y rompieron otra (como el caso proxy → VOD/series funciona, Live TV se rompió). El objetivo es producir un mapa claro del estado real, no repararlo todavía.

## Qué inventariar

### 1. Topología de red / despliegue
- ¿Dónde vive el frontend? (ej. Vercel)
- ¿Dónde vive el proxy? (ej. Oracle Cloud, IP pública)
- ¿Cómo se comunican? — URL exacta del proxy que usa el frontend, protocolo (http/https), si hay dominio o es IP directa.
- ¿El proxy es genérico (reenvía cualquier URL) o tiene lógica específica por tipo de contenido (Live vs VOD vs series)?

Ver `references/proxy-architecture.md` para el patrón esperado en este proyecto (Vercel + Oracle).

### 2. Para cada tipo de contenido (Live TV, VOD, Series), documenta:
- ¿La URL del stream pasa por el proxy o va directo al panel Xtream?
- ¿Qué extensión/formato se pide (`.m3u8`, `.ts`, `.mp4`)?
- ¿Qué reproductor/librería se usa para reproducirlo (hls.js, `<video>` nativo, otro)?
- ¿Funciona hoy, sí o no? (confirmar probando, no asumir)

Arma una tabla así antes de proponer cualquier cambio:

| Tipo de contenido | ¿Pasa por proxy? | Formato pedido | Reproductor usado | ¿Funciona hoy? |
|---|---|---|---|---|
| Live TV | | | | |
| VOD | | | | |
| Series | | | | |

### 3. Historial de cambios relevante
- Busca en git log / commits recientes qué se tocó cuando se implementó el proxy (`git log --oneline -- <carpeta del proxy>`).
- Identifica si el proxy tiene lógica condicional que trata Live diferente de VOD/series (timeouts, headers, buffering, tipo de conexión).
- Si hay variables de entorno o configuración que apunten a distintos proxies/hosts según el tipo de contenido, documéntalas explícitamente.

### 4. Configuración del proxy en sí
- ¿Qué tecnología es? (Node/Express, Nginx, Cloudflare Worker, etc.)
- ¿Tiene timeout configurado? (crítico — ver `proxy-regression-live-vs-vod.md`, los streams Live son conexiones largas/continuas y un timeout pensado para VOD las corta)
- ¿Hace streaming real (pipe) o buffer completo antes de responder? (un proxy que buffer-ea todo el archivo antes de responder funciona bien para VOD finito, pero nunca terminará de responder para un stream Live continuo)
- ¿Maneja correctamente el content-type y los headers de range requests (`Range`, `Accept-Ranges`)? VOD/series dependen mucho de range requests para seek; Live no los usa igual.

## Entregable de esta fase

Antes de proponer NINGÚN fix, entrega al usuario:
1. La tabla de arriba completa.
2. Un diagnóstico de la causa más probable de por qué el proxy ayudó a VOD/series pero rompió Live (referenciar `proxy-regression-live-vs-vod.md`).
3. Una lista corta de opciones (no un solo camino forzado) para que el usuario decida, por ejemplo:
   - Opción A: el proxy solo debería aplicarse a VOD/series, Live TV va directo al panel Xtream (si el problema original de Live nunca fue del proxy).
   - Opción B: ajustar el proxy para que soporte streams continuos (sin buffer completo, sin timeout corto, con pipe real).
   - Opción C: dos rutas/paths distintos en el mismo proxy, cada uno con configuración apropiada a su tipo de contenido.

No implementes ninguna opción hasta que el usuario confirme cuál prefiere.
