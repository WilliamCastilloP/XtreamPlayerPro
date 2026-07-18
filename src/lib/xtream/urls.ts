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

/**
 * Build playback candidates.
 * - Live: proxied HLS first (needs rewrite for hls.js), then direct HLS/TS
 * - VOD: DIRECT progressive file first (avoids proxying multi‑GB mp4s), then proxied HLS
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

  const push = (candidate: StreamCandidate) => {
    if (seen.has(candidate.url)) return;
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
    push({ url: m3u8, transport: "direct", label: "HLS (direct)" });
    push({ url: ts, transport: "direct", label: "MPEG-TS (direct)" });
    push({
      url: buildProxiedStreamUrl(bare),
      transport: "proxy",
      label: "Live (proxy)",
    });
    return out;
  }

  const fileExt =
    preferred && preferred !== "m3u8" ? preferred : "mp4";
  const fileUrl = buildDirectStreamUrl(credentials, kind, streamId, fileExt);
  const hlsUrl = buildDirectStreamUrl(credentials, kind, streamId, "m3u8");

  // Progressive download straight from the panel — do NOT proxy (crashes/OOM)
  push({
    url: fileUrl,
    transport: "direct",
    label: `${fileExt.toUpperCase()} (direct)`,
  });

  if (preferred && preferred !== fileExt && preferred !== "m3u8") {
    push({
      url: buildDirectStreamUrl(credentials, kind, streamId, preferred),
      transport: "direct",
      label: `${preferred.toUpperCase()} (direct)`,
    });
  }

  push({
    url: buildProxiedStreamUrl(hlsUrl),
    transport: "proxy",
    label: "HLS (proxy)",
  });

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

  if (/\.(mp4|mkv|avi|mov)(\?|$)/i.test(decoded)) return false;
  if (/\.ts(\?|$)/i.test(decoded)) return false;
  if (decoded.includes(".m3u8") || decoded.includes("mpegurl")) return true;

  // Extensionless live URLs are often HLS manifests
  return /\/live\/[^/]+\/[^/]+\/[^/.]+$/i.test(decoded);
}
