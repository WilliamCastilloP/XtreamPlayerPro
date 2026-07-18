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

const UPSTREAM_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

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

  // Never buffer multi‑GB VOD through the Next server — send the client straight
  // to the panel. Native <video> can play cross-origin progressive media.
  if (isLargeProgressivePath(parsed.pathname)) {
    return Response.redirect(parsed.toString(), 302);
  }

  const forwardHeaders: Record<string, string> = {
    "User-Agent": UPSTREAM_UA,
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
  };

  const range = request.headers.get("range");
  if (range) forwardHeaders.Range = range;
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

    // If upstream redirected a "live m3u8" request to a giant progressive file,
    // bounce the client there instead of piping bytes through us.
    if (isLargeProgressivePath(finalPath)) {
      return Response.redirect(finalUrl, 302);
    }

    if (shouldBufferAsPlaylist(contentType, finalPath)) {
      const text = await upstream.text();
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
      return new Response(text, { status: upstream.status, headers });
    }

    const headers = corsHeaders();
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase())) {
        headers.set(key, value);
      }
    });
    if (!headers.has("Content-Type")) {
      if (finalPath.endsWith(".ts")) headers.set("Content-Type", "video/mp2t");
      else headers.set("Content-Type", contentType || "application/octet-stream");
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
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
      "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
    },
  });
}
