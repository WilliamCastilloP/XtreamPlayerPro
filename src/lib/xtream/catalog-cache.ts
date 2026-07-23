import type { XtreamCredentials } from "./types";
import {
  getLiveCategories,
  getLiveStreams,
  getSeries,
  getSeriesCategories,
  getVodCategories,
  getVodStreams,
} from "./client";
import { itemHasGenre } from "./genres";
import type {
  LiveStream,
  SeriesItem,
  VodStream,
  XtreamCategory,
} from "./types";

type CacheBucket<T> = {
  at: number;
  data: T;
};

const TTL_MS = 5 * 60 * 1000;
const memory = new Map<string, CacheBucket<unknown>>();

function key(credentials: XtreamCredentials, part: string) {
  return `${credentials.serverUrl}|${credentials.username}|${part}`;
}

function peek<T>(
  credentials: XtreamCredentials,
  part: string,
): T | undefined {
  const hit = memory.get(key(credentials, part)) as CacheBucket<T> | undefined;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  return undefined;
}

async function cached<T>(
  credentials: XtreamCredentials,
  part: string,
  loader: () => Promise<T>,
): Promise<T> {
  const k = key(credentials, part);
  const hit = memory.get(k) as CacheBucket<T> | undefined;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const data = await loader();
  memory.set(k, { at: Date.now(), data });
  return data;
}

export function clearCatalogCache() {
  memory.clear();
}

export async function loadLiveCategories(credentials: XtreamCredentials) {
  return cached(credentials, "live-cats", () => getLiveCategories(credentials));
}

export async function loadVodCategories(credentials: XtreamCredentials) {
  return cached(credentials, "vod-cats", () => getVodCategories(credentials));
}

export async function loadSeriesCategories(credentials: XtreamCredentials) {
  return cached(credentials, "series-cats", () =>
    getSeriesCategories(credentials),
  );
}

/** Full live catalog (all channels) — matches Smarters completeness */
export async function loadAllLiveStreams(credentials: XtreamCredentials) {
  return cached(credentials, "live-all", () => getLiveStreams(credentials));
}

export async function loadAllVodStreams(credentials: XtreamCredentials) {
  return cached(credentials, "vod-all", () => getVodStreams(credentials));
}

export async function loadAllSeries(credentials: XtreamCredentials) {
  return cached(credentials, "series-all", () => getSeries(credentials));
}

function filterByCategoryId<T extends { category_id?: string }>(
  items: T[],
  categoryId: string,
) {
  if (categoryId === "uncategorized") {
    return items.filter((item) => !item.category_id);
  }
  return items.filter((item) => item.category_id === categoryId);
}

/**
 * Prefer slicing from the full-catalog cache when available so category pages
 * stay instant after BrowseRails has already loaded the panel once.
 */
export async function loadLiveByCategory(
  credentials: XtreamCredentials,
  categoryId: string,
) {
  const all = peek<LiveStream[]>(credentials, "live-all");
  if (all) return filterByCategoryId(all, categoryId);
  return cached(credentials, `live-cat-${categoryId}`, () =>
    getLiveStreams(credentials, categoryId),
  );
}

export async function loadVodByCategory(
  credentials: XtreamCredentials,
  categoryId: string,
) {
  const all = peek<VodStream[]>(credentials, "vod-all");
  if (all) return filterByCategoryId(all, categoryId);
  return cached(credentials, `vod-cat-${categoryId}`, () =>
    getVodStreams(credentials, categoryId),
  );
}

export async function loadSeriesByCategory(
  credentials: XtreamCredentials,
  categoryId: string,
) {
  const all = peek<SeriesItem[]>(credentials, "series-all");
  if (all) return filterByCategoryId(all, categoryId);
  return cached(credentials, `series-cat-${categoryId}`, () =>
    getSeries(credentials, categoryId),
  );
}

/** Movies/series browse by genre field (not panel category_id). */
export async function loadVodByGenre(
  credentials: XtreamCredentials,
  genre: string,
) {
  const all = await loadAllVodStreams(credentials);
  const seen = new Set<number | string>();
  return all.filter((item) => {
    if (!itemHasGenre(item, genre)) return false;
    if (seen.has(item.stream_id)) return false;
    seen.add(item.stream_id);
    return true;
  });
}

export async function loadSeriesByGenre(
  credentials: XtreamCredentials,
  genre: string,
) {
  const all = await loadAllSeries(credentials);
  const seen = new Set<number | string>();
  return all.filter((item) => {
    if (!itemHasGenre(item, genre)) return false;
    if (seen.has(item.series_id)) return false;
    seen.add(item.series_id);
    return true;
  });
}

export type GroupedRail<T> = {
  category: XtreamCategory;
  items: T[];
};

/** Group a full flat list by category_id using category metadata */
export function groupByCategory<T extends { category_id?: string }>(
  categories: XtreamCategory[],
  items: T[],
): GroupedRail<T>[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const id = item.category_id || "uncategorized";
    const list = map.get(id) || [];
    list.push(item);
    map.set(id, list);
  }

  const rails: GroupedRail<T>[] = [];
  for (const cat of categories) {
    const list = map.get(cat.category_id);
    if (list?.length) rails.push({ category: cat, items: list });
  }

  const orphan = map.get("uncategorized");
  if (orphan?.length) {
    rails.push({
      category: {
        category_id: "uncategorized",
        category_name: "Other",
      },
      items: orphan,
    });
  }

  return rails;
}

export type { LiveStream, SeriesItem, VodStream };
export {
  collectGenres,
  groupByGenre,
  itemHasGenre,
  parseGenres,
} from "./genres";
