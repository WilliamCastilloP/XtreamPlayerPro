"use client";

import Link from "next/link";
import { ArrowLeft, Heart, Play } from "lucide-react";
import { PosterPlaceholder } from "@/components/brand/BrandMark";

type Props = {
  backHref: string;
  backLabel: string;
  title: string;
  meta?: string;
  plot?: string;
  image?: string;
  playHref: string;
  playLabel?: string;
  favorited?: boolean;
  onToggleFavorite?: () => void;
};

export function TitleHero({
  backHref,
  backLabel,
  title,
  meta,
  plot,
  image,
  playHref,
  playLabel = "Play",
  favorited,
  onToggleFavorite,
}: Props) {
  return (
    <>
      <div className="relative">
        <div className="relative aspect-[16/11] w-full overflow-hidden bg-[var(--xp-surface)] sm:aspect-[21/9]">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <PosterPlaceholder className="absolute inset-0" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--xp-ink)] via-[rgba(11,15,20,0.55)] to-black/20" />
          <Link
            href={backHref}
            className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-black/45 px-3 py-2 text-sm text-white backdrop-blur"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
          <div className="absolute inset-x-0 bottom-0 space-y-3 p-4 md:p-8 md:max-w-2xl">
            <h1 className="font-[family-name:var(--xp-font-display)] text-3xl font-bold leading-tight md:text-5xl">
              {title}
            </h1>
            {meta ? (
              <p className="text-sm text-white/70">{meta}</p>
            ) : null}
            {plot ? (
              <p className="line-clamp-3 max-w-xl text-sm leading-relaxed text-white/85 md:line-clamp-4">
                {plot}
              </p>
            ) : null}
            <div className="hidden flex-wrap gap-2 pt-1 sm:flex">
              <Link href={playHref} className="xp-btn xp-btn-primary">
                <Play className="h-4 w-4 fill-current" />
                {playLabel}
              </Link>
              {onToggleFavorite ? (
                <button
                  type="button"
                  className="xp-btn xp-btn-ghost"
                  onClick={onToggleFavorite}
                >
                  <Heart
                    className={`h-4 w-4 ${favorited ? "fill-[var(--xp-accent)] text-[var(--xp-accent)]" : ""}`}
                  />
                  Favorite
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky mobile play bar — always visible like Netflix */}
      <div className="sticky bottom-20 z-40 border-t border-[var(--xp-border)] bg-[rgba(11,15,20,0.92)] px-4 py-3 backdrop-blur-xl sm:hidden md:bottom-0">
        <div className="flex gap-2">
          <Link href={playHref} className="xp-btn xp-btn-primary flex-1">
            <Play className="h-4 w-4 fill-current" />
            {playLabel}
          </Link>
          {onToggleFavorite ? (
            <button
              type="button"
              className="xp-btn xp-btn-ghost"
              onClick={onToggleFavorite}
              aria-label="Favorite"
            >
              <Heart
                className={`h-4 w-4 ${favorited ? "fill-[var(--xp-accent)] text-[var(--xp-accent)]" : ""}`}
              />
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
