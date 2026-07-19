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

function waitForSourceOpen(mediaSource: MediaSource): Promise<void> {
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

function appendChunk(
  sourceBuffer: SourceBuffer,
  chunk: Uint8Array,
): Promise<void> {
  return new Promise((resolve, reject) => {
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
 * Remux MKV/AVI into fragmented MP4 via Mediabunny and play with MSE.
 * Prefer a same-origin `/api/stream?url=...` source so Range requests work
 * without panel CORS (chunks stay small — full-file proxy often 502s).
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
  log("remux · opening source");

  if (typeof MediaSource === "undefined") {
    throw new Error("MediaSource not supported in this browser");
  }

  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  video.src = objectUrl;
  await waitForSourceOpen(mediaSource);

  let sourceBuffer: SourceBuffer | null = null;
  const mimeCandidates = [
    'video/mp4; codecs="avc1.640028, mp4a.40.2"',
    'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
    'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
    "video/mp4",
  ];
  for (const mime of mimeCandidates) {
    if (MediaSource.isTypeSupported(mime)) {
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

  const pump = async () => {
    if (pumping || closed) return;
    pumping = true;
    try {
      while (queue.length && !closed && sourceBuffer) {
        const chunk = queue.shift();
        if (!chunk) continue;
        await appendChunk(sourceBuffer, chunk);
        sawData = true;
      }
    } catch (err) {
      appendError = err instanceof Error ? err : new Error(String(err));
      log(`remux · append failed · ${appendError.message}`);
    } finally {
      pumping = false;
    }
  };

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      if (closed) return;
      queue.push(chunk);
      void pump();
    },
  });

  const input = new Input({
    source: new UrlSource(sourceUrl, {
      maxCacheSize: 32 * 1024 * 1024,
      parallelism: 2,
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
    await input.dispose();
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

  const stop = () => {
    closed = true;
    void conversion.cancel().catch(() => undefined);
    void Promise.resolve(input.dispose()).catch(() => undefined);
    try {
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
    if (Date.now() - started > 20000) {
      stop();
      throw new Error("Timed out waiting for remuxed media");
    }
    await new Promise((r) => window.setTimeout(r, 200));
  }

  if (appendError || conversionError) {
    stop();
    throw appendError || conversionError || new Error("Remux failed");
  }

  try {
    await video.play();
    log("remux · playing");
  } catch (err) {
    log(`remux · play() · ${err instanceof Error ? err.message : String(err)}`);
  }

  void conversionPromise.finally(async () => {
    try {
      while (queue.length && !appendError && !closed) {
        await pump();
        await new Promise((r) => window.setTimeout(r, 40));
      }
      if (
        !closed &&
        mediaSource.readyState === "open" &&
        sourceBuffer &&
        !sourceBuffer.updating
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
