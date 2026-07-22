#!/usr/bin/env node
/**
 * Standalone media proxy for XTREAM.
 *
 * - GET /api/stream?url=...  → byte-proxy (Range, HLS rewrite)
 * - GET /api/hls?url=...&start=&audio= → MKV/AVI/MOV → HLS via ffmpeg
 * - GET /api/hls/tracks?url=... → list audio + subtitle tracks (like Smarters)
 * - GET /api/hls/sub?url=...&index=&from=&duration= → WebVTT window (fast)
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
 *   warm: boolean,
 *   stopping: boolean,
 *   audioIndex: number,
 * }} HlsSession
 */

/**
 * @typedef {{
 *   id: number,
 *   language: string,
 *   codec: string,
 *   title: string,
 *   label: string,
 *   default?: boolean,
 * }} ProxyTrack
 */

/**
 * @typedef {{
 *   durationSec: number | null,
 *   audio: ProxyTrack[],
 *   subtitles: ProxyTrack[],
 * }} ProbedTracks
 */

const LANG_LABELS = {
  jpn: "Japanese",
  ja: "Japanese",
  eng: "English",
  en: "English",
  spa: "Spanish",
  es: "Spanish",
  por: "Portuguese",
  pt: "Portuguese",
  fre: "French",
  fra: "French",
  fr: "French",
  ger: "German",
  deu: "German",
  de: "German",
  ita: "Italian",
  it: "Italian",
  chi: "Chinese",
  zho: "Chinese",
  zh: "Chinese",
  kor: "Korean",
  ko: "Korean",
  rus: "Russian",
  ru: "Russian",
  ara: "Arabic",
  ar: "Arabic",
  hin: "Hindi",
  hi: "Hindi",
  und: "Unknown",
};

const TEXT_SUB_CODECS =
  /subrip|ass|ssa|webvtt|mov_text|text|srt|utf8|microdvd|mpl2|jacosub|sami|realtext|subviewer|vplayer/i;

function sessionIdFor(url, startSec = 0, audioIndex = 0) {
  const key = `${url}|${Math.max(0, Math.floor(startSec))}|a${Math.max(0, audioIndex | 0)}`;
  return createHash("sha1").update(key).digest("hex").slice(0, 16);
}

function trackLabel(language, title, kind, index) {
  const named = (title || "").trim();
  if (named) return named;
  const lang = (language || "und").toLowerCase();
  const pretty = LANG_LABELS[lang];
  if (pretty && lang !== "und") return pretty;
  if (lang && lang !== "und") return lang.toUpperCase();
  return `${kind} ${index + 1}`;
}

/**
 * Rewrite HLS segment / URI lines through this proxy.
 * Prefer absolute proxy URLs so hls.js never resolves `/api/stream` against
 * the app origin (e.g. :3000) when the playlist came from :8080.
 */
function rewriteUpstreamPlaylist(body, playlistUrl, proxyOrigin = "") {
  const base = new URL(playlistUrl);
  const origin = String(proxyOrigin || "").replace(/\/+$/, "");
  const wrap = (absolute) => {
    const path = `/api/stream?url=${encodeURIComponent(absolute)}`;
    return origin ? `${origin}${path}` : path;
  };
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        if (trimmed.includes("URI=")) {
          return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
            try {
              const absolute = new URL(uri, base).toString();
              return `URI="${wrap(absolute)}"`;
            } catch {
              return `URI="${uri}"`;
            }
          });
        }
        return line;
      }
      try {
        const absolute = new URL(trimmed, base).toString();
        return wrap(absolute);
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
  // Never forward Range onto playlist probes — partial m3u8 breaks live HLS.
  const likelyPlaylist =
    parsed.pathname.endsWith(".m3u8") ||
    /\/live\/[^/]+\/[^/]+\/[^/.]+$/i.test(parsed.pathname) ||
    /\/auth\//i.test(parsed.pathname);
  const range = req.headers.range;
  if (range && !likelyPlaylist) forwardHeaders.Range = range;

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
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  const proto =
    (req.headers["x-forwarded-proto"] || "").split(",")[0].trim() || "http";
  const proxyOrigin =
    (process.env.PUBLIC_STREAM_PROXY_BASE || "").replace(/\/+$/, "") ||
    `${proto}://${host}`;

  if (req.method !== "HEAD" && shouldBufferAsPlaylist(contentType, finalPath)) {
    const text = await upstream.text();
    if (text.includes("#EXTM3U")) {
      const rewritten = rewriteUpstreamPlaylist(text, finalUrl, proxyOrigin);
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

/** @type {Map<string, string>} sourceUrl → audio codec hint (aac, ac3, …) */
const audioCodecBySource = new Map();
/** @type {Map<string, number>} sourceUrl → duration seconds */
const durationBySource = new Map();
/** @type {Map<string, ProbedTracks>} sourceUrl → probed tracks */
const tracksBySource = new Map();
/** @type {Map<string, Promise<ProbedTracks>>} in-flight probes (dedupe) */
const tracksProbeJobs = new Map();
/** @type {Map<string, Promise<string>>} cacheKey → in-flight VTT extract */
const subtitleJobs = new Map();

function isUsefulProbe(probed) {
  return (
    (probed.audio && probed.audio.length > 0) ||
    (probed.subtitles && probed.subtitles.length > 0) ||
    (probed.durationSec != null && probed.durationSec > 1)
  );
}

/**
 * Probe duration + audio/subtitle tracks from ffmpeg -i banner.
 * Empty probes (panel HTML / transient errors) are NOT cached so we retry.
 * @param {string} mediaUrl
 * @returns {Promise<ProbedTracks>}
 */
function probeMediaInfo(mediaUrl) {
  const cached = tracksBySource.get(mediaUrl);
  if (cached && isUsefulProbe(cached)) return Promise.resolve(cached);

  const inflight = tracksProbeJobs.get(mediaUrl);
  if (inflight) return inflight;

  const job = new Promise((resolve) => {
    if (!FFMPEG_BIN) {
      resolve({ durationSec: null, audio: [], subtitles: [] });
      return;
    }
    const proc = spawn(
      FFMPEG_BIN,
      [
        "-hide_banner",
        "-user_agent",
        UPSTREAM_UA,
        "-reconnect",
        "1",
        "-reconnect_streamed",
        "1",
        "-reconnect_delay_max",
        "5",
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
    }, 45000);
    proc.stderr?.on("data", (c) => {
      err += String(c);
      if (err.length > 24000) err = err.slice(-24000);
    });
    proc.on("close", () => {
      clearTimeout(timer);
      /** @type {ProxyTrack[]} */
      const audio = [];
      /** @type {ProxyTrack[]} */
      const subtitles = [];
      let audioTypeIndex = 0;
      let subtitleTypeIndex = 0;
      const streamRe =
        /Stream #\d+:\d+(?:\(([^)]*)\))?:\s*(Audio|Subtitle):\s*([a-z0-9_]+)/gi;
      let match;
      while ((match = streamRe.exec(err))) {
        const language = (match[1] || "und").trim() || "und";
        const kind = match[2].toLowerCase();
        const codec = (match[3] || "").toLowerCase();
        const slice = err.slice(Math.max(0, match.index), match.index + 220);
        const isDefault = /\(default\)/i.test(slice);
        if (kind === "audio") {
          const id = audioTypeIndex;
          audioTypeIndex += 1;
          audio.push({
            id,
            language,
            codec,
            title: "",
            label: trackLabel(language, "", "Audio", id),
            default: isDefault,
          });
          if (id === 0 && !audioCodecBySource.has(mediaUrl)) {
            audioCodecBySource.set(mediaUrl, codec);
          }
        } else if (kind === "subtitle") {
          // id must match ffmpeg `-map 0:s:N` (includes image PGS we skip in UI).
          const id = subtitleTypeIndex;
          subtitleTypeIndex += 1;
          if (!TEXT_SUB_CODECS.test(codec)) continue;
          subtitles.push({
            id,
            language,
            codec,
            title: "",
            label: trackLabel(language, "", "Subtitles", subtitles.length),
            default: isDefault,
          });
        }
      }
      let durationSec = null;
      const dur = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (dur) {
        const sec =
          Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]);
        if (sec > 1) durationSec = sec;
      }
      /** @type {ProbedTracks} */
      const probed = { durationSec, audio, subtitles };
      // Only cache successful probes — empty results are usually HTML/502
      // from the panel and would permanently hide audio/subs until restart.
      if (isUsefulProbe(probed)) {
        tracksBySource.set(mediaUrl, probed);
        if (durationSec) durationBySource.set(mediaUrl, durationSec);
      } else {
        tracksBySource.delete(mediaUrl);
        console.warn(
          `[hls] tracks empty (not cached) · ${mediaUrl.slice(0, 56)}…`,
        );
      }
      console.log(
        `[hls] tracks · audio=${audio.length} subs=${subtitles.length} · ${mediaUrl.slice(0, 56)}…`,
      );
      resolve(probed);
    });
  }).finally(() => {
    tracksProbeJobs.delete(mediaUrl);
  });

  tracksProbeJobs.set(mediaUrl, job);
  return job;
}

/**
 * @param {string[]} args
 * @param {number} timeoutMs
 * @returns {Promise<{ code: number, stderr: string }>}
 */
function runFfmpeg(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (!FFMPEG_BIN) {
      reject(new Error("ffmpeg not available"));
      return;
    }
    const proc = spawn(FFMPEG_BIN, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      reject(new Error("ffmpeg timed out"));
    }, timeoutMs);
    proc.stderr?.on("data", (c) => {
      err += String(c);
      if (err.length > 8000) err = err.slice(-8000);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stderr: err });
    });
  });
}

function formatVttTimestamp(totalSeconds) {
  const msTotal = Math.max(0, Math.round(totalSeconds * 1000));
  const hours = Math.floor(msTotal / 3600000);
  const minutes = Math.floor((msTotal % 3600000) / 60000);
  const seconds = Math.floor((msTotal % 60000) / 1000);
  const ms = msTotal % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function parseVttTimestamp(value) {
  const parts = value.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const secPart = parts[parts.length - 1];
  const minutes = Number(parts[parts.length - 2]);
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  const seconds = Number(String(secPart).replace(",", "."));
  if (![hours, minutes, seconds].every((n) => Number.isFinite(n))) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

/** Shift relative WebVTT cues into absolute movie time. */
function shiftVttTimestamps(vtt, offsetSec) {
  if (!offsetSec || offsetSec < 0.05) return vtt;
  return vtt.replace(
    /(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)/g,
    (_full, startRaw, endRaw) => {
      const start = parseVttTimestamp(startRaw.split(/\s+/)[0]);
      const end = parseVttTimestamp(endRaw.split(/\s+/)[0]);
      if (start == null || end == null) return _full;
      return `${formatVttTimestamp(start + offsetSec)} --> ${formatVttTimestamp(end + offsetSec)}`;
    },
  );
}

/**
 * Windowed softsub extract aligned with server-HLS `-ss` (same fast seek).
 * Returns WebVTT with timestamps RELATIVE to `from` (like video.currentTime
 * after an HLS restart). The player must NOT mix these with absolute times.
 *
 * @param {string} sourceUrl
 * @param {number} subIndex
 * @param {number} fromSec
 * @param {number} durationSec
 * @returns {Promise<string>} WebVTT text (relative timestamps)
 */
async function extractSubtitleVttWindow(
  sourceUrl,
  subIndex,
  fromSec = 0,
  durationSec = 300,
) {
  const index = Math.max(0, subIndex | 0);
  // Match HLS session snapping (2s) so video + subs share the same seek base.
  const from = Math.max(0, Math.floor((fromSec || 0) / 2) * 2);
  const duration = Math.max(60, Math.min(900, Math.floor(durationSec || 300)));
  const cacheKey = `${createHash("sha1").update(sourceUrl).digest("hex").slice(0, 16)}-s${index}-f${from}-d${duration}-rel`;
  const existingJob = subtitleJobs.get(cacheKey);
  if (existingJob) return existingJob;

  const job = (async () => {
    await ensureHlsDir();
    const dir = path.join(HLS_ROOT, "subs");
    await fsp.mkdir(dir, { recursive: true });
    const outPath = path.join(dir, `${cacheKey}.vtt`);
    try {
      const st = await fsp.stat(outPath);
      if (st.size > 16) {
        console.log(
          `[hls] sub window cache · s:${index} · from=${from}s · ${duration}s`,
        );
        return fsp.readFile(outPath, "utf8");
      }
    } catch {
      /* extract */
    }

    // Same input path + -ss style as HLS video → same keyframe base → sync.
    const localProxy = `http://127.0.0.1:${PORT}/api/stream?url=${encodeURIComponent(sourceUrl)}`;
    console.log(
      `[hls] sub window start · s:${index} · from=${from}s · ${duration}s`,
    );
    const started = Date.now();
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
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
    if (from > 0) {
      args.push(
        "-ss",
        String(from),
        "-noaccurate_seek",
        "-fflags",
        "+fastseek",
      );
    }
    args.push(
      "-i",
      localProxy,
      "-t",
      String(duration),
      "-map",
      `0:s:${index}`,
      "-f",
      "webvtt",
      "-y",
      outPath,
    );

    const result = await runFfmpeg(args, 90000);
    if (result.code !== 0) {
      throw new Error(
        result.stderr.trim().slice(0, 240) || "subtitle window extract failed",
      );
    }
    // Keep relative timestamps (do NOT shift to absolute) — matches video.currentTime.
    const text = await fsp.readFile(outPath, "utf8");
    console.log(
      `[hls] sub window done · s:${index} · from=${from}s · ${((Date.now() - started) / 1000).toFixed(1)}s · bytes=${text.length}`,
    );
    return text;
  })();

  subtitleJobs.set(cacheKey, job);
  try {
    return await job;
  } finally {
    subtitleJobs.delete(cacheKey);
  }
}

/**
 * @param {string} sourceUrl
 * @param {number} [startSec]
 * @param {{ warm?: boolean, audioIndex?: number }} [opts]
 * @returns {Promise<HlsSession>}
 */
async function getOrStartSession(sourceUrl, startSec = 0, opts = {}) {
  const warm = !!opts.warm;
  const audio = Math.max(0, Math.floor(Number(opts.audioIndex) || 0));
  // Snap to 2s buckets so nearby scrubs reuse the same ffmpeg session.
  const start = Math.max(0, Math.floor((startSec || 0) / 2) * 2);
  const id = sessionIdFor(sourceUrl, start, audio);
  const existing = sessions.get(id);
  if (existing && !existing.error && !existing.stopping) {
    existing.lastAccess = Date.now();
    // Real playback takes ownership of a previously warmed session.
    if (!warm) existing.warm = false;
    return existing;
  }
  if (existing) {
    await destroySession(existing);
  }

  if (!warm) {
    // Committed playback/seek: drop every other session for this title.
    for (const other of [...sessions.values()]) {
      if (other.sourceUrl === sourceUrl && other.id !== id) {
        console.log(`[hls] stop ${other.id} (handoff → ${id})`);
        await destroySession(other);
      }
    }
  } else {
    // Prefetch only: keep the playing session; replace other warm seeks.
    for (const other of [...sessions.values()]) {
      if (other.sourceUrl === sourceUrl && other.id !== id && other.warm) {
        console.log(`[hls] stop ${other.id} (warm → ${id})`);
        await destroySession(other);
      }
    }
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
    durationSec: durationBySource.get(sourceUrl) || null,
    startSec: start,
    warm,
    stopping: false,
    audioIndex: audio,
  };
  sessions.set(id, session);

  // Probe tracks/duration on the primary (start=0) session — seeks/warm skip this.
  if (start === 0 && !warm) {
    void probeMediaInfo(localProxy).then((probed) => {
      if (sessions.get(id) !== session) return;
      if (probed.durationSec) {
        session.durationSec = probed.durationSec;
        durationBySource.set(sourceUrl, probed.durationSec);
        console.log(`[hls] duration ${id} = ${Math.round(probed.durationSec)}s`);
      }
      // Re-key cache under the upstream URL too (player queries by that).
      if (isUsefulProbe(probed)) {
        tracksBySource.set(sourceUrl, probed);
      }
    });
  }

  const playlist = path.join(dir, "index.m3u8");
  const segmentPattern = path.join(dir, "seg_%05d.ts");
  const probedAudio = tracksBySource.get(sourceUrl)?.audio?.[audio];
  const knownAudio =
    probedAudio?.codec || audioCodecBySource.get(sourceUrl) || "";
  const canCopyAudio = /^(aac|mp3|mp4a)/i.test(knownAudio);
  // Shorter segments after a scrub → first playable chunk arrives sooner.
  const hlsTime = start > 0 ? "2" : "3";

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
  // Fast input seek (keyframe). noaccurate_seek = much snappier on big MKVs.
  if (start > 0) {
    args.push(
      "-ss",
      String(start),
      "-noaccurate_seek",
      "-fflags",
      "+fastseek",
      // Don't spend seconds probing the whole MKV on every scrub.
      "-probesize",
      "512k",
      "-analyzeduration",
      "500000",
    );
  }
  args.push(
    "-i",
    localProxy,
    "-map",
    "0:v:0",
    "-map",
    `0:a:${audio}?`,
    "-c:v",
    "copy",
  );
  if (canCopyAudio) {
    args.push("-c:a", "copy");
  } else {
    // Fast AAC for AC3/DTS movies (transcode is the seek bottleneck).
    args.push(
      "-c:a",
      "aac",
      "-aac_coder",
      "fast",
      "-b:a",
      "96k",
      "-ac",
      "2",
      "-ar",
      "48000",
    );
  }
  args.push(
    "-f",
    "hls",
    "-hls_time",
    hlsTime,
    "-hls_list_size",
    "0",
    "-hls_playlist_type",
    "event",
    "-hls_flags",
    "independent_segments+append_list",
    "-hls_segment_filename",
    segmentPattern,
    playlist,
  );

  console.log(
    `[hls] start ${id} ← from=${start}s · a:${audio} · ${warm ? "warm · " : ""}audio=${canCopyAudio ? "copy" : "aac"} · ${sourceUrl.slice(0, 64)}…`,
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
    if (session.stopping) return;
    const text = String(chunk);
    stderrBuf = (stderrBuf + text).slice(-4000);
    const audioMatch = text.match(/Audio:\s*([a-z0-9_]+)/i);
    if (audioMatch && !audioCodecBySource.has(sourceUrl)) {
      audioCodecBySource.set(sourceUrl, audioMatch[1].toLowerCase());
      console.log(`[hls] audio codec ${audioMatch[1]} for source`);
    }
    // Upstream HTTP drops under seek load — reconnect is expected, not useful.
    if (/Will reconnect|error=End of file/i.test(text)) return;
    // Directory gone after intentional stop — ignore muxer noise.
    if (/No such file or directory|Failed to open file/i.test(text)) return;
    if (/error|invalid|failed/i.test(text)) {
      console.warn(`[hls] ffmpeg ${id}:`, text.trim().slice(0, 240));
    }
  });

  proc.on("exit", (code, signal) => {
    if (session.stopping) {
      console.log(`[hls] stopped ${id}`);
      return;
    }
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
  // Scrub restarts: 1 segment is enough to start playing ASAP.
  const needSegs = session.startSec > 0 ? 1 : 2;
  while (Date.now() - started < READY_TIMEOUT_MS) {
    session.lastAccess = Date.now();
    if (session.error) throw new Error(session.error);
    try {
      const text = await fsp.readFile(playlist, "utf8");
      const segs = text.split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
      if (segs.length >= needSegs) {
        session.ready = true;
        return text;
      }
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(
    "Timed out waiting for HLS segments (ffmpeg still starting or source unreachable)",
  );
}

/**
 * @param {HlsSession} session
 */
async function destroySession(session) {
  if (session.stopping) return;
  session.stopping = true;
  sessions.delete(session.id);
  const proc = session.proc;
  if (proc && proc.exitCode === null && !proc.killed) {
    try {
      proc.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    // Wait for ffmpeg to release segment file handles (critical on Windows).
    await Promise.race([
      new Promise((resolve) => proc.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
  }
  await new Promise((resolve) => setTimeout(resolve, 40));
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

async function handleHlsTracks(req, res, sourceUrl) {
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

  try {
    const localProxy = `http://127.0.0.1:${PORT}/api/stream?url=${encodeURIComponent(sourceUrl)}`;
    const probed =
      tracksBySource.get(sourceUrl) ||
      tracksBySource.get(localProxy) ||
      (await probeMediaInfo(localProxy));
    if (isUsefulProbe(probed)) {
      tracksBySource.set(sourceUrl, probed);
      tracksBySource.set(localProxy, probed);
    }
    sendJson(res, 200, {
      audio: probed.audio,
      subtitles: probed.subtitles,
      duration: probed.durationSec,
    });
  } catch (error) {
    sendJson(res, 502, {
      error: error instanceof Error ? error.message : "Track probe failed",
    });
  }
}

async function handleHlsSubtitle(
  req,
  res,
  sourceUrl,
  subIndex,
  fromSec = 0,
  durationSec = 600,
) {
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

  try {
    const text = await extractSubtitleVttWindow(
      sourceUrl,
      subIndex,
      fromSec,
      durationSec,
    );
    res.writeHead(
      200,
      corsHeaders({
        "Content-Type": "text/vtt; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      }),
    );
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(text);
  } catch (error) {
    sendJson(res, 502, {
      error: error instanceof Error ? error.message : "Subtitle extract failed",
    });
  }
}

async function handleHlsPlaylist(
  req,
  res,
  sourceUrl,
  startSec = 0,
  opts = {},
) {
  const audioIndex = Math.max(0, Math.floor(Number(opts.audioIndex) || 0));
  const warm = !!opts.warm;
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
    const session = await getOrStartSession(sourceUrl, startSec, {
      warm,
      audioIndex,
    });
    const text = await waitUntilReady(session);
    // Only wait for duration on the initial (start=0) playlist — never on scrub.
    if (!session.durationSec && session.startSec === 0) {
      await new Promise((r) => setTimeout(r, 800));
    }
    if (!session.durationSec && durationBySource.has(sourceUrl)) {
      session.durationSec = durationBySource.get(sourceUrl) || null;
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
      hls: "/api/hls?url=...&start=&audio= (MKV/AVI/MOV → HLS)",
      tracks: "/api/hls/tracks?url=...",
      subtitles: "/api/hls/sub?url=...&index=",
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

  if (url.pathname === "/api/hls/tracks") {
    const target = url.searchParams.get("url");
    if (!target) {
      sendJson(res, 400, { error: "Missing url" });
      return;
    }
    await handleHlsTracks(req, res, target);
    return;
  }

  if (url.pathname === "/api/hls/sub") {
    const target = url.searchParams.get("url");
    if (!target) {
      sendJson(res, 400, { error: "Missing url" });
      return;
    }
    const index = Number(url.searchParams.get("index") || 0);
    const from = Number(url.searchParams.get("from") || 0);
    const duration = Number(url.searchParams.get("duration") || 240);
    await handleHlsSubtitle(req, res, target, index, from, duration);
    return;
  }

  if (url.pathname === "/api/hls") {
    const target = url.searchParams.get("url");
    if (!target) {
      sendJson(res, 400, { error: "Missing url" });
      return;
    }
    const start = Number(url.searchParams.get("start") || 0);
    const warm =
      url.searchParams.get("warm") === "1" ||
      url.searchParams.get("warm") === "true";
    const audioIndex = Number(url.searchParams.get("audio") || 0);
    await handleHlsPlaylist(req, res, target, start, { warm, audioIndex });
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
