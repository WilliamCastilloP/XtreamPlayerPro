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

/** Serve from memory without network while younger than this. */
const TTL_FRESH_MS = 5 * 60 * 1000;
/** Serve stale from memory/IDB and revalidate in background. */
const TTL_STALE_MS = 45 * 60 * 1000;
const IDB_NAME = "xp-catalog";
const IDB_STORE = "buckets";
const IDB_VERSION = 1;

const memory = new Map<string, CacheBucket<unknown>>();
const revalidating = new Set<string>();

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

function ageOk(bucket: CacheBucket<unknown>, ttl: number) {
  return Date.now() - bucket.at < ttl;
}

function peek<T>(
  credentials: XtreamCredentials,
  part: string,
): T | undefined {
  const hit = peekMemory<T>(credentials, part);
  if (hit && ageOk(hit, TTL_STALE_MS)) return hit.data;
  return undefined;
}

async function readStale<T>(
  credentials: XtreamCredentials,
  part: string,
): Promise<T | undefined> {
  const k = key(credentials, part);
  const mem = memory.get(k) as CacheBucket<T> | undefined;
  if (mem && ageOk(mem, TTL_STALE_MS)) return mem.data;
  const disk = await idbGet<T>(k);
  if (disk && ageOk(disk, TTL_STALE_MS)) {
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

async function revalidate<T>(
  k: string,
  loader: () => Promise<T>,
): Promise<void> {
  if (revalidating.has(k)) return;
  revalidating.add(k);
  try {
    const data = await loader();
    store(k, data);
  } catch {
    /* keep stale */
  } finally {
    revalidating.delete(k);
  }
}

/**
 * Stale-while-revalidate:
 * - fresh memory → return immediately
 * - stale memory/IDB → return immediately + refresh in background
 * - miss → await network
 */
async function cached<T>(
  credentials: XtreamCredentials,
  part: string,
  loader: () => Promise<T>,
): Promise<T> {
  const k = key(credentials, part);
  const mem = memory.get(k) as CacheBucket<T> | undefined;
  if (mem && ageOk(mem, TTL_FRESH_MS)) return mem.data;

  if (mem && ageOk(mem, TTL_STALE_MS)) {
    void revalidate(k, loader);
    return mem.data;
  }

  const disk = await idbGet<T>(k);
  if (disk && ageOk(disk, TTL_STALE_MS)) {
    memory.set(k, disk);
    void revalidate(k, loader);
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
  parts: string[] = [
    "live-cats",
    "vod-cats",
    "series-cats",
    "live-all",
    "vod-all",
    "series-all",
  ],
) {
  await Promise.all(
    parts.map(async (part) => {
      const k = key(credentials, part);
      if (memory.has(k)) return;
      const disk = await idbGet(k);
      if (disk && ageOk(disk, TTL_STALE_MS)) memory.set(k, disk);
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
  const stale = await readStale<LiveStream[]>(credentials, "live-all");
  if (stale) {
    void revalidate(key(credentials, "live-all"), () =>
      getLiveStreams(credentials),
    );
    return filterByCategoryId(stale, categoryId);
  }
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
  const stale = await readStale<VodStream[]>(credentials, "vod-all");
  if (stale) {
    void revalidate(key(credentials, "vod-all"), () =>
      getVodStreams(credentials),
    );
    return filterByCategoryId(stale, categoryId);
  }
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
  const stale = await readStale<SeriesItem[]>(credentials, "series-all");
  if (stale) {
    void revalidate(key(credentials, "series-all"), () =>
      getSeries(credentials),
    );
    return filterByCategoryId(stale, categoryId);
  }
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
