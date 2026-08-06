"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { FavoriteItem } from "@/lib/library/storage";
import { PosterCard } from "./PosterCard";

export type MediaRowItem = {
  key: string;
  href: string;
  title: string;
  image?: string;
  subtitle?: string;
  aspect?: "poster" | "live";
  kind?: FavoriteItem["kind"];
  streamId?: number | string;
  /** When set, card shows continue-watching Play + Info overlays. */
  playHref?: string;
};

/** Shared card slot class for live / movies / series rows */
export const STANDARD_POSTER_WIDTH = "xp-poster-slot";

type Props = {
  title: string;
  href?: string;
  seeAllLabel?: string;
  items: MediaRowItem[];
  emptyLabel?: string;
  posterWidth?: string;
};

export function MediaRow({
  title,
  href,
  seeAllLabel,
  items,
  emptyLabel,
  posterWidth = STANDARD_POSTER_WIDTH,
}: Props) {
  const { t } = useLocale();
  const label = seeAllLabel ?? t("seeAll");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateArrows = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(max > 4 && el.scrollLeft < max - 4);
  };

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateArrows();
    el.addEventListener("scroll", updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      ro.disconnect();
    };
  }, [items]);

  const scrollByCards = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.75, 200);
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
  };

  const heading = (
    <h2 className="min-w-0 font-[family-name:var(--xp-font-display)] text-lg font-semibold md:text-xl">
      {href ? (
        <Link href={href} className="xp-link-title">
          {title}
        </Link>
      ) : (
        title
      )}
    </h2>
  );

  const seeAll = href ? (
    <Link
      href={href}
      className="xp-link inline-flex shrink-0 items-center gap-0.5 text-sm"
    >
      {label}
      <ChevronRight className="h-4 w-4 opacity-80" aria-hidden />
    </Link>
  ) : null;

  if (!items.length) {
    return emptyLabel ? (
      <section className="xp-media-row xp-fade-in space-y-3">
        <div className="flex items-end justify-between gap-3 px-4 md:px-6 lg:px-8 xl:px-12">
          {heading}
          {seeAll}
        </div>
        <p className="px-4 text-sm text-[var(--xp-muted)] md:px-6 lg:px-8 xl:px-12">
          {emptyLabel}
        </p>
      </section>
    ) : null;
  }

  return (
    <section className="xp-media-row xp-fade-in space-y-3">
      <div className="flex items-end justify-between gap-3 px-4 md:px-6 lg:px-8 xl:px-12">
        {heading}
        {seeAll}
      </div>
      <div className="relative min-w-0 w-full overflow-hidden">
        {canPrev ? (
          <button
            type="button"
            aria-label={t("pagerPrev")}
            onClick={() => scrollByCards(-1)}
            className="absolute left-1 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-[var(--xp-surface)]/95 text-[var(--xp-text)] shadow-lg ring-1 ring-[var(--xp-border)] transition hover:bg-[var(--xp-surface-2)] md:inline-flex lg:left-6 xl:left-10"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : null}
        {canNext ? (
          <button
            type="button"
            aria-label={t("pagerNext")}
            onClick={() => scrollByCards(1)}
            className="absolute right-1 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-[var(--xp-surface)]/95 text-[var(--xp-text)] shadow-lg ring-1 ring-[var(--xp-border)] transition hover:bg-[var(--xp-surface-2)] md:inline-flex lg:right-6 xl:right-10"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        ) : null}
        <div
          ref={scrollerRef}
          className="xp-media-row__scroller gap-2.5 px-4 py-1 scrollbar-none md:gap-3 md:px-6 lg:px-8 xl:px-12"
        >
          {items.map((item) => (
            <div key={item.key} className={posterWidth}>
              <PosterCard
                href={item.href}
                title={item.title}
                image={item.image}
                subtitle={item.subtitle}
                aspect={item.aspect}
                kind={item.kind}
                streamId={item.streamId}
                playHref={item.playHref}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
