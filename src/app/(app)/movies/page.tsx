"use client";

import { useEffect, useState } from "react";
import { CategoryChips } from "@/components/catalog/CategoryChips";
import { PosterCard } from "@/components/catalog/PosterCard";
import { PosterSkeletonRow } from "@/components/catalog/Skeleton";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { getVodCategories, getVodStreams } from "@/lib/xtream/client";
import type { VodStream, XtreamCategory } from "@/lib/xtream/types";

export default function MoviesPage() {
  const { credentials } = usePlaylists();
  const [categories, setCategories] = useState<XtreamCategory[]>([]);
  const [streams, setStreams] = useState<VodStream[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!credentials) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [cats, vod] = await Promise.all([
          getVodCategories(credentials!),
          getVodStreams(credentials!, categoryId || undefined),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setStreams(vod);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load movies");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [credentials, categoryId]);

  return (
    <div className="space-y-4 py-5">
      <div className="px-4 md:px-6">
        <h1 className="font-[family-name:var(--xp-font-display)] text-2xl font-bold">
          Movies
        </h1>
        <p className="text-sm text-[var(--xp-muted)]">Browse VOD by category</p>
      </div>
      <CategoryChips
        categories={categories}
        activeId={categoryId}
        onChange={setCategoryId}
      />
      {error ? (
        <p className="px-4 text-sm text-[var(--xp-danger)] md:px-6">{error}</p>
      ) : null}
      {loading ? (
        <PosterSkeletonRow count={10} />
      ) : (
        <div className="xp-fade-in grid grid-cols-3 gap-3 px-4 pb-6 sm:grid-cols-4 md:grid-cols-5 md:px-6 lg:grid-cols-6">
          {streams.map((stream) => (
            <PosterCard
              key={stream.stream_id}
              href={`/movies/${stream.stream_id}`}
              title={stream.name}
              image={stream.stream_icon || undefined}
              subtitle={stream.rating ? `★ ${stream.rating}` : undefined}
            />
          ))}
        </div>
      )}
      {!loading && !streams.length ? (
        <p className="px-4 text-sm text-[var(--xp-muted)] md:px-6">
          No movies found.
        </p>
      ) : null}
    </div>
  );
}
