export type FavoriteItem = {
  id: string;
  kind: "live" | "movie" | "series";
  title: string;
  image?: string;
  streamId: number | string;
  addedAt: number;
};

export type ContinueItem = {
  id: string;
  kind: "live" | "movie" | "series";
  title: string;
  image?: string;
  streamId: number | string;
  seriesId?: number | string;
  season?: number;
  episode?: number;
  extension?: string;
  position?: number;
  duration?: number;
  updatedAt: number;
};

function favKey(playlistId: string) {
  return `xp.favorites.${playlistId}`;
}

function recentKey(playlistId: string) {
  return `xp.continue.${playlistId}`;
}

function canUseStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function listFavorites(playlistId: string): FavoriteItem[] {
  return readJson<FavoriteItem[]>(favKey(playlistId), []).sort(
    (a, b) => b.addedAt - a.addedAt,
  );
}

export function isFavorite(
  playlistId: string,
  kind: FavoriteItem["kind"],
  streamId: number | string,
): boolean {
  const id = `${kind}:${streamId}`;
  return listFavorites(playlistId).some((f) => f.id === id);
}

export function toggleFavorite(
  playlistId: string,
  item: Omit<FavoriteItem, "id" | "addedAt">,
): boolean {
  const id = `${item.kind}:${item.streamId}`;
  const current = listFavorites(playlistId);
  const exists = current.find((f) => f.id === id);
  if (exists) {
    writeJson(
      favKey(playlistId),
      current.filter((f) => f.id !== id),
    );
    return false;
  }
  writeJson(favKey(playlistId), [
    { ...item, id, addedAt: Date.now() },
    ...current,
  ]);
  return true;
}

export function listContinue(playlistId: string): ContinueItem[] {
  return readJson<ContinueItem[]>(recentKey(playlistId), []).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
}

export function upsertContinue(
  playlistId: string,
  item: Omit<ContinueItem, "id" | "updatedAt">,
) {
  const id = `${item.kind}:${item.streamId}`;
  const current = listContinue(playlistId).filter((c) => c.id !== id);
  const next: ContinueItem[] = [
    { ...item, id, updatedAt: Date.now() },
    ...current,
  ].slice(0, 40);
  writeJson(recentKey(playlistId), next);
}

export function clearLibraryForPlaylist(playlistId: string) {
  if (!canUseStorage()) return;
  localStorage.removeItem(favKey(playlistId));
  localStorage.removeItem(recentKey(playlistId));
}
