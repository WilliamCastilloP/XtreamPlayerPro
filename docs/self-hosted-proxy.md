# Plan: proxy de video + MKV→HLS (velocidad tipo Netflix)

> El código del proxy ya convierte **MKV/AVI/MOV → HLS con ffmpeg**.
> Sin ese proxy, la app sigue remuxeando en el navegador (más lento).

## Idea

| Pieza | Dónde | Rol |
|-------|--------|-----|
| App (UI + catálogo) | Vercel o `npm run dev` | Ligera |
| Proxy de media | **Oracle / tu PC** (`npm run proxy`) | Bytes + **HLS** |
| Variable | `NEXT_PUBLIC_STREAM_PROXY_BASE` | Apunta la app al proxy |

## Local (fluido)

Necesitas **dos procesos** y **ffmpeg** instalado.

### 1. Instalar ffmpeg (Windows)

Con winget:

```powershell
winget install Gyan.FFmpeg
```

Cierra y abre la terminal, comprueba:

```powershell
ffmpeg -version
```

### 2. Arrancar el proxy (terminal A)

```powershell
cd ruta\a\XtreamPlayerPro
npm run proxy
```

Debería decir `ffmpeg: ok` y escuchar en `http://0.0.0.0:8080`.

Prueba: http://127.0.0.1:8080/health

### 3. Apuntar la app al proxy

En `.env.local`:

```env
NEXT_PUBLIC_STREAM_PROXY_BASE=http://127.0.0.1:8080
XTREAM_DEV_NAME=...
XTREAM_DEV_SERVER=...
XTREAM_DEV_USERNAME=...
XTREAM_DEV_PASSWORD=...
```

### 4. Arrancar Next (terminal B)

```powershell
# Si el panel falla por TLS:
$env:NODE_TLS_REJECT_UNAUTHORIZED=0
npm run dev
```

Abre la app, reproduce una movie MKV. En debug deberías ver algo como:

`MKV (server HLS)` + `engine=hls.js`

Si no aparece `server HLS`, la variable no se cargó → reinicia `npm run dev`.

> VPN: sí la necesitas si **tu PC** no alcanza el panel. El proxy local también sale por tu IP.

---

## Oracle Always Free (producción + mismo truco en local)

### 1. Crear la VM

1. https://www.oracle.com/cloud/free/
2. Create instance → **Ampere ARM**, Ubuntu, Always Free
3. Guarda la llave SSH (`.pem`)
4. Networking → Security List → Ingress:
   - TCP **22** (SSH)
   - TCP **8080** (proxy) o **443** si usas Caddy

### 2. Instalar Node + ffmpeg + proxy

SSH a la VM:

```bash
ssh -i tu-llave.pem ubuntu@IP_PUBLICA_ORACLE

sudo apt update
sudo apt install -y ffmpeg git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

git clone https://github.com/WilliamCastilloP/XtreamPlayerPro.git
cd XtreamPlayerPro
# solo hace falta el script; npm install no es obligatorio para el proxy

sudo npm install -g pm2
pm2 start scripts/stream-proxy.mjs --name xtream-proxy
pm2 save
pm2 startup
# sigue las instrucciones que imprime pm2 startup
```

Comprueba:

```bash
curl -s http://127.0.0.1:8080/health
# {"ok":true,"ffmpeg":true,...}
```

Abre en el firewall de Oracle el puerto **8080** hacia `0.0.0.0/0` (o solo tu IP).

### 3. HTTPS (recomendado)

Opción rápida: **Cloudflare Tunnel** (HTTPS gratis sin abrir 443):

```bash
# en la VM, tras instalar cloudflared
cloudflared tunnel --url http://127.0.0.1:8080
```

O Caddy con un dominio apuntando a la IP.

### 4. Variable en Vercel

```
NEXT_PUBLIC_STREAM_PROXY_BASE=https://TU-PROXY
```

**Redeploy** obligatorio (`NEXT_PUBLIC_*` se incrusta en el build).

### 5. Variable en local (opcional, misma fluidez)

```env
NEXT_PUBLIC_STREAM_PROXY_BASE=https://TU-PROXY
```

Así el remux HLS lo hace Oracle y tu PC/iPhone solo bajan segmentos.

---

## Qué mejora / qué no

| Setup | Movies MKV |
|-------|------------|
| Solo `npm run dev` (sin variable) | Remux en navegador (lento) |
| `npm run proxy` + variable local | **HLS en tu PC** → mucho más fluido |
| Oracle + variable (Vercel o local) | **HLS en Oracle** → fluido + no quema Vercel |

---

## Checklist

- [x] `/api/stream` byte-proxy
- [x] `/api/hls` MKV→HLS (ffmpeg)
- [x] App prioriza `server HLS` si hay `NEXT_PUBLIC_STREAM_PROXY_BASE`
- [ ] Instalar ffmpeg (PC y/o Oracle)
- [ ] Correr `npm run proxy`
- [ ] Poner la variable y reiniciar/redeploy
- [ ] Verificar en debug: `MKV (server HLS)`
