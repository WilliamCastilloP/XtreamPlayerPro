import type { Playlist, PlaylistDraft } from "./types";

const PLAYLISTS_KEY = "xp.playlists";
const ACTIVE_KEY = "xp.activePlaylistId";

function canUseStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readPlaylists(): Playlist[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(PLAYLISTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Playlist[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePlaylists(playlists: Playlist[]) {
  if (!canUseStorage()) return;
  localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
}

export function listPlaylists(): Playlist[] {
  return readPlaylists().sort((a, b) => b.createdAt - a.createdAt);
}

export function getPlaylist(id: string): Playlist | null {
  return readPlaylists().find((p) => p.id === id) ?? null;
}

export function getActivePlaylistId(): string | null {
  if (!canUseStorage()) return null;
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActivePlaylistId(id: string | null) {
  if (!canUseStorage()) return;
  if (!id) {
    localStorage.removeItem(ACTIVE_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_KEY, id);
}

export function getActivePlaylist(): Playlist | null {
  const id = getActivePlaylistId();
  if (!id) return null;
  return getPlaylist(id);
}

export function createPlaylist(draft: PlaylistDraft): Playlist {
  const playlist: Playlist = {
    id: crypto.randomUUID(),
    name: draft.name.trim(),
    serverUrl: draft.serverUrl.trim(),
    username: draft.username.trim(),
    password: draft.password,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const next = [...readPlaylists(), playlist];
  writePlaylists(next);
  return playlist;
}

export function updatePlaylist(
  id: string,
  draft: Partial<PlaylistDraft>,
): Playlist | null {
  const playlists = readPlaylists();
  const index = playlists.findIndex((p) => p.id === id);
  if (index < 0) return null;

  const current = playlists[index];
  const updated: Playlist = {
    ...current,
    name: draft.name?.trim() ?? current.name,
    serverUrl: draft.serverUrl?.trim() ?? current.serverUrl,
    username: draft.username?.trim() ?? current.username,
    password: draft.password ?? current.password,
    updatedAt: Date.now(),
  };
  playlists[index] = updated;
  writePlaylists(playlists);
  return updated;
}

export function deletePlaylist(id: string) {
  const next = readPlaylists().filter((p) => p.id !== id);
  writePlaylists(next);
  if (getActivePlaylistId() === id) {
    setActivePlaylistId(next[0]?.id ?? null);
  }
}
