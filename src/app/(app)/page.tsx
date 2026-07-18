"use client";

import { useEffect, useState } from "react";
import { MediaRow, type MediaRowItem } from "@/components/catalog/MediaRow";
import { PosterSkeletonRow } from "@/components/catalog/Skeleton";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { listContinue } from "@/lib/library/storage";
import {
  getLiveStreams,
  getSeries,
  getVodStreams,
  watchPath,
} from "@/lib/xtream/client";

export default function HomePage() {
  const { credentials, activePlaylist } = usePlaylists();
  const [continueItems, setContinueItems] = useState<MediaRowItem[]>([]);
  const [live, setLive] = useState<MediaRowItem[]>([]);
  const [movies, setMovies] = useState<MediaRowItem[]>([]);
  const [series, setSeries] = useState<MediaRowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!credentials || !activePlaylist) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const cont = listContinue(activePlaylist!.id).slice(0, 12).map((item) => ({
          key: item.id,
          href:
            item.kind === "series"
              ? `/series/${item.seriesId ?? item.streamId}`
              : item.kind === "movie"
                ? `/movies/${item.streamId}`
                : watchPath("live", item.streamId, { title: item.title }),
          title: item.title,
          image: item.image,
          aspect: item.kind === "live" ? ("live" as const) : ("poster" as const),
        }));

        const [liveStreams, vodStreams, seriesItems] = await Promise.all([
          getLiveStreams(credentials!),
          getVodStreams(credentials!),
          getSeries(credentials!),
        ]);

        if (cancelled) return;

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
        setMovies(
          vodStreams.slice(0, 18).map((s) => ({
            key: `vod-${s.stream_id}`,
            href: `/movies/${s.stream_id}`,
            title: s.name,
            image: s.stream_icon || undefined,
            subtitle: s.rating ? `★ ${s.rating}` : undefined,
          })),
        );
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

  return (
    <div className="space-y-8 py-5 md:py-8">
      <section className="xp-fade-in px-4 md:px-6">
        <p className="text-sm text-[var(--xp-muted)]">Now playing from</p>
        <h1 className="font-[family-name:var(--xp-font-display)] text-2xl font-bold md:text-3xl">
          {activePlaylist?.name}
        </h1>
      </section>

      {error ? (
        <p className="px-4 text-sm text-[var(--xp-danger)] md:px-6">{error}</p>
      ) : null}

      {loading ? (
        <div className="space-y-8">
          <PosterSkeletonRow />
          <PosterSkeletonRow />
        </div>
      ) : (
        <>
          <MediaRow
            title="Continue watching"
            items={continueItems}
            emptyLabel="Start watching to build your list."
          />
          <MediaRow title="Live channels" href="/live" items={live} />
          <MediaRow title="Movies" href="/movies" items={movies} />
          <MediaRow title="Series" href="/series" items={series} />
        </>
      )}
    </div>
  );
}
