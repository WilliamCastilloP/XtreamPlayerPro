import type { ContinueItem, FavoriteItem } from "@/lib/library/storage";
import {
  emitLibraryChange,
  listContinue,
  listFavorites,
} from "@/lib/library/storage";
import { getLocale, setLocale } from "@/lib/i18n/storage";
import type { Locale } from "@/lib/i18n/dictionaries";
import { getPlaylist } from "@/lib/playlists/storage";
import { normalizeServerUrl } from "@/lib/xtream/urls";
import type { XtreamCredentials } from "@/lib/xtream/types";
import type { SyncContinueDto } from "@/app/api/sync/continue/route";
import type { SyncFavoriteDto } from "@/app/api/sync/favorites/route";
import {
  getStoredSyncToken,
  getSyncAuthHeader,
  saveSyncToken,
  syncTokenMatchesCredentials,
} from "@/lib/sync/token";

function favKey(playlistId: string) {
  return `xp.favorites.${playlistId}`;
}

function recentKey(playlistId: string) {
  return `xp.continue.${playlistId}`;
}

function writeLocalFavorites(playlistId: string, items: FavoriteItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(favKey(playlistId), JSON.stringify(items));
  emitLibraryChange();
}

function writeLocalContinue(playlistId: string, items: ContinueItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(recentKey(playlistId), JSON.stringify(items));
  emitLibraryChange();
}

function favoriteFromDto(dto: SyncFavoriteDto): FavoriteItem {
  return {
    id: dto.id,
    kind: dto.kind,
    title: dto.title,
    image: dto.image,
    streamId: dto.streamId,
    addedAt: dto.addedAt,
  };
}

function continueFromDto(dto: SyncContinueDto): ContinueItem {
  return {
    id: dto.id,
    kind: dto.kind,
    title: dto.title,
    image: dto.image,
    streamId: dto.streamId,
    seriesId: dto.seriesId,
    season: dto.season,
    episode: dto.episode,
    extension: dto.extension,
    position: dto.position,
    duration: dto.duration,
    audioTrack: dto.audioTrack,
    subtitleTrack: dto.subtitleTrack,
    updatedAt: dto.updatedAt,
  };
}

function favoriteToDto(item: FavoriteItem): SyncFavoriteDto {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    image: item.image,
    streamId: String(item.streamId),
    addedAt: item.addedAt,
  };
}

function continueToDto(item: ContinueItem): SyncContinueDto {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    image: item.image,
    streamId: String(item.streamId),
    seriesId:
      item.seriesId != null ? String(item.seriesId) : undefined,
    season: item.season,
    episode: item.episode,
    extension: item.extension,
    position: item.position,
    duration: item.duration,
    audioTrack: item.audioTrack,
    subtitleTrack: item.subtitleTrack,
    updatedAt: item.updatedAt,
  };
}

function mergeFavorites(
  local: FavoriteItem[],
  remote: FavoriteItem[],
): FavoriteItem[] {
  const map = new Map<string, FavoriteItem>();
  for (const item of remote) map.set(item.id, item);
  for (const item of local) {
    const existing = map.get(item.id);
    if (!existing || item.addedAt >= existing.addedAt) {
      map.set(item.id, item);
    }
  }
  return [...map.values()].sort((a, b) => b.addedAt - a.addedAt);
}

function mergeContinue(
  local: ContinueItem[],
  remote: ContinueItem[],
): ContinueItem[] {
  const map = new Map<string, ContinueItem>();
  for (const item of remote) map.set(item.id, item);
  for (const item of local) {
    const existing = map.get(item.id);
    if (!existing || item.updatedAt >= existing.updatedAt) {
      map.set(item.id, item);
    }
  }
  return [...map.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 40);
}

function credentialsForPlaylist(playlistId: string): XtreamCredentials | null {
  const playlist = getPlaylist(playlistId);
  if (!playlist) return null;
  return {
    serverUrl: playlist.serverUrl,
    username: playlist.username,
    password: playlist.password,
  };
}

export async function syncAuth(
  credentials: XtreamCredentials,
): Promise<boolean> {
  try {
    const res = await fetch("/api/sync/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serverUrl: normalizeServerUrl(credentials.serverUrl),
        username: credentials.username.trim(),
        password: credentials.password,
      }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      token: string;
      userId: string;
      serverUrl: string;
      username: string;
      expiresAt: number;
    };
    saveSyncToken({
      token: data.token,
      userId: data.userId,
      serverUrl: data.serverUrl,
      username: data.username,
      expiresAt: data.expiresAt,
    });
    return true;
  } catch {
    return false;
  }
}

export async function ensureSyncAuth(
  credentials: XtreamCredentials,
): Promise<boolean> {
  if (syncTokenMatchesCredentials(credentials) && getStoredSyncToken()) {
    return true;
  }
  return syncAuth(credentials);
}

async function authHeaders(): Promise<Record<string, string> | null> {
  return getSyncAuthHeader();
}

export async function pullSync(playlistId: string): Promise<boolean> {
  const credentials = credentialsForPlaylist(playlistId);
  if (!credentials) return false;

  const authed = await ensureSyncAuth(credentials);
  if (!authed) return false;

  const headers = await authHeaders();
  if (!headers) return false;

  try {
    const [favRes, contRes, prefRes] = await Promise.all([
      fetch("/api/sync/favorites", { headers }),
      fetch("/api/sync/continue", { headers }),
      fetch("/api/sync/preferences", { headers }),
    ]);

    if (!favRes.ok || !contRes.ok || !prefRes.ok) return false;

    const favData = (await favRes.json()) as { favorites: SyncFavoriteDto[] };
    const contData = (await contRes.json()) as { continue: SyncContinueDto[] };
    const prefData = (await prefRes.json()) as {
      locale: Locale;
      updatedAt: number;
    };

    const localFavs = listFavorites(playlistId);
    const localCont = listContinue(playlistId);
    const remoteFavs = favData.favorites.map(favoriteFromDto);
    const remoteCont = contData.continue.map(continueFromDto);

    const mergedFavs = mergeFavorites(localFavs, remoteFavs);
    const mergedCont = mergeContinue(localCont, remoteCont);

    writeLocalFavorites(playlistId, mergedFavs);
    writeLocalContinue(playlistId, mergedCont);

    const localLocaleUpdated = Number(
      localStorage.getItem("xp.locale.updatedAt") || "0",
    );
    if (
      prefData.updatedAt > localLocaleUpdated &&
      prefData.locale !== getLocale()
    ) {
      setLocale(prefData.locale);
    }

    if (mergedFavs.length !== remoteFavs.length || mergedCont.length !== remoteCont.length) {
      await pushFavorites(playlistId);
      await pushContinueBatch(playlistId, mergedCont);
    }

    return true;
  } catch {
    return false;
  }
}

export async function pushFavorites(playlistId: string): Promise<void> {
  const credentials = credentialsForPlaylist(playlistId);
  if (!credentials || !syncTokenMatchesCredentials(credentials)) return;

  const auth = await authHeaders();
  if (!auth?.Authorization) return;

  const headers: Record<string, string> = {
    ...auth,
    "Content-Type": "application/json",
  };

  const favorites = listFavorites(playlistId).map(favoriteToDto);

  try {
    await fetch("/api/sync/favorites", {
      method: "PUT",
      headers,
      body: JSON.stringify({ favorites }),
    });
  } catch {
    // offline — local wins until next pull
  }
}

export async function pushContinue(
  playlistId: string,
  item: ContinueItem,
): Promise<void> {
  const credentials = credentialsForPlaylist(playlistId);
  if (!credentials || !syncTokenMatchesCredentials(credentials)) return;

  const auth = await authHeaders();
  if (!auth?.Authorization) return;

  const headers: Record<string, string> = {
    ...auth,
    "Content-Type": "application/json",
  };

  try {
    await fetch("/api/sync/continue", {
      method: "PUT",
      headers,
      body: JSON.stringify({ item: continueToDto(item) }),
    });
  } catch {
    // offline
  }
}

async function pushContinueBatch(
  playlistId: string,
  items: ContinueItem[],
): Promise<void> {
  for (const item of items) {
    await pushContinue(playlistId, item);
  }
}

export async function pushPreferences(locale: Locale): Promise<void> {
  const auth = await authHeaders();
  if (!auth?.Authorization) return;

  const headers: Record<string, string> = {
    ...auth,
    "Content-Type": "application/json",
  };

  try {
    await fetch("/api/sync/preferences", {
      method: "PUT",
      headers,
      body: JSON.stringify({ locale }),
    });
  } catch {
    // offline
  }
}

export function scheduleSyncAuth(credentials: XtreamCredentials) {
  void ensureSyncAuth(credentials);
}

export function schedulePullSync(playlistId: string) {
  void pullSync(playlistId);
}

export function schedulePushFavorites(playlistId: string) {
  void pushFavorites(playlistId);
}

const CONTINUE_SYNC_MIN_MS = 15_000;
const continueSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
const continueSyncLatest = new Map<string, ContinueItem>();

/** Debounce remote continue pushes — local storage stays immediate. */
export function schedulePushContinue(playlistId: string, item: ContinueItem) {
  const key = `${playlistId}:${item.id}`;
  continueSyncLatest.set(key, item);
  if (continueSyncTimers.has(key)) return;
  continueSyncTimers.set(
    key,
    setTimeout(() => {
      continueSyncTimers.delete(key);
      const latest = continueSyncLatest.get(key);
      continueSyncLatest.delete(key);
      if (latest) void pushContinue(playlistId, latest);
    }, CONTINUE_SYNC_MIN_MS),
  );
}

/** Flush pending continue sync immediately (pause / unmount). */
export function flushPushContinue(playlistId: string, item: ContinueItem) {
  const key = `${playlistId}:${item.id}`;
  const pending = continueSyncTimers.get(key);
  if (pending) {
    clearTimeout(pending);
    continueSyncTimers.delete(key);
  }
  continueSyncLatest.delete(key);
  void pushContinue(playlistId, item);
}

export function schedulePushPreferences(locale: Locale) {
  if (typeof window !== "undefined") {
    localStorage.setItem("xp.locale.updatedAt", String(Date.now()));
  }
  void pushPreferences(locale);
}
