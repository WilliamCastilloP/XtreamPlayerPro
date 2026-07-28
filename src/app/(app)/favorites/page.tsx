"use client";

import { PosterCard } from "@/components/catalog/PosterCard";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useLibrary } from "@/components/providers/LibraryProvider";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { withBack } from "@/lib/navigation/back";
import { catalogTitle } from "@/lib/xtream/title";

export default function FavoritesPage() {
  const { activePlaylist, ready } = usePlaylists();
  const { favorites } = useLibrary();
  const { t } = useLocale();
  const items = ready && activePlaylist ? favorites : [];

  return (
    <div className="space-y-4 px-4 py-5 md:px-6">
      <div>
        <h1 className="font-[family-name:var(--xp-font-display)] text-2xl font-bold">
          {t("favorite")}
        </h1>
        <p className="text-sm text-[var(--xp-muted)]">
          {activePlaylist
            ? t("favoritesSavedFor", { name: activePlaylist.name })
            : t("favoritesEmptyHint")}
        </p>
      </div>
      {!items.length ? (
        <p className="text-sm text-[var(--xp-muted)]">{t("favoritesEmptyHint")}</p>
      ) : (
        <div className="xp-fade-in grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {items.map((item) => {
            const baseHref =
              item.kind === "live"
                ? `/live/${item.streamId}`
                : item.kind === "movie"
                  ? `/movies/${item.streamId}`
                  : `/series/${item.streamId}`;
            return (
              <PosterCard
                key={item.id}
                href={withBack(baseHref, "/favorites")}
                title={catalogTitle({ name: item.title })}
                image={item.image}
                subtitle={item.kind}
                aspect={item.kind === "live" ? "live" : "poster"}
                kind={item.kind}
                streamId={item.streamId}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
