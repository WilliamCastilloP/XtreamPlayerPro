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
  opts?: { onQuota?: () => void },
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
        reject(new Error("SourceBuffer append error"));
      };
      sourceBuffer.addEventListener("updateend", onEnd, { once: true });
      sourceBuffer.addEventListener("error", onError, { once: true });
      try {
        const copy = new Uint8Array(chunk.byteLength);
        copy.set(chunk);
        sourceBuffer.appendBuffer(copy.buffer);
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

type RemuxOpts = {
  onProgress?: (progress: number) => void;
  onLog?: (message: string) => void;
  onAutoplayBlocked?: () => void;
  /** Fired when full media duration is known (seconds). */
  onDuration?: (seconds: number) => void;
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

  const MAX_AHEAD = 24;
  /** If ahead drops below this while playing, treat as underrun. */
  const STARVE_SECONDS = 1;
  const EVICT_BEHIND = 10;
  const HIGH_WATER = 10;
  const LOW_WATER = 3;

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

  const wantsMore = (): boolean => bufferedAhead() < MAX_AHEAD;

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
        });
        if (gen !== sessionGen) return;
        sawData = true;
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
    try {
      await video.play();
      log("remux · playing");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      log(`remux · play() · ${err instanceof Error ? err.message : String(err)}`);
      if (name === "NotAllowedError") {
        opts?.onAutoplayBlocked?.();
      }
      video.addEventListener(
        "canplay",
        () => {
          if (closed) return;
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

    const mimeCandidates = [
      'video/mp4; codecs="avc1.640028, mp4a.40.2"',
      'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
      'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
      "video/mp4",
    ];
    sourceBuffer = null;
    for (const mime of mimeCandidates) {
      if (MediaSourceImpl.isTypeSupported(mime)) {
        sourceBuffer = mediaSource.addSourceBuffer(mime);
        sourceBuffer.mode = "segments";
        // Map remuxed timestamps (start at 0 after trim) onto the real timeline.
        try {
          sourceBuffer.timestampOffset = baseTime;
        } catch {
          /* ignore */
        }
        log(`remux · SourceBuffer ${mime} · offset=${baseTime.toFixed(1)}`);
        break;
      }
    }
    if (!sourceBuffer) {
      throw new Error("No supported fMP4 SourceBuffer type");
    }

    queue = [];
    pumping = false;
    appendError = null;
    sawData = false;

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
        maxCacheSize: 32 * 1024 * 1024,
      }),
      formats: ALL_FORMATS,
    });

    const output = new Output({
      format: new Mp4OutputFormat({
        fastStart: "fragmented",
        minimumFragmentDuration: 1.2,
      }),
      target: new AppendOnlyStreamTarget(writable),
    });

    conversion = await Conversion.init({
      input,
      output,
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

    // Wait for first buffered media
    const started = Date.now();
    while (!closed && gen === sessionGen && !sawData && !appendError) {
      if (Date.now() - started > 25000) {
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

  // Keep buffer filled; if the playhead falls into a gap (common on iOS after
  // ManagedMediaSource silently evicts), restart from currentTime.
  let recovering = false;
  const onTimeUpdate = () => {
    if (closed || !sourceBuffer || seeking) return;
    void evictBehind(sourceBuffer, video, EVICT_BEHIND);
    void pump();
  };
  const recoverFromUnderrun = async (reason: string) => {
    if (closed || seeking || recovering) return;
    const t = video.currentTime || baseTime;
    if (sourceBuffer && playheadCovered(sourceBuffer, t) && bufferedAhead() >= 1) {
      void pump();
      void video.play().catch(() => undefined);
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
  const onWaiting = () => {
    if (closed || seeking) return;
    log(`remux · waiting · ahead=${bufferedAhead().toFixed(1)}s queue=${queue.length}`);
    void pump();
    window.setTimeout(() => {
      if (!closed && !seeking && bufferedAhead() < STARVE_SECONDS) {
        void recoverFromUnderrun("waiting");
      }
    }, 900);
  };
  const onPlaying = () => {
    if (!closed) void pump();
  };

  video.addEventListener("timeupdate", onTimeUpdate);
  video.addEventListener("waiting", onWaiting);
  video.addEventListener("playing", onPlaying);

  const pumpTimer = window.setInterval(() => {
    if (closed || seeking) return;
    void pump();
    if (queue.length < HIGH_WATER) releaseDrain();
    // If we have been starved for a bit while supposedly playing, recover.
    if (
      !video.paused &&
      bufferedAhead() < STARVE_SECONDS &&
      sourceBuffer &&
      !playheadCovered(sourceBuffer, video.currentTime || 0)
    ) {
      void recoverFromUnderrun("gap");
    }
  }, 400);

  // Ignore ManagedMediaSource endstreaming for remux — our MAX_AHEAD window
  // already caps memory. Obeying endstreaming was starving series episodes.

  await startSession(0);

  const stop = () => {
    closed = true;
    releaseDrain();
    window.clearInterval(pumpTimer);
    video.removeEventListener("timeupdate", onTimeUpdate);
    video.removeEventListener("waiting", onWaiting);
    video.removeEventListener("playing", onPlaying);
    void cancelSession();
    teardownMedia();
  };

  const seek = async (seconds: number) => {
    if (closed) return;
    const target = Math.max(
      0,
      Math.min(seconds, fullDuration > 0 ? fullDuration - 0.5 : seconds),
    );
    // If the target is already buffered, just jump the playhead (cheap).
    if (sourceBuffer && playheadCovered(sourceBuffer, target)) {
      try {
        video.currentTime = target;
        void video.play().catch(() => undefined);
        log(`remux · seek buffered · ${target.toFixed(1)}s`);
        return;
      } catch {
        /* fall through to restart */
      }
    }
    log(`remux · seek restart · ${target.toFixed(1)}s`);
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
