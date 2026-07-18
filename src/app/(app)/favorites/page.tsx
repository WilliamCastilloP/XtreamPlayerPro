"use client";

import { PosterCard } from "@/components/catalog/PosterCard";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { listFavorites } from "@/lib/library/storage";
import { watchPath } from "@/lib/xtream/client";

export default function FavoritesPage() {
  const { activePlaylist, ready } = usePlaylists();
  const items =
    ready && activePlaylist ? listFavorites(activePlaylist.id) : [];

  return (
    <div className="space-y-4 px-4 py-5 md:px-6">
      <div>
        <h1 className="font-[family-name:var(--xp-font-display)] text-2xl font-bold">
          Favorites
        </h1>
        <p className="text-sm text-[var(--xp-muted)]">
          Saved for {activePlaylist?.name}
        </p>
      </div>
      {!items.length ? (
        <p className="text-sm text-[var(--xp-muted)]">
          Heart a channel, movie, or series to see it here.
        </p>
      ) : (
        <div className="xp-fade-in grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {items.map((item) => {
            const href =
              item.kind === "live"
                ? watchPath("live", item.streamId, { title: item.title })
                : item.kind === "movie"
                  ? `/movies/${item.streamId}`
                  : `/series/${item.streamId}`;
            return (
              <PosterCard
                key={item.id}
                href={href}
                title={item.title}
                image={item.image}
                subtitle={item.kind}
                aspect={item.kind === "live" ? "live" : "poster"}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
