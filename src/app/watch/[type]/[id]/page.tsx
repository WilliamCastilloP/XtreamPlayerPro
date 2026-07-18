"use client";

import { Suspense, useCallback, useEffect, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { upsertContinue } from "@/lib/library/storage";
import { buildProxiedStreamUrl } from "@/lib/xtream/urls";
import type { StreamKind } from "@/lib/xtream/types";

function WatchInner() {
  const params = useParams<{ type: string; id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { ready, credentials, activePlaylist } = usePlaylists();

  const kind = params.type as StreamKind;
  const title = search.get("title") || "Now playing";
  const ext = search.get("ext") || "m3u8";
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

  const src = useMemo(() => {
    if (!credentials) return "";
    const extension =
      kind === "live"
        ? "m3u8"
        : ext.includes("m3u8")
          ? "m3u8"
          : ext || "mp4";
    const streamExt =
      kind === "live"
        ? "m3u8"
        : extension === "mp4" || extension === "mkv" || extension === "ts"
          ? extension
          : "m3u8";
    return buildProxiedStreamUrl(credentials, kind, params.id, streamExt);
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

  if (!ready || !credentials || !src) {
    return (
      <div className="flex h-dvh items-center justify-center bg-black text-white/70">
        Preparing player…
      </div>
    );
  }

  if (!["live", "movie", "series"].includes(kind)) {
    return (
      <div className="flex h-dvh items-center justify-center bg-black text-white">
        Unknown stream type.
      </div>
    );
  }

  return (
    <VideoPlayer
      src={src}
      title={title}
      poster={image}
      onProgress={onProgress}
    />
  );
}

export default function WatchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-black text-white/70">
          Preparing player…
        </div>
      }
    >
      <WatchInner />
    </Suspense>
  );
}
