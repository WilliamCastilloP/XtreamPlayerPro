"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Play } from "lucide-react";
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
import { backLabelForPath, safeInternalPath, withBack } from "@/lib/navigation/back";
import { getSeriesInfo, watchPath } from "@/lib/xtream/client";
import { parseMediaDuration } from "@/lib/player/duration";
import { parseGenres } from "@/lib/xtream/genres";
import { formatRating } from "@/lib/xtream/rating";
import { catalogTitle } from "@/lib/xtream/title";
import type { SeriesEpisode, SeriesInfo } from "@/lib/xtream/types";

function SeriesDetailInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { credentials, activePlaylist } = usePlaylists();
  const { t } = useLocale();
  const [info, setInfo] = useState<SeriesInfo | null>(null);
  const [season, setSeason] = useState<string>("1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { continueItems } = useLibrary();
  const backHref = safeInternalPath(
    searchParams.get("back"),
    "/?section=series",
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
    "series",
  );

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

  const title =
    catalogTitle({ name: info?.info?.name }) || `Series ${params.id}`;
  const image = info?.info?.cover;
  const seasonKeys = Object.keys(info?.episodes || {}).sort(
    (a, b) => Number(a) - Number(b),
  );
  const episodes: SeriesEpisode[] = info?.episodes?.[season] || [];
  const firstEpisode = episodes[0];
  const detailBack = withBack(`/series/${params.id}`, backHref);

  const seriesProgress = useMemo(() => {
    return continueItems
      .filter(
        (item) =>
          item.kind === "series" &&
          String(item.seriesId ?? "") === String(params.id),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }, [continueItems, params.id]);

  const canResumeSeries =
    seriesProgress &&
    (seriesProgress.position ?? 0) >= 5 &&
    !isContinueCompleted(seriesProgress);

  const defaultPlayHref = firstEpisode
    ? watchPath("series", firstEpisode.id, {
        title: `${title} · ${firstEpisode.title || `Episode ${firstEpisode.episode_num}`}`,
        ext: firstEpisode.container_extension || "mp4",
        image: firstEpisode.info?.movie_image || image || "",
        seriesId: params.id,
        season,
        episode: String(firstEpisode.episode_num ?? ""),
      })
    : `/series/${params.id}`;

  const playHref = canResumeSeries
    ? continueWatchHref(seriesProgress)
    : defaultPlayHref;
  const secondaryPlayHref = canResumeSeries
    ? continueFromZeroHref(seriesProgress)
    : undefined;

  const fav = useMemo(() => {
    if (!activePlaylist) return false;
    return isFavorite(activePlaylist.id, "series", params.id);
  }, [activePlaylist, params.id, continueItems]);

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

  const genreLabel = parseGenres(info?.info?.genre).join(", ");
  const ratingLabel = formatRating(info?.info?.rating);

  return (
    <TitleHero
      layout="series"
      backHref={backHref}
      backLabel={backLabel}
      title={title}
      meta={[genreLabel || undefined, info?.info?.releaseDate, ratingLabel]
        .filter(Boolean)
        .join(" · ")}
      plot={info?.info?.plot || undefined}
      image={image}
      playHref={playHref}
      playLabel={
        canResumeSeries
          ? t("episodeContinue")
          : firstEpisode
            ? `${t("play")} S${season} E${firstEpisode.episode_num ?? 1}`
            : t("play")
      }
      secondaryPlayHref={secondaryPlayHref}
      secondaryPlayLabel={t("episodeStartOver")}
      favorited={fav}
      onToggleFavorite={() => {
        if (!activePlaylist) return;
        toggleFavorite(activePlaylist.id, {
          kind: "series",
          title,
          image,
          streamId: params.id,
        });
      }}
    >
      <div className="space-y-4 px-4 pb-8 pt-2 md:px-8">
        {info?.info?.cast || info?.info?.director || genreLabel ? (
          <dl className="grid max-w-3xl gap-x-6 gap-y-2.5 rounded-2xl border border-white/10 bg-black/35 p-4 text-sm text-white backdrop-blur-md sm:grid-cols-2">
            {genreLabel ? (
              <div>
                <dt className="text-white/55">{t("metaGenre")}</dt>
                <dd className="m-0">{genreLabel}</dd>
              </div>
            ) : null}
            {info?.info?.releaseDate ? (
              <div>
                <dt className="text-white/55">{t("metaReleased")}</dt>
                <dd className="m-0">{info.info.releaseDate}</dd>
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
        ) : null}

        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {seasonKeys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSeason(key)}
              className={`shrink-0 cursor-pointer rounded-full px-4 py-2 text-sm backdrop-blur-md ${
                season === key
                  ? "bg-[var(--xp-accent)] text-[var(--xp-ink)]"
                  : "border border-white/15 bg-black/40 text-white/80"
              }`}
            >
              Season {key}
            </button>
          ))}
        </div>

        <ul className="space-y-2 pb-8">
          {episodes.map((ep) => {
            const epTitle = ep.title || `Episode ${ep.episode_num ?? ep.id}`;
            const ext = ep.container_extension || "mp4";
            const saved = activePlaylist
              ? getContinueItem(activePlaylist.id, "series", ep.id)
              : undefined;
            const completed = saved ? isContinueCompleted(saved) : false;
            const position = saved?.position ?? 0;
            const duration = saved?.duration ?? 0;
            const pct =
              duration > 0 ? Math.min(100, Math.round((position / duration) * 100)) : 0;
            const canResumeEp = saved && position >= 5 && !completed;
            const watchBase = watchPath("series", ep.id, {
              title: `${title} · ${epTitle}`,
              ext,
              image: ep.info?.movie_image || image || "",
              seriesId: params.id,
              season,
              episode: String(ep.episode_num ?? ""),
              ...(parseMediaDuration(ep.info?.duration)
                ? {
                    duration: String(parseMediaDuration(ep.info?.duration)),
                  }
                : {}),
            });
            const watchHref = withBack(
              canResumeEp && saved ? continueWatchHref(saved) : watchBase,
              detailBack,
            );
            const startOverHref = saved
              ? withBack(continueFromZeroHref(saved), detailBack)
              : withBack(`${watchBase}${watchBase.includes("?") ? "&" : "?"}t=0`, detailBack);

            return (
              <li key={ep.id}>
                <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-white backdrop-blur-md transition hover:bg-black/55">
                  <div className="flex items-center gap-3">
                    <Link
                      href={watchHref}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--xp-accent)] text-[var(--xp-ink)]"
                    >
                      <Play className="h-4 w-4 fill-current" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href={watchHref} className="block min-w-0">
                        <p className="truncate font-medium">{epTitle}</p>
                        <p className="truncate text-xs text-white/60">
                          {completed
                            ? t("episodeCompleted")
                            : pct > 0
                              ? t("episodeProgress", { pct: String(pct) })
                              : ep.info?.duration || `S${season}E${ep.episode_num}`}
                        </p>
                      </Link>
                      {pct > 0 && !completed ? (
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/20">
                          <div
                            className="h-full rounded-full bg-[var(--xp-accent)]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                    {canResumeEp ? (
                      <Link
                        href={startOverHref}
                        className="shrink-0 text-xs font-semibold text-[var(--xp-accent)] hover:underline"
                      >
                        {t("episodeStartOver")}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
          {!episodes.length ? (
            <li className="text-sm text-white/60">
              No episodes in this season.
            </li>
          ) : null}
        </ul>
      </div>
    </TitleHero>
  );
}

export default function SeriesDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh">
          <Shimmer className="min-h-dvh w-full rounded-none" />
        </div>
      }
    >
      <SeriesDetailInner />
    </Suspense>
  );
}
