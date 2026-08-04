# Referencia rápida: protocolo Xtream Codes

No es un estándar oficial documentado por un solo organismo — es una convención de facto que siguen la mayoría de paneles IPTV. Los endpoints típicos (todos vía `player_api.php`):

## Autenticación / info de cuenta
```
GET /player_api.php?username={u}&password={p}
```
Devuelve `user_info` (auth, status, exp_date, max_connections, active_cons) e `server_info`.

## Categorías y streams
```
GET /player_api.php?username={u}&password={p}&action=get_live_categories
GET /player_api.php?username={u}&password={p}&action=get_live_streams&category_id={id}
GET /player_api.php?username={u}&password={p}&action=get_vod_categories
GET /player_api.php?username={u}&password={p}&action=get_vod_streams&category_id={id}
GET /player_api.php?username={u}&password={p}&action=get_series
GET /player_api.php?username={u}&password={p}&action=get_series_info&series_id={id}
```

## EPG
```
GET /player_api.php?username={u}&password={p}&action=get_short_epg&stream_id={id}
GET /xmltv.php?username={u}&password={p}   // EPG completo en formato XMLTV
```

## URLs de reproducción

Live TV:
```
http://{host}:{port}/live/{u}/{p}/{stream_id}.{ext}
```
`{ext}` = `ts` o `m3u8` según lo que soporte el panel (muchos soportan ambos para el mismo canal, hay que probar).

VOD:
```
http://{host}:{port}/movie/{u}/{p}/{stream_id}.{ext}
```

Series/episodio:
```
http://{host}:{port}/series/{u}/{p}/{episode_id}.{ext}
```

## Notas importantes para debugging

- No todos los paneles implementan todos los endpoints igual — hay variaciones entre proveedores.
- `max_connections` limita sesiones simultáneas; si la app abre varios `<video>` para precarga (ver performance-playbook.md), verifica que no cuentes esto como conexiones extra que agoten el límite del usuario.
- Los `stream_id` no son estables entre proveedores — no los hardcodees ni los cachees indefinidamente sin revalidar contra el catálogo actual.
