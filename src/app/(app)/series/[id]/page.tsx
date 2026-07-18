"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Heart, Play } from "lucide-react";
import { Shimmer } from "@/components/catalog/Skeleton";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { isFavorite, toggleFavorite } from "@/lib/library/storage";
import { getSeriesInfo, watchPath } from "@/lib/xtream/client";
import type { SeriesEpisode, SeriesInfo } from "@/lib/xtream/types";

export default function SeriesDetailPage() {
  const params = useParams<{ id: string }>();
  const { credentials, activePlaylist } = usePlaylists();
  const [info, setInfo] = useState<SeriesInfo | null>(null);
  const [season, setSeason] = useState<string>("1");
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
        const data = await getSeriesInfo(credentials!, params.id);
        if (cancelled) return;
        setInfo(data);
        const keys = Object.keys(data.episodes || {}).sort(
          (a, b) => Number(a) - Number(b),
        );
        if (keys[0]) setSeason(keys[0]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load series");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [credentials, params.id]);

  const title = info?.info?.name || `Series ${params.id}`;
  const image = info?.info?.cover;
  const seasonKeys = Object.keys(info?.episodes || {}).sort(
    (a, b) => Number(a) - Number(b),
  );
  const episodes: SeriesEpisode[] = info?.episodes?.[season] || [];

  const fav = useMemo(() => {
    if (!activePlaylist) return false;
    void favTick;
    return isFavorite(activePlaylist.id, "series", params.id);
  }, [activePlaylist, params.id, favTick]);

  return (
    <div className="px-4 py-5 md:px-6 md:py-8">
      <Link
        href="/series"
        className="mb-6 inline-flex items-center gap-2 text-sm text-[var(--xp-muted)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Series
      </Link>

      {loading ? (
        <div className="space-y-4">
          <Shimmer className="h-40 w-full rounded-2xl" />
          <Shimmer className="h-8 w-1/2 rounded-lg" />
        </div>
      ) : error ? (
        <p className="text-sm text-[var(--xp-danger)]">{error}</p>
      ) : (
        <div className="xp-fade-in space-y-6">
          <div className="grid gap-6 md:grid-cols-[200px_1fr]">
            <div className="overflow-hidden rounded-2xl bg-[var(--xp-surface)]">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image}
                  alt=""
                  className="aspect-[2/3] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[2/3] items-center justify-center text-sm text-[var(--xp-muted)]">
                  No artwork
                </div>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <h1 className="font-[family-name:var(--xp-font-display)] text-3xl font-bold">
                  {title}
                </h1>
                <p className="mt-1 text-sm text-[var(--xp-muted)]">
                  {[info?.info?.genre, info?.info?.releaseDate, info?.info?.rating]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <p className="max-w-2xl text-sm leading-relaxed">
                {info?.info?.plot || "No synopsis available."}
              </p>
              <button
                type="button"
                className="xp-btn xp-btn-ghost"
                onClick={() => {
                  if (!activePlaylist) return;
                  toggleFavorite(activePlaylist.id, {
                    kind: "series",
                    title,
                    image,
                    streamId: params.id,
                  });
                  setFavTick((n) => n + 1);
                }}
              >
                <Heart
                  className={`h-4 w-4 ${fav ? "fill-[var(--xp-accent)] text-[var(--xp-accent)]" : ""}`}
                />
                Favorite
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {seasonKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSeason(key)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm ${
                    season === key
                      ? "bg-[var(--xp-accent)] text-[var(--xp-ink)]"
                      : "bg-[var(--xp-surface)] text-[var(--xp-muted)]"
                  }`}
                >
                  Season {key}
                </button>
              ))}
            </div>
            <ul className="space-y-2">
              {episodes.map((ep) => {
                const epTitle =
                  ep.title || `Episode ${ep.episode_num ?? ep.id}`;
                const ext = ep.container_extension || "mp4";
                return (
                  <li key={ep.id}>
                    <Link
                      href={watchPath("series", ep.id, {
                        title: `${title} · ${epTitle}`,
                        ext,
                        image: ep.info?.movie_image || image || "",
                        seriesId: params.id,
                        season,
                        episode: String(ep.episode_num ?? ""),
                      })}
                      className="flex items-center gap-3 rounded-xl bg-[var(--xp-surface)] px-3 py-3 transition hover:bg-[var(--xp-surface-2)]"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--xp-accent-dim)] text-[var(--xp-accent)]">
                        <Play className="h-4 w-4 fill-current" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{epTitle}</p>
                        <p className="truncate text-xs text-[var(--xp-muted)]">
                          {ep.info?.duration || `S${season}E${ep.episode_num}`}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
              {!episodes.length ? (
                <li className="text-sm text-[var(--xp-muted)]">
                  No episodes in this season.
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
