"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { TitleHero } from "@/components/catalog/TitleHero";
import { Shimmer } from "@/components/catalog/Skeleton";
import { useLocale } from "@/components/providers/LocaleProvider";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { isFavorite, toggleFavorite } from "@/lib/library/storage";
import { backLabelForPath, safeInternalPath } from "@/lib/navigation/back";
import { loadAllLiveStreams } from "@/lib/xtream/catalog-cache";
import { watchPath } from "@/lib/xtream/client";
import type { LiveStream } from "@/lib/xtream/types";

function LiveDetailInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { credentials, activePlaylist } = usePlaylists();
  const { t } = useLocale();
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favTick, setFavTick] = useState(0);
  const backHref = safeInternalPath(searchParams.get("back"), "/?section=live");
  const backLabel = backLabelForPath(
    backHref,
    {
      home: t("navHome"),
      search: t("searchTitle"),
      live: t("liveTv"),
      movies: t("movies"),
      series: t("series"),
      favorites: t("favorite"),
    },
    "live",
  );

  useEffect(() => {
    if (!credentials) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const all = await loadAllLiveStreams(credentials!);
        const found =
          all.find((s) => String(s.stream_id) === String(params.id)) || null;
        if (!cancelled) {
          if (!found) setError("Channel not found");
          else setStream(found);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load channel");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [credentials, params.id]);

  const title = stream?.name || `Channel ${params.id}`;
  const image = stream?.stream_icon || undefined;
  const streamId = stream?.stream_id ?? params.id;
  const meta = [t("liveTv"), stream?.epg_channel_id || undefined]
    .filter(Boolean)
    .join(" · ");

  const fav = useMemo(() => {
    if (!activePlaylist) return false;
    void favTick;
    return isFavorite(activePlaylist.id, "live", streamId);
  }, [activePlaylist, streamId, favTick]);

  if (loading) {
    return (
      <div className="min-h-dvh">
        <Shimmer className="min-h-dvh w-full rounded-none" />
      </div>
    );
  }

  if (error) {
    return <p className="px-4 py-10 text-sm text-[var(--xp-danger)]">{error}</p>;
  }

  return (
    <TitleHero
      backHref={backHref}
      backLabel={backLabel}
      title={title}
      meta={meta}
      image={image}
      playHref={watchPath("live", streamId, {
        title,
        image: image || "",
      })}
      playLabel={t("play")}
      favorited={fav}
      onToggleFavorite={() => {
        if (!activePlaylist) return;
        toggleFavorite(activePlaylist.id, {
          kind: "live",
          title,
          image,
          streamId,
        });
        setFavTick((n) => n + 1);
      }}
    />
  );
}

export default function LiveDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh">
          <Shimmer className="min-h-dvh w-full rounded-none" />
        </div>
      }
    >
      <LiveDetailInner />
    </Suspense>
  );
}
