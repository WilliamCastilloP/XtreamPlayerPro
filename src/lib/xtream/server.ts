import { NextRequest } from "next/server";
import { buildPlayerApiUrl, normalizeServerUrl } from "./urls";
import type { XtreamCredentials } from "./types";

export function credentialsFromRequest(
  request: NextRequest,
): XtreamCredentials | null {
  const serverUrl =
    request.headers.get("x-xtream-server") ||
    request.nextUrl.searchParams.get("server") ||
    "";
  const username =
    request.headers.get("x-xtream-username") ||
    request.nextUrl.searchParams.get("username") ||
    "";
  const password =
    request.headers.get("x-xtream-password") ||
    request.nextUrl.searchParams.get("password") ||
    "";

  if (!serverUrl || !username || !password) {
    return null;
  }

  return {
    serverUrl: normalizeServerUrl(serverUrl),
    username,
    password,
  };
}

export async function fetchXtreamJson(
  credentials: XtreamCredentials,
  params: Record<string, string | number | undefined> = {},
): Promise<unknown> {
  const url = buildPlayerApiUrl(credentials, params);
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "XtreamPlayerPro/1.0",
    },
  });

  if (!res.ok) {
    throw new Error(`Xtream panel responded with ${res.status}`);
  }

  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Invalid JSON from Xtream panel");
  }
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
