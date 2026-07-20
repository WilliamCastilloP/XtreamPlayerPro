import {
  ALL_FORMATS,
  AppendOnlyStreamTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  UrlSource,
} from "mediabunny";

export function needsContainerRemux(extension?: string, url?: string): boolean {
  // Server HLS playlist — never client-remux even if nested url ends in .mkv
  if (url && url.includes("/api/hls")) return false;
  const ext = (extension || guessExtFromUrl(url) || "")
    .toLowerCase()
    .replace(/^\./, "");
  return ext === "mkv" || ext === "avi" || ext === "mov";
}

function guessExtFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const nested = new URL(url, "http://local").searchParams.get("url") || url;
    const match = nested.match(/\.([a-z0-9]+)(?:\?|$)/i);
    return match?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Media Source Extensions on iOS Safari (iPhone) are only exposed through
 * `ManagedMediaSource` (iOS 17+). Desktop/Android expose the regular
 * `MediaSource`. Pick whichever the platform provides so remuxed playback
 * works everywhere, not just on Chromium/Firefox.
 */
type MediaSourceLike = MediaSource;

type MediaSourceCtor = {
  new (): MediaSourceLike;
  isTypeSupported(type: string): boolean;
};

function getMediaSourceCtor(): { ctor: MediaSourceCtor; managed: boolean } | null {
  const w = window as unknown as {
    MediaSource?: MediaSourceCtor;
    ManagedMediaSource?: MediaSourceCtor;
  };
  if (typeof w.MediaSource !== "undefined" && w.MediaSource) {
    return { ctor: w.MediaSource, managed: false };
  }
  if (typeof w.ManagedMediaSource !== "undefined" && w.ManagedMediaSource) {
    return { ctor: w.ManagedMediaSource, managed: true };
  }
  return null;
}

export function canRemuxInBrowser(): boolean {
  return getMediaSourceCtor() !== null;
}

function waitForSourceOpen(mediaSource: MediaSourceLike): Promise<void> {
  if (mediaSource.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("MediaSource failed to open"));
    };
    const cleanup = () => {
      mediaSource.removeEventListener("sourceopen", onOpen);
      mediaSource.removeEventListener("error", onError);
    };
    mediaSource.addEventListener("sourceopen", onOpen);
    mediaSource.addEventListener("error", onError);
  });
}

function waitForUpdateEnd(sourceBuffer: SourceBuffer): Promise<void> {
  if (!sourceBuffer.updating) return Promise.resolve();
  return new Promise((resolve) => {
    sourceBuffer.addEventListener("updateend", () => resolve(), { once: true });
  });
}

async function evictBehind(
  sourceBuffer: SourceBuffer,
  video: HTMLVideoElement,
  keepBehind = 10,
): Promise<void> {
  try {
    const buffered = sourceBuffer.buffered;
    if (!buffered.length) return;
    const start = buffered.start(0);
    const keepFrom = Math.max(start, (video.currentTime || 0) - keepBehind);
    if (keepFrom - start < 3) return;
    await waitForUpdateEnd(sourceBuffer);
    sourceBuffer.remove(start, keepFrom);
    await waitForUpdateEnd(sourceBuffer);
  } catch {
    /* ignore */
  }
}

function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "QuotaExceededError";
}

function playheadCovered(sourceBuffer: SourceBuffer, t: number): boolean {
  try {
    const b = sourceBuffer.buffered;
    for (let i = 0; i < b.length; i += 1) {
      if (t >= b.start(i) - 0.35 && t < b.end(i) - 0.15) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function appendChunk(
  sourceBuffer: SourceBuffer,
  chunk: Uint8Array,
  video: HTMLVideoElement,
  opts?: { onQuota?: () => void; onDetail?: (detail: string) => void },
): Promise<void> {
  return new Promise((resolve, reject) => {
    let quotaRetries = 0;
    const run = () => {
      if (sourceBuffer.updating) {
        sourceBuffer.addEventListener("updateend", run, { once: true });
        return;
      }
      const onEnd = () => {
        sourceBuffer.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        sourceBuffer.removeEventListener("updateend", onEnd);
        const mediaErr = video.error;
        const detail = [
          "SourceBuffer append error",
          mediaErr ? `mediaError=${mediaErr.code}` : null,
          `bytes=${chunk.byteLength}`,
        ]
          .filter(Boolean)
          .join(" · ");
        opts?.onDetail?.(detail);
        reject(new Error(detail));
      };
      sourceBuffer.addEventListener("updateend", onEnd, { once: true });
      sourceBuffer.addEventListener("error", onError, { once: true });
      try {
        // Fresh ArrayBuffer — avoid SharedArrayBuffer views that Chrome rejects.
        const copy = new Uint8Array(chunk.byteLength);
        copy.set(chunk);
        sourceBuffer.appendBuffer(copy);
      } catch (err) {
        sourceBuffer.removeEventListener("updateend", onEnd);
        sourceBuffer.removeEventListener("error", onError);
        if (isQuotaError(err) && quotaRetries < 24) {
          quotaRetries += 1;
          opts?.onQuota?.();
          void evictBehind(sourceBuffer, video, 2).then(() => {
            window.setTimeout(run, 400);
          });
          return;
        }
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    run();
  });
}

export type RemuxHandle = {
  stop: () => void;
  /** Restart remux from `seconds` (lightweight seek for MKV). */
  seek: (seconds: number) => Promise<void>;
  objectUrl: string;
};

export type BufferRange = { start: number; end: number };

type RemuxOpts = {
  onProgress?: (progress: number) => void;
  onLog?: (message: string) => void;
  onAutoplayBlocked?: () => void;
  /** Muted autoplay succeeded — UI should offer unmute. */
  onMutedAutoplay?: () => void;
  /** Fired when full media duration is known (seconds). */
  onDuration?: (seconds: number) => void;
  /** Fired when MSE buffered ranges change (for the dual progress bar). */
  onBuffer?: (ranges: BufferRange[], currentTime: number) => void;
};

/**
 * Remux MKV/AVI/MOV into fragmented MP4 via Mediabunny and play with MSE.
 *
 * Seek is implemented by cancelling the current conversion and restarting
 * from `trim.start` (Range requests) — much lighter than buffering the
 * whole file.
 */
export async function startRemuxedPlayback(
  video: HTMLVideoElement,
  sourceUrl: string,
  opts?: RemuxOpts,
): Promise<RemuxHandle> {
  const log = opts?.onLog || (() => undefined);

  const found = getMediaSourceCtor();
  if (!found) {
    throw new Error("This browser can't play this format (no Media Source)");
  }
  const { ctor: MediaSourceImpl, managed } = found;

  let closed = false;
  let objectUrl = "";
  let sourceEl: HTMLSourceElement | null = null;
  let mediaSource: MediaSourceLike | null = null;
  let sourceBuffer: SourceBuffer | null = null;
  let sessionGen = 0;
  let fullDuration = 0;
  let baseTime = 0;
  let seeking = false;

  // Shared pump state for the active session
  let queue: Uint8Array[] = [];
  let pumping = false;
  let appendError: Error | null = null;
  let sawData = false;
  let conversion: Conversion | null = null;
  let input: Input | null = null;
  let drainResolve: (() => void) | null = null;

  const MAX_AHEAD_PLAYING = 45;
  /** While paused, keep remuxing toward ~10% of the title (capped). */
  const MAX_AHEAD_PAUSED_FLOOR = 60;
  const MAX_AHEAD_PAUSED_CAP = 180;
  /** Seconds of buffer required before we start/resume playback. */
  const START_BUFFER = 3;
  /** Pause playback when ahead falls below this (refill without killing session). */
  const REFILL_PAUSE = 2.5;
  /** Resume after a refill pause once ahead reaches this. */
  const REFILL_RESUME = 6;
  /** Only restart the whole remux session if starved this long with a gap. */
  const STARVE_SECONDS = 1.25;
  const EVICT_BEHIND = 12;
  const HIGH_WATER = 24;
  const LOW_WATER = 6;

  let refillPaused = false;
  let userPaused = false;
  let audioTranscoding = false;

  const releaseDrain = () => {
    if (drainResolve) {
      const r = drainResolve;
      drainResolve = null;
      r();
    }
  };
  const waitForDrain = () =>
    new Promise<void>((resolve) => {
      drainResolve = resolve;
    });

  const targetAhead = (): number => {
    const paused = userPaused || (!!video.paused && !refillPaused);
    if (!paused) return MAX_AHEAD_PLAYING;
    if (fullDuration > 0) {
      const tenPercent = fullDuration * 0.1;
      return Math.min(
        MAX_AHEAD_PAUSED_CAP,
        Math.max(MAX_AHEAD_PAUSED_FLOOR, tenPercent),
      );
    }
    return MAX_AHEAD_PAUSED_CAP;
  };

  const reportBuffer = () => {
    if (!sourceBuffer || !opts?.onBuffer) return;
    try {
      const b = sourceBuffer.buffered;
      const ranges: BufferRange[] = [];
      for (let i = 0; i < b.length; i += 1) {
        ranges.push({ start: b.start(i), end: b.end(i) });
      }
      opts.onBuffer(ranges, video.currentTime || baseTime);
    } catch {
      /* ignore */
    }
  };

  const bufferedAhead = (): number => {
    if (!sourceBuffer) return 0;
    try {
      const b = sourceBuffer.buffered;
      if (!b.length) return 0;
      const t = video.currentTime || 0;
      for (let i = 0; i < b.length; i += 1) {
        if (t >= b.start(i) - 0.35 && t <= b.end(i) + 0.35) {
          return Math.max(0, b.end(i) - t);
        }
      }
      return 0;
    } catch {
      return 0;
    }
  };

  const wantsMore = (): boolean => bufferedAhead() < targetAhead();

  const teardownMedia = () => {
    try {
      if (sourceEl?.parentNode) sourceEl.parentNode.removeChild(sourceEl);
      sourceEl = null;
      video.removeAttribute("src");
      while (video.firstChild) video.removeChild(video.firstChild);
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    } catch {
      /* ignore */
    }
    objectUrl = "";
    mediaSource = null;
    sourceBuffer = null;
  };

  const cancelSession = async () => {
    releaseDrain();
    queue = [];
    pumping = false;
    appendError = null;
    sawData = false;
    const conv = conversion;
    const inp = input;
    conversion = null;
    input = null;
    if (conv) void conv.cancel().catch(() => undefined);
    if (inp) void Promise.resolve(inp.dispose()).catch(() => undefined);
  };

  const pump = async () => {
    if (pumping || closed || appendError || !sourceBuffer) return;
    pumping = true;
    const gen = sessionGen;
    try {
      while (
        queue.length &&
        !closed &&
        !appendError &&
        sourceBuffer &&
        gen === sessionGen &&
        wantsMore()
      ) {
        const chunk = queue.shift();
        if (!chunk) continue;
        await appendChunk(sourceBuffer, chunk, video, {
          onQuota: () => log("remux · quota · evicting + retry"),
          onDetail: (detail) => log(`remux · ${detail}`),
        });
        if (gen !== sessionGen) return;
        sawData = true;
        reportBuffer();
        if (queue.length <= LOW_WATER) releaseDrain();
      }
    } catch (err) {
      if (gen !== sessionGen) return;
      if (isQuotaError(err)) {
        log(
          `remux · append paused · ${err instanceof Error ? err.message : String(err)}`,
        );
        releaseDrain();
      } else {
        appendError = err instanceof Error ? err : new Error(String(err));
        log(`remux · append failed · ${appendError.message}`);
        releaseDrain();
      }
    } finally {
      if (gen === sessionGen) pumping = false;
      else pumping = false;
    }
    if (!closed && queue.length < HIGH_WATER) releaseDrain();
  };

  const attemptPlay = async () => {
    if (userPaused) return;
    try {
      video.muted = false;
      await video.play();
      log("remux · playing");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      log(`remux · play() · ${err instanceof Error ? err.message : String(err)}`);
      if (name === "NotAllowedError") {
        // Web/iOS often allow muted autoplay; unmute on the next user tap.
        try {
          video.muted = true;
          await video.play();
          log("remux · playing muted (awaiting unmute tap)");
          opts?.onMutedAutoplay?.();
          return;
        } catch {
          opts?.onAutoplayBlocked?.();
        }
      }
      video.addEventListener(
        "canplay",
        () => {
          if (closed || userPaused) return;
          void video.play().catch((e) => {
            if (e instanceof Error && e.name === "NotAllowedError") {
              opts?.onAutoplayBlocked?.();
            }
          });
        },
        { once: true },
      );
    }
  };

  const startSession = async (fromSeconds: number) => {
    if (closed) return;
    const gen = ++sessionGen;
    seeking = fromSeconds > 0.25;
    baseTime = Math.max(0, fromSeconds);
    log(
      `remux · session · from=${baseTime.toFixed(1)}s · ${managed ? "ManagedMediaSource" : "MediaSource"}`,
    );

    await cancelSession();
    teardownMedia();
    if (closed || gen !== sessionGen) return;

    mediaSource = new MediaSourceImpl();
    objectUrl = URL.createObjectURL(mediaSource);

    if (managed) {
      try {
        (video as unknown as { disableRemotePlayback: boolean }).disableRemotePlayback =
          true;
      } catch {
        /* not fatal */
      }
      sourceEl = document.createElement("source");
      sourceEl.src = objectUrl;
      video.appendChild(sourceEl);
    } else {
      video.src = objectUrl;
    }
    video.load();
    await waitForSourceOpen(mediaSource);
    if (closed || gen !== sessionGen) return;

    // Queue data first; create SourceBuffer only after we know the real codecs.
    // Hardcoding avc1.640028 while remuxing every track (incl. 2nd audio /
    // subs) is a common cause of async "SourceBuffer append error".
    queue = [];
    pumping = false;
    appendError = null;
    sawData = false;
    sourceBuffer = null;

    const writable = new WritableStream<Uint8Array>({
      async write(chunk) {
        if (closed || gen !== sessionGen) return;
        while (queue.length >= HIGH_WATER && !closed && !appendError && gen === sessionGen) {
          void pump();
          await waitForDrain();
        }
        if (closed || gen !== sessionGen) return;
        queue.push(chunk);
        void pump();
      },
    });

    input = new Input({
      source: new UrlSource(sourceUrl, {
        maxCacheSize: 64 * 1024 * 1024,
      }),
      formats: ALL_FORMATS,
    });

    const output = new Output({
      format: new Mp4OutputFormat({
        fastStart: "fragmented",
        // Slightly smaller fragments append more reliably on Chrome MSE.
        minimumFragmentDuration: 0.8,
      }),
      target: new AppendOnlyStreamTarget(writable),
    });

    audioTranscoding = false;
    conversion = await Conversion.init({
      input,
      output,
      // One video + one audio. Extra MKV tracks (2nd audio / subs) break a
      // single MSE SourceBuffer. Do NOT discard via `n > 0` — mediabunny's `n`
      // is 1-based and that wrongly drops the primary tracks too.
      tracks: "primary",
      audio: async (track) => {
        // Chrome MSE rarely accepts AC3/EAC3 in fMP4; transmux to AAC.
        const codec = await track.getCodec();
        if (codec === "ac3" || codec === "eac3") {
          audioTranscoding = true;
          log(`remux · audio ${codec} → aac (transcode)`);
          return { codec: "aac" };
        }
        return undefined;
      },
      trim: baseTime > 0.05 ? { start: baseTime } : undefined,
      showWarnings: false,
    });
    if (closed || gen !== sessionGen) {
      await cancelSession();
      return;
    }

    if (!conversion.isValid) {
      const reasons = conversion.discardedTracks
        .map((t) => `${t.track.codec ?? "?"} (${t.reason})`)
        .join(", ");
      await cancelSession();
      throw new Error(
        reasons
          ? `Cannot remux this file: ${reasons}`
          : "Cannot remux this file for browser playback",
      );
    }

    const codecParts: string[] = [];
    for (const track of conversion.utilizedTracks) {
      let codecStr: string | null = null;
      try {
        codecStr = await track.getCodecParameterString();
      } catch {
        codecStr = track.codec ?? null;
      }
      if (codecStr) codecParts.push(codecStr);
      const kind = track.isVideoTrack()
        ? "video"
        : track.isAudioTrack()
          ? "audio"
          : "other";
      log(`remux · track · ${kind} · ${codecStr || "?"}`);
    }

    const mimeCandidates = [
      codecParts.length > 0
        ? `video/mp4; codecs="${codecParts.join(", ")}"`
        : null,
      'video/mp4; codecs="avc1.640028, mp4a.40.2"',
      'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
      'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
      "video/mp4",
    ].filter((m): m is string => Boolean(m));

    for (const mime of mimeCandidates) {
      if (!MediaSourceImpl.isTypeSupported(mime)) continue;
      try {
        sourceBuffer = mediaSource.addSourceBuffer(mime);
        sourceBuffer.mode = "segments";
        try {
          sourceBuffer.timestampOffset = baseTime;
        } catch {
          /* ignore */
        }
        log(`remux · SourceBuffer ${mime} · offset=${baseTime.toFixed(1)}`);
        break;
      } catch (err) {
        log(
          `remux · SourceBuffer rejected ${mime} · ${err instanceof Error ? err.message : String(err)}`,
        );
        sourceBuffer = null;
      }
    }
    if (!sourceBuffer) {
      throw new Error("No supported fMP4 SourceBuffer type");
    }
    // Flush anything that arrived while the SourceBuffer was being created.
    void pump();

    // Duration: prefer metadata; after a seek, keep the known full length.
    if (fullDuration <= 0) {
      try {
        const dur = await input.getDurationFromMetadata();
        if (dur && Number.isFinite(dur) && dur > 0) {
          fullDuration = dur;
          opts?.onDuration?.(dur);
          log(`remux · duration=${Math.round(dur)}s`);
        }
      } catch {
        /* ignore */
      }
    }

    const applyDuration = () => {
      if (!mediaSource || mediaSource.readyState !== "open" || fullDuration <= 0) {
        return;
      }
      try {
        if (sourceBuffer?.updating) {
          sourceBuffer.addEventListener("updateend", applyDuration, { once: true });
          return;
        }
        mediaSource.duration = fullDuration;
      } catch {
        /* ignore */
      }
    };
    applyDuration();

    conversion.onProgress = (progress) => {
      if (gen === sessionGen) opts?.onProgress?.(progress);
    };

    log(
      `remux · converting · tracks=${conversion.utilizedTracks.length} discarded=${conversion.discardedTracks.length}`,
    );

    const conversionPromise = conversion.execute().catch((err: unknown) => {
      if (gen !== sessionGen || closed) return;
      appendError = err instanceof Error ? err : new Error(String(err));
      log(`remux · conversion error · ${appendError.message}`);
    });

    // Wait until we have a healthy start buffer (not just the first fragment).
    // Movies with AC3→AAC transcode are slower — give them more time, but
    // also accept a smaller buffer so playback can start sooner.
    const started = Date.now();
    const startTimeoutMs = audioTranscoding ? 90000 : 45000;
    const softAfterMs = audioTranscoding ? 20000 : 10000;
    const softAhead = audioTranscoding ? 2 : 2.5;
    while (!closed && gen === sessionGen && !appendError) {
      const ahead = bufferedAhead();
      if (sawData && ahead >= START_BUFFER) break;
      if (
        sawData &&
        ahead >= softAhead &&
        Date.now() - started > softAfterMs
      ) {
        log(`remux · start buffer soft · ahead=${ahead.toFixed(1)}s`);
        break;
      }
      if (Date.now() - started > startTimeoutMs) {
        throw new Error("Timed out waiting for remuxed media");
      }
      await new Promise((r) => window.setTimeout(r, 200));
    }
    if (closed || gen !== sessionGen) return;
    if (appendError) throw appendError;

    try {
      video.currentTime = baseTime;
    } catch {
      /* ignore */
    }
    seeking = false;
    refillPaused = false;
    reportBuffer();
    log(`remux · start buffer ready · ahead=${bufferedAhead().toFixed(1)}s`);
    await attemptPlay();

    void conversionPromise.finally(async () => {
      if (gen !== sessionGen || closed) return;
      try {
        while (queue.length && !appendError && !closed && gen === sessionGen) {
          await pump();
          await new Promise((r) => window.setTimeout(r, 60));
        }
        if (
          !closed &&
          gen === sessionGen &&
          !appendError &&
          mediaSource?.readyState === "open" &&
          sourceBuffer &&
          !sourceBuffer.updating &&
          !queue.length
        ) {
          mediaSource.endOfStream();
          log("remux · endOfStream");
        }
      } catch {
        /* ignore */
      }
    });
  };

  // Prefer pause→refill→resume over tearing down the remux session.
  let recovering = false;
  let recoverTimer: number | null = null;

  const manageBufferHealth = () => {
    if (closed || seeking || !sourceBuffer) return;
    reportBuffer();
    void evictBehind(sourceBuffer, video, EVICT_BEHIND);
    void pump();

    const t = video.currentTime || baseTime;
    const ahead = bufferedAhead();
    const covered = playheadCovered(sourceBuffer, t);

    if (!userPaused && covered && ahead < REFILL_PAUSE && !video.paused) {
      refillPaused = true;
      video.pause();
      log(`remux · refill pause · ahead=${ahead.toFixed(1)}s`);
      return;
    }

    if (refillPaused && !userPaused && covered && ahead >= REFILL_RESUME) {
      refillPaused = false;
      log(`remux · refill resume · ahead=${ahead.toFixed(1)}s`);
      void attemptPlay();
      return;
    }

    if (!covered && ahead < STARVE_SECONDS && !recovering && !seeking) {
      if (recoverTimer) window.clearTimeout(recoverTimer);
      recoverTimer = window.setTimeout(() => {
        recoverTimer = null;
        if (
          closed ||
          seeking ||
          recovering ||
          (sourceBuffer &&
            playheadCovered(sourceBuffer, video.currentTime || 0))
        ) {
          return;
        }
        void recoverFromUnderrun("gap");
      }, 1200);
    }
  };

  const recoverFromUnderrun = async (reason: string) => {
    if (closed || seeking || recovering) return;
    const t = video.currentTime || baseTime;
    if (
      sourceBuffer &&
      playheadCovered(sourceBuffer, t) &&
      bufferedAhead() >= REFILL_PAUSE
    ) {
      void pump();
      if (refillPaused || video.paused) {
        refillPaused = false;
        void attemptPlay();
      }
      return;
    }
    recovering = true;
    log(`remux · recover · ${reason} · t=${t.toFixed(1)}s`);
    try {
      await startSession(Math.max(0, t - 0.25));
    } catch (err) {
      log(
        `remux · recover failed · ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      recovering = false;
    }
  };

  const onTimeUpdate = () => manageBufferHealth();
  const onWaiting = () => {
    if (closed || seeking) return;
    log(
      `remux · waiting · ahead=${bufferedAhead().toFixed(1)}s queue=${queue.length}`,
    );
    manageBufferHealth();
  };
  const onPlaying = () => {
    if (!closed) {
      userPaused = false;
      void pump();
      releaseDrain();
      reportBuffer();
      log(
        `remux · playing · ahead=${bufferedAhead().toFixed(1)}s · target=${targetAhead()}s`,
      );
    }
  };
  const onPause = () => {
    if (!refillPaused) userPaused = true;
    // Keep remuxing while the user is paused — fill toward ~10% / cap.
    const target = targetAhead();
    log(
      `remux · user pause · filling toward ${target.toFixed(0)}s (ahead=${bufferedAhead().toFixed(1)}s)`,
    );
    releaseDrain();
    void pump();
  };

  video.addEventListener("timeupdate", onTimeUpdate);
  video.addEventListener("waiting", onWaiting);
  video.addEventListener("playing", onPlaying);
  video.addEventListener("pause", onPause);

  const pumpTimer = window.setInterval(() => {
    if (closed || seeking) return;
    manageBufferHealth();
    if (queue.length < HIGH_WATER) releaseDrain();
  }, 400);

  await startSession(0);

  const stop = () => {
    closed = true;
    releaseDrain();
    if (recoverTimer) window.clearTimeout(recoverTimer);
    window.clearInterval(pumpTimer);
    video.removeEventListener("timeupdate", onTimeUpdate);
    video.removeEventListener("waiting", onWaiting);
    video.removeEventListener("playing", onPlaying);
    video.removeEventListener("pause", onPause);
    void cancelSession();
    teardownMedia();
  };

  const seek = async (seconds: number) => {
    if (closed) return;
    const target = Math.max(
      0,
      Math.min(seconds, fullDuration > 0 ? fullDuration - 0.5 : seconds),
    );
    if (sourceBuffer && playheadCovered(sourceBuffer, target)) {
      try {
        video.currentTime = target;
        userPaused = false;
        void video.play().catch(() => undefined);
        log(`remux · seek buffered · ${target.toFixed(1)}s`);
        reportBuffer();
        return;
      } catch {
        /* fall through to restart */
      }
    }
    log(`remux · seek restart · ${target.toFixed(1)}s`);
    userPaused = false;
    await startSession(target);
  };

  return {
    stop,
    seek,
    get objectUrl() {
      return objectUrl;
    },
  };
}
