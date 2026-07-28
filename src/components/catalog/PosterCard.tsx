"use client";

import Link from "next/link";
import { useState } from "react";
import { Heart, Play } from "lucide-react";
import { PosterPlaceholder } from "@/components/brand/BrandMark";
import { useLocale } from "@/components/providers/LocaleProvider";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { useIsFavorite } from "@/components/providers/LibraryProvider";
import { toggleFavorite, type FavoriteItem } from "@/lib/library/storage";

type Props = {
  href: string;
  title: string;
  image?: string;
  subtitle?: string;
  /** live = channel logo (contain); same card size as movies/series */
  aspect?: "poster" | "live";
  kind?: FavoriteItem["kind"];
  streamId?: number | string;
  /**
   * Continue-watching mode: card opens details (`href`);
   * center Play opens playback immediately.
   */
  playHref?: string;
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
  playHref,
}: Props) {
  const { activePlaylist } = usePlaylists();
  const { t } = useLocale();
  const [imgFailed, setImgFailed] = useState(false);
  const fav = useIsFavorite(kind, streamId);
  const src = usableImageUrl(image);
  const showImage = Boolean(src) && !imgFailed;
  const canFavorite =
    Boolean(activePlaylist && kind != null && streamId != null);
  const isContinue = Boolean(playHref);

  return (
    <div className="group xp-press relative block w-full">
      <Link
        href={href}
        title={title}
        className="relative block w-full"
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

      {isContinue && playHref ? (
        <Link
          href={playHref}
          aria-label={t("play")}
          title={t("play")}
          className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white shadow-lg ring-1 ring-white/25 backdrop-blur-sm transition group-hover:scale-105 group-hover:bg-[var(--xp-accent)] group-hover:text-[var(--xp-ink)] group-hover:ring-[var(--xp-accent)]">
            <Play className="h-5 w-5 fill-current" />
          </span>
        </Link>
      ) : null}

      {canFavorite ? (
        <button
          type="button"
          aria-label={t("favorite")}
          aria-pressed={fav}
          className={`absolute right-1.5 top-1.5 z-20 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-black/55 backdrop-blur-sm transition ${
            fav
              ? "text-[var(--xp-accent)] opacity-100"
              : "text-white/85 opacity-100"
          }`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!activePlaylist || kind == null || streamId == null) return;
            toggleFavorite(activePlaylist.id, {
              kind,
              title,
              image,
              streamId,
            });
          }}
        >
          <Heart className={`h-3.5 w-3.5 ${fav ? "fill-current" : ""}`} />
        </button>
      ) : null}
    </div>
  );
}
