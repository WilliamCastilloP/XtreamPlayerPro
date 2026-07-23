/**
 * Only allow same-app relative paths for ?back= (no open redirects).
 */
export function safeInternalPath(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value) return fallback;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return fallback;
  if (decoded.includes("://")) return fallback;
  return decoded;
}

type BackLabels = {
  home: string;
  search: string;
  live: string;
  movies: string;
  series: string;
  favorites: string;
};

/** Label for the detail-page ← Back chip from a safe internal path. */
export function backLabelForPath(
  path: string,
  labels: BackLabels,
  fallback: "live" | "movies" | "series" | "home" = "home",
): string {
  const q = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
  const section = new URLSearchParams(q).get("section");

  if (path.startsWith("/search")) return labels.search;
  if (path.startsWith("/favorites")) return labels.favorites;
  if (
    section === "series" ||
    path.startsWith("/browse/series") ||
    path === "/series"
  ) {
    return labels.series;
  }
  if (
    section === "movies" ||
    path.startsWith("/browse/movies") ||
    path === "/movies"
  ) {
    return labels.movies;
  }
  if (
    section === "live" ||
    path.startsWith("/browse/live") ||
    path === "/live"
  ) {
    return labels.live;
  }
  if (fallback === "series") return labels.series;
  if (fallback === "movies") return labels.movies;
  if (fallback === "live") return labels.live;
  return labels.home;
}
