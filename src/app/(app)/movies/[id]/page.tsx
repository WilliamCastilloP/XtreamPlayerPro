"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { TitleHero } from "@/components/catalog/TitleHero";
import { Shimmer } from "@/components/catalog/Skeleton";
import { useLocale } from "@/components/providers/LocaleProvider";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { useLibrary } from "@/components/providers/LibraryProvider";
import {
  getContinueItem,
  isContinueCompleted,
  isFavorite,
  toggleFavorite,
} from "@/lib/library/storage";
import { continueFromZeroHref, continueWatchHref } from "@/lib/library/continue";
import { backLabelForPath, safeInternalPath } from "@/lib/navigation/back";
import { getVodInfo, watchPath } from "@/lib/xtream/client";
import { parseMediaDuration } from "@/lib/player/duration";
import { parseGenres } from "@/lib/xtream/genres";
import { formatRating } from "@/lib/xtream/rating";
import { catalogTitle } from "@/lib/xtream/title";
import type { VodInfo } from "@/lib/xtream/types";

function MovieDetailInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { credentials, activePlaylist } = usePlaylists();
  const { t } = useLocale();
  const [info, setInfo] = useState<VodInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { continueItems } = useLibrary();
  const backHref = safeInternalPath(
    searchParams.get("back"),
    "/?section=movies",
  );
  const backLabel = backLabelForPath(
    backHref,
    {
      home: t("navHome"),
      search: t("searchTitle"),
      live: t("liveTv"),
      movies: t("movies"),
      series: t("series"),
      favorites: t("favorite"),
    },
    "movies",
  );

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

  const title = catalogTitle({
    name: info?.info?.name || info?.movie_data?.name,
    title: undefined,
  }) || `Movie ${params.id}`;
  const image = info?.info?.movie_image;
  const extension = info?.movie_data?.container_extension || "mp4";
  const streamId = info?.movie_data?.stream_id || params.id;
  const genreLabel = parseGenres(info?.info?.genre).join(", ");
  const ratingLabel = formatRating(info?.info?.rating);
  const meta = [
    genreLabel || undefined,
    info?.info?.releasedate,
    ratingLabel,
    info?.info?.duration,
  ]
    .filter(Boolean)
    .join(" · ");

  const fav = useMemo(() => {
    if (!activePlaylist) return false;
    return isFavorite(activePlaylist.id, "movie", streamId);
  }, [activePlaylist, streamId, continueItems]);

  const saved = useMemo(() => {
    const byId = continueItems.find(
      (item) =>
        item.kind === "movie" &&
        (String(item.streamId) === String(params.id) ||
          String(item.streamId) === String(streamId)),
    );
    if (byId) return byId;
    if (!activePlaylist) return undefined;
    return (
      getContinueItem(activePlaylist.id, "movie", streamId) ||
      getContinueItem(activePlaylist.id, "movie", params.id)
    );
  }, [activePlaylist, streamId, params.id, continueItems]);

  const position = saved?.position ?? 0;
  const catalogDuration = parseMediaDuration(info?.info?.duration) || 0;
  const duration = saved?.duration && saved.duration > 0 ? saved.duration : catalogDuration;
  const completed = saved ? isContinueCompleted(saved) : false;
  const progressPct =
    duration > 0 && position > 0
      ? Math.min(100, Math.round((position / duration) * 100))
      : 0;
  const canResume = Boolean(saved && position >= 5 && !completed);

  const defaultPlayHref = watchPath("movie", streamId, {
    title,
    ext: extension,
    image: image || "",
    ...(parseMediaDuration(info?.info?.duration)
      ? {
          duration: String(parseMediaDuration(info?.info?.duration)),
        }
      : {}),
  });

  const playHref = canResume && saved ? continueWatchHref(saved) : defaultPlayHref;
  const secondaryPlayHref =
    canResume && saved ? continueFromZeroHref(saved) : undefined;

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
      layout="movie"
      backHref={backHref}
      backLabel={backLabel}
      title={title}
      meta={meta}
      plot={info?.info?.plot || undefined}
      image={image}
      playHref={playHref}
      playLabel={canResume ? t("episodeContinue") : t("play")}
      secondaryPlayHref={secondaryPlayHref}
      secondaryPlayLabel={t("episodeStartOver")}
      progressPct={progressPct > 0 ? progressPct : undefined}
      progressLabel={
        completed
          ? t("episodeCompleted")
          : progressPct > 0
            ? t("episodeProgress", { pct: String(progressPct) })
            : undefined
      }
      favorited={fav}
      onToggleFavorite={() => {
        if (!activePlaylist) return;
        toggleFavorite(activePlaylist.id, {
          kind: "movie",
          title,
          image,
          streamId,
        });
      }}
    >
      {      info?.info?.cast ||
      info?.info?.director ||
      genreLabel ||
      info?.info?.duration ||
      info?.info?.releasedate ||
      ratingLabel ||
      info?.info?.youtube_trailer ? (
        <div className="space-y-4 px-4 pb-5 pt-2 md:px-8">
          <dl className="grid max-w-3xl gap-x-6 gap-y-2.5 rounded-2xl border border-white/10 bg-black/35 p-4 text-sm text-white backdrop-blur-md sm:grid-cols-2">
            {genreLabel ? (
              <div>
                <dt className="text-white/55">{t("metaGenre")}</dt>
                <dd className="m-0">{genreLabel}</dd>
              </div>
            ) : null}
            {info?.info?.releasedate ? (
              <div>
                <dt className="text-white/55">{t("metaReleased")}</dt>
                <dd className="m-0">{info.info.releasedate}</dd>
              </div>
            ) : null}
            {info?.info?.duration ? (
              <div>
                <dt className="text-white/55">{t("metaDuration")}</dt>
                <dd className="m-0">{info.info.duration}</dd>
              </div>
            ) : null}
            {ratingLabel ? (
              <div>
                <dt className="text-white/55">{t("metaRating")}</dt>
                <dd className="m-0">★ {ratingLabel}</dd>
              </div>
            ) : null}
            {info?.info?.director ? (
              <div className="sm:col-span-2">
                <dt className="text-white/55">{t("metaDirector")}</dt>
                <dd className="m-0">{info.info.director}</dd>
              </div>
            ) : null}
            {info?.info?.cast ? (
              <div className="sm:col-span-2">
                <dt className="text-white/55">{t("metaCast")}</dt>
                <dd className="m-0 leading-relaxed">{info.info.cast}</dd>
              </div>
            ) : null}
          </dl>
          {info?.info?.youtube_trailer ? (
            <a
              href={
                info.info.youtube_trailer.startsWith("http")
                  ? info.info.youtube_trailer
                  : `https://www.youtube.com/watch?v=${info.info.youtube_trailer}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex text-sm font-semibold text-[var(--xp-accent)] hover:underline"
            >
              {t("metaTrailer")}
            </a>
          ) : null}
        </div>
      ) : null}
    </TitleHero>
  );
}

export default function MovieDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh">
          <Shimmer className="min-h-dvh w-full rounded-none" />
        </div>
      }
    >
      <MovieDetailInner />
    </Suspense>
  );
}
