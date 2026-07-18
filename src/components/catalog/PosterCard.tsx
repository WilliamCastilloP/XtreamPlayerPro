"use client";

import Link from "next/link";
import { PosterPlaceholder } from "@/components/brand/BrandMark";
import { MarqueeText } from "@/components/catalog/MarqueeText";

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
    <Link href={href} className="group xp-press relative block w-full">
      <div
        className={`relative overflow-hidden rounded-lg bg-[var(--xp-surface)] ring-1 ring-white/5 transition group-hover:ring-[var(--xp-accent)]/40 ${
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
          <PosterPlaceholder />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 space-y-0.5 p-2">
          <MarqueeText
            text={title}
            className="text-xs font-semibold text-white sm:text-sm"
          />
          {subtitle ? (
            <p className="truncate text-[10px] text-white/65">{subtitle}</p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
