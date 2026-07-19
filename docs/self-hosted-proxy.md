# Plan: mover el proxy de streaming fuera de Vercel

> Estado: **EN STAND‑BY** hasta que haya acceso a una computadora para el setup.
> Este documento existe para no perder el plan. Cuando estés listo, sígelo paso a paso.

## El problema

La app está en Vercel. El plan gratuito (Hobby) incluye solo **10 GB/mes de
"Fast Origin Transfer"** y se **reinicia cada mes**. Cuando se agota, Vercel
**pausa el proyecto** hasta el mes siguiente.

Todo el video se transmite a través de la ruta `src/app/api/stream/route.ts`
(`/api/stream`), que corre en Vercel. Eso incluye:

- **TV en vivo** (segmentos HLS): ~1.5–2 GB por hora.
- **Remux de MKV** (películas/series): el archivo **completo** (p. ej. 2.4 GB
  por película).

Por eso 10 GB/mes se agotan enseguida (equivale a ~4 películas o unas pocas
horas de TV en vivo).

> Nota: las películas/series en **MP4** que se reproducen **directo** del panel
> (navegador → panel, sin proxy) **no** consumen Vercel. Solo consume lo que
> pasa por `/api/stream`.

## La solución

Separar los dos tipos de tráfico:

- La **app** (interfaz, ligera) se queda en **Vercel** (gratis, sin problema).
- El **proxy de video** (pesado) se muda a un host con mucho ancho de banda.

### Cambio de código necesario (pendiente de implementar)

Hacer el origen del proxy **configurable** con una variable de entorno, por
ejemplo `NEXT_PUBLIC_STREAM_PROXY_BASE`:

- Si **no** se define → todo sigue igual (proxy en Vercel). Nada se rompe.
- Si se define (ej. `https://mi-proxy.midominio.com`) → la app pide el **video**
  a ese servidor; solo la **interfaz** sigue en Vercel.

En el código, `buildProxiedStreamUrl()` (en `src/lib/xtream/urls.ts`) generaría
`${NEXT_PUBLIC_STREAM_PROXY_BASE}/api/stream?url=...` en vez de la ruta relativa
`/api/stream?url=...`. El mismo `route.ts` se despliega en el servidor externo
(es un handler estándar de Node; se puede correr como app Next mínima o portarlo
a un pequeño servidor Node/Express con la misma lógica).

## Opción recomendada (gratis): Oracle Cloud "Always Free"

- **Costo:** 0 USD permanente (no es prueba de 30 días).
- **Tráfico:** ~10 TB/mes de salida gratis (prácticamente ilimitado para uso
  personal).
- **Ventaja:** vive en la nube, no necesitas una PC encendida en casa.
- **Caveats:** piden una **tarjeta** para verificar (no cobran en Always Free);
  el registro/configuración es algo quisquilloso.

### Pasos (resumen)

1. Crear cuenta en Oracle Cloud (https://www.oracle.com/cloud/free/).
2. Crear una instancia **Always Free** (Ampere ARM, Ubuntu). Guardar la llave
   SSH.
3. Abrir el puerto del proxy en la Security List / firewall (ej. 443 o 8080).
4. Instalar Node.js en la instancia.
5. Copiar el proxy (la lógica de `src/app/api/stream/route.ts`) y correrlo con
   `pm2` o `systemd` para que quede siempre activo.
6. Poner un dominio + HTTPS (Cloudflare gratis o Caddy con Let's Encrypt).
7. En Vercel → Project Settings → Environment Variables, añadir
   `NEXT_PUBLIC_STREAM_PROXY_BASE=https://<tu-proxy>` y redeploy.

## Alternativas

### Hetzner (de pago, "simplemente funciona")

- ~4 €/mes, ~20 TB de tráfico, muy confiable y fácil de configurar.
- Mismos pasos 3–7 de arriba.

### Cloudflare Tunnel + PC en casa (gratis, sin nube)

- Requiere una computadora **siempre encendida** en casa.
- Instalas `cloudflared`, corres el proxy local y expones un túnel HTTPS gratis.
- El ancho de banda lo pone tu internet de casa. Costo 0.

## Mientras tanto

Para **probar** en el iPhone sin tocar Vercel: en una computadora corre
`npm run dev` y exponla por HTTPS con `npx cloudflared tunnel --url
http://localhost:3000`; abre esa URL en Safari del iPhone. El tráfico pasa por
tu computadora, no por Vercel.

## Checklist para retomar

- [ ] Conseguir acceso a una computadora.
- [ ] Elegir host (Oracle gratis / Hetzner / Cloudflare Tunnel).
- [ ] Implementar `NEXT_PUBLIC_STREAM_PROXY_BASE` en el código.
- [ ] Desplegar el proxy en el host elegido (con HTTPS + always‑on).
- [ ] Configurar la variable en Vercel y redeploy.
- [ ] Verificar que TV en vivo y remux ya no consumen "Fast Origin Transfer" en
      Vercel.
