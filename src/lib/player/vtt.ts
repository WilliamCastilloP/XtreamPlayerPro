export type VttCue = {
  start: number;
  end: number;
  text: string;
};

function parseTimestamp(value: string): number | null {
  const parts = value.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const secPart = parts[parts.length - 1]!;
  const minutes = Number(parts[parts.length - 2]);
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  const seconds = Number(secPart.replace(",", "."));
  if (![hours, minutes, seconds].every((n) => Number.isFinite(n))) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

/** Minimal WebVTT parser for softsubs from the ffmpeg proxy. */
export function parseWebVtt(raw: string): VttCue[] {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const blocks = text.split(/\n\n+/);
  const cues: VttCue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    if (!lines.length) continue;
    if (/^WEBVTT/i.test(lines[0]!) || /^NOTE\b/i.test(lines[0]!)) continue;

    let timeLine = lines[0]!;
    let textStart = 1;
    if (!timeLine.includes("-->") && lines[1]?.includes("-->")) {
      timeLine = lines[1]!;
      textStart = 2;
    }
    if (!timeLine.includes("-->")) continue;

    const [startRaw, endRaw] = timeLine.split("-->").map((s) => s.trim());
    const start = parseTimestamp((startRaw || "").split(/\s+/)[0] || "");
    const end = parseTimestamp((endRaw || "").split(/\s+/)[0] || "");
    if (start == null || end == null || end <= start) continue;

    const body = lines
      .slice(textStart)
      .join("\n")
      .replace(/<\/?[^>]+>/g, "")
      .trim();
    if (!body) continue;
    cues.push({ start, end, text: body });
  }

  cues.sort((a, b) => a.start - b.start);
  return cues;
}

export function cueTextAt(cues: VttCue[], timeSec: number): string {
  if (!cues.length || !Number.isFinite(timeSec)) return "";
  // Linear scan is fine for typical softsub sizes; keep last match.
  let text = "";
  for (const cue of cues) {
    if (cue.start > timeSec) break;
    if (timeSec >= cue.start && timeSec < cue.end) text = cue.text;
  }
  return text;
}
