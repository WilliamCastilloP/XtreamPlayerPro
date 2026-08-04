import { NextRequest } from "next/server";
import { jsonError } from "@/lib/xtream/server";
import { requireSyncUser } from "@/lib/sync/auth-server";
import { prisma } from "@/lib/sync/db";

export type SyncContinueDto = {
  id: string;
  kind: "live" | "movie" | "series";
  title: string;
  image?: string;
  streamId: string;
  seriesId?: string;
  season?: number;
  episode?: number;
  extension?: string;
  position?: number;
  duration?: number;
  audioTrack?: number;
  subtitleTrack?: number;
  updatedAt: number;
};

function toDto(row: {
  itemId: string;
  kind: string;
  title: string;
  image: string | null;
  streamId: string;
  seriesId: string | null;
  season: number | null;
  episode: number | null;
  extension: string | null;
  position: number | null;
  duration: number | null;
  audioTrack: number | null;
  subtitleTrack: number | null;
  updatedAt: Date;
}): SyncContinueDto {
  return {
    id: row.itemId,
    kind: row.kind as SyncContinueDto["kind"],
    title: row.title,
    image: row.image ?? undefined,
    streamId: row.streamId,
    seriesId: row.seriesId ?? undefined,
    season: row.season ?? undefined,
    episode: row.episode ?? undefined,
    extension: row.extension ?? undefined,
    position: row.position ?? undefined,
    duration: row.duration ?? undefined,
    audioTrack: row.audioTrack ?? undefined,
    subtitleTrack: row.subtitleTrack ?? undefined,
    updatedAt: row.updatedAt.getTime(),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireSyncUser(request);
  if (auth instanceof Response) return auth;

  const rows = await prisma.continue.findMany({
    where: { userId: auth.sub },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });

  return Response.json({ continue: rows.map(toDto) });
}

export async function PUT(request: NextRequest) {
  const auth = await requireSyncUser(request);
  if (auth instanceof Response) return auth;

  let body: { item?: SyncContinueDto };
  try {
    body = (await request.json()) as { item?: SyncContinueDto };
  } catch {
    return jsonError("Invalid JSON body");
  }

  const item = body.item;
  if (!item?.id || !item.kind || !item.title || item.streamId == null) {
    return jsonError("Invalid continue item");
  }

  await prisma.continue.upsert({
    where: {
      userId_itemId: {
        userId: auth.sub,
        itemId: item.id,
      },
    },
    create: {
      userId: auth.sub,
      itemId: item.id,
      kind: item.kind,
      title: item.title,
      image: item.image ?? null,
      streamId: String(item.streamId),
      seriesId: item.seriesId != null ? String(item.seriesId) : null,
      season: item.season ?? null,
      episode: item.episode ?? null,
      extension: item.extension ?? null,
      position: item.position ?? null,
      duration: item.duration ?? null,
      audioTrack: item.audioTrack ?? null,
      subtitleTrack: item.subtitleTrack ?? null,
      updatedAt: new Date(item.updatedAt || Date.now()),
    },
    update: {
      kind: item.kind,
      title: item.title,
      image: item.image ?? null,
      streamId: String(item.streamId),
      seriesId: item.seriesId != null ? String(item.seriesId) : null,
      season: item.season ?? null,
      episode: item.episode ?? null,
      extension: item.extension ?? null,
      position: item.position ?? null,
      duration: item.duration ?? null,
      audioTrack: item.audioTrack ?? null,
      subtitleTrack: item.subtitleTrack ?? null,
      updatedAt: new Date(item.updatedAt || Date.now()),
    },
  });

  // Keep one continue row per series (drop older episodes of the same show).
  if (item.kind === "series" && item.seriesId != null) {
    await prisma.continue.deleteMany({
      where: {
        userId: auth.sub,
        kind: "series",
        seriesId: String(item.seriesId),
        NOT: { itemId: item.id },
      },
    });
  }

  const count = await prisma.continue.count({ where: { userId: auth.sub } });
  if (count > 40) {
    const stale = await prisma.continue.findMany({
      where: { userId: auth.sub },
      orderBy: { updatedAt: "desc" },
      skip: 40,
      select: { userId: true, itemId: true },
    });
    if (stale.length > 0) {
      await prisma.continue.deleteMany({
        where: {
          OR: stale.map((s) => ({
            userId: s.userId,
            itemId: s.itemId,
          })),
        },
      });
    }
  }

  return Response.json({ ok: true });
}
