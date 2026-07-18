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

type Props = {
  src: string;
  title: string;
  poster?: string;
  onProgress?: (position: number, duration: number) => void;
};

export function VideoPlayer({ src, title, poster, onProgress }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChrome, setShowChrome] = useState(true);
  const hideTimer = useRef<number | null>(null);

  const bumpChrome = () => {
    setShowChrome(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (playing) setShowChrome(false);
    }, 2800);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setError(null);
    setReady(false);
    let hls: Hls | null = null;

    const onError = () => setError("Could not play this stream.");

    const isHls =
      src.includes(".m3u8") || src.includes("mpegurl") || src.includes("/live/");

    if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.addEventListener("loadedmetadata", () => setReady(true));
      video.addEventListener("error", onError);
    } else if (isHls && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => setReady(true));
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setError("Stream error. Tap retry to try again.");
        }
      });
    } else if (!isHls) {
      video.src = src;
      video.addEventListener("loadedmetadata", () => setReady(true));
      video.addEventListener("error", onError);
    } else {
      queueMicrotask(() =>
        setError("HLS is not supported in this browser."),
      );
    }

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => {
      if (video.duration && onProgress) {
        onProgress(video.currentTime, video.duration);
      }
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);

    void video.play().catch(() => {
      /* autoplay may be blocked */
    });

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("error", onError);
      if (hls) hls.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [src, onProgress]);

  useEffect(() => () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
  }, []);

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
        typeof (video as HTMLVideoElement & { webkitEnterFullscreen: () => void })
          .webkitEnterFullscreen === "function"
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
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    video.load();
    void video.play().catch(() => undefined);
  };

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
        controls={false}
        onClick={togglePlay}
      />

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
            {!ready && !error ? (
              <p className="text-xs text-white/60">Loading stream…</p>
            ) : null}
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
