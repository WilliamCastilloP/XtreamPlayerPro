"use client";

import { Suspense, useCallback, useEffect, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { upsertContinue } from "@/lib/library/storage";
import { buildStreamCandidates } from "@/lib/xtream/urls";
import type { StreamKind } from "@/lib/xtream/types";

function WatchInner() {
  const params = useParams<{ type: string; id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { ready, credentials, activePlaylist } = usePlaylists();

  const kind = params.type as StreamKind;
  const title = search.get("title") || "Now playing";
  const ext = search.get("ext") || "";
  const image = search.get("image") || undefined;
  const seriesId = search.get("seriesId") || undefined;
  const season = search.get("season") || undefined;
  const episode = search.get("episode") || undefined;

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

  const sources = useMemo(() => {
    if (!credentials) return [];
    return buildStreamCandidates(
      credentials,
      kind,
      params.id,
      kind === "live" ? "m3u8" : ext || undefined,
    );
  }, [credentials, kind, params.id, ext]);

  const onProgress = useCallback(
    (position: number, duration: number) => {
      if (!activePlaylist) return;
      if (position < 5) return;
      upsertContinue(activePlaylist.id, {
        kind,
        title,
        image,
        streamId: params.id,
        seriesId,
        season: season ? Number(season) : undefined,
        episode: episode ? Number(episode) : undefined,
        extension: ext,
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
      ext,
    ],
  );

  if (!ready || !credentials) {
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
      extension={ext}
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
