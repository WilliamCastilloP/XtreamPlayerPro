/** Round numeric ratings to one decimal (8.426 → "8.4", 8.569 → "8.6"). */
export function formatRating(raw: string | number | null | undefined): string | undefined {
  if (raw == null) return undefined;
  const text = String(raw).trim();
  if (!text || text === "0" || text === "0.0") return undefined;
  const n = Number(text.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) {
    // Non-numeric ratings (rare) — show as-is
    return text;
  }
  const rounded = Math.round(n * 10) / 10;
  return rounded.toFixed(1);
}

export function formatRatingStar(
  raw: string | number | null | undefined,
): string | undefined {
  const value = formatRating(raw);
  return value ? `★ ${value}` : undefined;
}
