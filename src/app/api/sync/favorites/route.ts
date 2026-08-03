import { NextRequest } from "next/server";
import { jsonError } from "@/lib/xtream/server";
import { requireSyncUser } from "@/lib/sync/auth-server";
import { prisma } from "@/lib/sync/db";

export type SyncFavoriteDto = {
  id: string;
  kind: "live" | "movie" | "series";
  title: string;
  image?: string;
  streamId: string;
  addedAt: number;
};

function toDto(row: {
  itemId: string;
  kind: string;
  title: string;
  image: string | null;
  streamId: string;
  addedAt: Date;
}): SyncFavoriteDto {
  return {
    id: row.itemId,
    kind: row.kind as SyncFavoriteDto["kind"],
    title: row.title,
    image: row.image ?? undefined,
    streamId: row.streamId,
    addedAt: row.addedAt.getTime(),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireSyncUser(request);
  if (auth instanceof Response) return auth;

  const rows = await prisma.favorite.findMany({
    where: { userId: auth.sub },
    orderBy: { addedAt: "desc" },
  });

  return Response.json({ favorites: rows.map(toDto) });
}

export async function PUT(request: NextRequest) {
  const auth = await requireSyncUser(request);
  if (auth instanceof Response) return auth;

  let body: { favorites?: SyncFavoriteDto[] };
  try {
    body = (await request.json()) as { favorites?: SyncFavoriteDto[] };
  } catch {
    return jsonError("Invalid JSON body");
  }

  const favorites = body.favorites;
  if (!Array.isArray(favorites)) {
    return jsonError("favorites must be an array");
  }

  await prisma.$transaction(async (tx) => {
    await tx.favorite.deleteMany({ where: { userId: auth.sub } });
    if (favorites.length === 0) return;

    await tx.favorite.createMany({
      data: favorites.map((f) => ({
        userId: auth.sub,
        itemId: f.id,
        kind: f.kind,
        title: f.title,
        image: f.image ?? null,
        streamId: String(f.streamId),
        addedAt: new Date(f.addedAt),
      })),
    });
  });

  return Response.json({ ok: true, count: favorites.length });
}
