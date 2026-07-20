#!/usr/bin/env node
/**
 * Standalone media proxy for XTREAM.
 *
 * - GET /api/stream?url=...  → byte-proxy (Range, HLS rewrite)
 * - GET /api/hls?url=...     → MKV/AVI/MOV → HLS via ffmpeg (Netflix-like)
 * - GET /api/hls/session/:id/:file → HLS segments / playlist
 * - GET /health
 *
 * Usage:
 *   node scripts/stream-proxy.mjs
 *   STREAM_PROXY_PORT=8080 node scripts/stream-proxy.mjs
 *
 * Bundled ffmpeg-static is used automatically (npm install).
 * Optional override: FFMPEG_PATH=/path/to/ffmpeg
 *
 * Then set (local .env.local or Vercel) and restart/redeploy:
 *   NEXT_PUBLIC_STREAM_PROXY_BASE=http://127.0.0.1:8080
 *   # or https://your-oracle-proxy.example.com
 */

import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { URL } from "node:url";

const require = createRequire(import.meta.url);

/**
 * Prefer bundled ffmpeg-static so Windows/Oracle work without a system install.
 */
function resolveFfmpegBin() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }

  try {
    const bundled = require("ffmpeg-static");
    if (typeof bundled === "string" && bundled && fs.existsSync(bundled)) {
      return bundled;
    }
  } catch {
    // optional dependency missing
  }

  // Resolve from repo root when script is started via npm run proxy
  try {
    const fromRoot = require.resolve("ffmpeg-static");
    const pkgDir = path.dirname(fromRoot);
    const guessed = path.join(
      pkgDir,
      process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
    );
    if (fs.existsSync(guessed)) return guessed;
  } catch {
    /* ignore */
  }

  const candidates = ["ffmpeg"];
  if (process.platform === "win32") {
    candidates.push(
      "C:\\ffmpeg\\bin\\ffmpeg.exe",
      "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
      path.join(
        process.env.LOCALAPPDATA || "",
        "Microsoft",
        "WinGet",
        "Links",
        "ffmpeg.exe",
      ),
    );
  }
  for (const bin of candidates) {
    if (!bin || bin.endsWith(path.sep)) continue;
    try {
      execFileSync(bin, ["-version"], { stdio: "ignore" });
      return bin;
    } catch {
      /* try next */
    }
  }
  return null;
}

const FFMPEG_BIN = resolveFfmpegBin();
const FFMPEG_OK = Boolean(FFMPEG_BIN);

const PORT = Number(process.env.STREAM_PROXY_PORT || process.env.PORT || 8080);
const UPSTREAM_UA = "VLC/3.0.20 LibVLC/3.0.20";
const HLS_ROOT = path.join(
  process.env.STREAM_HLS_DIR || os.tmpdir(),
  "xtream-hls",
);
const SESSION_TTL_MS = Number(process.env.STREAM_HLS_TTL_MS || 45 * 60 * 1000);
const READY_TIMEOUT_MS = Number(process.env.STREAM_HLS_READY_MS || 90000);

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

/** @type {Map<string, HlsSession>} */
const sessions = new Map();

/**
 * @typedef {{
 *   id: string,
 *   sourceUrl: string,
 *   dir: string,
 *   proc: import('node:child_process').ChildProcess | null,
 *   startedAt: number,
 *   lastAccess: number,
 *   ready: boolean,
 *   error: string | null,
 *   durationSec: number | null,
 *   startSec: number,
 * }} HlsSession
 */

function sessionIdFor(url, startSec = 0) {
  const key = `${url}|${Math.max(0, Math.floor(startSec))}`;
  return createHash("sha1").update(key).digest("hex").slice(0, 16);
}

function rewriteUpstreamPlaylist(body, playlistUrl) {
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

function rewriteLocalHlsPlaylist(body, sessionId, durationSec) {
  const lines = body.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const file = path.basename(trimmed.split("?")[0] || trimmed);
    return `/api/hls/session/${sessionId}/${file}`;
  });
  if (durationSec && durationSec > 0 && !body.includes("#XTREAM-DURATION:")) {
    // Inject after #EXTM3U so the player can show the real runtime while the
    // event playlist is still growing (only a few minutes of segments yet).
    const idx = lines.findIndex((l) => l.trim() === "#EXTM3U");
    const tag = `#XTREAM-DURATION:${Math.round(durationSec)}`;
    if (idx >= 0) lines.splice(idx + 1, 0, tag);
    else lines.unshift("#EXTM3U", tag);
  }
  return lines.join("\n");
}

function isLargeProgressivePath(pathname) {
  return /\.(mp4|mkv|avi|mov|m4v)$/i.test(pathname);
}

function needsServerHls(pathname) {
  return /\.(mkv|avi|mov|m4v)$/i.test(pathname);
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
      const rewritten = rewriteUpstreamPlaylist(text, finalUrl);
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

async function ensureHlsDir() {
  await fsp.mkdir(HLS_ROOT, { recursive: true });
}

/**
 * Read container duration via ffmpeg banner (fast; stops after headers).
 * @param {string} mediaUrl
 * @returns {Promise<number|null>}
 */
function probeDurationSeconds(mediaUrl) {
  return new Promise((resolve) => {
    if (!FFMPEG_BIN) {
      resolve(null);
      return;
    }
    const proc = spawn(
      FFMPEG_BIN,
      [
        "-hide_banner",
        "-user_agent",
        UPSTREAM_UA,
        "-i",
        mediaUrl,
        "-f",
        "null",
        "-t",
        "0",
        "-",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let err = "";
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, 20000);
    proc.stderr?.on("data", (c) => {
      err += String(c);
      if (err.length > 8000) err = err.slice(-8000);
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (m) {
        clearTimeout(timer);
        try {
          proc.kill("SIGKILL");
        } catch {
          /* ignore */
        }
        const sec =
          Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
        resolve(sec > 1 ? sec : null);
      }
    });
    proc.on("close", () => {
      clearTimeout(timer);
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (m) {
        const sec =
          Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
        resolve(sec > 1 ? sec : null);
        return;
      }
      resolve(null);
    });
  });
}

/**
 * @param {string} sourceUrl
 * @param {number} [startSec]
 * @returns {Promise<HlsSession>}
 */
async function getOrStartSession(sourceUrl, startSec = 0) {
  const start = Math.max(0, Math.floor(startSec || 0));
  const id = sessionIdFor(sourceUrl, start);
  const existing = sessions.get(id);
  if (existing && !existing.error) {
    existing.lastAccess = Date.now();
    return existing;
  }
  if (existing) {
    await destroySession(existing);
  }

  await ensureHlsDir();
  const dir = path.join(HLS_ROOT, id);
  await fsp.rm(dir, { recursive: true, force: true });
  await fsp.mkdir(dir, { recursive: true });

  const localProxy = `http://127.0.0.1:${PORT}/api/stream?url=${encodeURIComponent(sourceUrl)}`;

  /** @type {HlsSession} */
  const session = {
    id,
    sourceUrl,
    dir,
    proc: null,
    startedAt: Date.now(),
    lastAccess: Date.now(),
    ready: false,
    error: null,
    durationSec: null,
    startSec: start,
  };
  sessions.set(id, session);

  // Probe full file duration from the beginning (ignore start offset).
  void probeDurationSeconds(localProxy).then((sec) => {
    if (sec && sessions.get(id) === session) {
      session.durationSec = sec;
      console.log(`[hls] duration ${id} = ${Math.round(sec)}s`);
    }
  });

  const playlist = path.join(dir, "index.m3u8");
  const segmentPattern = path.join(dir, "seg_%05d.ts");

  const args = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-nostdin",
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "5",
    "-user_agent",
    UPSTREAM_UA,
  ];
  // Fast input seek for copy mode (keyframe-accurate enough for VOD scrubbing).
  if (start > 0) {
    args.push("-ss", String(start));
  }
  args.push(
    "-i",
    localProxy,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-ac",
    "2",
    "-b:a",
    "128k",
    "-f",
    "hls",
    "-hls_time",
    "3",
    "-hls_playlist_type",
    "event",
    "-hls_flags",
    "independent_segments+append_list",
    "-hls_segment_filename",
    segmentPattern,
    playlist,
  );

  console.log(
    `[hls] start ${id} ← from=${start}s · ${sourceUrl.slice(0, 72)}…`,
  );
  const proc = spawn(FFMPEG_BIN || "ffmpeg", args, {
    stdio: ["ignore", "ignore", "pipe"],
    env: {
      ...process.env,
    },
  });
  session.proc = proc;

  let stderrBuf = "";
  proc.stderr?.on("data", (chunk) => {
    const text = String(chunk);
    stderrBuf = (stderrBuf + text).slice(-4000);
    if (/error|invalid|failed/i.test(text)) {
      console.warn(`[hls] ffmpeg ${id}:`, text.trim().slice(0, 240));
    }
  });

  proc.on("exit", (code, signal) => {
    if (session.error) return;
    if (code && code !== 0) {
      session.error =
        stderrBuf.trim().slice(0, 400) ||
        `ffmpeg exited code ${code}${signal ? ` signal ${signal}` : ""}`;
      console.error(`[hls] failed ${id}:`, session.error);
    } else {
      console.log(`[hls] ffmpeg done ${id}`);
    }
  });

  return session;
}

/**
 * @param {HlsSession} session
 */
async function waitUntilReady(session) {
  const playlist = path.join(session.dir, "index.m3u8");
  const started = Date.now();
  while (Date.now() - started < READY_TIMEOUT_MS) {
    session.lastAccess = Date.now();
    if (session.error) throw new Error(session.error);
    try {
      const text = await fsp.readFile(playlist, "utf8");
      const segs = text.split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
      // Wait for a couple of segments so start/seek feels ready to play.
      if (segs.length >= 2) {
        session.ready = true;
        return text;
      }
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    "Timed out waiting for HLS segments (ffmpeg still starting or source unreachable)",
  );
}

/**
 * @param {HlsSession} session
 */
async function destroySession(session) {
  sessions.delete(session.id);
  try {
    session.proc?.kill("SIGKILL");
  } catch {
    /* ignore */
  }
  try {
    await fsp.rm(session.dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

async function cleanupSessions() {
  const now = Date.now();
  for (const session of [...sessions.values()]) {
    if (now - session.lastAccess > SESSION_TTL_MS) {
      console.log(`[hls] expire ${session.id}`);
      await destroySession(session);
    }
  }
}

setInterval(() => {
  void cleanupSessions();
}, 60_000).unref();

async function handleHlsPlaylist(req, res, sourceUrl, startSec = 0) {
  if (!FFMPEG_OK) {
    sendJson(res, 503, {
      error: "ffmpeg not available on this proxy",
      hint: "Run npm install (includes ffmpeg-static), then restart npm run proxy",
    });
    return;
  }

  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    sendJson(res, 400, { error: "Invalid url" });
    return;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    sendJson(res, 400, { error: "Unsupported protocol" });
    return;
  }

  // Only remux containers through ffmpeg; otherwise redirect to byte-proxy.
  if (!needsServerHls(parsed.pathname) && !needsServerHls(sourceUrl)) {
    const loc = `/api/stream?url=${encodeURIComponent(sourceUrl)}`;
    res.writeHead(302, corsHeaders({ Location: loc }));
    res.end();
    return;
  }

  try {
    const session = await getOrStartSession(sourceUrl, startSec);
    const text = await waitUntilReady(session);
    // Wait briefly for duration probe if still pending.
    if (!session.durationSec) {
      await new Promise((r) => setTimeout(r, 800));
    }
    const rewritten = rewriteLocalHlsPlaylist(
      text,
      session.id,
      session.durationSec,
    );
    const headers = corsHeaders({
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-cache",
    });
    if (session.durationSec) {
      headers["X-Media-Duration"] = String(Math.round(session.durationSec));
      headers["Access-Control-Expose-Headers"] =
        "Content-Length, Content-Range, Accept-Ranges, X-Media-Duration";
    }
    res.writeHead(200, headers);
    res.end(rewritten);
  } catch (error) {
    sendJson(res, 502, {
      error: error instanceof Error ? error.message : "HLS remux failed",
    });
  }
}

async function handleHlsFile(req, res, sessionId, fileName) {
  if (!/^[a-f0-9]{8,32}$/i.test(sessionId)) {
    sendJson(res, 400, { error: "Bad session" });
    return;
  }
  if (!/^[A-Za-z0-9._-]+$/.test(fileName) || fileName.includes("..")) {
    sendJson(res, 400, { error: "Bad file" });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    sendJson(res, 404, { error: "Unknown or expired HLS session" });
    return;
  }
  session.lastAccess = Date.now();

  const filePath = path.join(session.dir, fileName);
  if (!filePath.startsWith(session.dir)) {
    sendJson(res, 400, { error: "Bad path" });
    return;
  }

  // Playlist refresh while ffmpeg is still writing.
  if (fileName.endsWith(".m3u8")) {
    try {
      const text = await fsp.readFile(filePath, "utf8");
      const rewritten = rewriteLocalHlsPlaylist(
        text,
        sessionId,
        session.durationSec,
      );
      const headers = corsHeaders({
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-cache",
      });
      if (session.durationSec) {
        headers["X-Media-Duration"] = String(Math.round(session.durationSec));
        headers["Access-Control-Expose-Headers"] =
          "Content-Length, Content-Range, Accept-Ranges, X-Media-Duration";
      }
      res.writeHead(200, headers);
      res.end(rewritten);
      return;
    } catch {
      sendJson(res, 404, { error: "Playlist not ready" });
      return;
    }
  }

  // Wait briefly for the segment file to appear (ffmpeg slightly behind).
  const waitUntil = Date.now() + 15000;
  while (Date.now() < waitUntil) {
    try {
      await fsp.access(filePath, fs.constants.R_OK);
      break;
    } catch {
      if (session.error) {
        sendJson(res, 502, { error: session.error });
        return;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  try {
    const stat = await fsp.stat(filePath);
    const type = fileName.endsWith(".ts")
      ? "video/mp2t"
      : "application/octet-stream";
    res.writeHead(
      200,
      corsHeaders({
        "Content-Type": type,
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=60",
      }),
    );
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  } catch {
    sendJson(res, 404, { error: "Segment not found" });
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
      ffmpeg: FFMPEG_OK,
      ffmpegPath: FFMPEG_BIN,
      stream: "/api/stream?url=...",
      hls: "/api/hls?url=... (MKV/AVI/MOV → HLS)",
      sessions: sessions.size,
    });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const sessionMatch = url.pathname.match(
    /^\/api\/hls\/session\/([a-f0-9]+)\/([^/]+)$/i,
  );
  if (sessionMatch) {
    await handleHlsFile(req, res, sessionMatch[1], sessionMatch[2]);
    return;
  }

  if (url.pathname === "/api/hls") {
    const target = url.searchParams.get("url");
    if (!target) {
      sendJson(res, 400, { error: "Missing url" });
      return;
    }
    const start = Number(url.searchParams.get("start") || 0);
    await handleHlsPlaylist(req, res, target, start);
    return;
  }

  if (url.pathname === "/api/stream") {
    const target = url.searchParams.get("url");
    if (!target) {
      sendJson(res, 400, { error: "Missing url" });
      return;
    }
    await handleStream(req, res, target);
    return;
  }

  sendJson(res, 404, {
    error: "Not found",
    hint: "Use /api/stream?url=... or /api/hls?url=...",
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[xtream-stream-proxy] listening on http://0.0.0.0:${PORT}`);
  console.log(
    `[xtream-stream-proxy] ffmpeg: ${FFMPEG_OK ? `ok (${FFMPEG_BIN})` : "MISSING"}`,
  );
  if (!FFMPEG_OK) {
    console.log(
      `[xtream-stream-proxy] install: npm install   (bundles ffmpeg-static)`,
    );
  }
  console.log(`[xtream-stream-proxy] health: GET /health`);
  console.log(`[xtream-stream-proxy] stream: GET /api/stream?url=<upstream>`);
  console.log(`[xtream-stream-proxy] hls:    GET /api/hls?url=<mkv>`);
  console.log(
    `[xtream-stream-proxy] set NEXT_PUBLIC_STREAM_PROXY_BASE to this origin`,
  );
});
