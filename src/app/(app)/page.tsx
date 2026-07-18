"use client";

import { useEffect, useState } from "react";
import { HeroBanner } from "@/components/catalog/HeroBanner";
import { MediaRow, type MediaRowItem } from "@/components/catalog/MediaRow";
import { PosterSkeletonRow } from "@/components/catalog/Skeleton";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { listContinue } from "@/lib/library/storage";
import {
  getLiveCategories,
  getLiveStreams,
  getSeries,
  getSeriesCategories,
  getVodCategories,
  getVodStreams,
  watchPath,
} from "@/lib/xtream/client";

export default function HomePage() {
  const { credentials, activePlaylist } = usePlaylists();
  const [continueItems, setContinueItems] = useState<MediaRowItem[]>([]);
  const [live, setLive] = useState<MediaRowItem[]>([]);
  const [movies, setMovies] = useState<MediaRowItem[]>([]);
  const [series, setSeries] = useState<MediaRowItem[]>([]);
  const [moreMovieRails, setMoreMovieRails] = useState<
    { id: string; name: string; items: MediaRowItem[] }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!credentials || !activePlaylist) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const cont = listContinue(activePlaylist!.id)
          .slice(0, 12)
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

        const [liveCats, vodCats, seriesCats] = await Promise.all([
          getLiveCategories(credentials!),
          getVodCategories(credentials!),
          getSeriesCategories(credentials!),
        ]);

        const movieCatSlice = vodCats.slice(0, 4);

        const [liveStreams, seriesItems, ...movieChunks] = await Promise.all([
          liveCats[0]
            ? getLiveStreams(credentials!, liveCats[0].category_id)
            : Promise.resolve([]),
          seriesCats[0]
            ? getSeries(credentials!, seriesCats[0].category_id)
            : Promise.resolve([]),
          ...movieCatSlice.map((cat) =>
            getVodStreams(credentials!, cat.category_id).catch(() => []),
          ),
        ]);

        if (cancelled) return;

        const movieRails = movieCatSlice.map((cat, index) => ({
          id: cat.category_id,
          name: cat.category_name,
          items: (movieChunks[index] || []).slice(0, 18).map((s) => ({
            key: `vod-${cat.category_id}-${s.stream_id}`,
            href: `/movies/${s.stream_id}`,
            title: s.name,
            image: s.stream_icon || undefined,
            subtitle: s.rating ? `★ ${s.rating}` : undefined,
          })),
        }));

        setContinueItems(cont);
        setLive(
          liveStreams.slice(0, 18).map((s) => ({
            key: `live-${s.stream_id}`,
            href: watchPath("live", s.stream_id, { title: s.name }),
            title: s.name,
            image: s.stream_icon || undefined,
            aspect: "live" as const,
          })),
        );
        setMovies(movieRails[0]?.items || []);
        setMoreMovieRails(movieRails.slice(1).filter((r) => r.items.length));
        setSeries(
          seriesItems.slice(0, 18).map((s) => ({
            key: `series-${s.series_id}`,
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
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [credentials, activePlaylist]);

  const hero =
    continueItems[0] || movies[0] || series[0] || live[0] || null;

  return (
    <div className="space-y-6 pb-8 pt-3 md:space-y-8 md:pt-5">
      <div className="px-4 md:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--xp-accent)]">
          XtreamPlayerPro
        </p>
        <h1 className="font-[family-name:var(--xp-font-display)] text-2xl font-bold md:text-3xl">
          {activePlaylist?.name}
        </h1>
      </div>

      {error ? (
        <p className="px-4 text-sm text-[var(--xp-danger)] md:px-6">{error}</p>
      ) : null}

      {loading ? (
        <div className="space-y-8">
          <div className="xp-shimmer mx-4 h-48 rounded-2xl md:mx-6 md:h-64" />
          <PosterSkeletonRow />
          <PosterSkeletonRow />
        </div>
      ) : (
        <>
          {hero ? (
            <HeroBanner
              eyebrow="For you"
              title={hero.title}
              subtitle="Play now — rotate your phone for a cinema view"
              image={hero.image}
              playHref={hero.href}
              infoHref={
                hero.href.startsWith("/watch") ? undefined : hero.href
              }
            />
          ) : null}

          <MediaRow
            title="Continue watching"
            items={continueItems}
            emptyLabel="Start watching to build your list."
          />
          <MediaRow title="Live TV" href="/live" items={live} />
          <MediaRow
            title={moreMovieRails.length ? "Movies" : "Movies"}
            href="/movies"
            items={movies}
          />
          {moreMovieRails.map((rail) => (
            <MediaRow
              key={rail.id}
              title={rail.name}
              href="/movies"
              items={rail.items}
            />
          ))}
          <MediaRow title="Series" href="/series" items={series} />
        </>
      )}
    </div>
  );
}
