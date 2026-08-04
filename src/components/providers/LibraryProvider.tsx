"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  CATALOG_REFRESH_EVENT,
  LIBRARY_EVENT,
  listContinueDeduped,
  listFavorites,
  type ContinueItem,
  type FavoriteItem,
} from "@/lib/library/storage";
import { usePlaylists } from "@/components/providers/PlaylistProvider";

type LibraryContextValue = {
  favorites: FavoriteItem[];
  continueItems: ContinueItem[];
  catalogVersion: number;
  refreshCatalog: () => void;
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

let catalogRefreshGen = 0;

function subscribeLibrary(callback: () => void) {
  const onCatalogRefresh = () => {
    catalogRefreshGen += 1;
    callback();
  };
  window.addEventListener(LIBRARY_EVENT, callback);
  window.addEventListener(CATALOG_REFRESH_EVENT, onCatalogRefresh);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(LIBRARY_EVENT, callback);
    window.removeEventListener(CATALOG_REFRESH_EVENT, onCatalogRefresh);
    window.removeEventListener("storage", callback);
  };
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const { activePlaylist } = usePlaylists();
  const playlistId = activePlaylist?.id ?? "";

  const snapshot = useSyncExternalStore(
    subscribeLibrary,
    () => {
      if (!playlistId) return "empty";
      const favs = listFavorites(playlistId);
      const cont = listContinueDeduped(playlistId);
      return `${playlistId}:c${catalogRefreshGen}:${favs.map((f) => f.id).join(",")}:${cont.map((c) => `${c.id}@${c.position ?? 0}`).join(",")}`;
    },
    () => "empty",
  );

  const favorites = useMemo(
    () => (playlistId ? listFavorites(playlistId) : []),
    [playlistId, snapshot],
  );

  const continueItems = useMemo(
    () => (playlistId ? listContinueDeduped(playlistId) : []),
    [playlistId, snapshot],
  );

  const refreshCatalog = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(CATALOG_REFRESH_EVENT));
    }
  }, []);

  useEffect(() => {
    if (!playlistId) return;
    void import("@/lib/sync/client").then(({ schedulePullSync }) =>
      schedulePullSync(playlistId),
    );
  }, [playlistId]);

  const value = useMemo(
    () => ({
      favorites,
      continueItems,
      catalogVersion: snapshot.length,
      refreshCatalog,
    }),
    [favorites, continueItems, snapshot, refreshCatalog],
  );

  return (
    <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
  );
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error("useLibrary must be used within LibraryProvider");
  }
  return ctx;
}

export function useIsFavorite(
  kind: FavoriteItem["kind"] | undefined,
  streamId: number | string | undefined,
): boolean {
  const { favorites } = useLibrary();
  if (kind == null || streamId == null) return false;
  const id = `${kind}:${streamId}`;
  return favorites.some((f) => f.id === id);
}
