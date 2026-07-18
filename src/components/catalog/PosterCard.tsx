"use client";

import Link from "next/link";
import { Play } from "lucide-react";

type Props = {
  href: string;
  title: string;
  image?: string;
  subtitle?: string;
  aspect?: "poster" | "live";
};

export function PosterCard({
  href,
  title,
  image,
  subtitle,
  aspect = "poster",
}: Props) {
  return (
    <Link
      href={href}
      className="group xp-press relative block w-full"
    >
      <div
        className={`relative overflow-hidden rounded-xl bg-[var(--xp-surface)] ${
          aspect === "live" ? "aspect-video" : "aspect-[2/3]"
        }`}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105 group-active:scale-95"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--xp-surface)] to-[var(--xp-surface-2)] px-2 text-center text-xs text-[var(--xp-muted)]">
            {title}
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-80" />
        <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-1">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white md:text-sm">
              {title}
            </p>
            {subtitle ? (
              <p className="truncate text-[10px] text-white/70">{subtitle}</p>
            ) : null}
          </div>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--xp-accent)] text-[var(--xp-ink)] opacity-0 transition group-hover:opacity-100">
            <Play className="h-3.5 w-3.5 fill-current" />
          </span>
        </div>
      </div>
    </Link>
  );
}
