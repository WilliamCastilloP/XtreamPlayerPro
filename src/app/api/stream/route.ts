import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
]);

const UPSTREAM_UA = "VLC/3.0.20 LibVLC/3.0.20";
const PLAYLIST_BUFFER_MS = Number(
  process.env.STREAM_PLAYLIST_BUFFER_MS || 10000,
);
const PLAYLIST_MAX_BYTES = 2 * 1024 * 1024;

function rewritePlaylist(body: string, playlistUrl: string): string {
  const base = new URL(playlistUrl);
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        if (trimmed.includes("URI=")) {
          return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
            try {
              const absolute = new URL(uri, base).toString();
              return `URI="/api/stream?url=${encodeURIComponent(absolute)}"`;
            } catch {
              return `URI="${uri}"`;
            }
          });
        }
        return line;
      }

      try {
        const absolute = new URL(trimmed, base).toString();
        return `/api/stream?url=${encodeURIComponent(absolute)}`;
      } catch {
        return line;
      }
    })
    .join("\n");
}

function isLargeProgressivePath(pathname: string) {
  return /\.(mp4|mkv|avi|mov|m4v)$/i.test(pathname);
}

function shouldBufferAsPlaylist(contentType: string, pathname: string) {
  if (isLargeProgressivePath(pathname) || pathname.endsWith(".ts")) {
    return false;
  }
  return (
    contentType.includes("mpegurl") ||
    contentType.includes("m3u8") ||
    contentType.startsWith("text/") ||
    pathname.endsWith(".m3u8") ||
    /\/live\/[^/]+\/[^/]+\/[^/.]+$/i.test(pathname)
  );
}

function looksLikeM3u8Chunk(buf: Uint8Array) {
  if (!buf || buf.length === 0) return false;
  if (buf[0] === 0x47) return false;
  const head = new TextDecoder()
    .decode(buf.subarray(0, Math.min(buf.length, 64)))
    .trimStart();
  return head.startsWith("#EXTM3U") || head.startsWith("#EXT");
}

function corsHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges",
  );
  headers.set("Cache-Control", "no-store");
  return headers;
}

function mediaHeaders(
  upstream: Response,
  contentType: string,
  finalPath: string,
): Headers {
  // Upstream CDN CORS must not override ours (common Live CORS failure).
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    if (lower.startsWith("access-control-")) return;
    headers.set(key, value);
  });
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges",
  );
  headers.set("Access-Control-Allow-Private-Network", "true");
  headers.set("Cache-Control", "no-store");
  if (!headers.has("Content-Type")) {
    if (finalPath.endsWith(".ts") || contentType.includes("mp2t")) {
      headers.set("Content-Type", "video/mp2t");
    } else if (isLargeProgressivePath(finalPath)) {
      headers.set("Content-Type", "video/mp4");
    } else {
      headers.set("Content-Type", contentType || "application/octet-stream");
    }
  }
  if ((headers.get("Content-Type") || "").includes("mp2t")) {
    headers.delete("Content-Length");
  }
  if (!headers.has("Accept-Ranges")) {
    headers.set("Accept-Ranges", "bytes");
  }
  return headers;
}

function streamFromReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  prefix: Uint8Array | null,
): ReadableStream<Uint8Array> {
  let sentPrefix = !prefix || prefix.length === 0;
  return new ReadableStream({
    async pull(controller) {
      if (!sentPrefix && prefix) {
        sentPrefix = true;
        controller.enqueue(prefix);
        return;
      }
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    cancel() {
      void reader.cancel();
    },
  });
}

async function bufferPlaylistBody(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  firstChunk: Uint8Array,
  timeoutMs: number,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [firstChunk];
  let total = firstChunk.length;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Playlist buffer timeout");
    const result = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Playlist buffer timeout")), remaining);
      }),
    ]);
    if (result.done) break;
    chunks.push(result.value);
    total += result.value.length;
    if (total >= PLAYLIST_MAX_BYTES) break;
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function proxy(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url");
  if (!target) {
    return Response.json({ error: "Missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return Response.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return Response.json({ error: "Unsupported protocol" }, { status: 400 });
  }

  const forwardHeaders: Record<string, string> = {
    "User-Agent": UPSTREAM_UA,
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
  };

  const likelyPlaylist =
    parsed.pathname.endsWith(".m3u8") ||
    /\/live\/[^/]+\/[^/]+\/[^/.]+$/i.test(parsed.pathname) ||
    /\/auth\//i.test(parsed.pathname);
  const range = request.headers.get("range");
  if (range && !likelyPlaylist) forwardHeaders.Range = range;

  forwardHeaders.Referer = `${parsed.origin}/`;
  forwardHeaders.Origin = parsed.origin;

  try {
    const upstream = await fetch(parsed.toString(), {
      cache: "no-store",
      headers: forwardHeaders,
      redirect: "follow",
    });

    if (!upstream.ok && upstream.status !== 206) {
      const detail = await upstream.text().catch(() => "");
      return Response.json(
        {
          error: `Upstream error ${upstream.status}`,
          detail: detail.slice(0, 240),
        },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }

    const contentType = upstream.headers.get("content-type") || "";
    const finalUrl = upstream.url || parsed.toString();
    const finalPath = new URL(finalUrl).pathname;

    if (request.method === "HEAD" || !upstream.body) {
      return new Response(null, {
        status: upstream.status,
        headers: mediaHeaders(upstream, contentType, finalPath),
      });
    }

    const reader = upstream.body.getReader();

    if (shouldBufferAsPlaylist(contentType, finalPath)) {
      const first = await reader.read();
      if (first.done || !first.value) {
        return new Response(null, {
          status: upstream.status,
          headers: mediaHeaders(upstream, contentType, finalPath),
        });
      }

      const firstBuf = first.value;
      if (looksLikeM3u8Chunk(firstBuf)) {
        try {
          const all = await bufferPlaylistBody(
            reader,
            firstBuf,
            PLAYLIST_BUFFER_MS,
          );
          const text = new TextDecoder().decode(all);
          if (text.includes("#EXTM3U")) {
            const rewritten = rewritePlaylist(text, finalUrl);
            return new Response(rewritten, {
              status: 200,
              headers: corsHeaders({
                "Content-Type": "application/vnd.apple.mpegurl",
              }),
            });
          }
          const headers = corsHeaders();
          headers.set("Content-Type", contentType || "application/octet-stream");
          return new Response(all, { status: upstream.status, headers });
        } catch {
          return new Response(streamFromReader(reader, firstBuf), {
            status: upstream.status,
            headers: mediaHeaders(
              upstream,
              contentType || "video/mp2t",
              finalPath,
            ),
          });
        }
      }

      return new Response(streamFromReader(reader, firstBuf), {
        status: upstream.status,
        headers: mediaHeaders(
          upstream,
          contentType || (firstBuf[0] === 0x47 ? "video/mp2t" : ""),
          finalPath,
        ),
      });
    }

    return new Response(streamFromReader(reader, null), {
      status: upstream.status,
      headers: mediaHeaders(upstream, contentType, finalPath),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Stream proxy failed";
    return Response.json({ error: message }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  return proxy(request);
}

export async function HEAD(request: NextRequest) {
  return proxy(request);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers":
        "Range, Content-Type, Accept, If-None-Match, If-Modified-Since",
      "Access-Control-Allow-Private-Network": "true",
      "Access-Control-Max-Age": "86400",
    },
  });
}
