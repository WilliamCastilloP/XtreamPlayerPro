"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Heart, Play } from "lucide-react";
import { Shimmer } from "@/components/catalog/Skeleton";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { isFavorite, toggleFavorite } from "@/lib/library/storage";
import { getVodInfo, watchPath } from "@/lib/xtream/client";
import type { VodInfo } from "@/lib/xtream/types";

export default function MovieDetailPage() {
  const params = useParams<{ id: string }>();
  const { credentials, activePlaylist } = usePlaylists();
  const [info, setInfo] = useState<VodInfo | null>(null);
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
        const data = await getVodInfo(credentials!, params.id);
        if (!cancelled) setInfo(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load movie");
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

  const title =
    info?.info?.name || info?.movie_data?.name || `Movie ${params.id}`;
  const image = info?.info?.movie_image;
  const extension = info?.movie_data?.container_extension || "mp4";
  const streamId = info?.movie_data?.stream_id || params.id;

  const fav = useMemo(() => {
    if (!activePlaylist) return false;
    void favTick;
    return isFavorite(activePlaylist.id, "movie", streamId);
  }, [activePlaylist, streamId, favTick]);

  return (
    <div className="px-4 py-5 md:px-6 md:py-8">
      <Link
        href="/movies"
        className="mb-6 inline-flex items-center gap-2 text-sm text-[var(--xp-muted)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Movies
      </Link>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          <Shimmer className="aspect-[2/3] w-full rounded-2xl" />
          <div className="space-y-3">
            <Shimmer className="h-8 w-2/3 rounded-lg" />
            <Shimmer className="h-24 w-full rounded-lg" />
          </div>
        </div>
      ) : error ? (
        <p className="text-sm text-[var(--xp-danger)]">{error}</p>
      ) : (
        <div className="xp-fade-in grid gap-6 md:grid-cols-[220px_1fr]">
          <div className="overflow-hidden rounded-2xl bg-[var(--xp-surface)]">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="aspect-[2/3] w-full object-cover" />
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
                {[info?.info?.genre, info?.info?.releasedate, info?.info?.rating]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--xp-text)]/90">
              {info?.info?.plot || "No synopsis available."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={watchPath("movie", streamId, {
                  title,
                  ext: extension,
                  image: image || "",
                })}
                className="xp-btn xp-btn-primary"
              >
                <Play className="h-4 w-4 fill-current" />
                Play
              </Link>
              <button
                type="button"
                className="xp-btn xp-btn-ghost"
                onClick={() => {
                  if (!activePlaylist) return;
                  toggleFavorite(activePlaylist.id, {
                    kind: "movie",
                    title,
                    image,
                    streamId,
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
        </div>
      )}
    </div>
  );
}
