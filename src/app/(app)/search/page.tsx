"use client";

import { useEffect, useMemo, useState } from "react";
import { PosterCard } from "@/components/catalog/PosterCard";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import {
  getLiveStreams,
  getSeries,
  getVodStreams,
  watchPath,
} from "@/lib/xtream/client";
import type { LiveStream, SeriesItem, VodStream } from "@/lib/xtream/types";

type Filter = "all" | "live" | "movies" | "series";

export default function SearchPage() {
  const { credentials } = usePlaylists();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [live, setLive] = useState<LiveStream[]>([]);
  const [movies, setMovies] = useState<VodStream[]>([]);
  const [series, setSeries] = useState<SeriesItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!credentials) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [l, m, s] = await Promise.all([
          getLiveStreams(credentials!),
          getVodStreams(credentials!),
          getSeries(credentials!),
        ]);
        if (cancelled) return;
        setLive(l);
        setMovies(m);
        setSeries(s);
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
  }, [credentials]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const liveHits =
      filter === "all" || filter === "live"
        ? live
            .filter((s) => s.name.toLowerCase().includes(q))
            .slice(0, 40)
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
      filter === "all" || filter === "movies"
        ? movies
            .filter((s) => s.name.toLowerCase().includes(q))
            .slice(0, 40)
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
      filter === "all" || filter === "series"
        ? series
            .filter((s) => s.name.toLowerCase().includes(q))
            .slice(0, 40)
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
    { id: "all", label: "All" },
    { id: "live", label: "Live" },
    { id: "movies", label: "Movies" },
    { id: "series", label: "Series" },
  ];

  return (
    <div className="space-y-4 px-4 py-5 md:px-6">
      <div>
        <h1 className="font-[family-name:var(--xp-font-display)] text-2xl font-bold">
          Search
        </h1>
        <p className="text-sm text-[var(--xp-muted)]">
          Mixed results across Live, Movies, and Series
        </p>
      </div>
      <input
        className="xp-field"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search titles and channels…"
        autoFocus
      />
      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setFilter(chip.id)}
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
        <p className="text-sm text-[var(--xp-muted)]">Loading catalog…</p>
      ) : null}

      {!query.trim() ? (
        <p className="text-sm text-[var(--xp-muted)]">
          Type to search your catalog.
        </p>
      ) : results.length === 0 ? (
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
