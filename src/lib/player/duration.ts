/**
 * Parse Xtream / human duration strings into seconds.
 * Accepts "01:45:30", "1:45:30", "105", "105 min", "1h 45m", etc.
 */
export function parseMediaDuration(raw?: string | number | null): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw > 100000 ? raw / 1000 : raw; // ms vs seconds heuristic
  }
  const text = String(raw).trim();
  if (!text) return null;

  // HH:MM:SS or MM:SS
  const clock = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.\d+)?$/);
  if (clock) {
    const h = Number(clock[1] || 0);
    const m = Number(clock[2] || 0);
    const s = Number(clock[3] || 0);
    const total = h * 3600 + m * 60 + s;
    return total > 0 ? total : null;
  }

  const hours = text.match(/(\d+)\s*h/i);
  const mins = text.match(/(\d+)\s*m/i);
  if (hours || mins) {
    const total =
      Number(hours?.[1] || 0) * 3600 + Number(mins?.[1] || 0) * 60;
    return total > 0 ? total : null;
  }

  const asNum = Number(text.replace(/[^\d.]/g, ""));
  if (Number.isFinite(asNum) && asNum > 0) {
    // Bare numbers from panels are usually minutes if small, seconds if large
    if (asNum <= 600 && /min/i.test(text)) return Math.round(asNum * 60);
    if (asNum <= 300 && !/sec|s\b/i.test(text)) return Math.round(asNum * 60);
    return Math.round(asNum);
  }

  return null;
}
