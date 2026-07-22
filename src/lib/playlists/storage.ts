import type { Playlist, PlaylistDraft } from "./types";

const PLAYLISTS_KEY = "xp.playlists";
const ACTIVE_KEY = "xp.activePlaylistId";

function canUseStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

/** iOS Safari over http://LAN-IP has no crypto.randomUUID (secure-context only). */
function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `xp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
    id: newId(),
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
