"use client";

import { useEffect, useState } from "react";
import { HeroBanner } from "@/components/catalog/HeroBanner";
import { MediaRow, type MediaRowItem } from "@/components/catalog/MediaRow";
import { PosterSkeletonRow } from "@/components/catalog/Skeleton";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import {
  getLiveCategories,
  getLiveStreams,
  getSeries,
  getSeriesCategories,
  getVodCategories,
  getVodStreams,
  watchPath,
} from "@/lib/xtream/client";

type BrowseKind = "live" | "movies" | "series";

type Props = {
  kind: BrowseKind;
  title: string;
  subtitle: string;
  maxRails?: number;
};

type Rail = {
  id: string;
  name: string;
  items: MediaRowItem[];
};

export function BrowseRails({
  kind,
  title,
  subtitle,
  maxRails = 8,
}: Props) {
  const { credentials } = usePlaylists();
  const [rails, setRails] = useState<Rail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!credentials) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const cats =
          kind === "live"
            ? await getLiveCategories(credentials!)
            : kind === "movies"
              ? await getVodCategories(credentials!)
              : await getSeriesCategories(credentials!);

        const picked = cats.slice(0, maxRails);
        const loaded = await Promise.all(
          picked.map(async (cat) => {
            try {
              if (kind === "live") {
                const streams = await getLiveStreams(
                  credentials!,
                  cat.category_id,
                );
                return {
                  id: cat.category_id,
                  name: cat.category_name,
                  items: streams.slice(0, 24).map((s) => ({
                    key: `live-${s.stream_id}`,
                    href: watchPath("live", s.stream_id, { title: s.name }),
                    title: s.name,
                    image: s.stream_icon || undefined,
                    aspect: "live" as const,
                  })),
                };
              }
              if (kind === "movies") {
                const streams = await getVodStreams(
                  credentials!,
                  cat.category_id,
                );
                return {
                  id: cat.category_id,
                  name: cat.category_name,
                  items: streams.slice(0, 24).map((s) => ({
                    key: `vod-${s.stream_id}`,
                    href: `/movies/${s.stream_id}`,
                    title: s.name,
                    image: s.stream_icon || undefined,
                    subtitle: s.rating ? `★ ${s.rating}` : undefined,
                  })),
                };
              }
              const series = await getSeries(credentials!, cat.category_id);
              return {
                id: cat.category_id,
                name: cat.category_name,
                items: series.slice(0, 24).map((s) => ({
                  key: `series-${s.series_id}`,
                  href: `/series/${s.series_id}`,
                  title: s.name,
                  image: s.cover || undefined,
                  subtitle: s.rating ? `★ ${s.rating}` : undefined,
                })),
              };
            } catch {
              return {
                id: cat.category_id,
                name: cat.category_name,
                items: [] as MediaRowItem[],
              };
            }
          }),
        );
        if (!cancelled) {
          setRails(loaded.filter((rail) => rail.items.length > 0));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load catalog");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [credentials, kind, maxRails]);

  const hero = rails[0]?.items[0];
  const isLive = kind === "live";

  return (
    <div className="space-y-6 pb-8 pt-3 md:space-y-8 md:pt-5">
      <div className="px-4 md:px-6">
        <h1 className="font-[family-name:var(--xp-font-display)] text-2xl font-bold md:text-3xl">
          {title}
        </h1>
        <p className="text-sm text-[var(--xp-muted)]">{subtitle}</p>
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
              eyebrow={rails[0]?.name || title}
              title={hero.title}
              subtitle={
                isLive
                  ? "Tap Play — rotate your phone for fullscreen"
                  : hero.subtitle || "Tap a poster or Play to start"
              }
              image={hero.image}
              playHref={
                isLive
                  ? hero.href
                  : kind === "movies"
                    ? watchPath("movie", hero.href.split("/").pop() || "", {
                        title: hero.title,
                        image: hero.image || "",
                      })
                    : hero.href
              }
              infoHref={isLive ? undefined : hero.href}
            />
          ) : null}

          {rails.map((rail) => (
            <MediaRow
              key={rail.id}
              title={rail.name}
              items={rail.items}
              posterWidth={
                isLive
                  ? "w-[42vw] max-w-[14rem] min-w-[9rem] sm:w-48"
                  : "w-[30vw] max-w-[9.5rem] min-w-[6.5rem] sm:w-36 md:w-40"
              }
            />
          ))}

          {!rails.length ? (
            <p className="px-4 text-sm text-[var(--xp-muted)] md:px-6">
              No titles in this catalog yet.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
