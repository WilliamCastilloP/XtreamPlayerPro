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

export function buildProxiedStreamUrl(directUrl: string): string {
  return `/api/stream?url=${encodeURIComponent(directUrl)}`;
}

export type StreamCandidate = {
  url: string;
  /** direct = <video src> to panel; proxy = same-origin HLS/segment proxy */
  transport: "direct" | "proxy";
  label: string;
};

function pageIsHttps(): boolean {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://");
}

/** Hide credentials in debug logs shown on-device */
export function redactStreamUrl(url: string): string {
  try {
    const parsed = new URL(url, "http://local");
    const nested = parsed.searchParams.get("url");
    if (nested) {
      return `/api/stream?url=${redactDirectUrl(nested)}`;
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

/**
 * Build playback candidates.
 * On HTTPS apps, never use direct http:// panel URLs (mixed content blocks them).
 * For VOD, try the panel's preferred file extension first (many panels have no HLS).
 */
export function buildStreamCandidates(
  credentials: XtreamCredentials,
  kind: StreamKind,
  streamId: string | number,
  preferredExt?: string,
): StreamCandidate[] {
  const preferred = preferredExt?.replace(/^\./, "").toLowerCase();
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

    push({
      url: buildProxiedStreamUrl(m3u8),
      transport: "proxy",
      label: "HLS (proxy)",
    });
    push({
      url: buildProxiedStreamUrl(bare),
      transport: "proxy",
      label: "Live (proxy)",
    });
    push({ url: m3u8, transport: "direct", label: "HLS (direct)" });
    push({
      url: buildProxiedStreamUrl(ts),
      transport: "proxy",
      label: "MPEG-TS (proxy)",
    });
    push({ url: ts, transport: "direct", label: "MPEG-TS (direct)" });
    return out;
  }

  // VOD / series: prefer progressive file formats — many panels have no .m3u8 for movies
  const extOrder: string[] = [];
  if (preferred) extOrder.push(preferred);
  for (const ext of ["mp4", "mkv", "avi", "m3u8", "ts"]) {
    if (!extOrder.includes(ext)) extOrder.push(ext);
  }

  for (const ext of extOrder) {
    const direct = buildDirectStreamUrl(credentials, kind, streamId, ext);
    push({
      url: buildProxiedStreamUrl(direct),
      transport: "proxy",
      label: `${ext.toUpperCase()} (proxy)`,
    });
  }

  for (const ext of extOrder) {
    const direct = buildDirectStreamUrl(credentials, kind, streamId, ext);
    push({
      url: direct,
      transport: "direct",
      label: `${ext.toUpperCase()} (direct)`,
    });
  }

  return out;
}

export function looksLikeHlsUrl(url: string): boolean {
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
