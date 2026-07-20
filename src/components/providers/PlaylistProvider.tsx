"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  createPlaylist,
  deletePlaylist,
  getActivePlaylist,
  getActivePlaylistId,
  listPlaylists,
  setActivePlaylistId,
  updatePlaylist,
} from "@/lib/playlists/storage";
import type { Playlist, PlaylistDraft } from "@/lib/playlists/types";
import type { XtreamCredentials } from "@/lib/xtream/types";

type PlaylistContextValue = {
  ready: boolean;
  playlists: Playlist[];
  activePlaylist: Playlist | null;
  credentials: XtreamCredentials | null;
  refresh: () => void;
  selectPlaylist: (id: string) => void;
  addPlaylist: (draft: PlaylistDraft) => Playlist;
  editPlaylist: (id: string, draft: Partial<PlaylistDraft>) => Playlist | null;
  removePlaylist: (id: string) => void;
  clearActive: () => void;
};

const PlaylistContext = createContext<PlaylistContextValue | null>(null);

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("xp-playlists", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("xp-playlists", callback);
  };
}

function emit() {
  window.dispatchEvent(new Event("xp-playlists"));
}

function getSnapshot() {
  return JSON.stringify({
    playlists: listPlaylists(),
    activeId: getActivePlaylistId(),
  });
}

function getServerSnapshot() {
  return JSON.stringify({ playlists: [], activeId: null });
}

export function PlaylistProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const ready = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const seededRef = useRef(false);

  const { playlists, activePlaylist } = useMemo(() => {
    const parsed = JSON.parse(snapshot) as {
      playlists: Playlist[];
      activeId: string | null;
    };
    const active =
      parsed.playlists.find((p) => p.id === parsed.activeId) ??
      getActivePlaylist();
    return { playlists: parsed.playlists, activePlaylist: active };
  }, [snapshot]);

  // Local/dev: if `.env.local` has XTREAM_DEV_* and there is no playlist yet,
  // seed one automatically so you don't retype credentials every time.
  useEffect(() => {
    if (!ready || seededRef.current || playlists.length > 0) return;
    seededRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/dev/xtream-defaults", {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          configured?: boolean;
          name?: string;
          serverUrl?: string;
          username?: string;
          password?: string;
        };
        if (
          !data.configured ||
          !data.serverUrl ||
          !data.username ||
          !data.password
        ) {
          return;
        }
        if (cancelled || listPlaylists().length > 0) return;
        const playlist = createPlaylist({
          name: data.name || data.username,
          serverUrl: data.serverUrl,
          username: data.username,
          password: data.password,
        });
        setActivePlaylistId(playlist.id);
        emit();
      } catch {
        /* ignore — form still works manually */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, playlists.length]);

  const refresh = useCallback(() => {
    emit();
  }, []);

  const selectPlaylist = useCallback((id: string) => {
    setActivePlaylistId(id);
    emit();
  }, []);

  const addPlaylist = useCallback((draft: PlaylistDraft) => {
    const playlist = createPlaylist(draft);
    setActivePlaylistId(playlist.id);
    emit();
    return playlist;
  }, []);

  const editPlaylist = useCallback(
    (id: string, draft: Partial<PlaylistDraft>) => {
      const updated = updatePlaylist(id, draft);
      emit();
      return updated;
    },
    [],
  );

  const removePlaylist = useCallback((id: string) => {
    deletePlaylist(id);
    emit();
  }, []);

  const clearActive = useCallback(() => {
    setActivePlaylistId(null);
    emit();
  }, []);

  const credentials = useMemo<XtreamCredentials | null>(() => {
    if (!activePlaylist) return null;
    return {
      serverUrl: activePlaylist.serverUrl,
      username: activePlaylist.username,
      password: activePlaylist.password,
    };
  }, [activePlaylist]);

  const value = useMemo(
    () => ({
      ready,
      playlists,
      activePlaylist,
      credentials,
      refresh,
      selectPlaylist,
      addPlaylist,
      editPlaylist,
      removePlaylist,
      clearActive,
    }),
    [
      ready,
      playlists,
      activePlaylist,
      credentials,
      refresh,
      selectPlaylist,
      addPlaylist,
      editPlaylist,
      removePlaylist,
      clearActive,
    ],
  );

  return (
    <PlaylistContext.Provider value={value}>
      {children}
    </PlaylistContext.Provider>
  );
}

export function usePlaylists() {
  const ctx = useContext(PlaylistContext);
  if (!ctx) {
    throw new Error("usePlaylists must be used within PlaylistProvider");
  }
  return ctx;
}
