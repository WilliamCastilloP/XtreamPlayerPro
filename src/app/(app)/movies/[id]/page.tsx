"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TitleHero } from "@/components/catalog/TitleHero";
import { Shimmer } from "@/components/catalog/Skeleton";
import { useLocale } from "@/components/providers/LocaleProvider";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { isFavorite, toggleFavorite } from "@/lib/library/storage";
import { getVodInfo, watchPath } from "@/lib/xtream/client";
import { parseMediaDuration } from "@/lib/player/duration";
import type { VodInfo } from "@/lib/xtream/types";

export default function MovieDetailPage() {
  const params = useParams<{ id: string }>();
  const { credentials, activePlaylist } = usePlaylists();
  const { t } = useLocale();
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
      <div className="min-h-dvh">
        <Shimmer className="min-h-dvh w-full rounded-none" />
      </div>
    );
  }

  if (error) {
    return <p className="px-4 py-10 text-sm text-[var(--xp-danger)]">{error}</p>;
  }

  return (
    <TitleHero
      backHref="/?section=movies"
      backLabel={t("navHome")}
      title={title}
      meta={meta}
      plot={info?.info?.plot || undefined}
      image={image}
      playHref={watchPath("movie", streamId, {
        title,
        ext: extension,
        image: image || "",
        ...(parseMediaDuration(info?.info?.duration)
          ? {
              duration: String(parseMediaDuration(info?.info?.duration)),
            }
          : {}),
      })}
      playLabel={t("play")}
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
    >
      {info?.info?.cast ? (
        <div className="px-4 py-5 md:px-8">
          <p className="max-w-3xl text-sm leading-relaxed text-[var(--xp-muted)]">
            Cast: {info.info.cast}
          </p>
        </div>
      ) : null}
    </TitleHero>
  );
}
