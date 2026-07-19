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
  // Prefer the standard MediaSource where it exists (better tested), and fall
  // back to ManagedMediaSource on iPhone Safari.
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

/**
 * Free already-played buffer so a long movie doesn't blow the MSE quota.
 * Keeps a small window behind the current playhead.
 */
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
    /* ignore eviction failures */
  }
}

function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "QuotaExceededError";
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
          // Free played buffer and wait for the playhead to advance before retry.
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
  objectUrl: string;
};

/**
 * Remux MKV/AVI/MOV into fragmented MP4 via Mediabunny and play with MSE.
 *
 * Prefer a same-origin `/api/stream?url=...` source so Range requests work
 * without panel CORS (chunks stay small — full-file proxy often 502s).
 *
 * Uses `ManagedMediaSource` on iPhone Safari (iOS 17+) where the classic
 * `MediaSource` is unavailable.
 */
export async function startRemuxedPlayback(
  video: HTMLVideoElement,
  sourceUrl: string,
  opts?: {
    onProgress?: (progress: number) => void;
    onLog?: (message: string) => void;
    /** Called when the browser blocked autoplay and a user tap is required. */
    onAutoplayBlocked?: () => void;
  },
): Promise<RemuxHandle> {
  const log = opts?.onLog || (() => undefined);

  const found = getMediaSourceCtor();
  if (!found) {
    throw new Error("This browser can't play this format (no Media Source)");
  }
  const { ctor: MediaSourceImpl, managed } = found;
  log(`remux · opening source · ${managed ? "ManagedMediaSource" : "MediaSource"}`);

  const mediaSource = new MediaSourceImpl();
  const objectUrl = URL.createObjectURL(mediaSource);

  // Clean any previous sources first.
  video.removeAttribute("src");
  while (video.firstChild) video.removeChild(video.firstChild);

  let sourceEl: HTMLSourceElement | null = null;
  if (managed) {
    // ManagedMediaSource must not offer AirPlay of an MSE stream, and Safari
    // expects attachment via a <source> child element.
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

  let sourceBuffer: SourceBuffer | null = null;
  const mimeCandidates = [
    'video/mp4; codecs="avc1.640028, mp4a.40.2"',
    'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
    'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
    "video/mp4",
  ];
  for (const mime of mimeCandidates) {
    if (MediaSourceImpl.isTypeSupported(mime)) {
      sourceBuffer = mediaSource.addSourceBuffer(mime);
      sourceBuffer.mode = "segments";
      log(`remux · SourceBuffer ${mime}`);
      break;
    }
  }
  if (!sourceBuffer) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("No supported fMP4 SourceBuffer type");
  }

  const queue: Uint8Array[] = [];
  let pumping = false;
  let closed = false;
  let appendError: Error | null = null;
  let sawData = false;

  // Sliding window: keep ~MAX_AHEAD buffered ahead, never let it drop below
  // MIN_AHEAD (otherwise iPhone stalls and needs play/pause to recover).
  const MAX_AHEAD = 20;
  const MIN_AHEAD = 8;
  const EVICT_BEHIND = 8;

  // Bound the in-memory queue so Mediabunny doesn't race ahead of MSE.
  const HIGH_WATER = 10;
  const LOW_WATER = 3;
  let drainResolve: (() => void) | null = null;
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
      // Prefer the range that contains the playhead (gaps from UA eviction).
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
  };

  // ManagedMediaSource hints when to fetch. Treat them as soft: if the buffer
  // is about to underrun we MUST keep appending, otherwise playback freezes
  // after a few seconds and only a play/pause tap "unsticks" it.
  let preferPause = false;
  if (managed) {
    const ms = mediaSource as unknown as EventTarget;
    ms.addEventListener("startstreaming", () => {
      preferPause = false;
      log("remux · startstreaming");
      void pump();
    });
    ms.addEventListener("endstreaming", () => {
      preferPause = true;
      log("remux · endstreaming");
    });
  }

  const wantsMore = (): boolean => {
    const ahead = bufferedAhead();
    if (ahead < MIN_AHEAD) return true; // never starve
    if (preferPause) return false;
    return ahead < MAX_AHEAD;
  };

  const pump = async () => {
    if (pumping || closed || appendError) return;
    pumping = true;
    try {
      while (queue.length && !closed && !appendError && sourceBuffer && wantsMore()) {
        const chunk = queue.shift();
        if (!chunk) continue;
        await appendChunk(sourceBuffer, chunk, video, {
          onQuota: () => {
            log("remux · quota · evicting + retry");
          },
        });
        sawData = true;
        if (queue.length <= LOW_WATER) releaseDrain();
      }
    } catch (err) {
      // Soft-fail quota/transient append errors: pause feeding, don't kill remux.
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
      pumping = false;
    }
    // Unblock the remuxer only when the queue has room. Do NOT release just
    // because the MSE window is full — that would busy-spin write()/pump().
    if (!closed && queue.length < HIGH_WATER) {
      releaseDrain();
    }
  };

  const writable = new WritableStream<Uint8Array>({
    async write(chunk) {
      if (closed) return;
      // If the window is full, wait BEFORE growing the queue further.
      while (queue.length >= HIGH_WATER && !closed && !appendError) {
        // Ensure pump is awake; it will releaseDrain when space opens.
        void pump();
        await waitForDrain();
      }
      if (closed) return;
      queue.push(chunk);
      void pump();
    },
  });

  const input = new Input({
    source: new UrlSource(sourceUrl, {
      maxCacheSize: 32 * 1024 * 1024,
    }),
    formats: ALL_FORMATS,
  });

  const output = new Output({
    format: new Mp4OutputFormat({
      fastStart: "fragmented",
      minimumFragmentDuration: 1.5,
    }),
    target: new AppendOnlyStreamTarget(writable),
  });

  const conversion = await Conversion.init({ input, output });
  if (!conversion.isValid) {
    const reasons = conversion.discardedTracks
      .map((t) => `${t.track.codec ?? "?"} (${t.reason})`)
      .join(", ");
    void Promise.resolve(input.dispose()).catch(() => undefined);
    URL.revokeObjectURL(objectUrl);
    throw new Error(
      reasons
        ? `Cannot remux this file: ${reasons}`
        : "Cannot remux this file for browser playback",
    );
  }

  conversion.onProgress = (progress) => {
    opts?.onProgress?.(progress);
  };

  // Publish the real movie length so the timeline shows the true duration
  // instead of only the small buffered window (~16s). Cheap metadata read.
  void input
    .getDurationFromMetadata()
    .then((dur) => {
      if (!dur || !Number.isFinite(dur) || dur <= 0 || closed) return;
      const applyDuration = () => {
        try {
          if (mediaSource.readyState !== "open") return;
          if (sourceBuffer && sourceBuffer.updating) {
            sourceBuffer.addEventListener("updateend", applyDuration, {
              once: true,
            });
            return;
          }
          mediaSource.duration = dur;
          log(`remux · duration=${Math.round(dur)}s`);
        } catch {
          /* ignore — timeline just stays approximate */
        }
      };
      applyDuration();
    })
    .catch(() => undefined);

  log(
    `remux · converting · tracks=${conversion.utilizedTracks.length} discarded=${conversion.discardedTracks.length}`,
  );

  let conversionError: Error | null = null;
  const conversionPromise = conversion.execute().catch((err: unknown) => {
    conversionError = err instanceof Error ? err : new Error(String(err));
    log(`remux · conversion error · ${conversionError.message}`);
  });

  // As playback advances: drop already-played buffer and pull more data.
  const onTimeUpdate = () => {
    if (closed || !sourceBuffer) return;
    void evictBehind(sourceBuffer, video, EVICT_BEHIND);
    void pump();
  };
  // When the element underruns, force a refill and resume — this is the stall
  // the user was seeing around ~5s (buffer empty + remux paused).
  const onWaiting = () => {
    if (closed) return;
    preferPause = false;
    log(`remux · waiting · ahead=${bufferedAhead().toFixed(1)}s queue=${queue.length}`);
    if (sourceBuffer) void evictBehind(sourceBuffer, video, 2);
    void pump();
    void video.play().catch(() => undefined);
  };
  const onPlaying = () => {
    if (!closed) void pump();
  };
  video.addEventListener("timeupdate", onTimeUpdate);
  video.addEventListener("waiting", onWaiting);
  video.addEventListener("playing", onPlaying);
  const pumpTimer = window.setInterval(() => {
    if (closed) return;
    // Poll faster when the buffer is thin so we never underrun.
    if (bufferedAhead() < MIN_AHEAD) preferPause = false;
    void pump();
    // Heal lost wakeups: if the remuxer is waiting on drain and the queue
    // already has room, release it.
    if (queue.length < HIGH_WATER) releaseDrain();
  }, 400);

  const stop = () => {
    closed = true;
    releaseDrain();
    window.clearInterval(pumpTimer);
    video.removeEventListener("timeupdate", onTimeUpdate);
    video.removeEventListener("waiting", onWaiting);
    video.removeEventListener("playing", onPlaying);
    void conversion.cancel().catch(() => undefined);
    void Promise.resolve(input.dispose()).catch(() => undefined);
    try {
      if (sourceEl && sourceEl.parentNode) sourceEl.parentNode.removeChild(sourceEl);
      if (video.src === objectUrl) {
        video.removeAttribute("src");
        video.load();
      }
      URL.revokeObjectURL(objectUrl);
    } catch {
      /* ignore */
    }
  };

  // Wait until we have buffered media or fail
  const started = Date.now();
  while (!closed && !sawData && !appendError && !conversionError) {
    if (Date.now() - started > 25000) {
      stop();
      throw new Error("Timed out waiting for remuxed media");
    }
    await new Promise((r) => window.setTimeout(r, 200));
  }

  if (appendError || conversionError) {
    stop();
    throw appendError || conversionError || new Error("Remux failed");
  }

  // Start playback so currentTime advances (required for the sliding window to
  // drain and evict). Retry once media is actually ready if the first call is
  // rejected/aborted.
  const attemptPlay = async () => {
    try {
      await video.play();
      log("remux · playing");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      log(`remux · play() · ${err instanceof Error ? err.message : String(err)}`);
      // Autoplay-with-sound is blocked without a user gesture (typical on iOS
      // after navigating from the detail page). Ask the UI to show a tap-to-play
      // button so the user can start it (and we enter fullscreen on that tap).
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
  await attemptPlay();

  void conversionPromise.finally(async () => {
    // Drain whatever is left once the remux finishes, respecting the window.
    try {
      while (queue.length && !appendError && !closed) {
        await pump();
        await new Promise((r) => window.setTimeout(r, 60));
      }
      if (
        !closed &&
        !appendError &&
        mediaSource.readyState === "open" &&
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
    void Promise.resolve(input.dispose()).catch(() => undefined);
  });

  return { stop, objectUrl };
}
