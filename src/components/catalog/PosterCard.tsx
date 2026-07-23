"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { PosterPlaceholder } from "@/components/brand/BrandMark";
import { useLocale } from "@/components/providers/LocaleProvider";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import {
  isFavorite,
  toggleFavorite,
  type FavoriteItem,
} from "@/lib/library/storage";

type Props = {
  href: string;
  title: string;
  image?: string;
  subtitle?: string;
  /** live = channel logo (contain); same card size as movies/series */
  aspect?: "poster" | "live";
  kind?: FavoriteItem["kind"];
  streamId?: number | string;
};

function usableImageUrl(image?: string) {
  const src = image?.trim();
  if (!src) return undefined;
  const lower = src.toLowerCase();
  if (
    lower === "null" ||
    lower === "undefined" ||
    lower === "n/a" ||
    lower === "none" ||
    lower === "-"
  ) {
    return undefined;
  }
  return src;
}

export function PosterCard({
  href,
  title,
  image,
  subtitle,
  aspect = "poster",
  kind,
  streamId,
}: Props) {
  const { activePlaylist } = usePlaylists();
  const { t } = useLocale();
  const [imgFailed, setImgFailed] = useState(false);
  const [fav, setFav] = useState(false);
  const src = usableImageUrl(image);
  const showImage = Boolean(src) && !imgFailed;
  const canFavorite =
    Boolean(activePlaylist && kind != null && streamId != null);

  useEffect(() => {
    if (!activePlaylist || kind == null || streamId == null) {
      setFav(false);
      return;
    }
    setFav(isFavorite(activePlaylist.id, kind, streamId));
  }, [activePlaylist, kind, streamId]);

  return (
    <Link
      href={href}
      title={title}
      className="group xp-press relative block w-full"
    >
      <div className="xp-poster-face relative overflow-hidden rounded-lg bg-[var(--xp-surface)] ring-1 ring-[var(--xp-border)] transition-[box-shadow,ring-color] duration-300 group-hover:ring-[var(--xp-accent)]/40">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className={`h-full w-full transition duration-300 group-active:scale-95 ${
              aspect === "live"
                ? "object-contain bg-[var(--xp-surface)] p-3"
                : "object-cover"
            }`}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <PosterPlaceholder className="absolute inset-0" />
        )}
        {canFavorite ? (
          <button
            type="button"
            aria-label={t("favorite")}
            aria-pressed={fav}
            className={`absolute right-1.5 top-1.5 z-20 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-black/55 backdrop-blur-sm transition ${
              fav
                ? "text-[var(--xp-accent)] opacity-100"
                : "text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            }`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!activePlaylist || kind == null || streamId == null) return;
              const next = toggleFavorite(activePlaylist.id, {
                kind,
                title,
                image,
                streamId,
              });
              setFav(next);
            }}
          >
            <Heart className={`h-3.5 w-3.5 ${fav ? "fill-current" : ""}`} />
          </button>
        ) : null}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 space-y-0.5 p-2">
          <p
            title={title}
            className="line-clamp-2 text-xs font-semibold leading-snug text-white sm:text-sm"
          >
            {title}
          </p>
          {subtitle ? (
            <p className="truncate text-[10px] text-white/65">{subtitle}</p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
