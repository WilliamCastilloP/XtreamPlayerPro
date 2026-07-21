export type MediaTrackOption = {
  id: number;
  label: string;
  lang?: string;
  /** false = image-based (PGS/VobSub) — not renderable as VTT */
  text?: boolean;
};

/** Parse `#XTREAM-AUDIO:0|eng|English · ac3|txt,1|spa|…` style tags. */
export function parseXtreamTrackTag(line: string): MediaTrackOption[] {
  const raw = line.replace(/^#XTREAM-(?:AUDIO|SUBS):/i, "").trim();
  if (!raw) return [];
  const out: MediaTrackOption[] = [];
  for (const part of raw.split(",")) {
    const [idStr, lang = "", label = "", flags = "txt"] = part.split("|");
    const id = Number(idStr);
    if (!Number.isFinite(id)) continue;
    out.push({
      id,
      lang,
      label: label || `Track ${id + 1}`,
      text: flags !== "img",
    });
  }
  return out;
}

export function parseXtreamTracksFromPlaylist(text: string): {
  audio: MediaTrackOption[];
  subs: MediaTrackOption[];
} {
  let audio: MediaTrackOption[] = [];
  let subs: MediaTrackOption[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("#XTREAM-AUDIO:")) audio = parseXtreamTrackTag(line);
    if (line.startsWith("#XTREAM-SUBS:")) subs = parseXtreamTrackTag(line);
  }
  return { audio, subs };
}

export function buildServerHlsSubsUrl(
  hlsUrl: string,
  trackId: number,
): string | null {
  if (!hlsUrl.includes("/api/hls")) return null;
  try {
    const absolute = hlsUrl.startsWith("http")
      ? new URL(hlsUrl)
      : new URL(hlsUrl, "http://local");
    const upstream = absolute.searchParams.get("url");
    if (!upstream) return null;
    // Relative proxy paths (Next rewrite) vs absolute STREAM_PROXY_BASE.
    if (!hlsUrl.startsWith("http")) {
      return `/api/hls/subs?url=${encodeURIComponent(upstream)}&track=${trackId}`;
    }
    return `${absolute.origin}/api/hls/subs?url=${encodeURIComponent(upstream)}&track=${trackId}`;
  } catch {
    return null;
  }
}
