#!/usr/bin/env node
/**
 * Standalone stream proxy for XTREAM.
 *
 * Run this on a VPS / home PC (not Vercel) so heavy video traffic does not
 * count against Vercel's 10 GB/month Fast Origin Transfer limit.
 *
 * Usage:
 *   node scripts/stream-proxy.mjs
 *   STREAM_PROXY_PORT=8080 node scripts/stream-proxy.mjs
 *
 * Then set in Vercel (and redeploy the app):
 *   NEXT_PUBLIC_STREAM_PROXY_BASE=https://your-proxy.example.com
 *
 * Put HTTPS in front with Caddy, nginx, or Cloudflare Tunnel.
 */

import http from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.STREAM_PROXY_PORT || process.env.PORT || 8080);
const UPSTREAM_UA = "VLC/3.0.20 LibVLC/3.0.20";

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

function rewritePlaylist(body, playlistUrl) {
  const base = new URL(playlistUrl);
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        if (trimmed.includes("URI=")) {
          return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
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

function isLargeProgressivePath(pathname) {
  return /\.(mp4|mkv|avi|mov|m4v)$/i.test(pathname);
}

function shouldBufferAsPlaylist(contentType, pathname) {
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

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers":
      "Content-Length, Content-Range, Accept-Ranges",
    "Cache-Control": "no-store",
    ...extra,
  };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...corsHeaders({ "Content-Type": "application/json" }),
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function handleStream(req, res, target) {
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    sendJson(res, 400, { error: "Invalid url" });
    return;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    sendJson(res, 400, { error: "Unsupported protocol" });
    return;
  }

  const forwardHeaders = {
    "User-Agent": UPSTREAM_UA,
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: `${parsed.origin}/`,
    Origin: parsed.origin,
  };
  const range = req.headers.range;
  if (range) forwardHeaders.Range = range;

  let upstream;
  try {
    upstream = await fetch(parsed.toString(), {
      method: req.method === "HEAD" ? "HEAD" : "GET",
      headers: forwardHeaders,
      redirect: "follow",
    });
  } catch (error) {
    sendJson(res, 502, {
      error: error instanceof Error ? error.message : "Stream proxy failed",
    });
    return;
  }

  if (!upstream.ok && upstream.status !== 206) {
    const detail = await upstream.text().catch(() => "");
    sendJson(res, upstream.status === 404 ? 404 : 502, {
      error: `Upstream error ${upstream.status}`,
      detail: detail.slice(0, 240),
    });
    return;
  }

  const contentType = upstream.headers.get("content-type") || "";
  const finalUrl = upstream.url || parsed.toString();
  const finalPath = new URL(finalUrl).pathname;

  if (req.method !== "HEAD" && shouldBufferAsPlaylist(contentType, finalPath)) {
    const text = await upstream.text();
    if (text.includes("#EXTM3U")) {
      const rewritten = rewritePlaylist(text, finalUrl);
      const headers = corsHeaders({
        "Content-Type": "application/vnd.apple.mpegurl",
      });
      res.writeHead(200, headers);
      res.end(rewritten);
      return;
    }
    const headers = corsHeaders({
      "Content-Type": contentType || "application/octet-stream",
    });
    res.writeHead(upstream.status, headers);
    res.end(text);
    return;
  }

  const headers = corsHeaders();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers[key] = value;
    }
  });
  if (!headers["Content-Type"] && !headers["content-type"]) {
    if (finalPath.endsWith(".ts")) headers["Content-Type"] = "video/mp2t";
    else if (isLargeProgressivePath(finalPath)) {
      headers["Content-Type"] = "video/mp4";
    } else {
      headers["Content-Type"] = contentType || "application/octet-stream";
    }
  }
  if (!headers["Accept-Ranges"] && !headers["accept-ranges"]) {
    headers["Accept-Ranges"] = "bytes";
  }

  res.writeHead(upstream.status, headers);
  if (req.method === "HEAD" || !upstream.body) {
    res.end();
    return;
  }

  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(value)) {
        await new Promise((resolve) => res.once("drain", resolve));
      }
    }
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      sendJson(res, 502, {
        error: error instanceof Error ? error.message : "Stream proxy failed",
      });
    } else {
      res.destroy();
    }
  }
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || `localhost:${PORT}`;
  const url = new URL(req.url || "/", `http://${host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }

  if (url.pathname === "/health" || url.pathname === "/") {
    sendJson(res, 200, {
      ok: true,
      service: "xtream-stream-proxy",
      path: "/api/stream?url=...",
    });
    return;
  }

  if (url.pathname !== "/api/stream") {
    sendJson(res, 404, { error: "Not found. Use /api/stream?url=..." });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const target = url.searchParams.get("url");
  if (!target) {
    sendJson(res, 400, { error: "Missing url" });
    return;
  }

  await handleStream(req, res, target);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[xtream-stream-proxy] listening on http://0.0.0.0:${PORT}`);
  console.log(`[xtream-stream-proxy] health:  GET /health`);
  console.log(`[xtream-stream-proxy] stream:  GET /api/stream?url=<upstream>`);
  console.log(
    `[xtream-stream-proxy] set NEXT_PUBLIC_STREAM_PROXY_BASE to this host (https) in Vercel`,
  );
});
