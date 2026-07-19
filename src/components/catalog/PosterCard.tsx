"use client";

import Link from "next/link";
import { useState } from "react";
import { PosterPlaceholder } from "@/components/brand/BrandMark";
import { MarqueeText } from "@/components/catalog/MarqueeText";

type Props = {
  href: string;
  title: string;
  image?: string;
  subtitle?: string;
  /** live = channel logo (contain); same card size as movies/series */
  aspect?: "poster" | "live";
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
}: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = usableImageUrl(image);
  const showImage = Boolean(src) && !imgFailed;

  return (
    <Link href={href} className="group xp-press relative block w-full">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-[var(--xp-surface)] ring-1 ring-white/5 transition group-hover:ring-[var(--xp-accent)]/40">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className={`h-full w-full transition duration-300 group-hover:scale-105 group-active:scale-95 ${
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
