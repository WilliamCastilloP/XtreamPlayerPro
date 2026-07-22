"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrowseRails, type BrowseKind } from "@/components/catalog/BrowseRails";
import { HeroBanner } from "@/components/catalog/HeroBanner";
import { MediaRow, type MediaRowItem } from "@/components/catalog/MediaRow";
import { PosterSkeletonRow } from "@/components/catalog/Skeleton";
import { useLocale } from "@/components/providers/LocaleProvider";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { listContinue, listFavorites } from "@/lib/library/storage";
import {
  loadLiveByCategory,
  loadLiveCategories,
  loadSeriesByCategory,
  loadSeriesCategories,
  loadVodByCategory,
  loadVodCategories,
} from "@/lib/xtream/catalog-cache";
import { watchPath } from "@/lib/xtream/client";

type Section = BrowseKind;

const FILTER_IDS: Section[] = ["live", "movies", "series"];

function parseSection(value: string | null): Section | null {
  if (value === "live" || value === "movies" || value === "series") return value;
  return null;
}

function HomeInner() {
  const { credentials, activePlaylist } = usePlaylists();
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  /** null = overview (a bit of everything). Driven by ?section= */
  const section = parseSection(searchParams.get("section"));
  const [continueItems, setContinueItems] = useState<MediaRowItem[]>([]);
  const [favLive, setFavLive] = useState<MediaRowItem[]>([]);
  const [favMovies, setFavMovies] = useState<MediaRowItem[]>([]);
  const [favSeries, setFavSeries] = useState<MediaRowItem[]>([]);
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
        const cont = listContinue(activePlaylist!.id)
          .slice(0, 16)
          .map((item) => ({
            key: item.id,
            href:
              item.kind === "series"
                ? `/series/${item.seriesId ?? item.streamId}`
                : item.kind === "movie"
                  ? `/movies/${item.streamId}`
                  : `/live/${item.streamId}`,
            title: item.title,
            image: item.image,
            aspect:
              item.kind === "live" ? ("live" as const) : ("poster" as const),
          }));

        const favorites = listFavorites(activePlaylist!.id);
        const liveFavs = favorites
          .filter((f) => f.kind === "live")
          .slice(0, 18)
          .map((f) => ({
            key: f.id,
            href: `/live/${f.streamId}`,
            title: f.title,
            image: f.image,
            aspect: "live" as const,
          }));
        const movieFavs = favorites
          .filter((f) => f.kind === "movie")
          .slice(0, 18)
          .map((f) => ({
            key: f.id,
            href: `/movies/${f.streamId}`,
            title: f.title,
            image: f.image,
          }));
        const seriesFavs = favorites
          .filter((f) => f.kind === "series")
          .slice(0, 18)
          .map((f) => ({
            key: f.id,
            href: `/series/${f.streamId}`,
            title: f.title,
            image: f.image,
          }));

        // Lightweight: only the FIRST category of each type for highlights
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

        setContinueItems(cont);
        setFavLive(liveFavs);
        setFavMovies(movieFavs);
        setFavSeries(seriesFavs);
        setFeaturedLive(
          liveSlice.slice(0, 16).map((s) => ({
            key: `feat-live-${s.stream_id}`,
            href: `/live/${s.stream_id}`,
            title: s.name,
            image: s.stream_icon || undefined,
            aspect: "live" as const,
          })),
        );
        setFeaturedMovies(
          vodSlice.slice(0, 16).map((s) => ({
            key: `feat-vod-${s.stream_id}`,
            href: `/movies/${s.stream_id}`,
            title: s.name,
            image: s.stream_icon || undefined,
            subtitle: s.rating ? `★ ${s.rating}` : undefined,
          })),
        );
        setFeaturedSeries(
          seriesSlice.slice(0, 16).map((s) => ({
            key: `feat-series-${s.series_id}`,
            href: `/series/${s.series_id}`,
            title: s.name,
            image: s.cover || undefined,
            subtitle: s.rating ? `★ ${s.rating}` : undefined,
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
  }, [credentials, activePlaylist]);

  // Re-read local library when switching sections so new favorites appear immediately.
  useEffect(() => {
    if (!activePlaylist) return;
    const cont = listContinue(activePlaylist.id)
      .slice(0, 16)
      .map((item) => ({
        key: item.id,
        href:
          item.kind === "series"
            ? `/series/${item.seriesId ?? item.streamId}`
            : item.kind === "movie"
              ? `/movies/${item.streamId}`
              : `/live/${item.streamId}`,
        title: item.title,
        image: item.image,
        aspect:
          item.kind === "live" ? ("live" as const) : ("poster" as const),
      }));
    const favorites = listFavorites(activePlaylist.id);
    setContinueItems(cont);
    setFavLive(
      favorites
        .filter((f) => f.kind === "live")
        .slice(0, 18)
        .map((f) => ({
          key: f.id,
          href: `/live/${f.streamId}`,
          title: f.title,
          image: f.image,
          aspect: "live" as const,
        })),
    );
    setFavMovies(
      favorites
        .filter((f) => f.kind === "movie")
        .slice(0, 18)
        .map((f) => ({
          key: f.id,
          href: `/movies/${f.streamId}`,
          title: f.title,
          image: f.image,
        })),
    );
    setFavSeries(
      favorites
        .filter((f) => f.kind === "series")
        .slice(0, 18)
        .map((f) => ({
          key: f.id,
          href: `/series/${f.streamId}`,
          title: f.title,
          image: f.image,
        })),
    );
  }, [section, activePlaylist]);

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
      ? continueItems.filter((item) => item.href.startsWith("/live/"))
      : section === "movies"
        ? continueItems.filter((item) => item.href.startsWith("/movies/"))
        : section === "series"
          ? continueItems.filter((item) => item.href.startsWith("/series/"))
          : [];

  const sectionFavorites =
    section === "live"
      ? favLive
      : section === "movies"
        ? favMovies
        : section === "series"
          ? favSeries
          : [];

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

  return (
    <div className="pb-8">
      <div className="sticky top-[52px] z-20 space-y-3 bg-gradient-to-b from-[rgba(11,15,20,0.96)] via-[rgba(11,15,20,0.88)] to-transparent px-4 pb-3 pt-2 lg:static lg:bg-transparent lg:px-6 lg:pt-5">
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {FILTER_IDS.map((id) => {
            const label =
              id === "live"
                ? t("liveTv")
                : id === "movies"
                  ? t("movies")
                  : t("series");
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  const next = section === id ? null : id;
                  if (next) {
                    router.replace(`/?section=${next}`, { scroll: false });
                  } else {
                    router.replace("/", { scroll: false });
                  }
                }}
                className={`shrink-0 cursor-pointer rounded-full px-4 py-2 text-xs font-bold tracking-wide transition ${
                  section === id
                    ? "bg-[var(--xp-accent)] text-[var(--xp-ink)]"
                    : "bg-[var(--xp-surface)] text-[var(--xp-muted)]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <p className="px-4 text-sm text-[var(--xp-danger)] lg:px-6">{error}</p>
      ) : null}

      {/* Filtered catalog — only mounts when user picks LIVE/MOVIES/SERIES */}
      {section ? (
        <div className="space-y-6 pt-2">
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
          />
        </div>
      ) : loadingHighlights ? (
        <div className="space-y-8 pt-4">
          <div className="xp-shimmer mx-4 h-48 rounded-2xl lg:mx-6" />
          <PosterSkeletonRow />
        </div>
      ) : (
        <div className="space-y-6 pt-2 lg:space-y-8">
          {hero ? (
            <HeroBanner
              eyebrow={t("homeForYou")}
              title={hero.title}
              subtitle={t("homeHeroSubtitle")}
              image={hero.image}
              playHref={
                hero.href.startsWith("/movies/")
                  ? watchPath("movie", hero.href.split("/").pop() || "", {
                      title: hero.title,
                      image: hero.image || "",
                    })
                  : hero.href
              }
              infoHref={
                hero.href.startsWith("/watch") ? undefined : hero.href
              }
            />
          ) : null}

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
