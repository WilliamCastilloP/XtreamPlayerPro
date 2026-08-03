import { NextRequest } from "next/server";
import { fetchXtreamJson, jsonError } from "@/lib/xtream/server";
import { normalizeServerUrl } from "@/lib/xtream/urls";
import type { XtreamAuthResponse } from "@/lib/xtream/types";
import { prisma } from "@/lib/sync/db";
import { signSyncToken, syncUserId } from "@/lib/sync/auth-server";

type AuthBody = {
  serverUrl?: string;
  username?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  let body: AuthBody;
  try {
    body = (await request.json()) as AuthBody;
  } catch {
    return jsonError("Invalid JSON body");
  }

  const serverUrl = body.serverUrl?.trim() ?? "";
  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";

  if (!serverUrl || !username || !password) {
    return jsonError("Missing serverUrl, username, or password");
  }

  const credentials = {
    serverUrl: normalizeServerUrl(serverUrl),
    username,
    password,
  };

  try {
    const data = (await fetchXtreamJson(credentials)) as XtreamAuthResponse;
    const auth = data?.user_info?.auth;
    const ok = auth === 1 || auth === "1";
    if (!ok) {
      return jsonError("Invalid username or password", 401);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Authentication failed";
    console.error("[sync/auth]", message);
    return jsonError(message, 502);
  }

  const userId = syncUserId(credentials);

  try {
    await prisma.user.upsert({
      where: { id: userId },
      create: { id: userId },
      update: {},
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Database error";
    console.error("[sync/auth] db", message);
    return jsonError(
      "Sync database is not ready. Run: npm run db:deploy",
      500,
    );
  }

  try {
    const { token, expiresAt } = await signSyncToken(credentials);
    return Response.json({
      token,
      userId,
      serverUrl: credentials.serverUrl,
      username: credentials.username,
      expiresAt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to issue sync token";
    console.error("[sync/auth]", message);
    return jsonError(message, 500);
  }
}
