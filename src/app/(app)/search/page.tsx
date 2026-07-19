"use client";

import { useEffect, useMemo, useState } from "react";
import { PosterCard } from "@/components/catalog/PosterCard";
import { useLocale } from "@/components/providers/LocaleProvider";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import {
  loadAllLiveStreams,
  loadAllSeries,
  loadAllVodStreams,
} from "@/lib/xtream/catalog-cache";
import { watchPath } from "@/lib/xtream/client";
import type { LiveStream, SeriesItem, VodStream } from "@/lib/xtream/types";

type Filter = "live" | "movies" | "series";

export default function SearchPage() {
  const { credentials } = usePlaylists();
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  /** null = no chip selected → show all types */
  const [filter, setFilter] = useState<Filter | null>(null);
  const [live, setLive] = useState<LiveStream[]>([]);
  const [movies, setMovies] = useState<VodStream[]>([]);
  const [series, setSeries] = useState<SeriesItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [readyCatalog, setReadyCatalog] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const liveHits =
      filter === null || filter === "live"
        ? live
            .filter((s) => s.name.toLowerCase().includes(q))
            .slice(0, 80)
            .map((s) => ({
              key: `live-${s.stream_id}`,
              href: watchPath("live", s.stream_id, { title: s.name }),
              title: s.name,
              image: s.stream_icon || undefined,
              kind: "Live",
              aspect: "live" as const,
            }))
        : [];

    const movieHits =
      filter === null || filter === "movies"
        ? movies
            .filter((s) => s.name.toLowerCase().includes(q))
            .slice(0, 80)
            .map((s) => ({
              key: `vod-${s.stream_id}`,
              href: `/movies/${s.stream_id}`,
              title: s.name,
              image: s.stream_icon || undefined,
              kind: "Movie",
              aspect: "poster" as const,
            }))
        : [];

    const seriesHits =
      filter === null || filter === "series"
        ? series
            .filter((s) => s.name.toLowerCase().includes(q))
            .slice(0, 80)
            .map((s) => ({
              key: `series-${s.series_id}`,
              href: `/series/${s.series_id}`,
              title: s.name,
              image: s.cover || undefined,
              kind: "Series",
              aspect: "poster" as const,
            }))
        : [];

    return [...liveHits, ...movieHits, ...seriesHits];
  }, [query, filter, live, movies, series]);

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
            className={`shrink-0 rounded-full px-4 py-2 text-sm ${
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
        <p className="text-sm text-[var(--xp-muted)]">Loading full catalog…</p>
      ) : null}

      {query.trim().length < 2 ? (
        <p className="text-sm text-[var(--xp-muted)]">
          Type to search Live, Movies, and Series together.
        </p>
      ) : results.length === 0 && !loading ? (
        <p className="text-sm text-[var(--xp-muted)]">No matches.</p>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
