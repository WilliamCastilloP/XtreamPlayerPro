/** Xtream often sends genre as "Drama, Crimen, Misterio" or sometimes as a string[]. */

export function genreKey(name: string) {
  return name.trim().toLocaleLowerCase();
}

/** Split + trim + unique by case-insensitive key (keeps first casing). */
export function parseGenres(raw: unknown): string[] {
  if (raw == null) return [];
  const parts: string[] = [];
  if (Array.isArray(raw)) {
    for (const part of raw) parts.push(...parseGenres(part));
  } else if (typeof raw === "string") {
    for (const part of raw.split(/[,|/]/)) {
      const trimmed = part.trim();
      if (trimmed) parts.push(trimmed);
    }
  }
  const seen = new Map<string, string>();
  for (const g of parts) {
    const key = genreKey(g);
    if (!seen.has(key)) seen.set(key, g);
  }
  return [...seen.values()];
}

export function itemHasGenre(
  item: { genre?: unknown },
  genre: string,
): boolean {
  const target = genreKey(genre);
  if (!target) return false;
  return parseGenres(item.genre).some((g) => genreKey(g) === target);
}

/** Unique genres sorted A–Z, preserving first-seen display casing. */
export function collectGenres(items: { genre?: unknown }[]): string[] {
  const map = new Map<string, string>();
  for (const item of items) {
    for (const g of parseGenres(item.genre)) {
      const key = genreKey(g);
      if (!map.has(key)) map.set(key, g);
    }
  }
  return [...map.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

function itemIdentity(item: unknown): string {
  if (!item || typeof item !== "object") return "";
  const o = item as Record<string, unknown>;
  if (o.series_id != null) return `series:${o.series_id}`;
  if (o.stream_id != null) return `stream:${o.stream_id}`;
  return "";
}

export type GenreRail<T> = {
  genre: string;
  items: T[];
};

/** One rail per genre; titles with multiple genres appear in each matching rail. */
export function groupByGenre<T extends { genre?: unknown }>(
  items: T[],
): GenreRail<T>[] {
  const map = new Map<
    string,
    { label: string; items: T[]; seen: Set<string> }
  >();

  const pushUnique = (
    key: string,
    label: string,
    item: T,
  ) => {
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { label, items: [], seen: new Set() };
      map.set(key, bucket);
    }
    const id = itemIdentity(item) || `idx:${bucket.items.length}`;
    if (bucket.seen.has(id)) return;
    bucket.seen.add(id);
    bucket.items.push(item);
  };

  for (const item of items) {
    const genres = parseGenres(item.genre);
    if (!genres.length) {
      pushUnique("__ungenered__", "Other", item);
      continue;
    }
    for (const g of genres) {
      pushUnique(genreKey(g), g, item);
    }
  }

  const rails: GenreRail<T>[] = [];
  const other = map.get("__ungenered__");
  for (const [key, bucket] of map) {
    if (key === "__ungenered__") continue;
    if (bucket.items.length) {
      rails.push({ genre: bucket.label, items: bucket.items });
    }
  }
  rails.sort((a, b) =>
    a.genre.localeCompare(b.genre, undefined, { sensitivity: "base" }),
  );
  if (other?.items.length) {
    rails.push({ genre: other.label, items: other.items });
  }
  return rails;
}
