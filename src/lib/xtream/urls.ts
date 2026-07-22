import type { StreamKind, XtreamCredentials } from "./types";

export function normalizeServerUrl(serverUrl: string): string {
  const trimmed = serverUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return trimmed;
}

export function buildPlayerApiUrl(
  credentials: XtreamCredentials,
  params: Record<string, string | number | undefined> = {},
): string {
  const base = normalizeServerUrl(credentials.serverUrl);
  const url = new URL(`${base}/player_api.php`);
  url.searchParams.set("username", credentials.username);
  url.searchParams.set("password", credentials.password);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Xtream puts credentials in the path. Only encode chars that break URLs;
 * over-encoding (e.g. @ → %40) breaks many panels.
 */
function pathSegment(value: string): string {
  return value.replace(/[/#?%\\]/g, (ch) => encodeURIComponent(ch));
}

export function buildDirectStreamUrl(
  credentials: XtreamCredentials,
  kind: StreamKind,
  streamId: string | number,
  extension = "m3u8",
): string {
  const base = normalizeServerUrl(credentials.serverUrl);
  const pathKind = kind === "movie" ? "movie" : kind;
  const user = pathSegment(credentials.username);
  const pass = pathSegment(credentials.password);
  const ext = extension.replace(/^\./, "");
  if (!ext) {
    return `${base}/${pathKind}/${user}/${pass}/${streamId}`;
  }
  return `${base}/${pathKind}/${user}/${pass}/${streamId}.${ext}`;
}

/**
 * Optional absolute origin for the stream proxy (no trailing slash), e.g.
 * `https://proxy.example.com`. When unset, the app uses same-origin
 * `/api/stream` (Vercel). Set `NEXT_PUBLIC_STREAM_PROXY_BASE` to move heavy
 * video traffic off Vercel onto a VPS / Cloudflare Tunnel / etc.
 */
export function getStreamProxyBase(): string {
  const raw = (process.env.NEXT_PUBLIC_STREAM_PROXY_BASE || "").trim();
  if (!raw) return "";
  const base = raw.replace(/\/+$/, "");
  // Phone / LAN: env often says 127.0.0.1, but that is the phone itself.
  // When the page is opened via the PC's LAN IP, point the proxy at that host.
  if (typeof window !== "undefined") {
    const pageHost = window.location.hostname;
    if (pageHost && pageHost !== "localhost" && pageHost !== "127.0.0.1") {
      try {
        const parsed = new URL(base);
        if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
          parsed.hostname = pageHost;
          return parsed.origin;
        }
      } catch {
        /* keep base */
      }
    }
  }
  return base;
}

export function buildProxiedStreamUrl(directUrl: string): string {
  const path = `/api/stream?url=${encodeURIComponent(directUrl)}`;
  const base = getStreamProxyBase();
  return base ? `${base}${path}` : path;
}

/**
 * Server-side MKV→HLS on the standalone proxy (`npm run proxy` / Oracle).
 * Only available when NEXT_PUBLIC_STREAM_PROXY_BASE points at that service.
 */
export function buildServerHlsUrl(directUrl: string): string | null {
  const base = getStreamProxyBase();
  if (!base) return null;
  return `${base}/api/hls?url=${encodeURIComponent(directUrl)}`;
}

/** True for same-origin or absolute `/api/stream?...` URLs. */
export function isProxiedStreamUrl(url: string): boolean {
  if (url.startsWith("/api/stream") || url.startsWith("/api/hls")) return true;
  try {
    const parsed = new URL(url);
    return (
      parsed.pathname === "/api/stream" ||
      parsed.pathname.endsWith("/api/stream") ||
      parsed.pathname === "/api/hls" ||
      parsed.pathname.includes("/api/hls/")
    );
  } catch {
    return false;
  }
}

export type StreamCandidate = {
  url: string;
  /** direct = <video src> to panel; proxy = /api/stream (same-origin or STREAM_PROXY_BASE) */
  transport: "direct" | "proxy";
  label: string;
  /**
   * Browser cannot play this container natively (e.g. MKV).
   * Play via client remux (Mediabunny → fMP4) using the proxy URL for Range.
   */
  remux?: boolean;
};

function pageIsHttps(): boolean {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://");
}

function isHttpsUrl(url: string): boolean {
  return url.startsWith("https:");
}

/** Hide credentials in debug logs shown on-device */
export function redactStreamUrl(url: string): string {
  try {
    const parsed = new URL(url, "http://local");
    const nested = parsed.searchParams.get("url");
    if (nested) {
      const isHls =
        parsed.pathname === "/api/hls" || parsed.pathname.endsWith("/api/hls");
      const prefix =
        url.startsWith("http://") || url.startsWith("https://")
          ? `${parsed.origin}${isHls ? "/api/hls" : "/api/stream"}?url=`
          : `${isHls ? "/api/hls" : "/api/stream"}?url=`;
      return `${prefix}${redactDirectUrl(nested)}`;
    }
    return redactDirectUrl(url);
  } catch {
    return redactDirectUrl(url);
  }
}

function redactDirectUrl(url: string): string {
  return url.replace(
    /(\/(?:live|movie|series)\/[^/]+\/)([^/?#]+)(\/)/i,
    "$1***$3",
  );
}

function needsRemuxExt(ext: string): boolean {
  return ["mkv", "avi", "mov", "ts"].includes(ext);
}

function isNativeProgressiveExt(ext: string): boolean {
  return ["mp4", "m4v", "webm"].includes(ext);
}

/**
 * Build playback candidates.
 *
 * Live: prefer DIRECT HLS first (panel→CDN redirect + CORS), like before
 * the standalone proxy. Proxy is a CORS/rewrite fallback only.
 *
 * VOD/series:
 * - Prefer the panel's real extension only (don't spray .avi/.ts 404s).
 * - HTTPS panels: try DIRECT first for browser-native formats (phone→panel
 *   like Smarters). Hosting proxies often 502 on huge progressive files.
 * - MKV/AVI: mark remux + use proxy URL (Range chunks) for Mediabunny.
 */
export function buildStreamCandidates(
  credentials: XtreamCredentials,
  kind: StreamKind,
  streamId: string | number,
  preferredExt?: string,
): StreamCandidate[] {
  const preferred = (
    preferredExt?.replace(/^\./, "").toLowerCase() ||
    (kind === "live" ? "m3u8" : "mp4")
  );
  const out: StreamCandidate[] = [];
  const seen = new Set<string>();
  const httpsPage = pageIsHttps();

  const push = (candidate: StreamCandidate) => {
    if (seen.has(candidate.url)) return;
    if (
      candidate.transport === "direct" &&
      httpsPage &&
      isHttpUrl(candidate.url)
    ) {
      return;
    }
    seen.add(candidate.url);
    out.push(candidate);
  };

  if (kind === "live") {
    const m3u8 = buildDirectStreamUrl(credentials, kind, streamId, "m3u8");
    const ts = buildDirectStreamUrl(credentials, kind, streamId, "ts");
    const bare = buildDirectStreamUrl(credentials, kind, streamId, "");

    // Direct first — browser follows panel→CDN auth redirect and resolves
    // relative /hls/ segments against the CDN (proxy-first broke this path).
    push({ url: m3u8, transport: "direct", label: "HLS (direct)" });
    push({
      url: buildProxiedStreamUrl(m3u8),
      transport: "proxy",
      label: "HLS (proxy)",
    });
    push({ url: bare, transport: "direct", label: "Live (direct)" });
    push({
      url: buildProxiedStreamUrl(bare),
      transport: "proxy",
      label: "Live (proxy)",
    });
    push({ url: ts, transport: "direct", label: "MPEG-TS (direct)" });
    push({
      url: buildProxiedStreamUrl(ts),
      transport: "proxy",
      label: "MPEG-TS (proxy)",
    });
    return out;
  }

  const directPreferred = buildDirectStreamUrl(
    credentials,
    kind,
    streamId,
    preferred,
  );
  const proxyPreferred = buildProxiedStreamUrl(directPreferred);
  const remux = needsRemuxExt(preferred);

  // 0) Server HLS (Oracle / local `npm run proxy` + ffmpeg) — Netflix-like path
  if (remux) {
    const serverHls = buildServerHlsUrl(directPreferred);
    if (serverHls) {
      push({
        url: serverHls,
        transport: "proxy",
        label: `${preferred.toUpperCase()} (server HLS)`,
      });
    }
  }

  // 1) Native progressive on HTTPS → direct like Smarters (avoids proxy 502)
  if (isNativeProgressiveExt(preferred) && isHttpsUrl(directPreferred)) {
    push({
      url: directPreferred,
      transport: "direct",
      label: `${preferred.toUpperCase()} (direct)`,
    });
  }

  // 2) Preferred via proxy — required for remux (CORS-safe Range) and HTTP panels
  push({
    url: proxyPreferred,
    transport: "proxy",
    label: remux
      ? `${preferred.toUpperCase()} (remux)`
      : `${preferred.toUpperCase()} (proxy)`,
    remux,
  });

  // 3) If remux container on HTTPS, also keep direct as last-resort / external
  if (remux && isHttpsUrl(directPreferred)) {
    push({
      url: directPreferred,
      transport: "direct",
      label: `${preferred.toUpperCase()} (direct)`,
      remux: true,
    });
  }

  // 4) HLS alternate (some panels generate it)
  if (preferred !== "m3u8") {
    const hls = buildDirectStreamUrl(credentials, kind, streamId, "m3u8");
    if (isHttpsUrl(hls)) {
      push({ url: hls, transport: "direct", label: "M3U8 (direct)" });
    }
    push({
      url: buildProxiedStreamUrl(hls),
      transport: "proxy",
      label: "M3U8 (proxy)",
    });
  }

  // 5) MP4 fallback when preferred wasn't mp4 (some panels remux on the fly)
  if (preferred !== "mp4") {
    const mp4 = buildDirectStreamUrl(credentials, kind, streamId, "mp4");
    if (isHttpsUrl(mp4)) {
      push({ url: mp4, transport: "direct", label: "MP4 (direct)" });
    }
    push({
      url: buildProxiedStreamUrl(mp4),
      transport: "proxy",
      label: "MP4 (proxy)",
    });
  }

  return out;
}

export function looksLikeHlsUrl(url: string): boolean {
  // Server-side MKV→HLS playlist (must win before nested .mkv is inspected).
  if (url.includes("/api/hls")) return true;

  const decoded = (() => {
    try {
      const param = new URL(url, "http://local").searchParams.get("url");
      return param || url;
    } catch {
      return url;
    }
  })();

  if (/\.(mp4|mkv|avi|mov|m4v)(\?|$)/i.test(decoded)) return false;
  if (/\.ts(\?|$)/i.test(decoded)) return false;
  if (decoded.includes(".m3u8") || decoded.includes("mpegurl")) return true;

  // Extensionless live URLs are often HLS manifests
  return /\/live\/[^/]+\/[^/]+\/[^/.]+$/i.test(decoded);
}
