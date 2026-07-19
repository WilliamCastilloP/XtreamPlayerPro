"use client";

import { useEffect, useState } from "react";
import { HeroBanner } from "@/components/catalog/HeroBanner";
import {
  MediaRow,
  STANDARD_POSTER_WIDTH,
  type MediaRowItem,
} from "@/components/catalog/MediaRow";
import { PosterSkeletonRow } from "@/components/catalog/Skeleton";
import { useLocale } from "@/components/providers/LocaleProvider";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import {
  groupByCategory,
  loadAllLiveStreams,
  loadAllSeries,
  loadAllVodStreams,
  loadLiveCategories,
  loadSeriesCategories,
  loadVodCategories,
  type LiveStream,
  type SeriesItem,
  type VodStream,
} from "@/lib/xtream/catalog-cache";
import { watchPath } from "@/lib/xtream/client";

export type BrowseKind = "live" | "movies" | "series";

type Props = {
  kind: BrowseKind;
  title: string;
  subtitle: string;
  embedded?: boolean;
};

type Rail = {
  id: string;
  name: string;
  items: MediaRowItem[];
  totalCount: number;
  href: string;
};

const PREVIEW_LIMIT = 6;
const PAINT_BATCH = 8;

function categoryHref(kind: BrowseKind, categoryId: string, name: string) {
  const params = new URLSearchParams({ name });
  return `/browse/${kind}/${encodeURIComponent(categoryId)}?${params.toString()}`;
}

function mapLiveItems(streams: LiveStream[]): MediaRowItem[] {
  return streams.map((s) => ({
    key: `live-${s.stream_id}`,
    href: watchPath("live", s.stream_id, { title: s.name }),
    title: s.name,
    image: s.stream_icon || undefined,
    aspect: "live" as const,
  }));
}

function mapVodItems(streams: VodStream[]): MediaRowItem[] {
  return streams.map((s) => ({
    key: `vod-${s.stream_id}`,
    href: `/movies/${s.stream_id}`,
    title: s.name,
    image: s.stream_icon || undefined,
    subtitle: s.rating ? `★ ${s.rating}` : undefined,
  }));
}

function mapSeriesItems(series: SeriesItem[]): MediaRowItem[] {
  return series.map((s) => ({
    key: `series-${s.series_id}`,
    href: `/series/${s.series_id}`,
    title: s.name,
    image: s.cover || undefined,
    subtitle: s.rating ? `★ ${s.rating}` : undefined,
  }));
}

export function BrowseRails({
  kind,
  title,
  subtitle,
  embedded = false,
}: Props) {
  const { credentials } = usePlaylists();
  const { t } = useLocale();
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
      setLoadingMore(false);
      try {
        const [cats, streams] = await Promise.all(
          kind === "live"
            ? [
                loadLiveCategories(credentials!),
                loadAllLiveStreams(credentials!),
              ]
            : kind === "movies"
              ? [
                  loadVodCategories(credentials!),
                  loadAllVodStreams(credentials!),
                ]
              : [
                  loadSeriesCategories(credentials!),
                  loadAllSeries(credentials!),
                ],
        );

        if (cancelled) return;

        const grouped =
          kind === "live"
            ? groupByCategory(cats, streams as LiveStream[])
            : kind === "movies"
              ? groupByCategory(cats, streams as VodStream[])
              : groupByCategory(cats, streams as SeriesItem[]);

        const built: Rail[] = grouped.map((rail) => {
          const previewSource = rail.items.slice(0, PREVIEW_LIMIT);
          const items =
            kind === "live"
              ? mapLiveItems(previewSource as LiveStream[])
              : kind === "movies"
                ? mapVodItems(previewSource as VodStream[])
                : mapSeriesItems(previewSource as SeriesItem[]);

          return {
            id: rail.category.category_id,
            name: rail.category.category_name,
            totalCount: rail.items.length,
            href: categoryHref(
              kind,
              rail.category.category_id,
              rail.category.category_name,
            ),
            items,
          };
        });

        setTotalCategories(built.length);

        const collected: Rail[] = [];
        for (let i = 0; i < built.length; i += PAINT_BATCH) {
          if (cancelled) return;
          if (i > 0) setLoadingMore(true);
          collected.push(...built.slice(i, i + PAINT_BATCH));
          setRails([...collected]);
          setLoading(false);
          if (i + PAINT_BATCH < built.length) {
            await new Promise((resolve) => window.setTimeout(resolve, 0));
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
  }, [credentials, kind]);

  const hero = rails[0]?.items[0];
  const isLive = kind === "live";
  const kindLabel =
    kind === "movies" ? t("movies") : kind === "series" ? t("series") : t("liveTv");

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
          <p className="px-4 text-sm text-[var(--xp-muted)] md:px-6">
            {t("loadingCatalog", { kind: kindLabel.toLowerCase() })}
          </p>
          <PosterSkeletonRow />
          <PosterSkeletonRow />
        </div>
      ) : (
        <>
          {rails.length > 0 ? (
            <p className="px-4 text-xs text-[var(--xp-muted)] md:px-6">
              {t("categoriesPreview", {
                shown: String(rails.length),
                total:
                  totalCategories > rails.length
                    ? ` / ${totalCategories}`
                    : "",
                limit: PREVIEW_LIMIT,
              })}
              {loadingMore ? t("loadingMore") : ""}
            </p>
          ) : null}

          {hero ? (
            <HeroBanner
              eyebrow={rails[0]?.name || title}
              title={hero.title}
              subtitle={
                isLive ? t("tapPlayRotate") : hero.subtitle || t("openDetails")
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
              href={rail.href}
              seeAllLabel={
                rail.totalCount > PREVIEW_LIMIT
                  ? t("seeAllCount", { count: rail.totalCount })
                  : t("seeAll")
              }
              items={rail.items}
              posterWidth={STANDARD_POSTER_WIDTH}
            />
          ))}

          {!rails.length && !loading ? (
            <p className="px-4 text-sm text-[var(--xp-muted)] md:px-6">
              {t("noTitlesCatalog")}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
