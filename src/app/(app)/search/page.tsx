"use client";

import { useEffect, useMemo, useState } from "react";
import { PosterCard } from "@/components/catalog/PosterCard";
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
import type { LiveStream, SeriesItem, VodStream } from "@/lib/xtream/types";

type Filter = "live" | "movies" | "series";

export default function SearchPage() {
  const { credentials } = usePlaylists();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("movies");
  const [live, setLive] = useState<LiveStream[]>([]);
  const [movies, setMovies] = useState<VodStream[]>([]);
  const [series, setSeries] = useState<SeriesItem[]>([]);
  const [loaded, setLoaded] = useState<Partial<Record<Filter, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load one catalog type at a time (first category only) when the user searches
  useEffect(() => {
    if (!credentials) return;
    const q = query.trim();
    if (q.length < 2) return;
    if (loaded[filter]) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (filter === "live") {
          const cats = await getLiveCategories(credentials!);
          const rows = cats[0]
            ? await getLiveStreams(credentials!, cats[0].category_id)
            : [];
          if (!cancelled) setLive(rows);
        } else if (filter === "movies") {
          const cats = await getVodCategories(credentials!);
          // Search across a few categories, not the entire panel dump
          const picks = cats.slice(0, 6);
          const chunks = await Promise.all(
            picks.map((c) => getVodStreams(credentials!, c.category_id)),
          );
          if (!cancelled) setMovies(chunks.flat());
        } else {
          const cats = await getSeriesCategories(credentials!);
          const picks = cats.slice(0, 6);
          const chunks = await Promise.all(
            picks.map((c) => getSeries(credentials!, c.category_id)),
          );
          if (!cancelled) setSeries(chunks.flat());
        }
        if (!cancelled) {
          setLoaded((prev) => ({ ...prev, [filter]: true }));
        }
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
  }, [credentials, filter, query, loaded]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    if (filter === "live") {
      return live
        .filter((s) => s.name.toLowerCase().includes(q))
        .slice(0, 60)
        .map((s) => ({
          key: `live-${s.stream_id}`,
          href: watchPath("live", s.stream_id, { title: s.name }),
          title: s.name,
          image: s.stream_icon || undefined,
          kind: "Live",
          aspect: "live" as const,
        }));
    }

    if (filter === "movies") {
      return movies
        .filter((s) => s.name.toLowerCase().includes(q))
        .slice(0, 60)
        .map((s) => ({
          key: `vod-${s.stream_id}`,
          href: `/movies/${s.stream_id}`,
          title: s.name,
          image: s.stream_icon || undefined,
          kind: "Movie",
          aspect: "poster" as const,
        }));
    }

    return series
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 60)
      .map((s) => ({
        key: `series-${s.series_id}`,
        href: `/series/${s.series_id}`,
        title: s.name,
        image: s.cover || undefined,
        kind: "Series",
        aspect: "poster" as const,
      }));
  }, [query, filter, live, movies, series]);

  const chips: { id: Filter; label: string }[] = [
    { id: "movies", label: "Movies" },
    { id: "series", label: "Series" },
    { id: "live", label: "Live" },
  ];

  return (
    <div className="space-y-4 px-4 py-5 md:px-6">
      <div>
        <h1 className="font-[family-name:var(--xp-font-display)] text-2xl font-bold">
          Search
        </h1>
        <p className="text-sm text-[var(--xp-muted)]">
          Type at least 2 characters. Catalogs load per type to keep the app stable.
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

      {query.trim().length < 2 ? (
        <p className="text-sm text-[var(--xp-muted)]">
          Type to search your catalog.
        </p>
      ) : results.length === 0 && !loading ? (
        <p className="text-sm text-[var(--xp-muted)]">No matches in loaded categories.</p>
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
