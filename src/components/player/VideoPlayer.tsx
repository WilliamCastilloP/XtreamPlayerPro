"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  ArrowLeft,
  Maximize,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  looksLikeHlsUrl,
  type StreamCandidate,
} from "@/lib/xtream/urls";

type Props = {
  sources: StreamCandidate[];
  title: string;
  poster?: string;
  onProgress?: (position: number, duration: number) => void;
};

function bufferPercent(video: HTMLVideoElement): number | null {
  if (!video.duration || !Number.isFinite(video.duration) || video.duration <= 0) {
    return null;
  }
  if (!video.buffered.length) return 0;
  try {
    const end = video.buffered.end(video.buffered.length - 1);
    return Math.max(0, Math.min(100, Math.round((end / video.duration) * 100)));
  } catch {
    return null;
  }
}

export function VideoPlayer({ sources, title, poster, onProgress }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const router = useRouter();
  const [sourceIndex, setSourceIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChrome, setShowChrome] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [loadPercent, setLoadPercent] = useState(0);
  const [statusText, setStatusText] = useState("Connecting…");
  const hideTimer = useRef<number | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const sourcesKey = sources.map((s) => s.url).join("|");
  const [seenSourcesKey, setSeenSourcesKey] = useState(sourcesKey);

  if (sourcesKey !== seenSourcesKey) {
    setSeenSourcesKey(sourcesKey);
    setSourceIndex(0);
    setError(null);
    setLoadPercent(0);
  }

  const candidate = sources[sourceIndex];
  const src = candidate?.url || "";

  const bumpChrome = () => {
    setShowChrome(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (playing) setShowChrome(false);
    }, 2800);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !candidate) return;

    let disposed = false;
    let fragTotal = 0;
    let fragLoaded = 0;

    setError(null);
    setPlaying(false);
    setLoadPercent(0);
    setStatusText("Connecting…");

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    video.removeAttribute("src");
    video.load();

    const failOver = () => {
      if (disposed) return;
      setStatusText("Trying next source…");
      setLoadPercent(0);
      setSourceIndex((current) => {
        if (current + 1 < sources.length) return current + 1;
        queueMicrotask(() =>
          setError("Could not play this stream. The server rejected playback."),
        );
        return current;
      });
    };

    /** Single source of truth for the ring — never mirror % into statusText */
    const setProgress = (pct: number) => {
      if (disposed) return;
      setLoadPercent(Math.max(0, Math.min(100, Math.round(pct))));
    };

    const updateNativeBuffer = () => {
      if (disposed) return;
      const pct = bufferPercent(video);
      if (pct !== null) {
        setProgress(pct);
        return;
      }
      if (video.buffered.length) {
        try {
          const secs = Math.round(video.buffered.end(video.buffered.length - 1));
          // Live/unknown duration: coarse estimate for the ring only
          setProgress(Math.min(95, 10 + secs * 4));
        } catch {
          /* ignore */
        }
      }
    };

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => {
      if (video.duration && onProgress) {
        onProgress(video.currentTime, video.duration);
      }
    };
    const onNativeError = () => failOver();
    const onLoaded = () => {
      if (!disposed) {
        setProgress(100);
        setStatusText("Starting…");
      }
    };
    const onWaiting = () => {
      if (!disposed) setStatusText("Buffering…");
    };
    const onPlayingEvt = () => {
      if (!disposed) {
        setProgress(100);
        setStatusText("Playing");
      }
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("progress", updateNativeBuffer);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlayingEvt);

    const isHls = looksLikeHlsUrl(src);
    const useHlsJs = isHls && Hls.isSupported();
    const useNativeHls =
      isHls &&
      !useHlsJs &&
      !!video.canPlayType("application/vnd.apple.mpegurl");

    if (useHlsJs) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        maxBufferLength: 20,
        maxMaxBufferLength: 40,
        backBufferLength: 30,
        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
        },
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_ev, data) => {
        if (disposed) return;
        fragTotal = Math.max(1, data.levels?.[0]?.details?.fragments?.length || 8);
        setStatusText("Loading stream…");
        setProgress(8);
        void video.play().catch(() => undefined);
      });

      hls.on(Hls.Events.LEVEL_LOADED, (_ev, data) => {
        if (disposed) return;
        const total = data.details?.fragments?.length;
        if (total) fragTotal = total;
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {
        if (disposed) return;
        fragLoaded += 1;
        const pct = Math.min(
          99,
          Math.round((fragLoaded / Math.max(fragTotal, fragLoaded + 2)) * 100),
        );
        setProgress(pct);
        setStatusText("Loading stream…");
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (disposed || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          try {
            hls.startLoad();
          } catch {
            /* ignore */
          }
          window.setTimeout(() => {
            if (!disposed && video.readyState < 2) {
              hls.destroy();
              hlsRef.current = null;
              failOver();
            }
          }, 1200);
          return;
        }
        hls.destroy();
        hlsRef.current = null;
        failOver();
      });
    } else if (useNativeHls || !isHls) {
      video.src = src;
      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("error", onNativeError);
      void video.play().catch(() => undefined);
    } else {
      queueMicrotask(() =>
        setError("HLS is not supported in this browser."),
      );
    }

    return () => {
      disposed = true;
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("progress", updateNativeBuffer);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlayingEvt);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onNativeError);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute("src");
      video.load();
    };
  }, [src, candidate, onProgress, sources.length, reloadToken]);

  useEffect(
    () => () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
    bumpChrome();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    bumpChrome();
  };

  const goFullscreen = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (video.requestFullscreen) await video.requestFullscreen();
      else if (
        "webkitEnterFullscreen" in video &&
        typeof (
          video as HTMLVideoElement & { webkitEnterFullscreen: () => void }
        ).webkitEnterFullscreen === "function"
      ) {
        (
          video as HTMLVideoElement & { webkitEnterFullscreen: () => void }
        ).webkitEnterFullscreen();
      }
    } catch {
      /* ignore */
    }
    bumpChrome();
  };

  const retry = () => {
    setError(null);
    setLoadPercent(0);
    setSourceIndex(0);
    setReloadToken((n) => n + 1);
  };

  // Keep loader visible until media is actually playing (not just "metadata ready")
  const showLoader = !error && !playing;

  return (
    <div
      className="relative flex h-dvh w-full items-center justify-center bg-black"
      onMouseMove={bumpChrome}
      onTouchStart={bumpChrome}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        poster={poster}
        playsInline
        preload="auto"
        controls={false}
        onClick={togglePlay}
      />

      {showLoader ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/55 px-6">
          <div className="relative h-20 w-20">
            <svg className="h-20 w-20 -rotate-90" viewBox="0 0 64 64">
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="4"
              />
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="var(--xp-accent)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${Math.max(6, (loadPercent || 8) * 1.76)} 176`}
                className={loadPercent < 5 ? "animate-pulse" : undefined}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white">
              {Math.max(loadPercent, 1)}%
            </span>
          </div>
          <p className="text-center text-sm text-white/85">{statusText}</p>
          <p className="text-center text-xs text-white/55">
            Rotate your phone for a wider view
          </p>
          {sources.length > 1 ? (
            <p className="text-xs text-white/50">
              Source {sourceIndex + 1}/{sources.length}
              {candidate ? ` · ${candidate.label}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className={`xp-player-chrome absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/50 transition-opacity duration-300 ${
          showChrome || error ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="absolute left-0 right-0 top-0 flex items-center gap-3 p-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="truncate font-[family-name:var(--xp-font-display)] text-lg font-semibold text-white">
              {title}
            </p>
          </div>
        </div>

        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="max-w-sm text-sm text-white/90">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--xp-accent)] px-5 py-3 text-sm font-semibold text-[var(--xp-ink)]"
            >
              <RotateCcw className="h-4 w-4" />
              Retry
            </button>
          </div>
        ) : (
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--xp-accent)] text-[var(--xp-ink)]"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="h-5 w-5 fill-current" />
              )}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>
              <button
                type="button"
                onClick={goFullscreen}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
                aria-label="Fullscreen"
              >
                <Maximize className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
