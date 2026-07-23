"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { upsertContinue } from "@/lib/library/storage";
import { parseMediaDuration } from "@/lib/player/duration";
import { getSeriesInfo, getVodInfo } from "@/lib/xtream/client";
import { buildStreamCandidates } from "@/lib/xtream/urls";
import { catalogTitle } from "@/lib/xtream/title";
import type { StreamKind } from "@/lib/xtream/types";

function normalizeExt(value?: string | null): string {
  return (value || "").replace(/^\./, "").toLowerCase().trim();
}

function WatchInner() {
  const params = useParams<{ type: string; id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { ready, credentials, activePlaylist } = usePlaylists();

  const kind = params.type as StreamKind;
  const title = search.get("title") || "Now playing";
  const queryExt = normalizeExt(search.get("ext"));
  const image = search.get("image") || undefined;
  const seriesId = search.get("seriesId") || undefined;
  const season = search.get("season") || undefined;
  const episode = search.get("episode") || undefined;
  const durationHint =
    parseMediaDuration(search.get("duration")) || undefined;

  const [resolvedExt, setResolvedExt] = useState(queryExt);
  const [resolvingExt, setResolvingExt] = useState(
    () => kind !== "live" && !queryExt,
  );

  useEffect(() => {
    if (!ready) return;
    if (!activePlaylist) {
      router.replace("/playlists");
    }
  }, [ready, activePlaylist, router]);

  // Soft-lock to landscape on mobile when supported (best-effort)
  useEffect(() => {
    const orient = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };
    void orient?.lock?.("landscape").catch(() => undefined);
    return () => {
      void screen.orientation?.unlock?.();
    };
  }, []);

  // Hero / continue links often omit ?ext= — resolve real container from the panel
  // so MKV titles don't fall through to a dead .mp4 URL.
  useEffect(() => {
    if (kind === "live") {
      setResolvedExt("m3u8");
      setResolvingExt(false);
      return;
    }
    if (queryExt) {
      setResolvedExt(queryExt);
      setResolvingExt(false);
      return;
    }
    if (!credentials) return;

    let cancelled = false;
    setResolvingExt(true);

    void (async () => {
      try {
        if (kind === "movie") {
          const info = await getVodInfo(credentials, params.id);
          const found =
            normalizeExt(info?.movie_data?.container_extension) || "mp4";
          if (!cancelled) setResolvedExt(found);
          return;
        }

        if (kind === "series" && seriesId) {
          const info = await getSeriesInfo(credentials, seriesId);
          const episodes = Object.values(info.episodes || {}).flat();
          const match = episodes.find(
            (ep) => String(ep.id) === String(params.id),
          );
          const found = normalizeExt(match?.container_extension) || "mp4";
          if (!cancelled) setResolvedExt(found);
          return;
        }

        if (!cancelled) setResolvedExt("mp4");
      } catch {
        if (!cancelled) setResolvedExt("mp4");
      } finally {
        if (!cancelled) setResolvingExt(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [credentials, kind, params.id, queryExt, seriesId]);

  const sources = useMemo(() => {
    if (!credentials || resolvingExt) return [];
    return buildStreamCandidates(
      credentials,
      kind,
      params.id,
      kind === "live" ? "m3u8" : resolvedExt || "mp4",
    );
  }, [credentials, kind, params.id, resolvedExt, resolvingExt]);

  const onProgress = useCallback(
    (position: number, duration: number) => {
      if (!activePlaylist) return;
      if (position < 5) return;
      upsertContinue(activePlaylist.id, {
        kind,
        title: catalogTitle({ name: title }),
        image,
        streamId: params.id,
        seriesId,
        season: season ? Number(season) : undefined,
        episode: episode ? Number(episode) : undefined,
        extension: resolvedExt,
        position,
        duration,
      });
    },
    [
      activePlaylist,
      kind,
      title,
      image,
      params.id,
      seriesId,
      season,
      episode,
      resolvedExt,
    ],
  );

  if (!ready || !credentials || resolvingExt) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-black text-white/80">
        <div className="h-10 w-10 animate-pulse rounded-full border-2 border-[var(--xp-accent)] border-t-transparent" />
        <p className="text-sm">Preparing player…</p>
      </div>
    );
  }

  if (!["live", "movie", "series"].includes(kind) || !sources.length) {
    return (
      <div className="flex h-dvh items-center justify-center bg-black text-white">
        Unknown stream type.
      </div>
    );
  }

  return (
    <VideoPlayer
      sources={sources}
      title={title}
      poster={image}
      kind={kind}
      streamId={params.id}
      seriesId={seriesId}
      extension={resolvedExt}
      durationHint={durationHint}
      onProgress={onProgress}
    />
  );
}

export default function WatchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-black text-white/80">
          <div className="h-10 w-10 animate-pulse rounded-full border-2 border-[var(--xp-accent)] border-t-transparent" />
          <p className="text-sm">Preparing player…</p>
        </div>
      }
    >
      <WatchInner />
    </Suspense>
  );
}
