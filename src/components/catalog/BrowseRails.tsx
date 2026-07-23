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
  groupByGenre,
  loadAllLiveStreams,
  loadAllSeries,
  loadAllVodStreams,
  loadLiveCategories,
  type LiveStream,
  type SeriesItem,
  type VodStream,
} from "@/lib/xtream/catalog-cache";
import { watchPath } from "@/lib/xtream/client";
import { formatRatingStar } from "@/lib/xtream/rating";
import { catalogTitle } from "@/lib/xtream/title";

export type BrowseKind = "live" | "movies" | "series";

type Props = {
  kind: BrowseKind;
  title: string;
  subtitle: string;
  embedded?: boolean;
  /** Skip the featured hero (e.g. parent already shows one under the header) */
  hideHero?: boolean;
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
  const seen = new Set<number | string>();
  const out: MediaRowItem[] = [];
  for (const s of streams) {
    if (seen.has(s.stream_id)) continue;
    seen.add(s.stream_id);
    out.push({
      key: `live-${s.stream_id}`,
      href: `/live/${s.stream_id}`,
      title: catalogTitle(s),
      image: s.stream_icon || undefined,
      aspect: "live" as const,
      kind: "live" as const,
      streamId: s.stream_id,
    });
  }
  return out;
}

function mapVodItems(streams: VodStream[]): MediaRowItem[] {
  const seen = new Set<number | string>();
  const out: MediaRowItem[] = [];
  for (const s of streams) {
    if (seen.has(s.stream_id)) continue;
    seen.add(s.stream_id);
    out.push({
      key: `vod-${s.stream_id}`,
      href: `/movies/${s.stream_id}`,
      title: catalogTitle(s),
      image: s.stream_icon || undefined,
      subtitle: formatRatingStar(s.rating),
      kind: "movie" as const,
      streamId: s.stream_id,
    });
  }
  return out;
}

function mapSeriesItems(series: SeriesItem[]): MediaRowItem[] {
  const seen = new Set<number | string>();
  const out: MediaRowItem[] = [];
  for (const s of series) {
    if (seen.has(s.series_id)) continue;
    seen.add(s.series_id);
    out.push({
      key: `series-${s.series_id}`,
      href: `/series/${s.series_id}`,
      title: catalogTitle(s),
      image: s.cover || undefined,
      subtitle: formatRatingStar(s.rating),
      kind: "series" as const,
      streamId: s.series_id,
    });
  }
  return out;
}

export function BrowseRails({
  kind,
  title,
  subtitle,
  embedded = false,
  hideHero = false,
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
        let built: Rail[] = [];

        if (kind === "live") {
          const [cats, streams] = await Promise.all([
            loadLiveCategories(credentials!),
            loadAllLiveStreams(credentials!),
          ]);
          if (cancelled) return;
          const grouped = groupByCategory(cats, streams);
          built = grouped.map((rail) => ({
            id: rail.category.category_id,
            name: rail.category.category_name,
            totalCount: rail.items.length,
            href: categoryHref(
              kind,
              rail.category.category_id,
              rail.category.category_name,
            ),
            items: mapLiveItems(rail.items.slice(0, PREVIEW_LIMIT)),
          }));
        } else {
          const streams =
            kind === "movies"
              ? await loadAllVodStreams(credentials!)
              : await loadAllSeries(credentials!);
          if (cancelled) return;
          const grouped =
            kind === "movies"
              ? groupByGenre(streams as VodStream[])
              : groupByGenre(streams as SeriesItem[]);
          built = grouped.map((rail) => ({
            id: rail.genre,
            name: rail.genre,
            totalCount: rail.items.length,
            href: categoryHref(kind, rail.genre, rail.genre),
            items:
              kind === "movies"
                ? mapVodItems(
                    (rail.items as VodStream[]).slice(0, PREVIEW_LIMIT),
                  )
                : mapSeriesItems(
                    (rail.items as SeriesItem[]).slice(0, PREVIEW_LIMIT),
                  ),
          }));
        }

        if (cancelled) return;

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
      className={`space-y-6 pb-8 ${embedded ? "pt-0" : "pt-3 lg:pt-5"} lg:space-y-8`}
    >
      {!embedded ? (
        <div className="px-4 md:px-6 lg:px-8 xl:px-12">
          <h1 className="font-[family-name:var(--xp-font-display)] text-2xl font-bold lg:text-3xl">
            {title}
          </h1>
          <p className="text-sm text-[var(--xp-muted)]">{subtitle}</p>
        </div>
      ) : null}

      {error ? (
        <p className="px-4 text-sm text-[var(--xp-danger)] md:px-6 lg:px-8 xl:px-12">
          {error}
        </p>
      ) : null}

      {loading && !rails.length ? (
        <div className="space-y-8">
          <div className="xp-shimmer mx-4 h-48 rounded-2xl md:mx-6 lg:mx-8 lg:h-64 xl:mx-12" />
          <p className="px-4 text-sm text-[var(--xp-muted)] md:px-6 lg:px-8 xl:px-12">
            {t("loadingCatalog", { kind: kindLabel.toLowerCase() })}
          </p>
          <PosterSkeletonRow />
          <PosterSkeletonRow />
        </div>
      ) : (
        <>
          {rails.length > 0 ? (
            <p className="px-4 text-xs text-[var(--xp-muted)] md:px-6 lg:px-8 xl:px-12">
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

          {hero && !hideHero ? (
            <HeroBanner
              cropLetterbox={isLive}
              eyebrow={rails[0]?.name || title}
              title={hero.title}
              subtitle={
                isLive ? t("tapPlayRotate") : hero.subtitle || t("openDetails")
              }
              image={hero.image}
              playHref={
                isLive
                  ? watchPath("live", hero.href.split("/").pop() || "", {
                      title: hero.title,
                      image: hero.image || "",
                    })
                  : kind === "movies"
                    ? watchPath("movie", hero.href.split("/").pop() || "", {
                        title: hero.title,
                        image: hero.image || "",
                      })
                    : hero.href
              }
              infoHref={hero.href}
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
            <p className="px-4 text-sm text-[var(--xp-muted)] md:px-6 lg:px-8 xl:px-12">
              {t("noTitlesCatalog")}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
