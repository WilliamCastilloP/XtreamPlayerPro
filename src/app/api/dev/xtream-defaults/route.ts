import { NextResponse } from "next/server";

/**
 * Dev-only: returns XTREAM_DEV_* from `.env.local`.
 * Restart `npm run dev` after editing that file.
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
    return NextResponse.json({
      configured: false,
      hint: "Set XTREAM_DEV_SERVER, XTREAM_DEV_USERNAME, and XTREAM_DEV_PASSWORD in .env.local, then restart npm run dev.",
    });
  }

  return NextResponse.json({
    configured: true,
    name,
    serverUrl,
    username,
    password,
  });
}
