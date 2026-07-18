"use client";

import { useEffect, useMemo, useState } from "react";
import { Heart, Play } from "lucide-react";
import Link from "next/link";
import { CategoryChips } from "@/components/catalog/CategoryChips";
import { ChannelSkeletonList } from "@/components/catalog/Skeleton";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import {
  isFavorite,
  toggleFavorite,
} from "@/lib/library/storage";
import {
  getLiveCategories,
  getLiveStreams,
  getShortEpg,
  watchPath,
} from "@/lib/xtream/client";
import type { LiveStream, ShortEpgListing, XtreamCategory } from "@/lib/xtream/types";

function decodeMaybeBase64(value?: string) {
  if (!value) return "";
  try {
    if (typeof window === "undefined") return value;
    // Xtream often base64-encodes EPG titles
    if (/^[A-Za-z0-9+/=]+$/.test(value) && value.length % 4 === 0) {
      const decoded = atob(value);
      if (/^[\x20-\x7E\s]+$/.test(decoded)) return decoded;
    }
  } catch {
    /* keep original */
  }
  return value;
}

export default function LivePage() {
  const { credentials, activePlaylist } = usePlaylists();
  const [categories, setCategories] = useState<XtreamCategory[]>([]);
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [selected, setSelected] = useState<LiveStream | null>(null);
  const [epg, setEpg] = useState<ShortEpgListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favTick, setFavTick] = useState(0);

  useEffect(() => {
    if (!credentials) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [cats, live] = await Promise.all([
          getLiveCategories(credentials!),
          getLiveStreams(credentials!, categoryId || undefined),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setStreams(live);
        setSelected((prev) => {
          if (prev && live.some((s) => s.stream_id === prev.stream_id)) {
            return prev;
          }
          return live[0] ?? null;
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load live");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [credentials, categoryId]);

  useEffect(() => {
    if (!credentials || !selected) return;
    let cancelled = false;
    getShortEpg(credentials, selected.stream_id)
      .then((res) => {
        if (!cancelled) setEpg(res.epg_listings ?? []);
      })
      .catch(() => {
        if (!cancelled) setEpg([]);
      });
    return () => {
      cancelled = true;
    };
  }, [credentials, selected]);

  const visibleEpg = selected ? epg : [];

  const fav = useMemo(() => {
    if (!activePlaylist || !selected) return false;
    void favTick;
    return isFavorite(activePlaylist.id, "live", selected.stream_id);
  }, [activePlaylist, selected, favTick]);

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col md:min-h-dvh">
      <div className="px-4 pt-5 md:px-6">
        <h1 className="font-[family-name:var(--xp-font-display)] text-2xl font-bold">
          Live TV
        </h1>
        <p className="text-sm text-[var(--xp-muted)]">
          Categories, channels, and short EPG
        </p>
      </div>

      <div className="mt-4">
        <CategoryChips
          categories={categories}
          activeId={categoryId}
          onChange={setCategoryId}
        />
      </div>

      {error ? (
        <p className="px-4 text-sm text-[var(--xp-danger)] md:px-6">{error}</p>
      ) : null}

      {loading ? (
        <ChannelSkeletonList />
      ) : (
        <div className="grid flex-1 gap-0 md:grid-cols-[minmax(0,1fr)_320px]">
          <ul className="divide-y divide-[var(--xp-border)] px-2 md:px-4">
            {streams.map((stream) => {
              const active = selected?.stream_id === stream.stream_id;
              return (
                <li key={stream.stream_id}>
                  <button
                    type="button"
                    onClick={() => setSelected(stream)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                      active
                        ? "bg-[var(--xp-accent-dim)]"
                        : "hover:bg-[var(--xp-surface)]"
                    }`}
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--xp-surface)]">
                      {stream.stream_icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={stream.stream_icon}
                          alt=""
                          className="h-full w-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-xs text-[var(--xp-muted)]">TV</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{stream.name}</p>
                      <p className="truncate text-xs text-[var(--xp-muted)]">
                        #{stream.num ?? stream.stream_id}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
            {!streams.length ? (
              <li className="px-4 py-10 text-sm text-[var(--xp-muted)]">
                No channels in this category.
              </li>
            ) : null}
          </ul>

          <aside className="border-t border-[var(--xp-border)] bg-[rgba(18,24,32,0.55)] p-4 md:border-l md:border-t-0">
            {selected ? (
              <div className="xp-fade-in space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--xp-muted)]">
                    Now
                  </p>
                  <h2 className="font-[family-name:var(--xp-font-display)] text-xl font-semibold">
                    {selected.name}
                  </h2>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={watchPath("live", selected.stream_id, {
                      title: selected.name,
                    })}
                    className="xp-btn xp-btn-primary flex-1"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Watch
                  </Link>
                  <button
                    type="button"
                    className="xp-btn xp-btn-ghost"
                    onClick={() => {
                      if (!activePlaylist) return;
                      toggleFavorite(activePlaylist.id, {
                        kind: "live",
                        title: selected.name,
                        image: selected.stream_icon,
                        streamId: selected.stream_id,
                      });
                      setFavTick((n) => n + 1);
                    }}
                    aria-label="Toggle favorite"
                  >
                    <Heart
                      className={`h-4 w-4 ${fav ? "fill-[var(--xp-accent)] text-[var(--xp-accent)]" : ""}`}
                    />
                  </button>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">EPG</p>
                  {visibleEpg.length ? (
                    <ul className="space-y-2">
                      {visibleEpg.map((item, index) => (
                        <li
                          key={`${item.id ?? index}-${item.start}`}
                          className="rounded-xl bg-[var(--xp-surface)] px-3 py-2"
                        >
                          <p className="text-sm font-medium">
                            {decodeMaybeBase64(item.title) || "Program"}
                          </p>
                          <p className="text-xs text-[var(--xp-muted)]">
                            {item.start || ""}
                            {item.end ? ` → ${item.end}` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[var(--xp-muted)]">
                      No short EPG available.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--xp-muted)]">
                Select a channel to preview EPG.
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
