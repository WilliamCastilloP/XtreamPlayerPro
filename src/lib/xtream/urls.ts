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

/** Path-safe credential segment (Xtream expects these in the URL path). */
function pathSegment(value: string): string {
  return encodeURIComponent(value).replace(/%40/g, "@");
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

/**
 * Candidate stream URLs for a given asset. Order matters: first success wins.
 * Live panels vary between HLS (.m3u8) and MPEG-TS (.ts).
 */
export function buildStreamCandidates(
  credentials: XtreamCredentials,
  kind: StreamKind,
  streamId: string | number,
  preferredExt?: string,
): string[] {
  const preferred = preferredExt?.replace(/^\./, "").toLowerCase();
  const extensions: string[] =
    kind === "live"
      ? ["m3u8", "ts", ""]
      : preferred
        ? [preferred, preferred === "m3u8" ? "mp4" : "m3u8", "mp4", "mkv", "ts"]
        : ["mp4", "m3u8", "mkv", "ts"];

  const seen = new Set<string>();
  const urls: string[] = [];
  for (const ext of extensions) {
    const direct = buildDirectStreamUrl(credentials, kind, streamId, ext);
    if (seen.has(direct)) continue;
    seen.add(direct);
    urls.push(buildProxiedStreamUrl(direct));
  }
  return urls;
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

  if (/\.(mp4|mkv|avi|mov)(\?|$)/i.test(decoded)) return false;
  if (/\.ts(\?|$)/i.test(decoded)) return false;
  if (decoded.includes(".m3u8") || decoded.includes("mpegurl")) return true;

  // Extensionless live URLs are often HLS manifests
  return /\/live\/[^/]+\/[^/]+\/[^/.]+$/i.test(decoded);
}
