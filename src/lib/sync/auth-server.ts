import { createHash } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { normalizeServerUrl } from "@/lib/xtream/urls";
import type { XtreamCredentials } from "@/lib/xtream/types";

const JWT_ISSUER = "xtream-sync";
const JWT_AUDIENCE = "xtream-app";
const JWT_TTL = "30d";

export type SyncJwtPayload = {
  sub: string;
  serverUrl: string;
  username: string;
};

function jwtSecret(): Uint8Array {
  const secret = process.env.SYNC_JWT_SECRET;
  if (!secret) {
    throw new Error("SYNC_JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(secret);
}

export function syncUserId(credentials: XtreamCredentials): string {
  const server = normalizeServerUrl(credentials.serverUrl);
  const username = credentials.username.trim();
  const raw = `${server}:${username}`.toLowerCase();
  return createHash("sha256").update(raw).digest("hex");
}

export async function signSyncToken(
  credentials: XtreamCredentials,
): Promise<{ token: string; userId: string; expiresAt: number }> {
  const userId = syncUserId(credentials);
  const serverUrl = normalizeServerUrl(credentials.serverUrl);
  const username = credentials.username.trim();
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

  const token = await new SignJWT({
    serverUrl,
    username,
  } satisfies Omit<SyncJwtPayload, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(JWT_TTL)
    .sign(jwtSecret());

  return { token, userId, expiresAt };
}

export async function verifySyncToken(
  token: string,
): Promise<SyncJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    const sub = payload.sub;
    const serverUrl = payload.serverUrl;
    const username = payload.username;
    if (
      typeof sub !== "string" ||
      typeof serverUrl !== "string" ||
      typeof username !== "string"
    ) {
      return null;
    }
    return { sub, serverUrl, username };
  } catch {
    return null;
  }
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function requireSyncUser(
  request: Request,
): Promise<SyncJwtPayload | Response> {
  const token = bearerToken(request);
  if (!token) {
    return Response.json({ error: "Missing sync token" }, { status: 401 });
  }
  const payload = await verifySyncToken(token);
  if (!payload) {
    return Response.json({ error: "Invalid or expired sync token" }, { status: 401 });
  }
  return payload;
}
