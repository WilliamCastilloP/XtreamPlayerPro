"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Play } from "lucide-react";
import { TitleHero } from "@/components/catalog/TitleHero";
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
  const firstEpisode = episodes[0];
  const playHref = firstEpisode
    ? watchPath("series", firstEpisode.id, {
        title: `${title} · ${firstEpisode.title || `Episode ${firstEpisode.episode_num}`}`,
        ext: firstEpisode.container_extension || "mp4",
        image: firstEpisode.info?.movie_image || image || "",
        seriesId: params.id,
        season,
        episode: String(firstEpisode.episode_num ?? ""),
      })
    : `/series/${params.id}`;

  const fav = useMemo(() => {
    if (!activePlaylist) return false;
    void favTick;
    return isFavorite(activePlaylist.id, "series", params.id);
  }, [activePlaylist, params.id, favTick]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Shimmer className="aspect-[16/11] w-full sm:aspect-[21/9]" />
        <Shimmer className="mx-4 h-24 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return <p className="px-4 py-10 text-sm text-[var(--xp-danger)]">{error}</p>;
  }

  return (
    <div className="xp-fade-in pb-28 sm:pb-8">
      <TitleHero
        backHref="/series"
        backLabel="Series"
        title={title}
        meta={[info?.info?.genre, info?.info?.releaseDate, info?.info?.rating]
          .filter(Boolean)
          .join(" · ")}
        plot={info?.info?.plot || "No synopsis available."}
        image={image}
        playHref={playHref}
        playLabel={
          firstEpisode
            ? `Play S${season} E${firstEpisode.episode_num ?? 1}`
            : "Play"
        }
        favorited={fav}
        onToggleFavorite={() => {
          if (!activePlaylist) return;
          toggleFavorite(activePlaylist.id, {
            kind: "series",
            title,
            image,
            streamId: params.id,
          });
          setFavTick((n) => n + 1);
        }}
      />

      <div className="space-y-4 px-4 pt-5 md:px-8">
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
            const epTitle = ep.title || `Episode ${ep.episode_num ?? ep.id}`;
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
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--xp-accent)] text-[var(--xp-ink)]">
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
  );
}
