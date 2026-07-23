"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Heart, Play } from "lucide-react";
import { PosterPlaceholder } from "@/components/brand/BrandMark";
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
  favorited?: boolean;
  onToggleFavorite?: () => void;
  /** Extra content below the full-bleed hero (e.g. series episodes) */
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
  favorited,
  onToggleFavorite,
  children,
}: Props) {
  const { t } = useLocale();
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(image?.trim()) && !imgFailed;

  // Landing from the player often restores mid-scroll; pin to the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [backHref, title]);

  return (
    <div className="xp-fade-in">
      {/* In-flow flex so the section ends right under Play — no empty viewport gap */}
      <section className="relative isolate flex min-h-[min(68dvh,34rem)] w-full flex-col justify-end overflow-hidden bg-[var(--xp-ink)] sm:min-h-[min(72dvh,38rem)]">
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

        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/25" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.45)_100%)]" />

        <Link
          href={backHref}
          className="absolute left-4 top-[calc(env(safe-area-inset-top)+3.35rem)] z-20 inline-flex cursor-pointer items-center gap-2 rounded-full bg-black/55 px-3 py-2 text-sm text-white backdrop-blur-md"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>

        <div className="relative z-10 space-y-3 px-4 pb-5 pt-24 md:px-8 md:pb-6 md:pt-20 md:space-y-4">
          <div className="max-w-2xl space-y-2 md:space-y-3">
            <h1
              className="font-[family-name:var(--xp-font-display)] text-3xl font-bold leading-tight text-white sm:text-4xl md:text-5xl"
              style={{ textShadow: "0 2px 24px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.9)" }}
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
                className="line-clamp-3 max-w-xl text-sm leading-relaxed text-white/92 sm:line-clamp-5 sm:text-[0.95rem]"
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
        </div>
      </section>

      {children ? (
        <div className="relative z-10 bg-[var(--xp-ink)]">{children}</div>
      ) : null}
    </div>
  );
}
