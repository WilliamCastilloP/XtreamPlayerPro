"use client";

import Link from "next/link";
import { useLocale } from "@/components/providers/LocaleProvider";
import { PosterCard } from "./PosterCard";

export type MediaRowItem = {
  key: string;
  href: string;
  title: string;
  image?: string;
  subtitle?: string;
  aspect?: "poster" | "live";
};

/** Shared card width for live / movies / series */
export const STANDARD_POSTER_WIDTH =
  "w-[30vw] max-w-[9.5rem] min-w-[6.5rem] sm:w-36 md:w-40";

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

  if (!items.length) {
    return emptyLabel ? (
      <section className="xp-fade-in space-y-3">
        <h2 className="px-4 font-[family-name:var(--xp-font-display)] text-lg font-semibold md:px-6 md:text-xl">
          {title}
        </h2>
        <p className="px-4 text-sm text-[var(--xp-muted)] md:px-6">
          {emptyLabel}
        </p>
      </section>
    ) : null;
  }

  return (
    <section className="xp-fade-in space-y-3">
      <div className="flex items-end justify-between gap-3 px-4 md:px-6">
        <h2 className="min-w-0 font-[family-name:var(--xp-font-display)] text-lg font-semibold md:text-xl">
          {title}
        </h2>
        {href ? (
          <Link
            href={href}
            className="shrink-0 text-sm font-medium text-[var(--xp-accent)] hover:underline"
          >
            {label}
          </Link>
        ) : null}
      </div>
      <div className="flex gap-2.5 overflow-x-auto px-4 pb-1 scrollbar-none md:gap-3 md:px-6">
        {items.map((item) => (
          <div key={item.key} className={`shrink-0 ${posterWidth}`}>
            <PosterCard
              href={item.href}
              title={item.title}
              image={item.image}
              subtitle={item.subtitle}
              aspect={item.aspect}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
