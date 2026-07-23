/** Prefer panel `title` over verbose `name`, then tidy common suffixes. */
export function catalogTitle(item: {
  name?: string;
  title?: string;
}): string {
  const raw = (item.title?.trim() || item.name?.trim() || "").trim();
  if (!raw) return "";

  let text = raw;
  // Continue-watching style: "Series (2016) · Episode…" → series only
  text = text.split(/\s+·\s+/)[0]?.trim() || text;
  // "American Crime (2015)" → "American Crime"
  text = text.replace(/\s*\(\d{4}\)\s*$/u, "").trim();
  // "Walking Dead - S01E06 - Capítulo…" → "Walking Dead"
  text = text.replace(/\s*[-–—]\s*S\d{1,2}E\d{1,3}\b.*$/iu, "").trim();
  // "Show Name | S01E02" variants
  text = text.replace(/\s*[|·]\s*S\d{1,2}E\d{1,3}\b.*$/iu, "").trim();
  // Panel noise: "Trial audio", "Multi Audio", etc.
  text = text
    .replace(
      /\s*[-–—|·:/]\s*(trial\s*audio|multi\s*audio|dual\s*audio|trial|sample)\s*$/iu,
      "",
    )
    .trim();
  text = text
    .replace(
      /\s*\((trial\s*audio|multi\s*audio|dual\s*audio|trial|sample)\)\s*$/iu,
      "",
    )
    .trim();
  text = text
    .replace(/\b(trial\s*audio|multi\s*audio|dual\s*audio)\b\s*$/iu, "")
    .trim();
  // Leftover dangling separators
  text = text.replace(/\s*[-–—|·:/]+\s*$/u, "").trim();

  return text || raw;
}
