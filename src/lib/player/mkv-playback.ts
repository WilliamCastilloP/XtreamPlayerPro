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

function appendChunk(
  sourceBuffer: SourceBuffer,
  chunk: Uint8Array,
  video: HTMLVideoElement,
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
        const isQuota =
          err instanceof DOMException && err.name === "QuotaExceededError";
        if (isQuota && quotaRetries < 8) {
          quotaRetries += 1;
          // Free as much played buffer as possible, then retry the same append.
          void evictBehind(sourceBuffer, video, 4).then(() => {
            window.setTimeout(run, 300);
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

  // Only keep a small window buffered ahead of the playhead. iOS MSE quotas are
  // tiny, so appending a whole multi-GB movie instantly throws QuotaExceeded.
  // We append ~MAX_AHEAD seconds, then wait for playback to advance (which lets
  // us evict what has already played and pull more from the remuxer).
  const MAX_AHEAD = 16;
  const EVICT_BEHIND = 6;

  // Bound the in-memory queue so Mediabunny doesn't race ahead of MSE.
  const HIGH_WATER = 12;
  const LOW_WATER = 4;
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
      return Math.max(0, b.end(b.length - 1) - (video.currentTime || 0));
    } catch {
      return 0;
    }
  };

  // ManagedMediaSource tells us when to (dis)continue feeding via these events.
  let streaming = true;
  if (managed) {
    const ms = mediaSource as unknown as EventTarget;
    ms.addEventListener("startstreaming", () => {
      streaming = true;
      void pump();
    });
    ms.addEventListener("endstreaming", () => {
      streaming = false;
    });
  }

  const pump = async () => {
    if (pumping || closed || appendError) return;
    pumping = true;
    try {
      while (
        queue.length &&
        !closed &&
        !appendError &&
        sourceBuffer &&
        streaming &&
        bufferedAhead() < MAX_AHEAD
      ) {
        const chunk = queue.shift();
        if (!chunk) continue;
        await appendChunk(sourceBuffer, chunk, video);
        sawData = true;
        if (queue.length <= LOW_WATER) releaseDrain();
      }
    } catch (err) {
      appendError = err instanceof Error ? err : new Error(String(err));
      log(`remux · append failed · ${appendError.message}`);
      releaseDrain();
    } finally {
      pumping = false;
    }
    // If we paused because the window is full, keep the queue bounded — the
    // timeupdate/interval drivers resume us as playback drains the buffer.
    if (!closed && queue.length <= LOW_WATER) releaseDrain();
  };

  const writable = new WritableStream<Uint8Array>({
    async write(chunk) {
      if (closed) return;
      queue.push(chunk);
      void pump();
      if (queue.length >= HIGH_WATER && !closed && !appendError) {
        await waitForDrain();
      }
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

  log(
    `remux · converting · tracks=${conversion.utilizedTracks.length} discarded=${conversion.discardedTracks.length}`,
  );

  let conversionError: Error | null = null;
  const conversionPromise = conversion.execute().catch((err: unknown) => {
    conversionError = err instanceof Error ? err : new Error(String(err));
    log(`remux · conversion error · ${conversionError.message}`);
  });

  // As playback advances: drop already-played buffer and pull more data. This
  // keeps the SourceBuffer inside its quota for the whole movie.
  const onTimeUpdate = () => {
    if (closed || !sourceBuffer) return;
    void evictBehind(sourceBuffer, video, EVICT_BEHIND);
    void pump();
  };
  video.addEventListener("timeupdate", onTimeUpdate);
  const pumpTimer = window.setInterval(() => {
    if (!closed) void pump();
  }, 1000);

  const stop = () => {
    closed = true;
    releaseDrain();
    window.clearInterval(pumpTimer);
    video.removeEventListener("timeupdate", onTimeUpdate);
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
      log(`remux · play() · ${err instanceof Error ? err.message : String(err)}`);
      video.addEventListener(
        "canplay",
        () => {
          if (!closed) void video.play().catch(() => undefined);
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
