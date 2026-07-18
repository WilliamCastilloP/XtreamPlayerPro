"use client";

import { useEffect, useState } from "react";
import { BrowseRails, type BrowseKind } from "@/components/catalog/BrowseRails";
import { HeroBanner } from "@/components/catalog/HeroBanner";
import { MediaRow, type MediaRowItem } from "@/components/catalog/MediaRow";
import { PosterSkeletonRow } from "@/components/catalog/Skeleton";
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

const FILTERS: { id: Section; label: string }[] = [
  { id: "live", label: "LIVE" },
  { id: "movies", label: "MOVIES" },
  { id: "series", label: "SERIES" },
];

export default function HomePage() {
  const { credentials, activePlaylist } = usePlaylists();
  /** null = overview (a bit of everything). No filter pre-selected. */
  const [section, setSection] = useState<Section | null>(null);
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
                  : watchPath("live", item.streamId, { title: item.title }),
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
            href: watchPath("live", f.streamId, { title: f.title }),
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
            href: watchPath("live", s.stream_id, { title: s.name }),
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

  const hero =
    continueItems[0] ||
    favMovies[0] ||
    favSeries[0] ||
    favLive[0] ||
    featuredMovies[0] ||
    featuredSeries[0] ||
    featuredLive[0] ||
    null;

  return (
    <div className="pb-8">
      <div className="sticky top-[52px] z-20 space-y-3 bg-gradient-to-b from-[rgba(11,15,20,0.96)] via-[rgba(11,15,20,0.88)] to-transparent px-4 pb-3 pt-2 md:static md:bg-transparent md:px-6 md:pt-5">
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() =>
                setSection((current) =>
                  current === filter.id ? null : filter.id,
                )
              }
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold tracking-wide transition ${
                section === filter.id
                  ? "bg-[var(--xp-accent)] text-[var(--xp-ink)]"
                  : "bg-[var(--xp-surface)] text-[var(--xp-muted)]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="px-4 text-sm text-[var(--xp-danger)] md:px-6">{error}</p>
      ) : null}

      {/* Filtered catalog — only mounts when user picks LIVE/MOVIES/SERIES */}
      {section ? (
        <BrowseRails
          kind={section}
          title={
            section === "live"
              ? "Live TV"
              : section === "movies"
                ? "Movies"
                : "Series"
          }
          subtitle="Browse by category"
          embedded
          maxRails={16}
        />
      ) : loadingHighlights ? (
        <div className="space-y-8 pt-4">
          <div className="xp-shimmer mx-4 h-48 rounded-2xl md:mx-6" />
          <PosterSkeletonRow />
        </div>
      ) : (
        <div className="space-y-6 pt-2 md:space-y-8">
          {hero ? (
            <HeroBanner
              eyebrow="For you"
              title={hero.title}
              subtitle="A mix of favorites and highlights — pick LIVE, MOVIES or SERIES to browse all"
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
            title="Continue watching"
            items={continueItems}
            emptyLabel="Start watching to build this list."
          />

          <MediaRow
            title="Favorite channels"
            items={favLive}
            emptyLabel="Heart live channels to pin them here."
          />
          <MediaRow title="Live highlights" items={featuredLive} />

          <MediaRow
            title="Favorite movies"
            items={favMovies}
            emptyLabel="Heart movies to pin them here."
          />
          <MediaRow title="Movie highlights" items={featuredMovies} />

          <MediaRow
            title="Favorite series"
            items={favSeries}
            emptyLabel="Heart series to pin them here."
          />
          <MediaRow title="Series highlights" items={featuredSeries} />
        </div>
      )}
    </div>
  );
}
