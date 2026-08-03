import type { XtreamCredentials } from "@/lib/xtream/types";
import { normalizeServerUrl } from "@/lib/xtream/urls";

const TOKEN_KEY = "xp.sync.jwt";

export type StoredSyncToken = {
  token: string;
  userId: string;
  serverUrl: string;
  username: string;
  expiresAt: number;
};

function canUseStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readStored(): StoredSyncToken | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSyncToken;
    if (
      !parsed?.token ||
      !parsed.userId ||
      !parsed.serverUrl ||
      !parsed.username ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getStoredSyncToken(): StoredSyncToken | null {
  const stored = readStored();
  if (!stored) return null;
  if (stored.expiresAt <= Date.now()) {
    clearSyncToken();
    return null;
  }
  return stored;
}

export function saveSyncToken(data: StoredSyncToken) {
  if (!canUseStorage()) return;
  localStorage.setItem(TOKEN_KEY, JSON.stringify(data));
}

export function clearSyncToken() {
  if (!canUseStorage()) return;
  localStorage.removeItem(TOKEN_KEY);
}

export function syncTokenMatchesCredentials(
  credentials: XtreamCredentials,
): boolean {
  const stored = getStoredSyncToken();
  if (!stored) return false;
  const server = normalizeServerUrl(credentials.serverUrl);
  const username = credentials.username.trim();
  return stored.serverUrl === server && stored.username === username;
}

export function getSyncAuthHeader(): Record<string, string> | null {
  const stored = getStoredSyncToken();
  if (!stored) return null;
  return { Authorization: `Bearer ${stored.token}` };
}
