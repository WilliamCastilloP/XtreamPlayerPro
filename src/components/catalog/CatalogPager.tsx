"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";

const PAGE_SIZE_KEY = "xp.pageSize";
const PAGE_SIZES = [24, 48, 96] as const;

export type PageSize = (typeof PAGE_SIZES)[number];

function readPageSize(): PageSize {
  if (typeof window === "undefined") return 48;
  try {
    const n = Number(localStorage.getItem(PAGE_SIZE_KEY));
    if (PAGE_SIZES.includes(n as PageSize)) return n as PageSize;
  } catch {
    /* ignore */
  }
  return 48;
}

type Props<T> = {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  className?: string;
};

export function CatalogPager<T extends { key: string }>({
  items,
  renderItem,
  className = "",
}: Props<T>) {
  const { t } = useLocale();
  const [pageSize, setPageSize] = useState<PageSize>(48);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPageSize(readPageSize());
  }, []);

  useEffect(() => {
    setPage(1);
  }, [items]);

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  const from = total === 0 ? 0 : start + 1;
  const to = Math.min(start + pageSize, total);

  const changePageSize = (next: PageSize) => {
    setPageSize(next);
    setPage(1);
    try {
      localStorage.setItem(PAGE_SIZE_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  const go = (next: number) => {
    setPage(Math.max(1, Math.min(pageCount, next)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6">
        <p className="text-sm text-[var(--xp-muted)]">
          {t("pagerShowing", { from, to, total })}
        </p>
        <label className="flex items-center gap-2 text-sm text-[var(--xp-muted)]">
          <span>{t("pagerPerPage")}</span>
          <select
            value={pageSize}
            onChange={(e) => changePageSize(Number(e.target.value) as PageSize)}
            className="cursor-pointer rounded-lg border border-[var(--xp-border)] bg-[var(--xp-surface)] px-2 py-1.5 text-[var(--xp-text)]"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2.5 px-4 sm:grid-cols-4 md:grid-cols-5 md:gap-3 md:px-6 lg:grid-cols-6">
        {slice.map((item) => (
          <div key={item.key}>{renderItem(item)}</div>
        ))}
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-center gap-3 px-4 pb-2 md:px-6">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => go(safePage - 1)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-[var(--xp-surface)] px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            {t("pagerPrev")}
          </button>
          <span className="text-sm text-[var(--xp-muted)]">
            {t("pagerPageOf", { page: safePage, pages: pageCount })}
          </span>
          <button
            type="button"
            disabled={safePage >= pageCount}
            onClick={() => go(safePage + 1)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-[var(--xp-surface)] px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("pagerNext")}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
