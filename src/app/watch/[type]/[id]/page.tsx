"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import {
  clearContinuePosition,
  getContinueItem,
  isContinueCompleted,
  upsertContinue,
} from "@/lib/library/storage";
import { parseMediaDuration } from "@/lib/player/duration";
import { getSeriesInfo, getVodInfo, watchPath } from "@/lib/xtream/client";
import { buildStreamCandidates } from "@/lib/xtream/urls";
import { catalogTitle } from "@/lib/xtream/title";
import type { SeriesEpisode, SeriesInfo, StreamKind } from "@/lib/xtream/types";

function normalizeExt(value?: string | null): string {
  return (value || "").replace(/^\./, "").toLowerCase().trim();
}

function flattenSeriesEpisodes(info: SeriesInfo) {
  const seasonKeys = Object.keys(info.episodes || {}).sort(
    (a, b) => Number(a) - Number(b),
  );
  const flat: { season: string; episode: SeriesEpisode }[] = [];
  for (const season of seasonKeys) {
    const eps = [...(info.episodes?.[season] || [])].sort(
      (a, b) => (a.episode_num ?? 0) - (b.episode_num ?? 0),
    );
    for (const episode of eps) flat.push({ season, episode });
  }
  return flat;
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
  const startFromZero = search.get("t") === "0";

  const [resolvedExt, setResolvedExt] = useState(queryExt);
  const [resolvingExt, setResolvingExt] = useState(
    () => kind !== "live" && !queryExt,
  );
  const [seriesInfo, setSeriesInfo] = useState<SeriesInfo | null>(null);

  const saved = useMemo(() => {
    if (!activePlaylist || kind === "live") return undefined;
    return getContinueItem(activePlaylist.id, kind, params.id);
  }, [activePlaylist, kind, params.id]);

  const initialPosition = useMemo(() => {
    if (startFromZero || kind === "live") return 0;
    const pos = saved?.position ?? 0;
    if (pos < 5) return 0;
    if (saved && isContinueCompleted(saved)) return 0;
    return pos;
  }, [startFromZero, kind, saved]);

  const initialAudioTrack = saved?.audioTrack ?? 0;
  const initialSubtitleTrack = saved?.subtitleTrack ?? -1;
  const prefsRef = useRef({
    audioTrack: initialAudioTrack,
    subtitleTrack: initialSubtitleTrack,
  });

  useEffect(() => {
    prefsRef.current = {
      audioTrack: initialAudioTrack,
      subtitleTrack: initialSubtitleTrack,
    };
  }, [params.id, initialAudioTrack, initialSubtitleTrack]);

  useEffect(() => {
    if (!ready) return;
    if (!activePlaylist) {
      router.replace("/playlists");
    }
  }, [ready, activePlaylist, router]);

  useEffect(() => {
    const orient = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };
    void orient?.lock?.("landscape").catch(() => undefined);
    return () => {
      void screen.orientation?.unlock?.();
    };
  }, []);

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
          if (!cancelled) setSeriesInfo(info);
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

  useEffect(() => {
    if (kind !== "series" || !credentials || !seriesId || seriesInfo) return;
    let cancelled = false;
    void getSeriesInfo(credentials, seriesId).then((info) => {
      if (!cancelled) setSeriesInfo(info);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, credentials, seriesId, seriesInfo]);

  const sources = useMemo(() => {
    if (!credentials || resolvingExt) return [];
    return buildStreamCandidates(
      credentials,
      kind,
      params.id,
      kind === "live" ? "m3u8" : resolvedExt || "mp4",
    );
  }, [credentials, kind, params.id, resolvedExt, resolvingExt]);

  const nextEpisode = useMemo(() => {
    if (kind !== "series" || !seriesInfo || !seriesId) return undefined;
    const flat = flattenSeriesEpisodes(seriesInfo);
    const idx = flat.findIndex(
      ({ episode: ep }) => String(ep.id) === String(params.id),
    );
    if (idx < 0 || idx >= flat.length - 1) return undefined;
    const next = flat[idx + 1]!;
    const epTitle =
      next.episode.title || `Episode ${next.episode.episode_num ?? next.episode.id}`;
    return {
      title: epTitle,
      href: watchPath("series", next.episode.id, {
        title: `${catalogTitle({ name: seriesInfo.info?.name })} · ${epTitle}`,
        ext: next.episode.container_extension || "mp4",
        image: next.episode.info?.movie_image || seriesInfo.info?.cover || "",
        seriesId,
        season: next.season,
        episode: String(next.episode.episode_num ?? ""),
        duration: next.episode.info?.duration || "",
      }),
    };
  }, [kind, seriesInfo, seriesId, params.id]);

  const saveContinue = useCallback(
    (
      position: number,
      duration: number,
      prefs?: { audioTrack: number; subtitleTrack: number },
    ) => {
      if (!activePlaylist || kind === "live") return;
      const nextPrefs = prefs ?? prefsRef.current;
      prefsRef.current = nextPrefs;
      const existing = getContinueItem(activePlaylist.id, kind, params.id);
      upsertContinue(activePlaylist.id, {
        kind,
        title: catalogTitle({ name: title }),
        image,
        streamId: params.id,
        seriesId,
        season: season ? Number(season) : undefined,
        episode: episode ? Number(episode) : undefined,
        extension: resolvedExt,
        position: position >= 0 ? position : (existing?.position ?? 0),
        duration: duration > 0 ? duration : (existing?.duration ?? 0),
        audioTrack: nextPrefs.audioTrack,
        subtitleTrack: nextPrefs.subtitleTrack,
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

  const onProgress = useCallback(
    (position: number, duration: number) => {
      if (position < 5) return;
      saveContinue(position, duration);
    },
    [saveContinue],
  );

  const onTrackPrefs = useCallback(
    (prefs: { audioTrack: number; subtitleTrack: number }) => {
      prefsRef.current = prefs;
      const existing = activePlaylist
        ? getContinueItem(activePlaylist.id, kind, params.id)
        : undefined;
      saveContinue(existing?.position ?? 0, existing?.duration ?? 0, prefs);
    },
    [activePlaylist, kind, params.id, saveContinue],
  );

  const onStartOver = useCallback(() => {
    if (!activePlaylist || kind === "live") return;
    clearContinuePosition(activePlaylist.id, kind, params.id);
  }, [activePlaylist, kind, params.id]);

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
      initialPosition={initialPosition}
      initialAudioTrack={initialAudioTrack}
      initialSubtitleTrack={initialSubtitleTrack}
      onProgress={onProgress}
      onTrackPrefs={onTrackPrefs}
      onStartOver={onStartOver}
      nextEpisode={nextEpisode}
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
