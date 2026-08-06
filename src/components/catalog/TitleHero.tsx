"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Heart, Play } from "lucide-react";
import { PosterPlaceholder } from "@/components/brand/BrandMark";
import { APP_CONTENT } from "@/components/layout/AppTopBar";
import { useLocale } from "@/components/providers/LocaleProvider";

type Props = {
  backHref: string;
  backLabel: string;
  title: string;
  meta?: string;
  plot?: string;
  image?: string;
  playHref: string;
  playLabel?: string;
  secondaryPlayHref?: string;
  secondaryPlayLabel?: string;
  /** 0–100 watch progress for movies / resume titles */
  progressPct?: number;
  progressLabel?: string;
  favorited?: boolean;
  onToggleFavorite?: () => void;
  /**
   * movie — full-viewport poster, copy pinned to the bottom.
   * series — same fixed poster; children scroll as a translucent overlay.
   */
  layout?: "movie" | "series" | "live";
  /** Extra content (episodes, cast) that scrolls over the poster */
  children?: React.ReactNode;
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
  secondaryPlayHref,
  secondaryPlayLabel,
  progressPct,
  progressLabel,
  favorited,
  onToggleFavorite,
  layout = "movie",
  children,
}: Props) {
  const { t } = useLocale();
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(image?.trim()) && !imgFailed;
  const isSeries = layout === "series";

  // Landing from the player often restores mid-scroll; pin to the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [backHref, title]);

  return (
    <div className="xp-fade-in relative isolate min-h-dvh">
      {/* Full-viewport poster — fixed so series/meta content scrolls over it */}
      <div
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[var(--xp-ink)]"
        aria-hidden
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <PosterPlaceholder className="absolute inset-0" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.35)_100%)]" />
      </div>

      <Link
        href={backHref}
        className="fixed left-4 top-[calc(env(safe-area-inset-top)+3.35rem)] z-30 inline-flex cursor-pointer items-center gap-2 rounded-full bg-black/55 px-3 py-2 text-sm text-white backdrop-blur-md"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      {/* First viewport: title + actions pinned to the bottom */}
      <section className="relative z-10 flex min-h-dvh w-full flex-col justify-end">
        <div
          className={`${APP_CONTENT} space-y-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-28 md:pb-8 md:space-y-4`}
        >
          <div className="max-w-2xl space-y-2 md:space-y-3">
            <h1
              className="font-[family-name:var(--xp-font-display)] text-3xl font-bold leading-tight text-white sm:text-4xl md:text-5xl"
              style={{
                textShadow:
                  "0 2px 24px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.9)",
              }}
            >
              {title}
            </h1>
            {meta ? (
              <p
                className="text-sm text-white/85"
                style={{ textShadow: "0 1px 12px rgba(0,0,0,0.9)" }}
              >
                {meta}
              </p>
            ) : null}
            {plot ? (
              <p
                className="line-clamp-3 max-w-xl text-sm leading-relaxed text-white/92 sm:line-clamp-4 sm:text-[0.95rem]"
                style={{
                  textShadow:
                    "0 2px 18px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.8)",
                }}
              >
                {plot}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Link href={playHref} className="xp-btn xp-btn-primary min-w-[9rem]">
              <Play className="h-4 w-4 fill-current" />
              {playLabel}
            </Link>
            {secondaryPlayHref ? (
              <Link href={secondaryPlayHref} className="xp-btn xp-btn-ghost">
                {secondaryPlayLabel ?? t("episodeStartOver")}
              </Link>
            ) : null}
            {onToggleFavorite ? (
              <button
                type="button"
                className="xp-btn xp-btn-ghost cursor-pointer"
                onClick={onToggleFavorite}
              >
                <Heart
                  className={`h-4 w-4 ${favorited ? "fill-[var(--xp-accent)] text-[var(--xp-accent)]" : ""}`}
                />
                {t("favorite")}
              </button>
            ) : null}
          </div>

          {progressPct != null && progressPct > 0 ? (
            <div className="max-w-md space-y-1.5 pt-1">
              {progressLabel ? (
                <p
                  className="text-xs font-medium text-white/80"
                  style={{ textShadow: "0 1px 10px rgba(0,0,0,0.9)" }}
                >
                  {progressLabel}
                </p>
              ) : null}
              <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-[var(--xp-accent)]"
                  style={{
                    width: `${Math.min(100, Math.max(0, progressPct))}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {children ? (
        <div
          className={`relative z-10 pb-[max(1.5rem,env(safe-area-inset-bottom))] ${
            isSeries
              ? "bg-gradient-to-b from-transparent via-black/40 to-black/65 backdrop-blur-[2px]"
              : "bg-gradient-to-b from-transparent via-black/35 to-black/55 backdrop-blur-[1px]"
          }`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
