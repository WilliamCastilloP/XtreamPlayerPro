# Arquitectura del proyecto: app en Vercel + proxy en Oracle Cloud

## Topología actual

- **Frontend/app**: desplegado en Vercel.
- **Proxy de video**: desplegado por separado en una instancia de Oracle Cloud (Oracle Cloud Infrastructure / OCI), accesible vía una **IP pública** generada por Oracle (no un dominio, salvo que se haya configurado uno encima).
- **Objetivo original de esta separación**: desacoplar la carga/streaming de video de Vercel, para que las funciones serverless de Vercel (con sus límites de tiempo de ejecución y ancho de banda) no sean el cuello de botella ni el punto de falla para servir video — el proxy en una VM propia en Oracle puede mantener conexiones abiertas más tiempo y no está sujeto a los límites de ejecución de funciones serverless.

## Por qué esta separación es la decisión correcta (y qué hay que cuidar)

Separar el proxy de Vercel es buena idea porque:
- Las funciones serverless de Vercel típicamente tienen límites de duración de ejecución (varían según plan, pero son un límite duro). Un stream Live TV continuo puede exceder ese límite fácilmente, cortando la conexión.
- Una VM en Oracle corriendo el proxy (ej. Node/Express o Nginx) puede mantener conexiones de larga duración sin ese límite artificial.

Lo que hay que verificar que SÍ se haya migrado correctamente al mover el proxy a Oracle:
- Que el proxy en Oracle esté efectivamente haciendo streaming real (pipe) y no reutilizando lógica que originalmente vivía en una función serverless con supuestos de "responde rápido y termina" (ver `proxy-regression-live-vs-vod.md`, causa #2).
- Que no queden timeouts heredados de cuando el proxy corría en un entorno serverless (algunos frameworks copian configuración por defecto).
- Que CORS esté configurado en el proxy de Oracle (no en Vercel) — es el proxy quien responde al navegador ahora, así que los headers `Access-Control-Allow-Origin` deben salir de ahí.
- Que la IP pública de Oracle sea estable (revisar si es una IP efímera o reservada/estática — en OCI, si no se reservó explícitamente, la IP pública puede cambiar en un reinicio de la instancia, lo que rompería la app silenciosamente hasta actualizar la URL en el frontend).

## Preguntas a confirmar con el usuario cuando se audite este componente

- ¿La IP pública de Oracle es una IP reservada (estática) o efímera? Si es efímera, es un riesgo de que se rompa toda la app sin código nuevo, solo por un reinicio de la VM.
- ¿El proxy corre detrás de algo como Nginx/PM2 con restart automático, o es un proceso simple que si se cae no vuelve solo?
- ¿Hay HTTPS configurado en el proxy, o es HTTP plano sobre la IP pública? (relevante porque si el frontend en Vercel está en HTTPS y el proxy en HTTP plano, el navegador puede bloquear la petición por "mixed content" — este es OTRO candidato a causa de fallos silenciosos, revisar si aplica).
- ¿El proxy tiene una sola ruta genérica de reenvío o rutas diferenciadas por tipo de contenido? (ver `proxy-regression-live-vs-vod.md`)

Actualiza este archivo con las respuestas reales una vez confirmadas, para que quede como documentación viva del proyecto y no haya que re-preguntar en la próxima sesión.
