"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TitleHero } from "@/components/catalog/TitleHero";
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
  const meta = [
    info?.info?.genre,
    info?.info?.releasedate,
    info?.info?.rating,
    info?.info?.duration,
  ]
    .filter(Boolean)
    .join(" · ");

  const fav = useMemo(() => {
    if (!activePlaylist) return false;
    void favTick;
    return isFavorite(activePlaylist.id, "movie", streamId);
  }, [activePlaylist, streamId, favTick]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Shimmer className="aspect-[16/11] w-full sm:aspect-[21/9]" />
        <div className="space-y-3 px-4">
          <Shimmer className="h-8 w-2/3 rounded-lg" />
          <Shimmer className="h-20 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return <p className="px-4 py-10 text-sm text-[var(--xp-danger)]">{error}</p>;
  }

  return (
    <div className="xp-fade-in pb-8">
      <TitleHero
        backHref="/movies"
        backLabel="Movies"
        title={title}
        meta={meta}
        plot={info?.info?.plot || "No synopsis available."}
        image={image}
        playHref={watchPath("movie", streamId, {
          title,
          ext: extension,
          image: image || "",
        })}
        favorited={fav}
        onToggleFavorite={() => {
          if (!activePlaylist) return;
          toggleFavorite(activePlaylist.id, {
            kind: "movie",
            title,
            image,
            streamId,
          });
          setFavTick((n) => n + 1);
        }}
      />
      <div className="hidden px-4 pt-4 md:block md:px-8">
        <p className="max-w-3xl text-sm leading-relaxed text-[var(--xp-muted)]">
          {info?.info?.cast ? `Cast: ${info.info.cast}` : null}
        </p>
      </div>
    </div>
  );
}
