"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { authenticate } from "@/lib/xtream/client";
import type { XtreamAuthResponse } from "@/lib/xtream/types";

export default function AccountPage() {
  const {
    activePlaylist,
    playlists,
    selectPlaylist,
    clearActive,
    removePlaylist,
    credentials,
  } = usePlaylists();
  const router = useRouter();
  const [info, setInfo] = useState<XtreamAuthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!credentials) return;
    let cancelled = false;
    authenticate(credentials)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Account check failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [credentials]);

  const user = info?.user_info;

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-5 md:px-6 md:py-8">
      <div>
        <h1 className="font-[family-name:var(--xp-font-display)] text-2xl font-bold">
          Account
        </h1>
        <p className="text-sm text-[var(--xp-muted)]">
          Switch playlists and manage this device
        </p>
      </div>

      <section className="xp-fade-in space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--xp-muted)]">
          Active playlist
        </h2>
        <div className="rounded-2xl border border-[var(--xp-border)] bg-[rgba(18,24,32,0.7)] p-4">
          <p className="text-lg font-semibold">{activePlaylist?.name}</p>
          <p className="text-sm text-[var(--xp-muted)]">
            {activePlaylist?.username}
          </p>
          <p className="truncate text-xs text-[var(--xp-muted)]">
            {activePlaylist?.serverUrl}
          </p>
          {user ? (
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[var(--xp-muted)]">Status</dt>
                <dd>{user.status || "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--xp-muted)]">Expires</dt>
                <dd>
                  {user.exp_date
                    ? new Date(Number(user.exp_date) * 1000).toLocaleDateString()
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--xp-muted)]">Connections</dt>
                <dd>
                  {user.active_cons || "0"} / {user.max_connections || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--xp-muted)]">Trial</dt>
                <dd>{user.is_trial === "1" ? "Yes" : "No"}</dd>
              </div>
            </dl>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm text-[var(--xp-danger)]">{error}</p>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--xp-muted)]">
            Playlists
          </h2>
          <Link href="/playlists/new" className="text-sm text-[var(--xp-accent)]">
            Add
          </Link>
        </div>
        <ul className="space-y-2">
          {playlists.map((playlist) => {
            const active = playlist.id === activePlaylist?.id;
            return (
              <li
                key={playlist.id}
                className="flex items-center gap-2 rounded-xl border border-[var(--xp-border)] px-3 py-3"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    selectPlaylist(playlist.id);
                    router.push("/");
                  }}
                >
                  <p className="truncate font-medium">
                    {playlist.name}
                    {active ? (
                      <span className="ml-2 text-xs text-[var(--xp-accent)]">
                        Active
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-[var(--xp-muted)]">
                    {playlist.username}
                  </p>
                </button>
                <Link
                  href={`/playlists/${playlist.id}/edit`}
                  className="text-xs text-[var(--xp-muted)] hover:text-[var(--xp-text)]"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  className="text-xs text-[var(--xp-danger)]"
                  onClick={() => {
                    if (confirm(`Delete “${playlist.name}”?`)) {
                      removePlaylist(playlist.id);
                    }
                  }}
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <button
        type="button"
        className="xp-btn xp-btn-ghost w-full"
        onClick={() => {
          clearActive();
          router.replace("/playlists");
        }}
      >
        Switch playlist / lock
      </button>
    </div>
  );
}
