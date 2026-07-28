"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BrowseRails, type BrowseKind } from "@/components/catalog/BrowseRails";
import { HomeGenreBar } from "@/components/catalog/HomeGenreBar";
import { HeroBanner } from "@/components/catalog/HeroBanner";
import { MediaRow, type MediaRowItem } from "@/components/catalog/MediaRow";
import { PosterSkeletonRow } from "@/components/catalog/Skeleton";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useLibrary } from "@/components/providers/LibraryProvider";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { continueDetailHref, continueWatchHref } from "@/lib/library/continue";
import { currentBackPath, withBack } from "@/lib/navigation/back";
import {
  loadLiveByCategory,
  loadLiveCategories,
  loadSeriesByCategory,
  loadSeriesCategories,
  loadVodByCategory,
  loadVodCategories,
} from "@/lib/xtream/catalog-cache";
import { watchPath } from "@/lib/xtream/client";
import { formatRatingStar } from "@/lib/xtream/rating";
import { catalogTitle } from "@/lib/xtream/title";

type Section = BrowseKind;

function parseSection(value: string | null): Section | null {
  if (value === "live" || value === "movies" || value === "series") return value;
  return null;
}

function HomeInner() {
  const { credentials, activePlaylist } = usePlaylists();
  const { continueItems: libraryContinue, favorites, catalogVersion } = useLibrary();
  const { t } = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const backPath = currentBackPath(pathname, searchParams.toString());
  /** null = overview (a bit of everything). Driven by ?section= */
  const section = parseSection(searchParams.get("section"));
  const [featuredLive, setFeaturedLive] = useState<MediaRowItem[]>([]);
  const [featuredMovies, setFeaturedMovies] = useState<MediaRowItem[]>([]);
  const [featuredSeries, setFeaturedSeries] = useState<MediaRowItem[]>([]);
  const [loadingHighlights, setLoadingHighlights] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!credentials || !activePlaylist) return;
    let cancelled = false;

    async function loadHighlights() {
      setLoadingHighlights(true);
      setError(null);
      try {
        const [liveCats, vodCats, seriesCats] = await Promise.all([
          loadLiveCategories(credentials!),
          loadVodCategories(credentials!),
          loadSeriesCategories(credentials!),
        ]);

        const [liveSlice, vodSlice, seriesSlice] = await Promise.all([
          liveCats[0]
            ? loadLiveByCategory(credentials!, liveCats[0].category_id)
            : Promise.resolve([]),
          vodCats[0]
            ? loadVodByCategory(credentials!, vodCats[0].category_id)
            : Promise.resolve([]),
          seriesCats[0]
            ? loadSeriesByCategory(credentials!, seriesCats[0].category_id)
            : Promise.resolve([]),
        ]);

        if (cancelled) return;

        setFeaturedLive(
          liveSlice.slice(0, 16).map((s) => ({
            key: `feat-live-${s.stream_id}`,
            href: withBack(`/live/${s.stream_id}`, backPath),
            title: catalogTitle(s),
            image: s.stream_icon || undefined,
            aspect: "live" as const,
            kind: "live" as const,
            streamId: s.stream_id,
          })),
        );
        setFeaturedMovies(
          vodSlice.slice(0, 16).map((s) => ({
            key: `feat-vod-${s.stream_id}`,
            href: withBack(`/movies/${s.stream_id}`, backPath),
            title: catalogTitle(s),
            image: s.stream_icon || undefined,
            subtitle: formatRatingStar(s.rating),
            kind: "movie" as const,
            streamId: s.stream_id,
          })),
        );
        setFeaturedSeries(
          seriesSlice.slice(0, 16).map((s) => ({
            key: `feat-series-${s.series_id}`,
            href: withBack(`/series/${s.series_id}`, backPath),
            title: catalogTitle(s),
            image: s.cover || undefined,
            subtitle: formatRatingStar(s.rating),
            kind: "series" as const,
            streamId: s.series_id,
          })),
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load home");
        }
      } finally {
        if (!cancelled) setLoadingHighlights(false);
      }
    }

    void loadHighlights();
    return () => {
      cancelled = true;
    };
  }, [credentials, activePlaylist, catalogVersion, backPath]);

  const continueItems = useMemo(
    () =>
      libraryContinue.slice(0, 16).map((item) => ({
        key: item.id,
        href: continueDetailHref(item, backPath),
        playHref: continueWatchHref(item),
        title: catalogTitle({ name: item.title }),
        image: item.image,
        aspect: item.kind === "live" ? ("live" as const) : ("poster" as const),
        kind: item.kind,
        streamId: item.seriesId ?? item.streamId,
      })),
    [libraryContinue, backPath],
  );

  const favLive = useMemo(
    () =>
      favorites
        .filter((f) => f.kind === "live")
        .slice(0, 18)
        .map((f) => ({
          key: f.id,
          href: withBack(`/live/${f.streamId}`, backPath),
          title: catalogTitle({ name: f.title }),
          image: f.image,
          aspect: "live" as const,
          kind: "live" as const,
          streamId: f.streamId,
        })),
    [favorites, backPath],
  );

  const favMovies = useMemo(
    () =>
      favorites
        .filter((f) => f.kind === "movie")
        .slice(0, 18)
        .map((f) => ({
          key: f.id,
          href: withBack(`/movies/${f.streamId}`, backPath),
          title: catalogTitle({ name: f.title }),
          image: f.image,
          kind: "movie" as const,
          streamId: f.streamId,
        })),
    [favorites, backPath],
  );

  const favSeries = useMemo(
    () =>
      favorites
        .filter((f) => f.kind === "series")
        .slice(0, 18)
        .map((f) => ({
          key: f.id,
          href: withBack(`/series/${f.streamId}`, backPath),
          title: catalogTitle({ name: f.title }),
          image: f.image,
          kind: "series" as const,
          streamId: f.streamId,
        })),
    [favorites, backPath],
  );

  const hero =
    continueItems[0] ||
    favMovies[0] ||
    favSeries[0] ||
    favLive[0] ||
    featuredMovies[0] ||
    featuredSeries[0] ||
    featuredLive[0] ||
    null;

  const sectionContinue =
    section === "live"
      ? continueItems.filter((item) => item.kind === "live")
      : section === "movies"
        ? continueItems.filter((item) => item.kind === "movie")
        : section === "series"
          ? continueItems.filter((item) => item.kind === "series")
          : [];

  const sectionFavorites =
    section === "live"
      ? favLive
      : section === "movies"
        ? favMovies
        : section === "series"
          ? favSeries
          : [];

  const sectionHero =
    section === "live"
      ? sectionContinue[0] || sectionFavorites[0] || featuredLive[0] || null
      : section === "movies"
        ? sectionContinue[0] || sectionFavorites[0] || featuredMovies[0] || null
        : section === "series"
          ? sectionContinue[0] ||
            sectionFavorites[0] ||
            featuredSeries[0] ||
            null
          : null;

  const activeHero = section ? sectionHero : hero;

  const sectionFavTitle =
    section === "live"
      ? t("favoriteChannels")
      : section === "movies"
        ? t("favoriteMovies")
        : t("favoriteSeries");

  const sectionFavEmpty =
    section === "live"
      ? t("favoriteChannelsEmpty")
      : section === "movies"
        ? t("favoriteMoviesEmpty")
        : t("favoriteSeriesEmpty");

  const renderHero = (item: MediaRowItem | null) => {
    if (!item) return null;
    const detailHref = item.href;
    const playHref =
      item.playHref ||
      (item.href.startsWith("/movies/")
        ? watchPath(
            "movie",
            item.streamId ?? (item.href.split("/").pop() || ""),
            {
              title: item.title,
              image: item.image || "",
            },
          )
        : item.href);
    return (
      <HeroBanner
        underHeader
        cropLetterbox={section === "live" || item.aspect === "live"}
        eyebrow={t("homeForYou")}
        title={item.title}
        subtitle={t("homeHeroSubtitle")}
        image={item.image}
        playHref={playHref}
        infoHref={detailHref}
      />
    );
  };

  return (
    <div className="pb-8">
      {error ? (
        <p className="px-4 text-sm text-[var(--xp-danger)] lg:px-8 xl:px-12">
          {error}
        </p>
      ) : null}

      {/* Filtered catalog — only mounts when user picks LIVE/MOVIES/SERIES */}
      {section ? (
        <div className="space-y-6">
          {renderHero(activeHero)}
          <div className="space-y-6 pt-4">
            <HomeGenreBar kind={section} />
            <MediaRow
              title={t("continueWatching")}
              items={sectionContinue}
              emptyLabel={t("continueEmpty")}
            />
            <MediaRow
              title={sectionFavTitle}
              items={sectionFavorites}
              emptyLabel={sectionFavEmpty}
            />
          </div>
          <BrowseRails
            kind={section}
            title={
              section === "live"
                ? t("liveTv")
                : section === "movies"
                  ? t("movies")
                  : t("series")
            }
            subtitle={t("browseByCategory")}
            embedded
            hideHero
          />
        </div>
      ) : loadingHighlights ? (
        <div className="space-y-8 pt-4">
          <div className="xp-shimmer mx-4 h-48 rounded-2xl lg:mx-8 lg:h-64 xl:mx-12" />
          <PosterSkeletonRow />
        </div>
      ) : (
        <div className="space-y-6 lg:space-y-8">
          {renderHero(hero)}

          <div className="space-y-6 pt-2 lg:space-y-8 lg:pt-4">
            <MediaRow
              title={t("continueWatching")}
              items={continueItems}
              emptyLabel={t("continueEmpty")}
            />

            <MediaRow
              title={t("favoriteChannels")}
              items={favLive}
              emptyLabel={t("favoriteChannelsEmpty")}
            />
            <MediaRow title={t("liveHighlights")} items={featuredLive} />

            <MediaRow
              title={t("favoriteMovies")}
              items={favMovies}
              emptyLabel={t("favoriteMoviesEmpty")}
            />
            <MediaRow title={t("movieHighlights")} items={featuredMovies} />

            <MediaRow
              title={t("favoriteSeries")}
              items={favSeries}
              emptyLabel={t("favoriteSeriesEmpty")}
            />
            <MediaRow title={t("seriesHighlights")} items={featuredSeries} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-8 px-4 pb-8 pt-4 lg:px-6">
          <div className="xp-shimmer h-10 w-40 rounded" />
          <div className="xp-shimmer h-48 rounded-2xl" />
          <PosterSkeletonRow />
        </div>
      }
    >
      <HomeInner />
    </Suspense>
  );
}
