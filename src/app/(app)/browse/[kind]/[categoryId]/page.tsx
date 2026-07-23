"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { CatalogPager } from "@/components/catalog/CatalogPager";
import { PosterCard } from "@/components/catalog/PosterCard";
import { PosterSkeletonRow } from "@/components/catalog/Skeleton";
import type { BrowseKind } from "@/components/catalog/BrowseRails";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import type { FavoriteItem } from "@/lib/library/storage";
import {
  loadLiveByCategory,
  loadSeriesByGenre,
  loadVodByGenre,
} from "@/lib/xtream/catalog-cache";
import { formatRatingStar } from "@/lib/xtream/rating";
import { catalogTitle } from "@/lib/xtream/title";

type GridItem = {
  key: string;
  href: string;
  title: string;
  image?: string;
  subtitle?: string;
  aspect?: "poster" | "live";
  kind: FavoriteItem["kind"];
  streamId: number | string;
};

function isBrowseKind(value: string): value is BrowseKind {
  return value === "live" || value === "movies" || value === "series";
}

function CategoryBrowseInner() {
  const params = useParams<{ kind: string; categoryId: string }>();
  const searchParams = useSearchParams();
  const { credentials } = usePlaylists();
  const [items, setItems] = useState<GridItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const kind = isBrowseKind(params.kind) ? params.kind : null;
  const filterKey = decodeURIComponent(params.categoryId || "");
  const categoryName =
    searchParams.get("name")?.trim() ||
    filterKey ||
    (kind === "live"
      ? "Live"
      : kind === "movies"
        ? "Movies"
        : kind === "series"
          ? "Series"
          : "Category");

  const kindLabel = useMemo(() => {
    if (kind === "live") return "Live TV";
    if (kind === "movies") return "Movies";
    if (kind === "series") return "Series";
    return "Catalog";
  }, [kind]);

  useEffect(() => {
    if (!credentials || !kind || !filterKey) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        let next: GridItem[] = [];
        if (kind === "live") {
          const streams = await loadLiveByCategory(credentials!, filterKey);
          next = streams.map((s) => ({
            key: `live-${s.stream_id}`,
            href: `/live/${s.stream_id}`,
            title: catalogTitle(s),
            image: s.stream_icon || undefined,
            aspect: "live" as const,
            kind: "live" as const,
            streamId: s.stream_id,
          }));
        } else if (kind === "movies") {
          const streams = await loadVodByGenre(credentials!, filterKey);
          next = streams.map((s) => ({
            key: `vod-${s.stream_id}`,
            href: `/movies/${s.stream_id}`,
            title: catalogTitle(s),
            image: s.stream_icon || undefined,
            subtitle: formatRatingStar(s.rating),
            kind: "movie" as const,
            streamId: s.stream_id,
          }));
        } else {
          const series = await loadSeriesByGenre(credentials!, filterKey);
          next = series.map((s) => ({
            key: `series-${s.series_id}`,
            href: `/series/${s.series_id}`,
            title: catalogTitle(s),
            image: s.cover || undefined,
            subtitle: formatRatingStar(s.rating),
            kind: "series" as const,
            streamId: s.series_id,
          }));
        }
        if (!cancelled) setItems(next);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load category",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [credentials, kind, filterKey]);

  if (!kind) {
    return (
      <div className="space-y-4 px-4 py-6 md:px-6">
        <p className="text-sm text-[var(--xp-danger)]">Invalid catalog type.</p>
        <Link href="/" className="text-sm text-[var(--xp-accent)] hover:underline">
          Back to Home
        </Link>
      </div>
    );
  }

  const isLive = kind === "live";

  return (
    <div className="space-y-5 pb-8 pt-3 md:pt-5">
      <div className="space-y-3 px-4 md:px-6">
        <Link
          href={`/?section=${kind}`}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--xp-muted)] transition hover:text-[var(--xp-text)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {kindLabel}
        </Link>
        <div>
          <h1 className="font-[family-name:var(--xp-font-display)] text-2xl font-bold md:text-3xl">
            {categoryName}
          </h1>
          <p className="text-sm text-[var(--xp-muted)]">
            {loading
              ? "Loading…"
              : `${items.length.toLocaleString()} ${
                  isLive ? "channels" : "titles"
                }`}
          </p>
        </div>
      </div>

      {error ? (
        <p className="px-4 text-sm text-[var(--xp-danger)] md:px-6">{error}</p>
      ) : null}

      {loading ? (
        <div className="space-y-6">
          <PosterSkeletonRow />
          <PosterSkeletonRow />
        </div>
      ) : items.length ? (
        <CatalogPager
          items={items}
          renderItem={(item) => (
            <PosterCard
              href={item.href}
              title={item.title}
              image={item.image}
              subtitle={item.subtitle}
              aspect={item.aspect}
              kind={item.kind}
              streamId={item.streamId}
            />
          )}
        />
      ) : (
        <p className="px-4 text-sm text-[var(--xp-muted)] md:px-6">
          No titles in this category.
        </p>
      )}
    </div>
  );
}

export default function CategoryBrowsePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 px-4 pb-8 pt-4 md:px-6">
          <div className="xp-shimmer h-8 w-32 rounded" />
          <div className="xp-shimmer h-10 w-64 rounded" />
          <PosterSkeletonRow />
        </div>
      }
    >
      <CategoryBrowseInner />
    </Suspense>
  );
}
