import { NextRequest } from "next/server";
import { jsonError } from "@/lib/xtream/server";
import { requireSyncUser } from "@/lib/sync/auth-server";
import { prisma } from "@/lib/sync/db";
import type { Locale } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/storage";

export async function GET(request: NextRequest) {
  const auth = await requireSyncUser(request);
  if (auth instanceof Response) return auth;

  const pref = await prisma.preference.findUnique({
    where: { userId: auth.sub },
  });

  return Response.json({
    locale: (pref?.locale as Locale | undefined) ?? "es",
    updatedAt: pref?.updatedAt.getTime() ?? 0,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireSyncUser(request);
  if (auth instanceof Response) return auth;

  let body: { locale?: string };
  try {
    body = (await request.json()) as { locale?: string };
  } catch {
    return jsonError("Invalid JSON body");
  }

  if (!isLocale(body.locale)) {
    return jsonError("Invalid locale");
  }

  const pref = await prisma.preference.upsert({
    where: { userId: auth.sub },
    create: { userId: auth.sub, locale: body.locale },
    update: { locale: body.locale },
  });

  return Response.json({
    ok: true,
    locale: pref.locale as Locale,
    updatedAt: pref.updatedAt.getTime(),
  });
}
