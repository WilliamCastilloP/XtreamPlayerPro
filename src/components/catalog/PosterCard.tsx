"use client";

import Link from "next/link";
import { Play } from "lucide-react";

type Props = {
  href: string;
  title: string;
  image?: string;
  subtitle?: string;
  aspect?: "poster" | "live";
  /** Always show play affordance (better on touch) */
  showPlay?: boolean;
};

export function PosterCard({
  href,
  title,
  image,
  subtitle,
  aspect = "poster",
  showPlay = true,
}: Props) {
  return (
    <Link href={href} className="group xp-press relative block w-full">
      <div
        className={`relative overflow-hidden rounded-lg bg-[var(--xp-surface)] ring-1 ring-white/5 transition group-hover:ring-[var(--xp-accent)]/50 ${
          aspect === "live" ? "aspect-video" : "aspect-[2/3]"
        }`}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className={`h-full w-full transition duration-300 group-hover:scale-105 group-active:scale-95 ${
              aspect === "live" ? "object-contain bg-black/40 p-2" : "object-cover"
            }`}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--xp-surface)] to-[var(--xp-surface-2)] px-2 text-center text-xs text-[var(--xp-muted)]">
            {title}
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100 group-active:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--xp-accent)] text-[var(--xp-ink)] shadow-lg">
            <Play className="h-5 w-5 fill-current" />
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <p className="truncate text-xs font-semibold text-white sm:text-sm">
            {title}
          </p>
          {subtitle ? (
            <p className="truncate text-[10px] text-white/65">{subtitle}</p>
          ) : null}
        </div>
        {showPlay ? (
          <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-[var(--xp-accent)] sm:hidden">
            <Play className="h-3.5 w-3.5 fill-current" />
          </span>
        ) : null}
      </div>
    </Link>
  );
}
