"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
