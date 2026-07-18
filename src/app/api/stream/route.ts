import { NextRequest } from "next/server";

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

function rewritePlaylist(body: string, playlistUrl: string): string {
  const base = new URL(playlistUrl);
  return body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return line;
      }

      let absolute: string;
      try {
        absolute = new URL(trimmed, base).toString();
      } catch {
        return line;
      }

      if (trimmed.endsWith(".m3u8") || trimmed.includes(".m3u8?")) {
        return `/api/stream?url=${encodeURIComponent(absolute)}`;
      }

      return `/api/stream?url=${encodeURIComponent(absolute)}`;
    })
    .join("\n");
}

export async function GET(request: NextRequest) {
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

  try {
    const upstream = await fetch(parsed.toString(), {
      cache: "no-store",
      headers: {
        "User-Agent": "XtreamPlayerPro/1.0",
        Accept: "*/*",
      },
      redirect: "follow",
    });

    if (!upstream.ok) {
      return new Response(`Upstream error ${upstream.status}`, {
        status: upstream.status,
      });
    }

    const contentType = upstream.headers.get("content-type") || "";
    const isPlaylist =
      contentType.includes("mpegurl") ||
      contentType.includes("m3u8") ||
      parsed.pathname.endsWith(".m3u8");

    if (isPlaylist) {
      const text = await upstream.text();
      const rewritten = rewritePlaylist(text, parsed.toString());
      return new Response(rewritten, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
        },
      });
    }

    const headers = new Headers();
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase())) {
        headers.set(key, value);
      }
    });
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "no-store");

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
