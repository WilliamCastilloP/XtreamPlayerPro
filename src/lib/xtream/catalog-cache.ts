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

/**
 * Catalog is persisted until the user refreshes from Account.
 * No automatic TTL / background revalidate.
 */
const IDB_NAME = "xp-catalog";
const IDB_STORE = "buckets";
const IDB_VERSION = 1;

const FULL_CATALOG_PARTS = [
  "live-cats",
  "vod-cats",
  "series-cats",
  "live-all",
  "vod-all",
  "series-all",
] as const;

const memory = new Map<string, CacheBucket<unknown>>();

function key(credentials: XtreamCredentials, part: string) {
  return `${credentials.serverUrl}|${credentials.username}|${part}`;
}

function canUseIdb() {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb open failed"));
  });
}

async function idbGet<T>(k: string): Promise<CacheBucket<T> | undefined> {
  if (!canUseIdb()) return undefined;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(k);
      req.onsuccess = () => resolve(req.result as CacheBucket<T> | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function idbSet<T>(k: string, bucket: CacheBucket<T>): Promise<void> {
  if (!canUseIdb()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(bucket, k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* quota / private mode */
  }
}

async function idbClear(): Promise<void> {
  if (!canUseIdb()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

function peekMemory<T>(
  credentials: XtreamCredentials,
  part: string,
): CacheBucket<T> | undefined {
  return memory.get(key(credentials, part)) as CacheBucket<T> | undefined;
}

function peek<T>(
  credentials: XtreamCredentials,
  part: string,
): T | undefined {
  return peekMemory<T>(credentials, part)?.data;
}

async function readCached<T>(
  credentials: XtreamCredentials,
  part: string,
): Promise<T | undefined> {
  const k = key(credentials, part);
  const mem = memory.get(k) as CacheBucket<T> | undefined;
  if (mem) return mem.data;
  const disk = await idbGet<T>(k);
  if (disk) {
    memory.set(k, disk);
    return disk.data;
  }
  return undefined;
}

function store<T>(k: string, data: T) {
  const bucket: CacheBucket<T> = { at: Date.now(), data };
  memory.set(k, bucket);
  void idbSet(k, bucket);
}

/**
 * Memory → IndexedDB → network. Once stored, never auto-refetches
 * until clearCatalogCache() / force preload from Account.
 */
async function cached<T>(
  credentials: XtreamCredentials,
  part: string,
  loader: () => Promise<T>,
): Promise<T> {
  const k = key(credentials, part);
  const mem = memory.get(k) as CacheBucket<T> | undefined;
  if (mem) return mem.data;

  const disk = await idbGet<T>(k);
  if (disk) {
    memory.set(k, disk);
    return disk.data;
  }

  const data = await loader();
  store(k, data);
  return data;
}

export function clearCatalogCache() {
  memory.clear();
  void idbClear();
}

/** Warm IDB → memory for instant first paint (call on app mount). */
export async function hydrateCatalogCache(
  credentials: XtreamCredentials,
  parts: string[] = [...FULL_CATALOG_PARTS],
) {
  await Promise.all(
    parts.map(async (part) => {
      const k = key(credentials, part);
      if (memory.has(k)) return;
      const disk = await idbGet(k);
      if (disk) memory.set(k, disk);
    }),
  );
}

/** True when live/VOD/series catalogs (+ categories) are already on disk/memory. */
export async function hasFullCatalogCached(
  credentials: XtreamCredentials,
): Promise<boolean> {
  for (const part of FULL_CATALOG_PARTS) {
    const k = key(credentials, part);
    if (memory.has(k)) continue;
    const disk = await idbGet(k);
    if (!disk) return false;
    memory.set(k, disk);
  }
  return true;
}

export type CatalogPreloadProgress = {
  done: number;
  total: number;
  part: string;
};

/**
 * Ensure the full catalog is in memory + IndexedDB.
 * Pass `force: true` to hit the network even when a cache entry exists
 * (Account → Refresh playlist; typically after clearCatalogCache()).
 */
export async function preloadFullCatalog(
  credentials: XtreamCredentials,
  options?: {
    force?: boolean;
    onProgress?: (progress: CatalogPreloadProgress) => void;
  },
): Promise<void> {
  if (!options?.force) {
    await hydrateCatalogCache(credentials);
    if (await hasFullCatalogCached(credentials)) {
      options?.onProgress?.({
        done: FULL_CATALOG_PARTS.length,
        total: FULL_CATALOG_PARTS.length,
        part: "done",
      });
      return;
    }
  }

  const loaders: { part: string; run: () => Promise<unknown> }[] = options
    ?.force
    ? [
        {
          part: "live-cats",
          run: async () => {
            const data = await getLiveCategories(credentials);
            store(key(credentials, "live-cats"), data);
          },
        },
        {
          part: "vod-cats",
          run: async () => {
            const data = await getVodCategories(credentials);
            store(key(credentials, "vod-cats"), data);
          },
        },
        {
          part: "series-cats",
          run: async () => {
            const data = await getSeriesCategories(credentials);
            store(key(credentials, "series-cats"), data);
          },
        },
        {
          part: "live-all",
          run: async () => {
            const data = await getLiveStreams(credentials);
            store(key(credentials, "live-all"), data);
          },
        },
        {
          part: "vod-all",
          run: async () => {
            const data = await getVodStreams(credentials);
            store(key(credentials, "vod-all"), data);
          },
        },
        {
          part: "series-all",
          run: async () => {
            const data = await getSeries(credentials);
            store(key(credentials, "series-all"), data);
          },
        },
      ]
    : [
        { part: "live-cats", run: () => loadLiveCategories(credentials) },
        { part: "vod-cats", run: () => loadVodCategories(credentials) },
        { part: "series-cats", run: () => loadSeriesCategories(credentials) },
        { part: "live-all", run: () => loadAllLiveStreams(credentials) },
        { part: "vod-all", run: () => loadAllVodStreams(credentials) },
        { part: "series-all", run: () => loadAllSeries(credentials) },
      ];

  let done = 0;
  const total = loaders.length;
  await Promise.all(
    loaders.map(async ({ part, run }) => {
      await run();
      done += 1;
      options?.onProgress?.({ done, total, part });
    }),
  );
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
  const disk = await readCached<LiveStream[]>(credentials, "live-all");
  if (disk) return filterByCategoryId(disk, categoryId);
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
  const disk = await readCached<VodStream[]>(credentials, "vod-all");
  if (disk) return filterByCategoryId(disk, categoryId);
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
  const disk = await readCached<SeriesItem[]>(credentials, "series-all");
  if (disk) return filterByCategoryId(disk, categoryId);
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
