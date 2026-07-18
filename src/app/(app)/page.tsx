"use client";

import { useEffect, useMemo, useState } from "react";
import { BrowseRails, type BrowseKind } from "@/components/catalog/BrowseRails";
import { HeroBanner } from "@/components/catalog/HeroBanner";
import { MediaRow, type MediaRowItem } from "@/components/catalog/MediaRow";
import { PosterSkeletonRow } from "@/components/catalog/Skeleton";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { listContinue, listFavorites } from "@/lib/library/storage";
import {
  loadAllLiveStreams,
  loadAllSeries,
  loadAllVodStreams,
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
  const [section, setSection] = useState<Section>("live");
  const [continueItems, setContinueItems] = useState<MediaRowItem[]>([]);
  const [favLive, setFavLive] = useState<MediaRowItem[]>([]);
  const [favMovies, setFavMovies] = useState<MediaRowItem[]>([]);
  const [favSeries, setFavSeries] = useState<MediaRowItem[]>([]);
  const [featuredLive, setFeaturedLive] = useState<MediaRowItem[]>([]);
  const [featuredMovies, setFeaturedMovies] = useState<MediaRowItem[]>([]);
  const [featuredSeries, setFeaturedSeries] = useState<MediaRowItem[]>([]);
  const [loadingHighlights, setLoadingHighlights] = useState(true);

  useEffect(() => {
    if (!credentials || !activePlaylist) return;
    let cancelled = false;

    async function loadHighlights() {
      setLoadingHighlights(true);
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
          .slice(0, 24)
          .map((f) => ({
            key: f.id,
            href: watchPath("live", f.streamId, { title: f.title }),
            title: f.title,
            image: f.image,
            aspect: "live" as const,
          }));
        const movieFavs = favorites
          .filter((f) => f.kind === "movie")
          .slice(0, 24)
          .map((f) => ({
            key: f.id,
            href: `/movies/${f.streamId}`,
            title: f.title,
            image: f.image,
          }));
        const seriesFavs = favorites
          .filter((f) => f.kind === "series")
          .slice(0, 24)
          .map((f) => ({
            key: f.id,
            href: `/series/${f.streamId}`,
            title: f.title,
            image: f.image,
          }));

        const [liveAll, vodAll, seriesAll] = await Promise.all([
          loadAllLiveStreams(credentials!),
          loadAllVodStreams(credentials!),
          loadAllSeries(credentials!),
        ]);

        if (cancelled) return;

        setContinueItems(cont);
        setFavLive(liveFavs);
        setFavMovies(movieFavs);
        setFavSeries(seriesFavs);
        setFeaturedLive(
          liveAll.slice(0, 24).map((s) => ({
            key: `feat-live-${s.stream_id}`,
            href: watchPath("live", s.stream_id, { title: s.name }),
            title: s.name,
            image: s.stream_icon || undefined,
            aspect: "live" as const,
          })),
        );
        setFeaturedMovies(
          vodAll.slice(0, 24).map((s) => ({
            key: `feat-vod-${s.stream_id}`,
            href: `/movies/${s.stream_id}`,
            title: s.name,
            image: s.stream_icon || undefined,
            subtitle: s.rating ? `★ ${s.rating}` : undefined,
          })),
        );
        setFeaturedSeries(
          seriesAll.slice(0, 24).map((s) => ({
            key: `feat-series-${s.series_id}`,
            href: `/series/${s.series_id}`,
            title: s.name,
            image: s.cover || undefined,
            subtitle: s.rating ? `★ ${s.rating}` : undefined,
          })),
        );
      } finally {
        if (!cancelled) setLoadingHighlights(false);
      }
    }

    void loadHighlights();
    return () => {
      cancelled = true;
    };
  }, [credentials, activePlaylist]);

  const sectionFavorites = useMemo(() => {
    if (section === "live") return favLive;
    if (section === "movies") return favMovies;
    return favSeries;
  }, [section, favLive, favMovies, favSeries]);

  const sectionFeatured = useMemo(() => {
    if (section === "live") return featuredLive;
    if (section === "movies") return featuredMovies;
    return featuredSeries;
  }, [section, featuredLive, featuredMovies, featuredSeries]);

  const hero =
    sectionFavorites[0] ||
    continueItems.find((c) =>
      section === "live"
        ? c.aspect === "live"
        : section === "movies"
          ? c.href.startsWith("/movies")
          : c.href.startsWith("/series"),
    ) ||
    sectionFeatured[0] ||
    null;

  return (
    <div className="pb-8">
      <div className="sticky top-[52px] z-20 space-y-3 bg-gradient-to-b from-[rgba(11,15,20,0.96)] via-[rgba(11,15,20,0.88)] to-transparent px-4 pb-3 pt-2 md:static md:from-transparent md:px-6 md:pt-5">
        <div>
          <p className="font-[family-name:var(--xp-font-display)] text-xs font-bold tracking-[0.2em] text-[var(--xp-accent)]">
            XTREAM
          </p>
          <h1 className="font-[family-name:var(--xp-font-display)] text-2xl font-bold md:text-3xl">
            {activePlaylist?.name}
          </h1>
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setSection(filter.id)}
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

      {loadingHighlights ? (
        <div className="space-y-8 pt-4">
          <div className="xp-shimmer mx-4 h-48 rounded-2xl md:mx-6" />
          <PosterSkeletonRow />
        </div>
      ) : (
        <div className="space-y-6 pt-2 md:space-y-8">
          {hero ? (
            <HeroBanner
              eyebrow={
                section === "live"
                  ? "Live"
                  : section === "movies"
                    ? "Movies"
                    : "Series"
              }
              title={hero.title}
              subtitle={
                section === "live"
                  ? "Play now — rotate for fullscreen"
                  : "Open details to play"
              }
              image={hero.image}
              playHref={
                section === "live"
                  ? hero.href
                  : section === "movies" && hero.href.startsWith("/movies/")
                    ? watchPath("movie", hero.href.split("/").pop() || "", {
                        title: hero.title,
                        image: hero.image || "",
                      })
                    : hero.href
              }
              infoHref={
                section === "live" || hero.href.startsWith("/watch")
                  ? undefined
                  : hero.href
              }
            />
          ) : null}

          <MediaRow
            title="Continue watching"
            items={continueItems.filter((item) => {
              if (section === "live") return item.aspect === "live";
              if (section === "movies") return item.href.startsWith("/movies");
              return item.href.startsWith("/series");
            })}
            emptyLabel="Nothing here yet — start watching."
          />

          <MediaRow
            title={
              section === "live"
                ? "Favorite channels"
                : section === "movies"
                  ? "Favorite movies"
                  : "Favorite series"
            }
            items={sectionFavorites}
            emptyLabel="Heart titles to pin them here."
          />

          <MediaRow
            title={
              section === "live"
                ? "Live highlights"
                : section === "movies"
                  ? "Movie highlights"
                  : "Series highlights"
            }
            items={sectionFeatured}
          />

          <BrowseRails
            kind={section}
            title={
              section === "live"
                ? "Live TV"
                : section === "movies"
                  ? "Movies"
                  : "Series"
            }
            subtitle="Full catalog by category"
            embedded
          />
        </div>
      )}
    </div>
  );
}
