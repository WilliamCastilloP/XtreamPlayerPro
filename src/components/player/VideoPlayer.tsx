"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  ArrowLeft,
  Bug,
  Copy,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/providers/LocaleProvider";
import {
  isProxiedStreamUrl,
  looksLikeHlsUrl,
  redactStreamUrl,
  type StreamCandidate,
} from "@/lib/xtream/urls";
import {
  needsContainerRemux,
  startRemuxedPlayback,
  type BufferRange,
  type RemuxHandle,
} from "@/lib/player/mkv-playback";
import { cueTextAt, parseWebVtt, type VttCue } from "@/lib/player/vtt";

const CONNECT_READY_SEC = 2.5;
const CONNECT_READY_SEEK_SEC = 1.2;

function snapHlsStart(seconds: number): number {
  return Math.max(0, Math.floor(seconds / 2) * 2);
}

/** Grab the current decoded frame so seek reload doesn't flash the cover art. */
function captureFreezeFrame(video: HTMLVideoElement): string | null {
  try {
    if (video.readyState < 2 || video.videoWidth < 2 || video.videoHeight < 2) {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.75);
  } catch {
    return null;
  }
}

function withServerHlsParams(
  url: string,
  startSec: number,
  audioIndex = 0,
  opts?: { warm?: boolean },
): string {
  if (!url.includes("/api/hls")) return url;
  try {
    const absolute = url.startsWith("http")
      ? new URL(url)
      : new URL(url, "http://local");
    const snapped = snapHlsStart(startSec);
    if (snapped >= 1) absolute.searchParams.set("start", String(snapped));
    else absolute.searchParams.delete("start");
    if (audioIndex > 0) absolute.searchParams.set("audio", String(audioIndex));
    else absolute.searchParams.delete("audio");
    if (opts?.warm) absolute.searchParams.set("warm", "1");
    else absolute.searchParams.delete("warm");
    if (url.startsWith("http")) return absolute.toString();
    return `${absolute.pathname}?${absolute.searchParams.toString()}`;
  } catch {
    return url;
  }
}

/** Shorter window = faster first paint; we prefetch the next chunk in the background. */
const SUB_WINDOW_SEC = 240;
/** Softsubs from fast `-ss` tend to land ~1s early vs the HLS video clock. */
const SUBTITLE_DELAY_SEC = 1.5;

/** Rewrite `/api/hls?url=` → `/api/hls/tracks?url=` or `/api/hls/sub?url=`. */
function serverHlsApiUrl(
  hlsUrl: string,
  kind: "tracks" | "sub",
  subIndex?: number,
  windowFrom?: number,
  windowDuration = SUB_WINDOW_SEC,
): string | null {
  if (!hlsUrl.includes("/api/hls")) return null;
  try {
    const absolute = hlsUrl.startsWith("http")
      ? new URL(hlsUrl)
      : new URL(hlsUrl, typeof window !== "undefined" ? window.location.origin : "http://local");
    absolute.pathname = absolute.pathname.replace(/\/api\/hls\/?$/, `/api/hls/${kind}`);
    absolute.searchParams.delete("start");
    absolute.searchParams.delete("audio");
    if (kind === "sub") {
      absolute.searchParams.set("index", String(subIndex ?? 0));
      // Same 2s snap as server HLS video sessions.
      const from = snapHlsStart(windowFrom || 0);
      absolute.searchParams.set("from", String(from));
      absolute.searchParams.set("duration", String(windowDuration));
    }
    if (hlsUrl.startsWith("http")) return absolute.toString();
    return `${absolute.pathname}?${absolute.searchParams.toString()}`;
  } catch {
    return null;
  }
}

function clearInjectedTextTracks(video: HTMLVideoElement) {
  const injected = video.querySelectorAll("track[data-xp-sub]");
  injected.forEach((el) => el.remove());
}

function mediaBufferedAhead(video: HTMLVideoElement): number {
  try {
    const b = video.buffered;
    if (!b.length) return 0;
    const t = video.currentTime || 0;
    for (let i = 0; i < b.length; i += 1) {
      if (t >= b.start(i) - 0.35 && t <= b.end(i) + 0.35) {
        return Math.max(0, b.end(i) - t);
      }
    }
    return Math.max(0, b.end(b.length - 1) - t);
  } catch {
    return 0;
  }
}
type Props = {
  sources: StreamCandidate[];
  title: string;
  poster?: string;
  kind?: string;
  streamId?: string;
  extension?: string;
  /** Known full duration in seconds (catalog / probe). Beats under-reported HLS event playlists. */
  durationHint?: number;
  onProgress?: (position: number, duration: number) => void;
};

type DebugLine = {
  id: string;
  at: string;
  text: string;
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

function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

type TrackOption = { id: number; label: string };

function mediaTrackLabel(
  track: { name?: string; lang?: string; label?: string },
  index: number,
  fallback: string,
): string {
  const name = track.name || track.label;
  if (name && name.trim()) return name.trim();
  if (track.lang && track.lang.trim()) return track.lang.trim().toUpperCase();
  return `${fallback} ${index + 1}`;
}

async function diagnoseSource(url: string): Promise<string | null> {
  if (!isProxiedStreamUrl(url)) return null;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
    });
    if (res.ok || res.status === 206) return null;
    const data = (await res.json().catch(() => null)) as {
      error?: string;
      detail?: string;
    } | null;
    if (data?.error) {
      return data.detail ? `${data.error}: ${data.detail}` : data.error;
    }
    return `HTTP ${res.status}`;
  } catch {
    return null;
  }
}

async function probeSource(candidate: StreamCandidate): Promise<string> {
  const label = candidate.label;
  const safe = redactStreamUrl(candidate.url);
  try {
    const res = await fetch(candidate.url, {
      method: "GET",
      headers: { Range: "bytes=0-1023" },
      cache: "no-store",
    });
    const ct = res.headers.get("content-type") || "?";
    const cl = res.headers.get("content-length") || res.headers.get("content-range") || "?";
    let sample = "";
    if (
      ct.includes("json") ||
      ct.includes("text") ||
      ct.includes("mpegurl") ||
      ct.includes("m3u8")
    ) {
      sample = (await res.text()).slice(0, 140).replace(/\s+/g, " ");
    } else {
      sample = `[binary · ${cl}]`;
    }
    return `${label} → ${res.status} · ${ct} · ${safe} · ${sample}`;
  } catch (err) {
    return `${label} → FAIL · ${safe} · ${err instanceof Error ? err.message : String(err)}`;
  }
}

export function VideoPlayer({
  sources,
  title,
  poster,
  kind,
  streamId,
  extension,
  durationHint,
  onProgress,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const router = useRouter();
  const { t } = useLocale();
  const [sourceIndex, setSourceIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChrome, setShowChrome] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [loadPercent, setLoadPercent] = useState(0);
  const [statusText, setStatusText] = useState(t("playerConnecting"));
  const [showDebug, setShowDebug] = useState(false);
  const [debugLines, setDebugLines] = useState<DebugLine[]>([]);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "err">("idle");
  const [probing, setProbing] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const remuxRef = useRef<RemuxHandle | null>(null);
  const lastFailDetail = useRef<string | null>(null);
  const debugRef = useRef<DebugLine[]>([]);
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const [awaitingTap, setAwaitingTap] = useState(false);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [serverHlsOffset, setServerHlsOffset] = useState(0);
  const [serverHlsAudio, setServerHlsAudio] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(() =>
    durationHint && durationHint > 0 ? durationHint : 0,
  );
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [seekingUi, setSeekingUi] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  /** Cover art, or a freeze-frame data URL held across seek reloads. */
  const [holdPoster, setHoldPoster] = useState<string | undefined>(poster);
  const [bufferRanges, setBufferRanges] = useState<BufferRange[]>([]);
  const [qualityOptions, setQualityOptions] = useState<TrackOption[]>([]);
  const [qualityId, setQualityId] = useState(-1);
  const [showSettings, setShowSettings] = useState(false);
  const [qualityIsHls, setQualityIsHls] = useState(false);
  const [audioOptions, setAudioOptions] = useState<TrackOption[]>([]);
  const [audioId, setAudioId] = useState(0);
  const [subtitleOptions, setSubtitleOptions] = useState<TrackOption[]>([]);
  const [subtitleId, setSubtitleId] = useState(-1);
  const [subtitleCues, setSubtitleCues] = useState<VttCue[]>([]);
  const [subtitleLoading, setSubtitleLoading] = useState(false);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPct, setHoverPct] = useState(0);
  const scrubbingRef = useRef(false);
  const subtitleAbortRef = useRef<AbortController | null>(null);
  const subtitleCacheRef = useRef<Map<string, VttCue[]>>(new Map());
  const subtitleWindowRef = useRef<{
    id: number;
    from: number;
    duration: number;
  } | null>(null);
  const prefetchTimer = useRef<number | null>(null);
  const seekingReloadRef = useRef(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sourcesKey = sources.map((s) => s.url).join("|");
  const [seenSourcesKey, setSeenSourcesKey] = useState(sourcesKey);

  if (sourcesKey !== seenSourcesKey) {
    setSeenSourcesKey(sourcesKey);
    setSourceIndex(0);
    setError(null);
    setLoadPercent(0);
    setCurrentTime(0);
    setDuration(0);
    setBufferRanges([]);
    setQualityOptions([]);
    setQualityId(-1);
    setQualityIsHls(false);
    setAudioOptions([]);
    setAudioId(0);
    setSubtitleOptions([]);
    setSubtitleId(-1);
    setSubtitleCues([]);
    setSubtitleLoading(false);
    setSubtitleError(null);
    subtitleCacheRef.current = new Map();
    subtitleWindowRef.current = null;
    subtitleAbortRef.current?.abort();
    subtitleAbortRef.current = null;
    setShowSettings(false);
    setHoverTime(null);
    setNeedsUnmute(false);
    setAwaitingTap(false);
    setHasStarted(false);
    setServerHlsOffset(0);
    setServerHlsAudio(0);
    setSeekingUi(false);
    seekingReloadRef.current = false;
    setHoldPoster(poster);
  }

  const candidate = sources[sourceIndex];
  const src = candidate?.url || "";
  const playSrc = withServerHlsParams(src, serverHlsOffset, serverHlsAudio);
  const isServerHls = src.includes("/api/hls");

  const pushDebug = useCallback((text: string) => {
    const at = new Date().toLocaleTimeString();
    const next = [
      ...debugRef.current.slice(-80),
      { id: `${Date.now()}-${Math.random()}`, at, text },
    ];
    debugRef.current = next;
    queueMicrotask(() => setDebugLines(next));
  }, []);

  const resetDebug = useCallback((seed?: string) => {
    debugRef.current = [];
    queueMicrotask(() => {
      setDebugLines([]);
      if (seed) {
        const at = new Date().toLocaleTimeString();
        const line = { id: `${Date.now()}-seed`, at, text: seed };
        debugRef.current = [line];
        setDebugLines([line]);
      }
    });
  }, []);

  const formatDebugDump = useCallback(() => {
    const meta = [
      `title=${title}`,
      kind ? `kind=${kind}` : null,
      streamId ? `streamId=${streamId}` : null,
      extension ? `ext=${extension}` : null,
      `sources=${sources.length}`,
      `sourceIndex=${sourceIndex}`,
      typeof navigator !== "undefined" ? `ua=${navigator.userAgent}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const body = debugRef.current
      .map((line) => `${line.at} ${line.text}`)
      .join("\n");
    return `${meta}\n${body}`.trim();
  }, [title, kind, streamId, extension, sources.length, sourceIndex]);

  const logDebugToTerminal = useCallback(
    async (text: string) => {
      if (process.env.NODE_ENV === "production") return;
      try {
        await fetch("/api/dev/player-debug", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            kind,
            streamId,
            text,
          }),
        });
      } catch {
        /* ignore — clipboard still works */
      }
    },
    [title, kind, streamId],
  );

  const copyDebug = useCallback(async () => {
    const text = formatDebugDump();
    if (!text) {
      setCopyState("err");
      return;
    }
    void logDebugToTerminal(text);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("ok");
    } catch {
      // Fallback for older Safari / insecure contexts
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        setCopyState(ok ? "ok" : "err");
      } catch {
        setCopyState("err");
      }
    }
    window.setTimeout(() => setCopyState("idle"), 2000);
  }, [formatDebugDump, logDebugToTerminal]);

  const goBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.replace("/");
  }, [router]);

  useEffect(() => {
    if (durationHint && durationHint > 0) {
      setDuration((prev) => Math.max(prev, durationHint));
    }
  }, [durationHint]);

  const bumpChrome = () => {
    setShowChrome(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (playing && !error && !showDebug && !showSettings) setShowChrome(false);
    }, 2800);
  };

  const runProbes = useCallback(async () => {
    setProbing(true);
    pushDebug(
      `meta · kind=${kind || "?"} id=${streamId || "?"} ext=${extension || "(none)"} https=${typeof window !== "undefined" && window.location.protocol === "https:"} candidates=${sources.length}`,
    );
    for (let i = 0; i < sources.length; i += 1) {
      const line = await probeSource(sources[i]!);
      pushDebug(`[${i + 1}/${sources.length}] ${line}`);
    }
    setProbing(false);
  }, [sources, kind, streamId, extension, pushDebug]);

  useEffect(() => {
    lastFailDetail.current = null;
    resetDebug(
      `start · ${kind || "stream"} · ${sources.length} sources · page ${typeof window !== "undefined" ? window.location.protocol : "?"}`,
    );
  }, [sourcesKey, kind, sources.length, resetDebug]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playSrc || !candidate) return;

    let disposed = false;
    let fragTotal = 0;
    let fragLoaded = 0;

    setError(null);
    setPlaying(false);
    setHasStarted(false);
    setAwaitingTap(false);
    setLoadPercent(0);
    if (seekingReloadRef.current) {
      setSeekingUi(true);
      setStatusText(t("playerSeeking"));
    } else {
      setStatusText(t("playerConnecting"));
    }
    lastFailDetail.current = null;
    pushDebug(
      `try ${sourceIndex + 1}/${sources.length} · ${candidate.label} · ${redactStreamUrl(playSrc)} · hls?=${looksLikeHlsUrl(playSrc)} · start=${serverHlsOffset.toFixed(0)}s`,
    );

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (remuxRef.current) {
      remuxRef.current.stop();
      remuxRef.current = null;
    }
    video.removeAttribute("src");
    clearInjectedTextTracks(video);
    video.load();

    const setProgress = (pct: number) => {
      if (disposed) return;
      setLoadPercent(Math.max(0, Math.min(100, Math.round(pct))));
    };

    const finishFailed = async () => {
      if (disposed) return;
      let detail = lastFailDetail.current;
      if (!detail) {
        detail = await diagnoseSource(src);
        if (detail) lastFailDetail.current = detail;
      }
      if (disposed) return;
      pushDebug(`all sources failed · last=${detail || "unknown"}`);
      // Prefer a direct HTTPS URL for "open externally" (Smarters-style)
      const direct = sources.find(
        (s) => s.transport === "direct" && s.url.startsWith("https:"),
      );
      setExternalUrl(direct?.url || null);
      setError(
        detail
          ? t("playerPlaybackFailedDetail", { detail })
          : t("playerPlaybackFailed"),
      );
      setShowDebug(true);
      // Probe then dump to the npm run dev terminal so it's easy to share.
      await runProbes();
      if (!disposed) void logDebugToTerminal(formatDebugDump());
    };

    const failOver = (reason?: string) => {
      if (disposed) return;
      if (reason) lastFailDetail.current = reason;
      pushDebug(`fail · ${candidate.label} · ${reason || "no detail"}`);
      setStatusText(t("playerTryingNext"));
      setLoadPercent(0);
      setSourceIndex((current) => {
        if (current + 1 < sources.length) return current + 1;
        queueMicrotask(() => {
          void finishFailed();
        });
        return current;
      });
    };

    const readySec =
      serverHlsOffset > 0 ? CONNECT_READY_SEEK_SEC : CONNECT_READY_SEC;

    const updateNativeBuffer = () => {
      if (disposed) return;
      const ahead = mediaBufferedAhead(video);
      if (ahead > 0) {
        setProgress(
          Math.min(99, Math.max(1, Math.round((ahead / readySec) * 100))),
        );
        setStatusText(t("playerConnecting"));
      }
    };

    const onPlay = () => {
      setPlaying(true);
      setAwaitingTap(false);
    };
    const onPause = () => setPlaying(false);
    const onTime = () => {
      if (!scrubbingRef.current) setCurrentTime(video.currentTime || 0);
      const mediaDur = video.duration;
      // HLS event playlists grow over time (~minutes) while the movie is
      // hours long — never shrink below catalog/probe hint.
      const best =
        [
          Number.isFinite(mediaDur) && mediaDur > 0 ? mediaDur : 0,
          durationHint && durationHint > 0 ? durationHint : 0,
        ].reduce((a, b) => Math.max(a, b), 0) || 0;
      if (best > 0) {
        setDuration((prev) => (best > prev + 0.5 ? best : prev));
      }
      // Native/HLS buffered ranges for the dual bar
      try {
        const ranges: BufferRange[] = [];
        for (let i = 0; i < video.buffered.length; i += 1) {
          ranges.push({
            start: video.buffered.start(i),
            end: video.buffered.end(i),
          });
        }
        if (ranges.length) setBufferRanges(ranges);
      } catch {
        /* ignore */
      }
      if (best && onProgress) {
        onProgress(video.currentTime, best);
      }
    };
    const onNativeError = () => {
      void (async () => {
        const detail = await diagnoseSource(src);
        const mediaErr = video.error;
        const code = mediaErr ? `mediaError=${mediaErr.code}` : undefined;
        failOver(detail || code || undefined);
      })();
    };
    const onLoaded = () => {
      if (!disposed) {
        setProgress(100);
        setStatusText(t("playerStarting"));
        pushDebug(`loadedmetadata · ${candidate.label}`);
      }
    };
    const onWaiting = () => {
      if (!disposed) setStatusText(t("playerBuffering"));
    };
    const onPlayingEvt = () => {
      if (!disposed) {
        setProgress(100);
        setStatusText(t("playerPlaying"));
        setHasStarted(true);
        setSeekingUi(false);
        seekingReloadRef.current = false;
        pushDebug(`playing · ${candidate.label}`);
      }
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("progress", updateNativeBuffer);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlayingEvt);

    // Decide remux from THIS candidate's own URL (not the title's extension),
    // otherwise HLS/MP4 fallbacks get wrongly routed through the remuxer.
    // Server HLS (/api/hls) must use hls.js — never Mediabunny.
    const isHls = looksLikeHlsUrl(playSrc);
    const wantsRemux =
      !isHls && (candidate.remux || needsContainerRemux(undefined, playSrc));

    const reportConnectProgress = () => {
      if (disposed) return;
      const ahead = mediaBufferedAhead(video);
      const pct = Math.min(
        99,
        Math.max(1, Math.round((ahead / readySec) * 100)),
      );
      setProgress(pct);
      setStatusText(t("playerConnecting"));
    };

    // MKV/AVI: remux via Mediabunny → fMP4 (browsers can't play Matroska; Smarters can)
    if (wantsRemux && candidate.transport === "proxy") {
      queueMicrotask(() => {
        if (disposed) return;
        setStatusText(t("playerConnecting"));
        setProgress(5);
      });
      pushDebug(`engine=mediabunny-remux · ${candidate.label}`);
      void startRemuxedPlayback(video, playSrc, {
        onProgress: (p) => {
          if (!disposed) {
            setProgress(Math.min(99, Math.max(5, Math.round(p * 95))));
            setStatusText(t("playerConnecting"));
          }
        },
        onLog: (message) => {
          if (!disposed) pushDebug(message);
        },
        onAutoplayBlocked: () => {
          if (!disposed) setAwaitingTap(true);
        },
        onMutedAutoplay: () => {
          if (!disposed) {
            setNeedsUnmute(true);
            setMuted(true);
            setAwaitingTap(false);
          }
        },
        onDuration: (seconds) => {
          if (!disposed && seconds > 0) setDuration(seconds);
        },
        onBuffer: (ranges) => {
          if (!disposed) {
            setBufferRanges(ranges);
            reportConnectProgress();
          }
        },
        onAudioTracks: (tracks, selectedId) => {
          if (disposed) return;
          if (tracks.length > 1) {
            setAudioOptions(
              tracks.map((track) => ({ id: track.id, label: track.label })),
            );
            setAudioId(selectedId);
          } else {
            setAudioOptions([]);
            setAudioId(0);
          }
        },
      })
        .then((handle) => {
          if (disposed) {
            handle.stop();
            return;
          }
          remuxRef.current = handle;
          setQualityOptions([{ id: -1, label: t("playerQualityAuto") }]);
          setQualityId(-1);
          setQualityIsHls(false);
          // Softsubs aren't available on the client remux path (mediabunny).
          setSubtitleOptions([]);
          setSubtitleId(-1);
          setHasStarted(true);
          setSeekingUi(false);
          seekingReloadRef.current = false;
          setStatusText(t("playerPlaying"));
          setProgress(100);
        })
        .catch((err) => {
          if (disposed) return;
          failOver(err instanceof Error ? err.message : String(err));
        });

      return () => {
        disposed = true;
        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("timeupdate", onTime);
        video.removeEventListener("progress", updateNativeBuffer);
        video.removeEventListener("waiting", onWaiting);
        video.removeEventListener("playing", onPlayingEvt);
        if (remuxRef.current) {
          remuxRef.current.stop();
          remuxRef.current = null;
        }
        video.removeAttribute("src");
        video.load();
      };
    }

    // Direct MKV without remux path — skip immediately (browser can't demux)
    if (wantsRemux && candidate.transport === "direct") {
      pushDebug(`skip direct remux-container · use proxy remux instead`);
      queueMicrotask(() => failOver("browser cannot play this container natively"));
      return () => {
        disposed = true;
        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("timeupdate", onTime);
        video.removeEventListener("progress", updateNativeBuffer);
        video.removeEventListener("waiting", onWaiting);
        video.removeEventListener("playing", onPlayingEvt);
      };
    }

    const useHlsJs = isHls && Hls.isSupported();
    const useNativeHls =
      isHls &&
      !useHlsJs &&
      !!video.canPlayType("application/vnd.apple.mpegurl");
    let cleanupNativeTracks: (() => void) | null = null;

    if (useHlsJs) {
      pushDebug(`engine=hls.js · ${candidate.label}`);
      if (playSrc.includes("/api/hls")) {
        void (async () => {
          try {
            const res = await fetch(playSrc, { cache: "no-store" });
            const text = await res.text();
            const match = text.match(/#XTREAM-DURATION:(\d+(?:\.\d+)?)/);
            const headerDur = Number(res.headers.get("x-media-duration") || 0);
            const tagged = match ? Number(match[1]) : 0;
            const best = Math.max(headerDur, tagged);
            if (!disposed && best > 0) {
              setDuration((prev) => Math.max(prev, best));
              pushDebug(`hls · duration hint ${Math.round(best)}s`);
            }
          } catch {
            /* ignore */
          }
        })();
      }
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        backBufferLength: 30,
        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
        },
      });
      hlsRef.current = hls;
      hls.loadSource(playSrc);
      hls.attachMedia(video);

      const waitAndPlay = async () => {
        const startedAt = Date.now();
        while (!disposed && Date.now() - startedAt < 90000) {
          reportConnectProgress();
          if (mediaBufferedAhead(video) >= readySec) break;
          await new Promise((r) => window.setTimeout(r, 150));
        }
        if (disposed) return;
        reportConnectProgress();
        try {
          video.muted = false;
          await video.play();
          setMuted(false);
        } catch (err) {
          pushDebug(
            `play() rejected · ${err instanceof Error ? err.message : String(err)}`,
          );
          if (err instanceof Error && err.name === "NotAllowedError") {
            try {
              video.muted = true;
              await video.play();
              setMuted(true);
              setNeedsUnmute(true);
            } catch {
              setAwaitingTap(true);
            }
          }
        }
      };

      const syncHlsTracks = () => {
        if (disposed || !hlsRef.current) return;
        // Our ffmpeg proxy is single-rendition; audio/subs come from /api/hls/tracks.
        if (playSrc.includes("/api/hls")) return;
        const current = hlsRef.current;
        const audios = current.audioTracks.map((track, index) => ({
          id: index,
          label: mediaTrackLabel(track, index, "Audio"),
        }));
        setAudioOptions(audios.length > 1 ? audios : []);
        setAudioId(current.audioTrack);
        if (current.subtitleTracks.length > 0) {
          setSubtitleOptions([
            { id: -1, label: t("playerSubtitlesOff") },
            ...current.subtitleTracks.map((track, index) => ({
              id: index,
              label: mediaTrackLabel(track, index, "CC"),
            })),
          ]);
          setSubtitleId(current.subtitleTrack);
          current.subtitleDisplay = true;
        } else {
          setSubtitleOptions([]);
          setSubtitleId(-1);
        }
      };

      hls.on(Hls.Events.MANIFEST_PARSED, (_ev, data) => {
        if (disposed) return;
        fragTotal = Math.max(1, data.levels?.[0]?.details?.fragments?.length || 8);
        const levels = (data.levels || []).map((level, index) => ({
          id: index,
          label: level.height
            ? `${level.height}p`
            : level.bitrate
              ? `${Math.round(level.bitrate / 1000)} kbps`
              : `L${index + 1}`,
        }));
        if (levels.length > 1) {
          setQualityOptions([{ id: -1, label: t("playerQualityAuto") }, ...levels]);
          setQualityId(-1);
          setQualityIsHls(true);
        } else {
          setQualityOptions([]);
          setQualityIsHls(false);
        }
        syncHlsTracks();
        pushDebug(
          `manifest ok · levels=${data.levels?.length || 0} · audio=${data.audioTracks?.length || 0} · subs=${data.subtitleTracks?.length || 0}`,
        );
        void waitAndPlay();
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        syncHlsTracks();
      });
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
        syncHlsTracks();
      });
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => {
        if (!disposed && hlsRef.current) setAudioId(hlsRef.current.audioTrack);
      });
      hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_ev, data) => {
        if (!disposed) setSubtitleId(data.id);
      });

      hls.on(Hls.Events.LEVEL_LOADED, (_ev, data) => {
        if (disposed) return;
        const total = data.details?.fragments?.length;
        if (total) fragTotal = total;
        reportConnectProgress();
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {
        if (disposed) return;
        fragLoaded += 1;
        reportConnectProgress();
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (disposed || !data.fatal) return;
        pushDebug(
          `hls fatal · type=${data.type} · ${String(data.details || "")}`,
        );
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
              void (async () => {
                const detail = await diagnoseSource(playSrc);
                failOver(
                  detail ||
                    (typeof data.details === "string" ? data.details : undefined),
                );
              })();
            }
          }, 1800);
          return;
        }
        hls.destroy();
        hlsRef.current = null;
        failOver(
          typeof data.details === "string" ? data.details : "media error",
        );
      });
    } else if (useNativeHls || !isHls) {
      pushDebug(
        `engine=native · hls=${isHls} · canPlay=${video.canPlayType("application/vnd.apple.mpegurl") || "n/a"}`,
      );
      video.src = playSrc;
      const syncNativeTextTracks = () => {
        if (disposed || hlsRef.current) return;
        const list = video.textTracks;
        const tracks: TrackOption[] = [];
        let selected = -1;
        for (let i = 0; i < list.length; i += 1) {
          const track = list[i]!;
          if (track.kind !== "subtitles" && track.kind !== "captions") continue;
          const id = tracks.length;
          tracks.push({
            id,
            label: mediaTrackLabel(
              { label: track.label, lang: track.language },
              id,
              "CC",
            ),
          });
          if (track.mode === "showing") selected = id;
          // Keep cues available; UI toggles showing vs hidden.
          if (track.mode === "disabled") track.mode = "hidden";
        }
        if (tracks.length > 0) {
          setSubtitleOptions([
            { id: -1, label: t("playerSubtitlesOff") },
            ...tracks,
          ]);
          setSubtitleId(selected);
        } else {
          setSubtitleOptions([]);
          setSubtitleId(-1);
        }
      };
      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("loadedmetadata", syncNativeTextTracks);
      video.textTracks.addEventListener("addtrack", syncNativeTextTracks);
      cleanupNativeTracks = () => {
        video.removeEventListener("loadedmetadata", syncNativeTextTracks);
        video.textTracks.removeEventListener("addtrack", syncNativeTextTracks);
      };
      video.addEventListener("error", onNativeError);
      const tryPlay = () => {
        reportConnectProgress();
        void video.play().catch((err) => {
          pushDebug(
            `play() rejected · ${err instanceof Error ? err.message : String(err)}`,
          );
          if (err instanceof Error && err.name === "NotAllowedError") {
            setAwaitingTap(true);
          }
        });
      };
      video.addEventListener("progress", reportConnectProgress);
      if (video.readyState >= 2) tryPlay();
      else video.addEventListener("canplay", tryPlay, { once: true });
    } else {
      queueMicrotask(() => setError(t("playerHlsUnsupported")));
    }

    return () => {
      disposed = true;
      cleanupNativeTracks?.();
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
      if (remuxRef.current) {
        remuxRef.current.stop();
        remuxRef.current = null;
      }
      video.removeAttribute("src");
      video.load();
    };
  }, [
    playSrc,
    candidate,
    onProgress,
    sources,
    sources.length,
    reloadToken,
    t,
    sourceIndex,
    pushDebug,
    runProbes,
    formatDebugDump,
    logDebugToTerminal,
    extension,
    durationHint,
    serverHlsOffset,
  ]);

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

  const toggleFullscreen = async () => {
    const root = rootRef.current;
    const video = videoRef.current;
    if (!video) return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const iosVideo = video as HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
      webkitExitFullscreen?: () => void;
      webkitDisplayingFullscreen?: boolean;
    };
    try {
      const active =
        document.fullscreenElement || doc.webkitFullscreenElement || null;
      if (active) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (typeof doc.webkitExitFullscreen === "function") {
          await doc.webkitExitFullscreen();
        }
        bumpChrome();
        return;
      }
      // iPhone native video fullscreen (enter/exit on the media element).
      if (iosVideo.webkitDisplayingFullscreen) {
        iosVideo.webkitExitFullscreen?.();
        bumpChrome();
        return;
      }
      if (
        typeof iosVideo.webkitEnterFullscreen === "function" &&
        !root?.requestFullscreen
      ) {
        iosVideo.webkitEnterFullscreen();
      } else if (root?.requestFullscreen) {
        await root.requestFullscreen();
      } else if (video.requestFullscreen) {
        await video.requestFullscreen();
      } else if (typeof iosVideo.webkitEnterFullscreen === "function") {
        iosVideo.webkitEnterFullscreen();
      }
      // Best-effort landscape lock (supported on some browsers).
      try {
        await (
          screen.orientation as ScreenOrientation & {
            lock?: (o: string) => Promise<void>;
          }
        ).lock?.("landscape");
      } catch {
        /* ignore */
      }
    } catch (err) {
      pushDebug(
        `fullscreen failed · ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    bumpChrome();
  };

  const startFromTap = () => {
    const video = videoRef.current;
    if (!video) return;
    setAwaitingTap(false);
    setNeedsUnmute(false);
    video.muted = false;
    setMuted(false);
    void toggleFullscreen();
    void video.play().catch((err) => {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setAwaitingTap(true);
      }
    });
  };

  const unmuteFromTap = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    setMuted(false);
    setNeedsUnmute(false);
    void video.play().catch(() => undefined);
    bumpChrome();
  };

  const applyQuality = (id: number) => {
    setQualityId(id);
    const hls = hlsRef.current;
    if (hls) {
      hls.currentLevel = id; // -1 = auto
    }
    pushDebug(`quality · ${id < 0 ? "auto" : id}`);
    bumpChrome();
  };

  const restartServerHlsAt = (absoluteSec: number, nextAudio: number) => {
    const video = videoRef.current;
    const snapped = snapHlsStart(absoluteSec);
    const frame = video ? captureFreezeFrame(video) : null;
    if (frame) setHoldPoster(frame);
    seekingReloadRef.current = true;
    setHasStarted(false);
    setLoadPercent(0);
    setSeekingUi(true);
    setStatusText(t("playerSeeking"));
    setServerHlsAudio(nextAudio);
    setServerHlsOffset(snapped);
    setCurrentTime(0);
  };

  const applyAudio = (id: number) => {
    if (id === audioId) {
      bumpChrome();
      return;
    }
    setAudioId(id);
    const hls = hlsRef.current;
    if (isServerHls) {
      const absolute = serverHlsOffset + (videoRef.current?.currentTime || 0);
      pushDebug(`audio · server HLS · ${id}`);
      restartServerHlsAt(absolute, id);
      bumpChrome();
      return;
    }
    if (remuxRef.current) {
      pushDebug(`audio · remux · ${id}`);
      void remuxRef.current.setAudioTrack(id);
      bumpChrome();
      return;
    }
    if (hls) {
      hls.audioTrack = id;
      pushDebug(`audio · ${id}`);
    }
    bumpChrome();
  };

  const clearProxySubtitles = () => {
    subtitleAbortRef.current?.abort();
    subtitleAbortRef.current = null;
    subtitleWindowRef.current = null;
    setSubtitleCues([]);
    setSubtitleLoading(false);
    setSubtitleError(null);
    const video = videoRef.current;
    if (video) clearInjectedTextTracks(video);
  };

  const loadProxySubtitles = async (
    id: number,
    opts?: { localTime?: number; quiet?: boolean },
  ) => {
    // Anchor to the same HLS session start as the video, then page forward in
    // relative windows so cues line up with video.currentTime (not wall-clock).
    const localTime = Math.max(
      0,
      opts?.localTime ?? videoRef.current?.currentTime ?? currentTime,
    );
    const overlap = 30;
    const step = Math.max(60, SUB_WINDOW_SEC - overlap);
    const segmentStart = Math.floor(localTime / step) * step;
    const from = snapHlsStart(serverHlsOffset + segmentStart);
    const localOffset = Math.max(0, from - serverHlsOffset);
    const cacheKey = `${id}:${from}:${SUB_WINDOW_SEC}`;
    const cached = subtitleCacheRef.current.get(cacheKey);
    if (cached) {
      subtitleWindowRef.current = {
        id,
        from,
        duration: SUB_WINDOW_SEC,
      };
      setSubtitleCues(cached);
      setSubtitleLoading(false);
      setSubtitleError(null);
      if (!opts?.quiet) {
        pushDebug(
          `subtitle · cache · ${id} · from=${from}s · cues=${cached.length}`,
        );
      }
      return;
    }
    const vttUrl = serverHlsApiUrl(src, "sub", id, from, SUB_WINDOW_SEC);
    if (!vttUrl) {
      setSubtitleError(t("playerSubtitlesFailed"));
      setSubtitleLoading(false);
      return;
    }
    subtitleAbortRef.current?.abort();
    const ac = new AbortController();
    subtitleAbortRef.current = ac;
    if (!opts?.quiet) {
      setSubtitleLoading(true);
      setSubtitleError(null);
      pushDebug(`subtitle · loading · ${id} · hlsFrom=${from}s`);
    }
    try {
      const res = await fetch(vttUrl, {
        cache: "no-store",
        signal: ac.signal,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const raw = await res.text();
      if (ac.signal.aborted) return;
      // VTT is relative to `from`; shift into the HLS session timeline (currentTime).
      const cues = parseWebVtt(raw).map((cue) => ({
        start: cue.start + localOffset,
        end: cue.end + localOffset,
        text: cue.text,
      }));
      subtitleCacheRef.current.set(cacheKey, cues);
      subtitleWindowRef.current = {
        id,
        from,
        duration: SUB_WINDOW_SEC,
      };
      setSubtitleCues(cues);
      setSubtitleLoading(false);
      pushDebug(
        `subtitle · ready · ${id} · from=${from}s · cues=${cues.length}`,
      );
      if (!cues.length && !opts?.quiet) {
        setSubtitleError(t("playerSubtitlesFailed"));
      }
      // Prefetch the next window so scrubbing forward stays smooth.
      const nextLocal = localOffset + step;
      const nextFrom = snapHlsStart(serverHlsOffset + nextLocal);
      const nextKey = `${id}:${nextFrom}:${SUB_WINDOW_SEC}`;
      if (!subtitleCacheRef.current.has(nextKey)) {
        const nextUrl = serverHlsApiUrl(src, "sub", id, nextFrom, SUB_WINDOW_SEC);
        if (nextUrl) {
          void fetch(nextUrl, { cache: "no-store" })
            .then(async (nextRes) => {
              if (!nextRes.ok) return;
              const nextRaw = await nextRes.text();
              const nextCues = parseWebVtt(nextRaw).map((cue) => ({
                start: cue.start + nextLocal,
                end: cue.end + nextLocal,
                text: cue.text,
              }));
              subtitleCacheRef.current.set(nextKey, nextCues);
            })
            .catch(() => undefined);
        }
      }
    } catch (err) {
      if (ac.signal.aborted) return;
      subtitleWindowRef.current = {
        id,
        from,
        duration: SUB_WINDOW_SEC,
      };
      setSubtitleLoading(false);
      if (!opts?.quiet) {
        setSubtitleError(t("playerSubtitlesFailed"));
      }
      pushDebug(
        `subtitle · failed · ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const applySubtitle = (id: number) => {
    setSubtitleId(id);
    const hls = hlsRef.current;
    const video = videoRef.current;
    if (isServerHls) {
      if (id < 0) {
        clearProxySubtitles();
        pushDebug("subtitle · off");
        bumpChrome();
        return;
      }
      void loadProxySubtitles(id);
      bumpChrome();
      return;
    }
    clearProxySubtitles();
    if (hls) {
      hls.subtitleDisplay = id >= 0;
      hls.subtitleTrack = id;
      pushDebug(`subtitle · ${id < 0 ? "off" : id}`);
    } else if (video) {
      const list = video.textTracks;
      let subIndex = 0;
      for (let i = 0; i < list.length; i += 1) {
        const track = list[i]!;
        if (track.kind !== "subtitles" && track.kind !== "captions") continue;
        track.mode =
          id >= 0 && subIndex === id ? "showing" : "hidden";
        subIndex += 1;
      }
      pushDebug(`subtitle · ${id < 0 ? "off" : id}`);
    }
    bumpChrome();
  };

  const seekTo = async (seconds: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(seconds) || !hasStarted) return;
    const target = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);
    setSeekingUi(true);
    setCurrentTime(Math.max(0, target - serverHlsOffset));
    setStatusText(t("playerSeeking"));
    pushDebug(
      `seek · ${target.toFixed(1)}s · remux=${!!remuxRef.current} · serverHls=${isServerHls}`,
    );
    bumpChrome();
    let restartingServerHls = false;
    try {
      if (remuxRef.current) {
        await remuxRef.current.seek(target);
      } else if (isServerHls) {
        const local = target - serverHlsOffset;
        let bufEnd = 0;
        try {
          if (video.buffered.length) {
            bufEnd = video.buffered.end(video.buffered.length - 1);
          }
        } catch {
          /* ignore */
        }
        // Within already-remuxed window → cheap local seek.
        if (local >= 0 && local <= bufEnd - 0.35) {
          video.currentTime = local;
          void video.play().catch(() => undefined);
        } else {
          // Restart ffmpeg HLS from a snapped wall-clock position (2s buckets
          // match the proxy session id so scrub-prefetch can warm it).
          const snapped = snapHlsStart(target);
          restartingServerHls = true;
          const frame = captureFreezeFrame(video);
          if (frame) setHoldPoster(frame);
          seekingReloadRef.current = true;
          setHasStarted(false);
          setLoadPercent(0);
          setStatusText(t("playerSeeking"));
          setServerHlsOffset(snapped);
          setCurrentTime(0);
        }
      } else {
        video.currentTime = target;
        void video.play().catch(() => undefined);
      }
    } catch (err) {
      pushDebug(
        `seek failed · ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      if (!restartingServerHls) {
        setSeekingUi(false);
        if (hasStarted) setStatusText(t("playerPlaying"));
      }
      // Keep seekingUi + freeze poster until the restarted stream hits playing.
    }
  };

  const retry = () => {
    setError(null);
    setExternalUrl(null);
    setAwaitingTap(false);
    setHasStarted(false);
    setServerHlsOffset(0);
    setServerHlsAudio(0);
    setLoadPercent(0);
    setSourceIndex(0);
    setSeekingUi(false);
    seekingReloadRef.current = false;
    setHoldPoster(poster);
    lastFailDetail.current = null;
    resetDebug();
    setReloadToken((n) => n + 1);
  };

  const controlsEnabled = hasStarted && !seekingUi && !error;

  const prefetchServerHls = useCallback(
    (absoluteSec: number) => {
      if (!isServerHls || !src) return;
      const start = snapHlsStart(absoluteSec);
      if (start <= 0) return;
      // warm=1: start ffmpeg without killing the session currently playing.
      const warmUrl = withServerHlsParams(src, start, serverHlsAudio, {
        warm: true,
      });
      void fetch(warmUrl, { cache: "no-store" }).catch(() => undefined);
    },
    [isServerHls, src, serverHlsAudio],
  );

  // Soft audio/subtitle list from the ffmpeg proxy (MKV multi-track).
  useEffect(() => {
    if (!isServerHls || !src) return;
    const tracksUrl = serverHlsApiUrl(src, "tracks");
    if (!tracksUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(tracksUrl, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          audio?: { id: number; label: string }[];
          subtitles?: { id: number; label: string }[];
        };
        if (cancelled) return;
        const audios = data.audio || [];
        if (audios.length > 1) {
          setAudioOptions(
            audios.map((a) => ({ id: a.id, label: a.label || `Audio ${a.id + 1}` })),
          );
          setAudioId((prev) =>
            audios.some((a) => a.id === prev) ? prev : audios[0]!.id,
          );
        } else {
          setAudioOptions([]);
        }
        const subs = data.subtitles || [];
        if (subs.length > 0) {
          setSubtitleOptions([
            { id: -1, label: t("playerSubtitlesOff") },
            ...subs.map((s) => ({
              id: s.id,
              label: s.label || `Subtitles ${s.id + 1}`,
            })),
          ]);
          // Don't warm-extract here — competing with HLS truncated the VTT
          // to ~15 minutes. Extract on demand when the user picks a track.
        } else {
          setSubtitleOptions([]);
          setSubtitleId(-1);
        }
        pushDebug(
          `proxy tracks · audio=${audios.length} · subs=${subs.length}`,
        );
      } catch (err) {
        if (!cancelled) {
          pushDebug(
            `proxy tracks failed · ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isServerHls, src, t, pushDebug]);

  const schedulePrefetch = useCallback(
    (absoluteSec: number) => {
      if (!isServerHls) return;
      if (prefetchTimer.current) window.clearTimeout(prefetchTimer.current);
      prefetchTimer.current = window.setTimeout(() => {
        prefetchTimer.current = null;
        prefetchServerHls(absoluteSec);
      }, 120);
    },
    [isServerHls, prefetchServerHls],
  );

  useEffect(
    () => () => {
      if (prefetchTimer.current) window.clearTimeout(prefetchTimer.current);
    },
    [],
  );

  useEffect(() => {
    const syncFs = () => {
      const doc = document as Document & {
        webkitFullscreenElement?: Element | null;
      };
      const video = videoRef.current as
        | (HTMLVideoElement & { webkitDisplayingFullscreen?: boolean })
        | null;
      setIsFullscreen(
        !!(
          document.fullscreenElement ||
          doc.webkitFullscreenElement ||
          video?.webkitDisplayingFullscreen
        ),
      );
    };
    document.addEventListener("fullscreenchange", syncFs);
    document.addEventListener("webkitfullscreenchange", syncFs as EventListener);
    const video = videoRef.current;
    video?.addEventListener("webkitbeginfullscreen", syncFs);
    video?.addEventListener("webkitendfullscreen", syncFs);
    syncFs();
    return () => {
      document.removeEventListener("fullscreenchange", syncFs);
      document.removeEventListener(
        "webkitfullscreenchange",
        syncFs as EventListener,
      );
      video?.removeEventListener("webkitbeginfullscreen", syncFs);
      video?.removeEventListener("webkitendfullscreen", syncFs);
    };
  }, []);
  const showLoader =
    (!error && !hasStarted && !awaitingTap) || seekingUi;
  const freezeHold = !!holdPoster?.startsWith("data:");
  const timelineValue = scrubbing
    ? scrubValue
    : serverHlsOffset + currentTime;
  const timelineMax = duration > 0 ? duration : Math.max(timelineValue, 1);
  const displayBufferRanges = bufferRanges.map((r) => ({
    start: r.start + serverHlsOffset,
    end: r.end + serverHlsOffset,
  }));
  const hasSettings =
    qualityOptions.length > 0 ||
    audioOptions.length > 0 ||
    subtitleOptions.length > 0;
  const tooltipTime = scrubbing ? scrubValue : hoverTime;
  const tooltipPct = scrubbing
    ? timelineMax > 0
      ? (Math.min(scrubValue, timelineMax) / timelineMax) * 100
      : 0
    : hoverPct;
  const showSeekTooltip =
    tooltipTime !== null && controlsEnabled && timelineMax > 1;
  // Cues are on the HLS-local timeline; delay slightly so they don't lead the video.
  const subtitleText =
    subtitleId >= 0 && subtitleCues.length > 0
      ? cueTextAt(
          subtitleCues,
          Math.max(0, currentTime - SUBTITLE_DELAY_SEC),
        )
      : "";

  // Seek / audio switch restarts HLS at a new offset — drop stale cues.
  useEffect(() => {
    if (!isServerHls || subtitleId < 0) return;
    subtitleWindowRef.current = null;
    subtitleCacheRef.current = new Map();
    setSubtitleCues([]);
  }, [serverHlsOffset, serverHlsAudio, isServerHls, subtitleId]);

  // Reload when the playhead leaves the current relative window.
  useEffect(() => {
    if (!isServerHls || subtitleId < 0 || subtitleLoading) return;
    const win = subtitleWindowRef.current;
    if (!win || win.id !== subtitleId) {
      void loadProxySubtitles(subtitleId, { localTime: currentTime });
      return;
    }
    const localFrom = Math.max(0, win.from - serverHlsOffset);
    const localEnd = localFrom + win.duration;
    if (currentTime < localFrom || currentTime >= localEnd - 45) {
      void loadProxySubtitles(subtitleId, { localTime: currentTime });
    }
  }, [
    isServerHls,
    subtitleId,
    subtitleLoading,
    currentTime,
    src,
    serverHlsOffset,
  ]);

  return (
    <div
      ref={rootRef}
      className="relative flex h-dvh w-full items-center justify-center bg-black"
      onMouseMove={bumpChrome}
      onTouchStart={bumpChrome}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        poster={holdPoster || poster}
        playsInline
        preload="auto"
        controls={false}
        onClick={() => {
          if (controlsEnabled) togglePlay();
        }}
      />

      {showLoader ? (
        <div
          className={`pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 px-6 ${
            freezeHold ? "bg-black/35" : "bg-black/55"
          }`}
        >
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
          <p className="text-center text-xs text-white/55">{t("playerRotate")}</p>
          {sources.length > 1 ? (
            <p className="text-xs text-white/50">
              {t("playerSource", {
                current: sourceIndex + 1,
                total: sources.length,
              })}
              {candidate ? ` · ${candidate.label}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {awaitingTap && !error ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            startFromTap();
          }}
          className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/60 px-6 text-center"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--xp-accent)] text-[var(--xp-ink)] shadow-xl">
            <Play className="h-9 w-9 fill-current" />
          </span>
          <span className="text-base font-semibold text-white">
            {t("playerTapToPlay")}
          </span>
          <span className="text-xs text-white/60">{t("playerRotate")}</span>
        </button>
      ) : null}

      {needsUnmute && !awaitingTap && !error ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            unmuteFromTap();
          }}
          className="absolute bottom-28 left-1/2 z-40 -translate-x-1/2 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-black shadow-lg"
        >
          {t("playerTapForSound")}
        </button>
      ) : null}

      {subtitleId >= 0 && !error ? (
        <div
          className={`pointer-events-none absolute inset-x-0 z-30 flex justify-center px-6 text-center transition-[bottom] duration-300 ${
            showChrome && hasStarted ? "bottom-28" : "bottom-10"
          }`}
        >
          {subtitleLoading ? (
            <span className="rounded bg-black/70 px-3 py-1.5 text-xs text-white/80">
              {t("playerSubtitlesLoading")}
            </span>
          ) : subtitleError ? (
            <span className="rounded bg-black/70 px-3 py-1.5 text-xs text-red-200">
              {subtitleError}
            </span>
          ) : subtitleText ? (
            <span className="max-w-[min(52rem,92vw)] whitespace-pre-line rounded bg-black/75 px-3 py-1.5 text-base font-medium leading-snug text-white shadow-lg sm:text-lg">
              {subtitleText}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Back + title — always above error/retry overlay */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-50 flex items-center gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goBack();
          }}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur"
          aria-label={t("back")}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-[family-name:var(--xp-font-display)] text-lg font-semibold text-white drop-shadow">
            {title}
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowDebug((v) => !v);
            setShowChrome(true);
          }}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-2 text-xs font-medium text-white backdrop-blur"
        >
          <Bug className="h-3.5 w-3.5" />
          {showDebug ? t("playerDebugHide") : t("playerDebug")}
        </button>
      </div>

      {error ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/70 px-6 pb-8 pt-20 text-center">
          <p className="max-w-md text-sm text-white/90">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--xp-accent)] px-5 py-3 text-sm font-semibold text-[var(--xp-ink)]"
          >
            <RotateCcw className="h-4 w-4" />
            {t("playerRetry")}
          </button>
          {externalUrl ? (
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 text-sm font-semibold text-white"
            >
              {t("playerOpenExternal")}
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setShowDebug(true);
              void runProbes();
            }}
            className="text-xs text-white/60 underline"
          >
            {t("playerDebug")}
          </button>
        </div>
      ) : null}

      <div
        className={`xp-player-chrome absolute inset-0 z-20 bg-gradient-to-t from-black/80 via-transparent to-transparent transition-opacity duration-300 ${
          showChrome && !error && hasStarted
            ? "opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      >
        {!error ? (
          <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-right font-mono text-[11px] text-white/70">
                {formatClock(timelineValue)}
              </span>
              <div className="relative h-5 flex-1">
                {showSeekTooltip ? (
                  <div
                    className="pointer-events-none absolute bottom-full z-20 mb-2 -translate-x-1/2 rounded-md bg-black/90 px-2 py-1 font-mono text-[11px] font-medium text-white shadow-lg"
                    style={{ left: `${tooltipPct}%` }}
                  >
                    {formatClock(tooltipTime ?? 0)}
                  </div>
                ) : null}
                <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/20">
                  {timelineMax > 0
                    ? displayBufferRanges.map((range, i) => (
                        <div
                          key={`${range.start}-${range.end}-${i}`}
                          className="absolute top-0 h-full bg-white/45"
                          style={{
                            left: `${(range.start / timelineMax) * 100}%`,
                            width: `${(Math.max(0, range.end - range.start) / timelineMax) * 100}%`,
                          }}
                        />
                      ))
                    : null}
                  <div
                    className="absolute left-0 top-0 h-full bg-[var(--xp-accent)]"
                    style={{
                      width: `${timelineMax > 0 ? (Math.min(timelineValue, timelineMax) / timelineMax) * 100 : 0}%`,
                    }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={timelineMax}
                  step={0.1}
                  value={Math.min(timelineValue, timelineMax)}
                  aria-label="Seek"
                  disabled={!controlsEnabled || timelineMax <= 1}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (!controlsEnabled) return;
                    scrubbingRef.current = true;
                    setScrubbing(true);
                    setScrubValue(timelineValue);
                  }}
                  onPointerMove={(e) => {
                    if (!controlsEnabled || timelineMax <= 1) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    if (rect.width <= 0) return;
                    const pct = Math.max(
                      0,
                      Math.min(1, (e.clientX - rect.left) / rect.width),
                    );
                    setHoverPct(pct * 100);
                    setHoverTime(pct * timelineMax);
                  }}
                  onPointerLeave={() => {
                    if (!scrubbingRef.current) setHoverTime(null);
                  }}
                  onChange={(e) => {
                    if (!controlsEnabled) return;
                    const next = Number(e.target.value);
                    setScrubValue(next);
                    setHoverTime(next);
                    setHoverPct(
                      timelineMax > 0
                        ? (Math.min(next, timelineMax) / timelineMax) * 100
                        : 0,
                    );
                    schedulePrefetch(next);
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    if (!controlsEnabled) return;
                    const next = Number((e.target as HTMLInputElement).value);
                    if (prefetchTimer.current) {
                      window.clearTimeout(prefetchTimer.current);
                      prefetchTimer.current = null;
                    }
                    // Kick warm immediately for the release position.
                    prefetchServerHls(next);
                    scrubbingRef.current = false;
                    setScrubbing(false);
                    setHoverTime(null);
                    void seekTo(next);
                  }}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    if (!controlsEnabled) return;
                    const next = Number((e.target as HTMLInputElement).value);
                    if (prefetchTimer.current) {
                      window.clearTimeout(prefetchTimer.current);
                      prefetchTimer.current = null;
                    }
                    prefetchServerHls(next);
                    scrubbingRef.current = false;
                    setScrubbing(false);
                    setHoverTime(null);
                    void seekTo(next);
                  }}
                  className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0 disabled:cursor-not-allowed disabled:opacity-0"
                />
              </div>
              <span className="w-14 shrink-0 font-mono text-[11px] text-white/70">
                {formatClock(duration)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={togglePlay}
                disabled={!controlsEnabled}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--xp-accent)] text-[var(--xp-ink)] disabled:opacity-40"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? (
                  <Pause className="h-5 w-5 fill-current" />
                ) : (
                  <Play className="h-5 w-5 fill-current" />
                )}
              </button>
              <div className="relative flex items-center gap-2">
                {hasSettings ? (
                  <>
                    <button
                      type="button"
                      disabled={!controlsEnabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!controlsEnabled) return;
                        setShowSettings((v) => !v);
                        bumpChrome();
                      }}
                      className="flex h-11 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-medium text-white disabled:opacity-40"
                      aria-label={t("playerSettings")}
                    >
                      <Settings2 className="h-4 w-4" />
                      {t("playerSettings")}
                    </button>
                    {showSettings ? (
                      <div className="absolute bottom-14 right-0 z-50 max-h-[min(50dvh,22rem)] w-[12.5rem] overflow-y-auto rounded-xl border border-white/15 bg-black/90 py-1 shadow-xl backdrop-blur">
                        {qualityOptions.length > 0 ? (
                          <div className="border-b border-white/10 pb-1">
                            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                              {t("playerQuality")}
                            </p>
                            {qualityOptions.map((q) => (
                              <button
                                key={`q-${q.id}`}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  applyQuality(q.id);
                                }}
                                className={`block w-full px-3 py-2 text-left text-xs ${
                                  q.id === qualityId
                                    ? "bg-white/15 text-[var(--xp-accent)]"
                                    : "text-white/85"
                                }`}
                              >
                                {q.label}
                              </button>
                            ))}
                            {!qualityIsHls ? (
                              <p className="px-3 py-2 text-[10px] text-white/50">
                                {t("playerQualityRemuxHint")}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        {audioOptions.length > 0 ? (
                          <div className="border-b border-white/10 py-1">
                            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                              {t("playerAudio")}
                            </p>
                            {audioOptions.map((option) => (
                              <button
                                key={`a-${option.id}`}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  applyAudio(option.id);
                                }}
                                className={`block w-full px-3 py-2 text-left text-xs ${
                                  option.id === audioId
                                    ? "bg-white/15 text-[var(--xp-accent)]"
                                    : "text-white/85"
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {subtitleOptions.length > 0 ? (
                          <div className="py-1">
                            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                              {t("playerSubtitles")}
                            </p>
                            {subtitleOptions.map((option) => (
                              <button
                                key={`s-${option.id}`}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  applySubtitle(option.id);
                                }}
                                className={`block w-full px-3 py-2 text-left text-xs ${
                                  option.id === subtitleId
                                    ? "bg-white/15 text-[var(--xp-accent)]"
                                    : "text-white/85"
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : null}
                <button
                  type="button"
                  disabled={!controlsEnabled}
                  onClick={toggleMute}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-40"
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
                  disabled={!controlsEnabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!controlsEnabled) return;
                    void toggleFullscreen();
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-40"
                  aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  {isFullscreen ? (
                    <Minimize className="h-5 w-5" />
                  ) : (
                    <Maximize className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {showDebug ? (
        <div className="absolute inset-x-3 bottom-3 z-[60] max-h-[45dvh] overflow-hidden rounded-2xl border border-white/15 bg-black/90 shadow-2xl backdrop-blur-md sm:inset-x-6">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--xp-accent)]">
              {t("playerDebug")}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!debugLines.length}
                onClick={() => void copyDebug()}
                className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white disabled:opacity-50"
              >
                <Copy className="h-3 w-3" />
                {copyState === "ok"
                  ? t("playerDebugCopied")
                  : copyState === "err"
                    ? t("playerDebugCopyFailed")
                    : t("playerDebugCopy")}
              </button>
              <button
                type="button"
                disabled={probing}
                onClick={() => void runProbes()}
                className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white disabled:opacity-50"
              >
                {probing ? t("playerDebugProbing") : "Probe"}
              </button>
              <button
                type="button"
                onClick={() => setShowDebug(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white"
                aria-label={t("playerDebugHide")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="max-h-[calc(45dvh-2.5rem)] overflow-y-auto px-3 py-2 font-mono text-[10px] leading-relaxed text-white/80">
            {debugLines.length ? (
              debugLines.map((line) => (
                <p key={line.id} className="break-all border-b border-white/5 py-1.5">
                  <span className="text-white/40">{line.at}</span> {line.text}
                </p>
              ))
            ) : (
              <p className="py-2 text-white/50">{t("playerDebugEmpty")}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
