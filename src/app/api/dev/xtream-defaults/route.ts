import { NextResponse } from "next/server";

/**
 * Dev-only helper: returns playlist defaults from `.env.local`.
 * Never enabled in production builds.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ configured: false }, { status: 404 });
  }

  const serverUrl = (process.env.XTREAM_DEV_SERVER || "").trim();
  const username = (process.env.XTREAM_DEV_USERNAME || "").trim();
  const password = process.env.XTREAM_DEV_PASSWORD || "";
  const name =
    (process.env.XTREAM_DEV_NAME || "").trim() || username || "Dev playlist";

  if (!serverUrl || !username || !password) {
    return NextResponse.json({ configured: false });
  }

  return NextResponse.json({
    configured: true,
    name,
    serverUrl,
    username,
    password,
  });
}
