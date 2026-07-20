import { NextRequest, NextResponse } from "next/server";

/**
 * Dev-only: print a player debug dump to the Next.js terminal so it can be
 * copied from the npm run dev output and shared.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  let body: {
    title?: string;
    kind?: string;
    streamId?: string;
    text?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const text = (body.text || "").trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: "Empty dump" }, { status: 400 });
  }

  const header = [
    "",
    "======== PLAYER DEBUG DUMP ========",
    body.title ? `title: ${body.title}` : null,
    body.kind ? `kind: ${body.kind}` : null,
    body.streamId ? `streamId: ${body.streamId}` : null,
    `at: ${new Date().toISOString()}`,
    "-----------------------------------",
  ]
    .filter(Boolean)
    .join("\n");

  console.log(header);
  console.log(text);
  console.log("======== END PLAYER DEBUG ========\n");

  return NextResponse.json({ ok: true });
}
