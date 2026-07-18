"use client";

import Link from "next/link";
import { Info, Play } from "lucide-react";

type Props = {
  title: string;
  subtitle?: string;
  image?: string;
  playHref: string;
  infoHref?: string;
  eyebrow?: string;
};

export function HeroBanner({
  title,
  subtitle,
  image,
  playHref,
  infoHref,
  eyebrow = "Featured",
}: Props) {
  return (
    <section className="xp-fade-in relative mx-4 overflow-hidden rounded-2xl md:mx-6">
      <div className="relative aspect-[16/10] w-full bg-[var(--xp-surface)] sm:aspect-[21/9]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--xp-surface-2)] to-[var(--xp-ink)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--xp-ink)] via-[rgba(11,15,20,0.45)] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 space-y-3 p-4 sm:p-6 md:max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--xp-accent)]">
            {eyebrow}
          </p>
          <h2 className="font-[family-name:var(--xp-font-display)] text-2xl font-bold leading-tight sm:text-3xl md:text-4xl">
            {title}
          </h2>
          {subtitle ? (
            <p className="line-clamp-2 text-sm text-white/75">{subtitle}</p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href={playHref} className="xp-btn xp-btn-primary min-w-[7.5rem]">
              <Play className="h-4 w-4 fill-current" />
              Play
            </Link>
            {infoHref ? (
              <Link href={infoHref} className="xp-btn xp-btn-ghost min-w-[7.5rem]">
                <Info className="h-4 w-4" />
                Details
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
