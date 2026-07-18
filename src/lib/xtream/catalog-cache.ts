import type { XtreamCredentials } from "./types";
import {
  getLiveCategories,
  getLiveStreams,
  getSeries,
  getSeriesCategories,
  getVodCategories,
  getVodStreams,
} from "./client";
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

export async function loadLiveByCategory(
  credentials: XtreamCredentials,
  categoryId: string,
) {
  return cached(credentials, `live-cat-${categoryId}`, () =>
    getLiveStreams(credentials, categoryId),
  );
}

export async function loadVodByCategory(
  credentials: XtreamCredentials,
  categoryId: string,
) {
  return cached(credentials, `vod-cat-${categoryId}`, () =>
    getVodStreams(credentials, categoryId),
  );
}

export async function loadSeriesByCategory(
  credentials: XtreamCredentials,
  categoryId: string,
) {
  return cached(credentials, `series-cat-${categoryId}`, () =>
    getSeries(credentials, categoryId),
  );
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
