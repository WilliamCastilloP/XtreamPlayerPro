"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PosterCard } from "@/components/catalog/PosterCard";
import { useLocale } from "@/components/providers/LocaleProvider";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import {
  loadAllLiveStreams,
  loadAllSeries,
  loadAllVodStreams,
} from "@/lib/xtream/catalog-cache";
import type { LiveStream, SeriesItem, VodStream } from "@/lib/xtream/types";
import { catalogTitle } from "@/lib/xtream/title";

type Filter = "live" | "movies" | "series";

function parseFilter(value: string | null): Filter | null {
  if (value === "live" || value === "movies" || value === "series") return value;
  return null;
}

function searchHref(query: string, filter: Filter | null): string {
  const params = new URLSearchParams();
  const q = query.trim();
  if (q) params.set("q", q);
  if (filter) params.set("f", filter);
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

function withBack(href: string, back: string): string {
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}back=${encodeURIComponent(back)}`;
}

function SearchInner() {
  const { credentials } = usePlaylists();
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const qParam = searchParams.get("q") || "";
  const fParam = parseFilter(searchParams.get("f"));

  const [query, setQuery] = useState(qParam);
  const [filter, setFilter] = useState<Filter | null>(fParam);
  const [live, setLive] = useState<LiveStream[]>([]);
  const [movies, setMovies] = useState<VodStream[]>([]);
  const [series, setSeries] = useState<SeriesItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [readyCatalog, setReadyCatalog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore from URL (e.g. browser back / shared link).
  useEffect(() => {
    setQuery(qParam);
    setFilter(fParam);
  }, [qParam, fParam]);

  // Keep the address bar in sync so history preserves the results.
  useEffect(() => {
    const next = searchHref(query, filter);
    const current = searchHref(qParam, fParam);
    if (next === current) return;
    router.replace(next, { scroll: false });
  }, [query, filter, qParam, fParam, router]);

  useEffect(() => {
    if (!credentials) return;
    const q = query.trim();
    if (q.length < 2 || readyCatalog) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [l, m, s] = await Promise.all([
          loadAllLiveStreams(credentials!),
          loadAllVodStreams(credentials!),
          loadAllSeries(credentials!),
        ]);
        if (cancelled) return;
        setLive(l);
        setMovies(m);
        setSeries(s);
        setReadyCatalog(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Search failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [credentials, query, readyCatalog]);

  const backTarget = searchHref(query, filter);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const liveHits =
      filter === null || filter === "live"
        ? (() => {
            const seen = new Set<number | string>();
            const out: {
              key: string;
              href: string;
              title: string;
              image?: string;
              kind: string;
              favKind: "live";
              streamId: number | string;
              aspect: "live";
            }[] = [];
            for (const s of live) {
              const label = catalogTitle(s);
              if (
                !s.name.toLowerCase().includes(q) &&
                !label.toLowerCase().includes(q)
              ) {
                continue;
              }
              if (seen.has(s.stream_id)) continue;
              seen.add(s.stream_id);
              out.push({
                key: `live-${s.stream_id}`,
                href: withBack(`/live/${s.stream_id}`, backTarget),
                title: label,
                image: s.stream_icon || undefined,
                kind: "Live",
                favKind: "live",
                streamId: s.stream_id,
                aspect: "live",
              });
              if (out.length >= 80) break;
            }
            return out;
          })()
        : [];

    const movieHits =
      filter === null || filter === "movies"
        ? (() => {
            const seen = new Set<number | string>();
            const out: {
              key: string;
              href: string;
              title: string;
              image?: string;
              kind: string;
              favKind: "movie";
              streamId: number | string;
              aspect: "poster";
            }[] = [];
            for (const s of movies) {
              const label = catalogTitle(s);
              if (
                !s.name.toLowerCase().includes(q) &&
                !(s.title || "").toLowerCase().includes(q) &&
                !label.toLowerCase().includes(q)
              ) {
                continue;
              }
              if (seen.has(s.stream_id)) continue;
              seen.add(s.stream_id);
              out.push({
                key: `vod-${s.stream_id}`,
                href: withBack(`/movies/${s.stream_id}`, backTarget),
                title: label,
                image: s.stream_icon || undefined,
                kind: "Movie",
                favKind: "movie",
                streamId: s.stream_id,
                aspect: "poster",
              });
              if (out.length >= 80) break;
            }
            return out;
          })()
        : [];

    const seriesHits =
      filter === null || filter === "series"
        ? (() => {
            const seen = new Set<number | string>();
            const out: {
              key: string;
              href: string;
              title: string;
              image?: string;
              kind: string;
              favKind: "series";
              streamId: number | string;
              aspect: "poster";
            }[] = [];
            for (const s of series) {
              const label = catalogTitle(s);
              if (
                !s.name.toLowerCase().includes(q) &&
                !(s.title || "").toLowerCase().includes(q) &&
                !label.toLowerCase().includes(q)
              ) {
                continue;
              }
              if (seen.has(s.series_id)) continue;
              seen.add(s.series_id);
              out.push({
                key: `series-${s.series_id}`,
                href: withBack(`/series/${s.series_id}`, backTarget),
                title: label,
                image: s.cover || undefined,
                kind: "Series",
                favKind: "series",
                streamId: s.series_id,
                aspect: "poster",
              });
              if (out.length >= 80) break;
            }
            return out;
          })()
        : [];

    return [...liveHits, ...movieHits, ...seriesHits];
  }, [query, filter, live, movies, series, backTarget]);

  const chips: { id: Filter; label: string }[] = [
    { id: "live", label: t("liveTv") },
    { id: "movies", label: t("movies") },
    { id: "series", label: t("series") },
  ];

  return (
    <div className="space-y-4 px-4 py-5 md:px-6">
      <div>
        <h1 className="font-[family-name:var(--xp-font-display)] text-2xl font-bold">
          {t("searchTitle")}
        </h1>
        <p className="text-sm text-[var(--xp-muted)]">
          {t("searchPlaceholder")}
        </p>
      </div>
      <input
        className="xp-field"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
        autoFocus
      />
      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() =>
              setFilter((current) => (current === chip.id ? null : chip.id))
            }
            className={`shrink-0 cursor-pointer rounded-full px-4 py-2 text-sm ${
              filter === chip.id
                ? "bg-[var(--xp-accent)] text-[var(--xp-ink)]"
                : "bg-[var(--xp-surface)] text-[var(--xp-muted)]"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-[var(--xp-danger)]">{error}</p>
      ) : null}
      {loading ? (
        <p className="text-sm text-[var(--xp-muted)]">
          {t("searchLoadingCatalog")}
        </p>
      ) : null}

      {query.trim().length < 2 ? (
        <p className="text-sm text-[var(--xp-muted)]">{t("searchTypeHint")}</p>
      ) : results.length === 0 && !loading ? (
        <p className="text-sm text-[var(--xp-muted)]">{t("searchNoMatches")}</p>
      ) : (
        <div className="xp-fade-in grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {results.map((item) => (
            <PosterCard
              key={item.key}
              href={item.href}
              title={item.title}
              image={item.image}
              subtitle={item.kind}
              aspect={item.aspect}
              kind={item.favKind}
              streamId={item.streamId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 px-4 py-5 md:px-6">
          <p className="text-sm text-[var(--xp-muted)]">Loading…</p>
        </div>
      }
    >
      <SearchInner />
    </Suspense>
  );
}
