"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { DevEnvConnectButton } from "@/components/playlists/DevEnvConnectButton";
import { authenticate } from "@/lib/xtream/client";
import { useState } from "react";

const isDev = process.env.NODE_ENV === "development";

export default function PlaylistsPage() {
  const { ready, playlists, selectPlaylist, removePlaylist } = usePlaylists();
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openPlaylist = async (id: string) => {
    const playlist = playlists.find((p) => p.id === id);
    if (!playlist) return;
    setError(null);
    setLoadingId(id);
    try {
      await authenticate({
        serverUrl: playlist.serverUrl,
        username: playlist.username,
        password: playlist.password,
      });
      selectPlaylist(id);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect");
    } finally {
      setLoadingId(null);
    }
  };

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-[var(--xp-muted)]">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 py-10 md:py-16">
      <div className="xp-fade-in mb-10 space-y-3 text-center md:text-left">
        <p className="font-[family-name:var(--xp-font-display)] text-4xl font-extrabold tracking-[0.14em] md:text-5xl">
          XTREAM
        </p>
        <p className="text-[var(--xp-muted)]">
          {isDev
            ? "Connect with credentials from .env.local, or open a saved playlist."
            : "Choose a playlist or add a new Xtream Codes account."}
        </p>
      </div>

      {isDev ? (
        <div className="xp-fade-in mb-8">
          <DevEnvConnectButton />
        </div>
      ) : null}

      <div className="xp-fade-in space-y-3">
        {playlists.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--xp-border)] px-5 py-10 text-center">
            <p className="mb-1 font-medium">No playlists yet</p>
            <p className="text-sm text-[var(--xp-muted)]">
              {isDev
                ? "Press Connect above to use .env.local."
                : "Add your first server to start watching."}
            </p>
          </div>
        ) : (
          playlists.map((playlist) => (
            <div
              key={playlist.id}
              className="flex items-center gap-3 rounded-2xl border border-[var(--xp-border)] bg-[rgba(18,24,32,0.72)] p-3"
            >
              <button
                type="button"
                onClick={() => openPlaylist(playlist.id)}
                disabled={loadingId === playlist.id}
                className="min-w-0 flex-1 rounded-xl px-2 py-2 text-left transition hover:bg-[var(--xp-surface)]"
              >
                <p className="truncate font-semibold">{playlist.name}</p>
                <p className="truncate text-xs text-[var(--xp-muted)]">
                  {playlist.username} · {playlist.serverUrl}
                </p>
                {loadingId === playlist.id ? (
                  <p className="mt-1 text-xs text-[var(--xp-accent)]">
                    Connecting…
                  </p>
                ) : null}
              </button>
              <Link
                href={`/playlists/${playlist.id}/edit`}
                className="rounded-full px-3 py-2 text-xs text-[var(--xp-muted)] hover:text-[var(--xp-text)]"
              >
                Edit
              </Link>
              <button
                type="button"
                aria-label={`Delete ${playlist.name}`}
                onClick={() => {
                  if (confirm(`Delete playlist “${playlist.name}”?`)) {
                    removePlaylist(playlist.id);
                  }
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--xp-muted)] hover:bg-[var(--xp-surface)] hover:text-[var(--xp-danger)]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {error ? (
        <p className="mt-4 text-sm text-[var(--xp-danger)]">{error}</p>
      ) : null}

      {!isDev ? (
        <Link
          href="/playlists/new"
          className="xp-btn xp-btn-primary mt-8 w-full"
        >
          <Plus className="h-4 w-4" />
          Add playlist
        </Link>
      ) : (
        <Link
          href="/playlists/new"
          className="mt-6 text-center text-sm text-[var(--xp-muted)] hover:text-[var(--xp-text)]"
        >
          Or add a playlist manually
        </Link>
      )}
    </div>
  );
}
