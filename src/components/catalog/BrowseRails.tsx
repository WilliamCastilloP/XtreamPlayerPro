"use client";

import { useEffect, useState } from "react";
import { HeroBanner } from "@/components/catalog/HeroBanner";
import { MediaRow, type MediaRowItem } from "@/components/catalog/MediaRow";
import { PosterSkeletonRow } from "@/components/catalog/Skeleton";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import {
  loadLiveByCategory,
  loadLiveCategories,
  loadSeriesByCategory,
  loadSeriesCategories,
  loadVodByCategory,
  loadVodCategories,
} from "@/lib/xtream/catalog-cache";
import { watchPath } from "@/lib/xtream/client";

export type BrowseKind = "live" | "movies" | "series";

type Props = {
  kind: BrowseKind;
  title: string;
  subtitle: string;
  embedded?: boolean;
  /** How many category rails to load (keeps UI responsive) */
  maxRails?: number;
};

type Rail = {
  id: string;
  name: string;
  items: MediaRowItem[];
};

const BATCH = 3;

export function BrowseRails({
  kind,
  title,
  subtitle,
  embedded = false,
  maxRails = 12,
}: Props) {
  const { credentials } = usePlaylists();
  const [rails, setRails] = useState<Rail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCategories, setTotalCategories] = useState(0);

  useEffect(() => {
    if (!credentials) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setRails([]);
      try {
        const cats =
          kind === "live"
            ? await loadLiveCategories(credentials!)
            : kind === "movies"
              ? await loadVodCategories(credentials!)
              : await loadSeriesCategories(credentials!);

        if (cancelled) return;
        setTotalCategories(cats.length);
        const picked = cats.slice(0, maxRails);

        // Progressive batches — never download the entire panel as one giant JSON
        const collected: Rail[] = [];
        for (let i = 0; i < picked.length; i += BATCH) {
          if (cancelled) return;
          if (i > 0) setLoadingMore(true);
          const chunk = picked.slice(i, i + BATCH);
          const batchRails = await Promise.all(
            chunk.map(async (cat) => {
              try {
                if (kind === "live") {
                  const streams = await loadLiveByCategory(
                    credentials!,
                    cat.category_id,
                  );
                  return {
                    id: cat.category_id,
                    name: cat.category_name,
                    items: streams.map((s) => ({
                      key: `live-${s.stream_id}`,
                      href: watchPath("live", s.stream_id, { title: s.name }),
                      title: s.name,
                      image: s.stream_icon || undefined,
                      aspect: "live" as const,
                    })),
                  };
                }
                if (kind === "movies") {
                  const streams = await loadVodByCategory(
                    credentials!,
                    cat.category_id,
                  );
                  return {
                    id: cat.category_id,
                    name: cat.category_name,
                    items: streams.map((s) => ({
                      key: `vod-${s.stream_id}`,
                      href: `/movies/${s.stream_id}`,
                      title: s.name,
                      image: s.stream_icon || undefined,
                      subtitle: s.rating ? `★ ${s.rating}` : undefined,
                    })),
                  };
                }
                const series = await loadSeriesByCategory(
                  credentials!,
                  cat.category_id,
                );
                return {
                  id: cat.category_id,
                  name: cat.category_name,
                  items: series.map((s) => ({
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
          collected.push(...batchRails.filter((r) => r.items.length > 0));
          if (!cancelled) {
            setRails([...collected]);
            setLoading(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load catalog");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [credentials, kind, maxRails]);

  const hero = rails[0]?.items[0];
  const isLive = kind === "live";
  const total = rails.reduce((sum, rail) => sum + rail.items.length, 0);

  return (
    <div
      className={`space-y-6 pb-8 ${embedded ? "pt-2" : "pt-3 md:pt-5"} md:space-y-8`}
    >
      {!embedded ? (
        <div className="px-4 md:px-6">
          <h1 className="font-[family-name:var(--xp-font-display)] text-2xl font-bold md:text-3xl">
            {title}
          </h1>
          <p className="text-sm text-[var(--xp-muted)]">{subtitle}</p>
        </div>
      ) : null}

      {error ? (
        <p className="px-4 text-sm text-[var(--xp-danger)] md:px-6">{error}</p>
      ) : null}

      {loading && !rails.length ? (
        <div className="space-y-8">
          <div className="xp-shimmer mx-4 h-48 rounded-2xl md:mx-6 md:h-64" />
          <PosterSkeletonRow />
          <PosterSkeletonRow />
        </div>
      ) : (
        <>
          {total > 0 ? (
            <p className="px-4 text-xs text-[var(--xp-muted)] md:px-6">
              {total.toLocaleString()} titles · {rails.length}
              {totalCategories > rails.length
                ? ` / ${totalCategories}`
                : ""}{" "}
              categories
              {loadingMore ? " · loading more…" : ""}
            </p>
          ) : null}

          {hero ? (
            <HeroBanner
              eyebrow={rails[0]?.name || title}
              title={hero.title}
              subtitle={
                isLive
                  ? "Tap Play — rotate your phone for fullscreen"
                  : hero.subtitle || "Open details to play"
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
              title={`${rail.name} (${rail.items.length})`}
              items={rail.items}
              posterWidth={
                isLive
                  ? "w-[42vw] max-w-[14rem] min-w-[9rem] sm:w-48"
                  : "w-[30vw] max-w-[9.5rem] min-w-[6.5rem] sm:w-36 md:w-40"
              }
            />
          ))}

          {!rails.length && !loading ? (
            <p className="px-4 text-sm text-[var(--xp-muted)] md:px-6">
              No titles in this catalog yet.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
