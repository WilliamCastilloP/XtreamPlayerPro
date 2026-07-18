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

export function buildDirectStreamUrl(
  credentials: XtreamCredentials,
  kind: StreamKind,
  streamId: string | number,
  extension = "m3u8",
): string {
  const base = normalizeServerUrl(credentials.serverUrl);
  const pathKind = kind === "movie" ? "movie" : kind;
  return `${base}/${pathKind}/${encodeURIComponent(credentials.username)}/${encodeURIComponent(credentials.password)}/${streamId}.${extension}`;
}

export function buildProxiedStreamUrl(
  credentials: XtreamCredentials,
  kind: StreamKind,
  streamId: string | number,
  extension = "m3u8",
): string {
  const direct = buildDirectStreamUrl(credentials, kind, streamId, extension);
  return `/api/stream?url=${encodeURIComponent(direct)}`;
}
